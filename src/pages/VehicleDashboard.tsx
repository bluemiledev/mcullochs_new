import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { flushSync } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TimeScrubber from '../components/TimeScrubber';
import DigitalSignalTimeline from '../components/DigitalSignalTimeline';
import AnalogChart from '../components/AnalogChart';
import AssetSelectionModal from '../components/AssetSelectionModal';
import FilterOptionsModal from '../components/FilterOptionsModal';
import DrillingFilterModal from '../components/DrillingFilterModal';
import MaintenanceFilterModal from '../components/MaintenanceFilterModal';
import ErrorModal from '../components/ErrorModal';
import DrillingOperationsTable from '../components/DrillingOperationsTable';
import MaintenanceTables from '../components/MaintenanceTables';
import styles from './VehicleDashboard.module.css';
import { useTimeContext } from '../context/TimeContext';
import { useDataProcessor } from '../hooks/useDataProcessor';
import { formatShiftForAPI } from '../utils';

interface VehicleMetric {
  id: string;
  name: string;
  unit: string;
  color: string;
  min_color?: string;
  max_color?: string;
  data: Array<{ time: Date; value?: number; avg?: number | null; min?: number | null; max?: number | null }>;
  currentValue: number;
  avg: number;
  min: number;
  max: number;
  yAxisRange: { min: number; max: number };
}

interface DigitalStatusChart {
  id: string;
  name: string;
  metrics: Array<{
    id: string;
    name: string;
    color: string;
    data: Array<{ time: Date; value: number }>;
    currentValue: number;
  }>;
}

const parseShiftApiToSeconds = (shiftApi: string): { startSec: number; endSec: number } => {
  const match = String(shiftApi || '').match(
    /^(\d{2}):(\d{2}):(\d{2})to(\d{2}):(\d{2}):(\d{2})$/
  );
  if (!match) {
    return { startSec: 6 * 3600, endSec: 18 * 3600 };
  }
  const toSec = (h: string, m: string, s: string) => {
    const hh = Number(h);
    const mm = Number(m);
    const ss = Number(s);
    return (hh * 3600) + (mm * 60) + ss;
  };
  const start = toSec(match[1], match[2], match[3]);
  let end = toSec(match[4], match[5], match[6]);
  if (end <= start) end += 24 * 3600; // handle shift crossing midnight
  return { startSec: start, endSec: end };
};

const formatSecondsToHms = (sec: number): string => {
  const mod = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const hh = Math.floor(mod / 3600);
  const mm = Math.floor((mod % 3600) / 60);
  const ss = mod % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const formatDateUtcToHms = (date: Date, baseDate?: string): string => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  // For overnight shifts, if the date represents the next day but we want to show it as part of present day,
  // we need to check if the time is in the early morning hours (00:00:00 to 06:00:00) and the base date is provided
  // In that case, we just return the time as-is since the API should handle it based on the date parameter
  return `${hours}:${minutes}:${seconds}`;
};

const getCenteredWindowSeconds = (
  shiftStartSec: number,
  shiftEndSec: number,
  windowSec: number
): { startSec: number; endSec: number; centerSec: number } => {
  const duration = Math.max(0, shiftEndSec - shiftStartSec);
  const w = Math.max(1, Math.min(windowSec, duration || windowSec));
  const center = shiftStartSec + duration / 2;
  let start = Math.round(center - w / 2);
  let end = start + w;

  if (start < shiftStartSec) {
    start = shiftStartSec;
    end = start + w;
  }
  if (end > shiftEndSec) {
    end = shiftEndSec;
    start = end - w;
  }
  const centerSec = start + w / 2;
  return { startSec: start, endSec: end, centerSec };
};

const parseDateToUtcDayStartMs = (dateStr: string): number | null => {
  const s = String(dateStr || '').trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
      return Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
    }
  }
  // DD-MM-YYYY
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
      return Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
    }
  }
  // DD/MM/YYYY
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
      return Date.UTC(y, mo - 1, d, 0, 0, 0, 0);
    }
  }
  return null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const getUtcDayStartMsFromMs = (ms: number): number => {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
};

const formatUtcDayStartMsLike = (dayStartMs: number, like?: string): string => {
  const d = new Date(dayStartMs);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const sample = String(like || '').trim();

  // Preserve the incoming format when possible
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(sample)) return `${dd}/${mm}/${yyyy}`;
  if (/^\d{2}-\d{2}-\d{4}$/.test(sample)) return `${dd}-${mm}-${yyyy}`;

  // Default: YYYY-MM-DD
  return `${yyyy}-${mm}-${dd}`;
};

const getShiftMeta = (selectedDate: string, selectedShift: string) => {
  const shiftApi = formatShiftForAPI(selectedShift);
  const { startSec, endSec } = parseShiftApiToSeconds(shiftApi);
  const crossesMidnight = endSec > 24 * 3600;
  const normalizedEndSec = crossesMidnight ? endSec - 24 * 3600 : endSec;

  const selectedDayStartMs = parseDateToUtcDayStartMs(selectedDate);

  // IMPORTANT: For overnight shifts, treat the selected date as the "shift end date".
  // That means the shift timeline base day is the previous calendar day.
  const timelineBaseDayStartMs =
    selectedDayStartMs == null ? null : crossesMidnight ? selectedDayStartMs - DAY_MS : selectedDayStartMs;

  return { shiftApi, startSec, endSec, crossesMidnight, normalizedEndSec, selectedDayStartMs, timelineBaseDayStartMs };
};

const VehicleDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Check URL params immediately to initialize state
  const initialVehicleParam = searchParams.get('device_id') || searchParams.get('vehicle');
  const initialDateParam = searchParams.get('date');
  const initialVehicleId = initialVehicleParam ? Number(initialVehicleParam) : null;
  const hasUrlParams = initialVehicleId && initialDateParam;
  
  const [vehicleMetrics, setVehicleMetrics] = useState<VehicleMetric[]>([]);
  const [digitalStatusChart, setDigitalStatusChart] = useState<DigitalStatusChart | null>(null);
  const { selectedTime, setSelectedTime } = useTimeContext();
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [crosshairActive, setCrosshairActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  // Always show asset modal on page load/refresh
  const [showAssetModal, setShowAssetModal] = useState<boolean>(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(initialVehicleId);
  const [selectedVehicleSerialNo, setSelectedVehicleSerialNo] = useState<string | null>(initialVehicleParam || null);
  const [selectedDate, setSelectedDate] = useState<string>(initialDateParam || '');
  const [selectedShift, setSelectedShift] = useState<string>('6 AM to 6 PM');
  const [visibleChartsCount, setVisibleChartsCount] = useState<number>(5); // Start with 5 charts, progressively render more
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [vehicles, setVehicles] = useState<Array<{ id: number; name: string; rego: string }>>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState<boolean>(false);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [visibleDigital, setVisibleDigital] = useState<Record<string, boolean>>({});
  const [visibleAnalog, setVisibleAnalog] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [forceAllChartsVisible, setForceAllChartsVisible] = useState<boolean>(false);
  const [selectedHourRange, setSelectedHourRange] = useState<{ start: string; end: string; label: string } | null>(null);
  const [screenMode, setScreenMode] = useState<'Maintenance' | 'Drilling'>('Drilling');
  const [isSecondViewMode, setIsSecondViewMode] = useState<boolean>(false);
  const [apiRange, setApiRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const [tableData, setTableData] = useState<Record<string, { valueStr: string; reading: string; id: string }> | null>(null);
  const [showDrillingFilters, setShowDrillingFilters] = useState<boolean>(false);
  const [visibleDownholeCharts, setVisibleDownholeCharts] = useState<Record<string, boolean>>({});
  const [visibleRigOpsRows, setVisibleRigOpsRows] = useState<Record<string, boolean>>({});
  const [visibleMaintenanceRows, setVisibleMaintenanceRows] = useState<Record<string, boolean>>({});
  const [maintenanceTablesData, setMaintenanceTablesData] = useState<{
    reportingOutputs?: Record<string, { valueStr: string; reading: string; id: string }>;
    faultReportingAnalog?: Record<string, { valueStr: string; reading: string; id: string }>;
    faultReportingDigital?: Record<string, { valueStr: string; reading: string; id: string }>;
  } | null>(null);
  const [rawTimestamps, setRawTimestamps] = useState<number[]>([]); // Store raw timestamps from API for scrubber
  const { processData, getWindow, clearCache } = useDataProcessor();
  const loadVersionRef = useRef<number>(0); // Used to ignore stale async/chunk updates when a new load starts

  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    message: string;
    details?: string;
    endpoint?: string;
    showRefresh?: boolean;
  }>({
    isOpen: false,
    message: ''
  });
  
  // Use refs to access latest values in event listeners
  const vehicleMetricsRef = useRef<VehicleMetric[]>([]);
  const digitalStatusChartRef = useRef<DigitalStatusChart | null>(null);
  
  // Update state when URL params change (e.g., when navigating back)
  // But always show Asset Chart modal on page refresh - don't auto-hide
  useEffect(() => {
    const vehicleParam = searchParams.get('device_id') || searchParams.get('vehicle');
    const dateParam = searchParams.get('date');
    const shiftParam = searchParams.get('shift');
    const reportTypeParam = searchParams.get('reportType');
    
    if (vehicleParam && dateParam) {
      const vehicleId = Number(vehicleParam);
      if (vehicleId && dateParam) {
        setSelectedVehicleId(vehicleId);
        setSelectedVehicleSerialNo(vehicleParam); // Store as string for API calls
        setSelectedDate(dateParam);
        if (shiftParam) setSelectedShift(shiftParam);
        if (reportTypeParam === 'Maintenance' || reportTypeParam === 'Drilling') setScreenMode(reportTypeParam);
        // Don't auto-hide modal - always show Asset Chart modal on page refresh
        // User must click "Show Graph" to proceed
        // setShowAssetModal(false);
      }
    }
    // Always show modal on page refresh - removed the else clause that would hide it
  }, [searchParams]);
  
  // Keep refs in sync with state
  useEffect(() => {
    vehicleMetricsRef.current = vehicleMetrics;
  }, [vehicleMetrics]);
  
  useEffect(() => {
    digitalStatusChartRef.current = digitalStatusChart;
  }, [digitalStatusChart]);

  // Generate realistic vehicle data patterns
  const generateVehicleData = useCallback((): { analogMetrics: VehicleMetric[]; digitalChart: DigitalStatusChart } => {
    const baseDate = parseISO('2025-10-27');
    const startTime = new Date(baseDate);
    startTime.setHours(0, 0, 0, 0);

    const intervalMinutes = 15;
    const totalPoints = Math.floor((24 * 60) / intervalMinutes);

    const digitalMetrics: Array<{
      id: string;
      name: string;
      color: string;
      data: Array<{ time: Date; value: number }>;
      currentValue: number;
    }> = [
      { id: 'D1', name: 'On-Track Status', color: '#ff6b35', data: [], currentValue: 1 },
      { id: 'D6', name: 'Park Brake Output', color: '#8b5cf6', data: [], currentValue: 0 },
      { id: 'D11', name: 'Front Rail Gear Down', color: '#2563eb', data: [], currentValue: 0 },
      { id: 'D12', name: 'Front Rail Gear Up', color: '#0ea5e9', data: [], currentValue: 0 },
      { id: 'D21', name: 'Rail Gear Up', color: '#a16207', data: [], currentValue: 0 },
      { id: 'D27', name: 'EWP Stowed', color: '#84cc16', data: [], currentValue: 0 }
    ];

    const createDigitalSeries = (windows: Array<[number, number]>) => {
      const points: Array<{ time: Date; value: number }> = [];
      const currentTime = new Date(startTime);
      for (let i = 0; i < totalPoints; i++) {
        const hourValue = currentTime.getHours() + currentTime.getMinutes() / 60;
        const active = windows.some(([start, end]) => hourValue >= start && hourValue < end);
        points.push({ time: new Date(currentTime), value: active ? 1 : 0 });
        currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
      }
      return points;
    };

    digitalMetrics.forEach(metric => {
      let windows: Array<[number, number]> = [];
      switch (metric.id) {
        case 'D1':
          windows = [[0, 24]];
          break;
        case 'D6':
          windows = [[8, 10.5], [11.5, 12.5], [13.5, 14.25]];
          break;
        case 'D11':
          windows = [[11, 11.75]];
          break;
        case 'D12':
          windows = [[11.5, 12.75]];
          break;
        case 'D21':
          windows = [[12.0, 13.25]];
          break;
        case 'D27':
          windows = [[7.5, 8.25], [12.5, 13.5]];
          break;
        default:
          windows = [];
      }
      metric.data = createDigitalSeries(windows);
      metric.currentValue = metric.data[metric.data.length - 1]?.value ?? 0;
    });

    const analogMetrics: VehicleMetric[] = [
      {
        id: 'A5',
        name: 'Primary Air Pressure - PSI 1',
        unit: 'PSI',
        color: '#2563eb',
        data: [],
        currentValue: 0,
        avg: 0,
        min: 0,
        max: 0,
        yAxisRange: { min: 0, max: 120 }
      },
      {
        id: 'A9',
        name: 'EWP Jib Tilt Angle - Degree',
        unit: '°',
        color: '#0ea5e9',
        data: [],
        currentValue: 0,
        avg: 0,
        min: -120,
        max: 0,
        yAxisRange: { min: -120, max: 10 }
      },
      {
        id: 'A14',
        name: 'Engine Speed - rpm',
        unit: 'rpm',
        color: '#f97316',
        data: [],
        currentValue: 0,
        avg: 0,
        min: 0,
        max: 0,
        yAxisRange: { min: 0, max: 1200 }
      },
      {
        id: 'A15',
        name: 'Hydraulic Brake Pressures - PSI',
        unit: 'PSI',
        color: '#10b981',
        data: [],
        currentValue: 0,
        avg: 0,
        min: 0,
        max: 0,
        yAxisRange: { min: -1, max: 1 }
      }
    ];

    const createAnalogSeries = (generator: (hourValue: number) => number) => {
      const dataPoints: Array<{ time: Date; value: number }> = [];
      const currentTime = new Date(startTime);
      for (let i = 0; i < totalPoints; i++) {
        const hourValue = currentTime.getHours() + currentTime.getMinutes() / 60;
        dataPoints.push({ time: new Date(currentTime), value: generator(hourValue) });
        currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
      }
      return dataPoints;
    };

    analogMetrics.forEach(metric => {
      let dataPoints: Array<{ time: Date; value: number }> = [];
      if (metric.id === 'A5') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.75) return 110;
          if (hourValue >= 13 && hourValue < 14.5) return 95 + Math.sin((hourValue - 13) * Math.PI) * 5;
          return 0;
        });
      } else if (metric.id === 'A9') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.5) return -100;
          if (hourValue >= 13 && hourValue < 13.75) return -40;
          return 0;
        });
      } else if (metric.id === 'A14') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.5) return 900;
          if (hourValue >= 13 && hourValue < 14) return 600;
          return 0;
        });
      } else if (metric.id === 'A15') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.5) return 0.4;
          if (hourValue >= 13 && hourValue < 14) return 0.6;
          return 0;
        });
      }

      metric.data = dataPoints;
      metric.currentValue = dataPoints[dataPoints.length - 1]?.value ?? 0;
      const values = dataPoints.map(d => d.value);
      metric.avg = values.reduce((a, b) => a + b, 0) / values.length;
      metric.min = Math.min(...values);
      metric.max = Math.max(...values);
    });

    return {
      analogMetrics,
      digitalChart: {
        id: 'digital-status',
        name: 'Digital Status Indicators',
        metrics: digitalMetrics
      }
    };
  }, []);

  // ✅ Place this useEffect directly inside the component,
// at the same indentation level as your other useEffects.
useEffect(() => {
  const beforePrint = () => {
    document.body.classList.add('print-mode');
    window.scrollTo(0, 0);
  };
  const afterPrint = () => {
    document.body.classList.remove('print-mode');
  };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  return () => {
    window.removeEventListener('beforeprint', beforePrint);
    window.removeEventListener('afterprint', afterPrint);
  };
}, []);


  const handleShowGraph = useCallback((vehicleId: number, date: string, shift: string, reportType: 'Maintenance' | 'Drilling') => {
    console.log('📋 handleShowGraph called with:', { vehicleId, date, shift, reportType });
    // Clear previous data before loading new data
    setVehicleMetrics([]);
    setDigitalStatusChart({
      id: 'digital-status',
      name: 'Digital Status Indicators',
      metrics: []
    });
    setSelectedTime(null);
    setSelectionStart(null);
    setSelectionEnd(null);
    setRawTimestamps([]); // Clear raw timestamps
    setApiRange(null); // Reset any previously selected API range
    
    setSelectedVehicleId(vehicleId);
    // Note: selectedVehicleSerialNo is set by the asset:selected event listener
    // If not set yet, fallback to string conversion
    setSelectedVehicleSerialNo(prev => prev || String(vehicleId));
    setSelectedDate(date);
    setSelectedShift(shift); // Store shift
    setScreenMode(reportType); // Set screen mode from modal
    setShowAssetModal(false);
    
    // Update URL parameters
    const params = new URLSearchParams(searchParams);
    params.set('device_id', String(vehicleId));
    params.set('date', date);
    params.set('shift', shift);
    params.set('reportType', reportType);
    setSearchParams(params, { replace: true });
    
    // Dispatch event so FilterControls can initialize with selected values
    window.dispatchEvent(new CustomEvent('asset:selected', {
      detail: {
        device_id: String(vehicleId),
        date,
        shift,
        reportType
      }
    }));
    
    // Dispatch filter apply event with all values
    window.dispatchEvent(new CustomEvent('filters:apply', { 
      detail: { 
        device_id: vehicleId, 
        date,
        shift,
        reportType
      } 
    }));
  }, [searchParams, setSearchParams]);

  

  // Fetch vehicles (for header controls)
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoadingVehicles(true);
        const res = await fetch('/reet_python/get_vehicles.php', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
          mode: 'cors'
        });
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => 'Unable to read error response');
          console.error('❌ Vehicles API Error Response:', errorText.substring(0, 500));
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await res.text();
        const contentType = res.headers.get('content-type');
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        try {
          // Try to parse as JSON
          json = JSON.parse(text);
          console.log('✅ Successfully parsed JSON response (Content-Type was:', contentType, ')');
        } catch (parseError) {
          // If parsing fails, check if it's HTML
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('❌ Vehicles API Response is HTML. Content-Type:', contentType);
            console.error('❌ Response body (first 500 chars):', text.substring(0, 500));
            throw new Error(`API returned HTML page instead of JSON. Content-Type: ${contentType}`);
          } else {
            // Not HTML, but also not valid JSON
            console.error('❌ Vehicles API Response is not valid JSON. Content-Type:', contentType);
            console.error('❌ Response body (first 500 chars):', text.substring(0, 500));
            throw new Error(`API returned invalid JSON. Content-Type: ${contentType}`);
          }
        }
        // Map: [{ devices_serial_no: "6363299", name: "Vehicle Name" }, ...]
        const arr = (Array.isArray(json) ? json : [])
          .map((v: any) => {
            const serial = String(v?.devices_serial_no || '');
            const name = String(v?.name || serial); // Use name field from API, fallback to serial
            return { id: Number(serial), name, rego: serial };
          })
          .filter((v: { id: number; name: string; rego: string }) => v.id > 0);
        setVehicles(arr);
        // Don't auto-select vehicle - user must select from AssetSelectionModal
      } catch (e) {
        console.error('vehicles error', e);
        setVehicles([]);
      } finally {
        setLoadingVehicles(false);
      }
    };
    fetchVehicles();
  }, []);

  // Fetch dates for selected vehicle (header controls)
  useEffect(() => {
    if (!selectedVehicleId) { setDates([]); return; }
    const fetchDates = async () => {
      try {
        setLoadingDates(true);
        const url = `/reet_python/get_vehicle_dates.php?devices_serial_no=${selectedVehicleId}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store', mode: 'cors' });
        if (!res.ok) {
          const errorText = await res.text().catch(() => 'Unable to read error response');
          console.error('❌ VehicleDashboard Dates API Error:', errorText.substring(0, 500));
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await res.text();
        const contentType = res.headers.get('content-type');
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        try {
          json = JSON.parse(text);
          console.log('✅ VehicleDashboard: Successfully parsed dates JSON (Content-Type was:', contentType, ')');
        } catch (parseError) {
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('❌ VehicleDashboard: Dates API returned HTML. Content-Type:', contentType);
            console.error('❌ Response body (first 500 chars):', text.substring(0, 500));
            throw new Error(`API returned HTML instead of JSON`);
          } else {
            console.error('❌ VehicleDashboard: Dates API invalid JSON. Content-Type:', contentType);
            throw new Error(`API returned invalid JSON`);
          }
        }
        // Map: [{ date: "YYYY-MM-DD" }]
        const arr: string[] = (Array.isArray(json) ? json : [])
          .map((o: any) => String(o?.date || ''))
          .filter((d: string) => d.length > 0)
          .sort((a: string, b: string) => b.localeCompare(a));
        setDates(arr);
        // Don't auto-select date - user must select from AssetSelectionModal
      } catch (e) {
        console.error('dates error', e);
        setDates([]);
      } finally {
        setLoadingDates(false);
      }
    };
    fetchDates();
  }, [selectedVehicleId]);

  // Listen to filters:open event for drilling filters
  useEffect(() => {
    const onFiltersOpen = () => {
      if (screenMode === 'Drilling') {
        setShowDrillingFilters(true);
        setShowFilters(false); // Ensure old modal doesn't show
      } else {
        setShowFilters(true);
        setShowDrillingFilters(false); // Ensure drilling modal doesn't show
      }
    };

    window.addEventListener('filters:open', onFiltersOpen);
    return () => {
      window.removeEventListener('filters:open', onFiltersOpen);
    };
  }, [screenMode]);

  // Listen to asset selection from modal
  useEffect(() => {
    const handleAssetSelected = (e: CustomEvent) => {
      const deviceId = e?.detail?.device_id; // Can be string (devices_serial_no) or number
      const date = e?.detail?.date;
      const shift = e?.detail?.shift || '6 AM to 6 PM';
      const reportType = e?.detail?.reportType || 'Drilling';
      
      if (deviceId && date) {
        // Convert to number for selectedVehicleId (backward compatibility)
        const vehicleIdNum = typeof deviceId === 'string' ? Number(deviceId) : deviceId;
        // Store devices_serial_no as string for API calls
        const serialNo = typeof deviceId === 'string' ? deviceId : String(deviceId);
        setSelectedVehicleSerialNo(serialNo);
        // Note: handleShowGraph is called directly from modal, so we just store serialNo here
      }
    };
    
    window.addEventListener('asset:selected', handleAssetSelected as EventListener);
    return () => {
      window.removeEventListener('asset:selected', handleAssetSelected as EventListener);
    };
  }, []);

  // Listen to top-left controls events
  useEffect(() => {
    const onApply = (e: any) => {
      // Don't auto-trigger if modal is showing - wait for user to click "Show Graph"
      if (showAssetModal) {
        return;
      }
      const deviceId = e?.detail?.device_id;
      const date = String(e?.detail?.date || '');
      const shift = e?.detail?.shift || selectedShift || '6 AM to 6 PM';
      const reportType = e?.detail?.reportType || screenMode || 'Drilling';
      
      console.log('📋 VehicleDashboard: Received filters:apply event:', {
        deviceId,
        date,
        shift,
        reportType,
        currentShift: selectedShift,
        currentScreenMode: screenMode
      });
      
      if (deviceId) {
        const deviceIdNum = typeof deviceId === 'string' ? Number(deviceId) : deviceId;
        const serialNo = typeof deviceId === 'string' ? deviceId : String(deviceId);
        setSelectedVehicleId(deviceIdNum);
        setSelectedVehicleSerialNo(serialNo);
      }
      if (date) setSelectedDate(date);
      if (shift) setSelectedShift(shift);
      if (reportType === 'Maintenance' || reportType === 'Drilling') {
        setScreenMode(reportType);
      }
      // Always update state first, then trigger reload
      // This ensures the useEffect that depends on selectedShift will trigger
      // Always call handleShowGraph if we have deviceId and date, or use current values if not provided
      const finalDeviceId = deviceId || selectedVehicleId;
      const finalDate = date || selectedDate;
      
      if (finalDeviceId && finalDate && !showAssetModal) {
        const deviceIdNum = typeof finalDeviceId === 'string' ? Number(finalDeviceId) : finalDeviceId;
        console.log('📋 VehicleDashboard: Calling handleShowGraph with:', {
          vehicleId: deviceIdNum,
          date: finalDate,
          shift,
          reportType
        });
        handleShowGraph(deviceIdNum, finalDate, shift, reportType);
      }
    };
    const onOpen = () => setShowFilters(true);
    const onClear = () => { setVisibleAnalog({}); setVisibleDigital({}); };
    
    // Handle print full page - show all charts
    const onPrintFullPage = () => {
      console.log('🖨️ Print Full Page: Forcing all charts visible');
      console.log('🖨️ Current vehicleMetrics count:', vehicleMetricsRef.current.length);
      console.log('🖨️ Current digitalStatusChart:', digitalStatusChartRef.current ? 'exists' : 'null');
      
      // Use flushSync to force immediate synchronous state updates
      flushSync(() => {
        // Force all charts to be visible
        setForceAllChartsVisible(true);
        
        // Also update the visibility records to ensure everything is marked as visible
        // Use refs to get latest values
        const allAnalogVisible: Record<string, boolean> = {};
        vehicleMetricsRef.current.forEach(metric => {
          allAnalogVisible[metric.id] = true;
        });
        setVisibleAnalog(allAnalogVisible);
        
        const allDigitalVisible: Record<string, boolean> = {};
        if (digitalStatusChartRef.current) {
          digitalStatusChartRef.current.metrics.forEach(metric => {
            allDigitalVisible[metric.id] = true;
          });
        }
        setVisibleDigital(allDigitalVisible);
        
        console.log('🖨️ Set visibility for', Object.keys(allAnalogVisible).length, 'analog charts');
        console.log('🖨️ Set visibility for', Object.keys(allDigitalVisible).length, 'digital charts');
      });
      
      // Dispatch a custom event after state is flushed to notify that DOM should be ready
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('print:fullpage:ready'));
      }, 0);
    };
    
    // Restore visibility after print
    const onPrintFullPageDone = () => {
      console.log('🖨️ Print Full Page: Done, restoring normal state');
      // Restore normal visibility behavior
      setForceAllChartsVisible(false);
    };
    
    window.addEventListener('filters:apply', onApply as any);
    window.addEventListener('filters:open', onOpen as any);
    window.addEventListener('filters:clear', onClear as any);
    window.addEventListener('print:fullpage', onPrintFullPage as any);
    window.addEventListener('print:fullpage:done', onPrintFullPageDone as any);
    return () => {
      window.removeEventListener('filters:apply', onApply as any);
      window.removeEventListener('filters:open', onOpen as any);
      window.removeEventListener('filters:clear', onClear as any);
      window.removeEventListener('print:fullpage', onPrintFullPage as any);
      window.removeEventListener('print:fullpage:done', onPrintFullPageDone as any);
    };
  }, [handleShowGraph, showAssetModal]);

  // Clear maintenance tables data when switching modes
  useEffect(() => {
    if (screenMode === 'Drilling') {
      // Clear maintenance tables data when switching to Drilling mode
      setMaintenanceTablesData(null);
    }
    // Note: Maintenance tables data is now loaded from the main API call
    // in the data loading useEffect, so we don't need a separate fetch here
  }, [screenMode]);

  // Debug: Log visibleRigOpsRows when it changes
  useEffect(() => {
    if (screenMode === 'Drilling') {
      console.log('🔍 VehicleDashboard visibleRigOpsRows updated:', visibleRigOpsRows, 'Keys:', Object.keys(visibleRigOpsRows));
    }
  }, [visibleRigOpsRows, screenMode]);

  // Listen to screen mode change events (Maintenance/Drilling)
  useEffect(() => {
    const handleScreenModeChange = (e: any) => {
      const mode = e?.detail?.mode || 'Drilling';
      setScreenMode(mode);
      // Reset filter states when switching modes
      setShowFilters(false);
      setShowDrillingFilters(false);
      if (mode === 'Drilling') {
        // Reset drilling filter states to all visible
        setVisibleDownholeCharts({});
        setVisibleRigOpsRows({});
      } else if (mode === 'Maintenance') {
        // Reset maintenance filter states to all visible
        setVisibleMaintenanceRows({});
      }
      console.log('🔄 Screen mode changed to:', mode);
    };
    
    window.addEventListener('screen-mode:changed', handleScreenModeChange as any);
    
    return () => {
      window.removeEventListener('screen-mode:changed', handleScreenModeChange as any);
    };
  }, []);
  
  // Hour range selection events - commented out (second view mode removed)
  // Always use minute view now
  /*
  useEffect(() => {
    // Legacy code - removed
  }, [selectedDate]);
  */
  
  // Note: In second view mode, we show full downsampled data (like minute view)
  // No need to update window when selectedTime changes - charts show full timeline
  // The red line just moves across the full timeline

  // Process per-second data when it's loaded (legacy - removed, always use minute view)
  // Commented out - no longer using second view mode
  /*
  useEffect(() => {
    if (!perSecondData) return;
    
    const baseDate = new Date(selectedDate);
    baseDate.setHours(0, 0, 0, 0);
    
    // Get shift info to handle overnight shifts
    const shiftParamForApi = formatShiftForAPI(selectedShift);
    const { startSec: shiftStartSec, endSec: shiftEndSec } = parseShiftApiToSeconds(shiftParamForApi);
    const crossesMidnight = shiftEndSec > 24 * 3600;
    const normalizedEndSec = crossesMidnight ? shiftEndSec - 24 * 3600 : shiftEndSec;
    
    const parseHMS = (hms: string): Date => {
      const [hh, mm, ss] = hms.split(':').map(Number);
      const date = new Date(baseDate);
      date.setHours(hh, mm, ss, 0);
      
      // For overnight shifts, if time is in early morning (00:00:00 to normalizedEndSec),
      // add 24 hours so it appears after 23:59:59 on the timeline
      if (crossesMidnight) {
        const timeInSeconds = hh * 3600 + mm * 60 + ss;
        if (timeInSeconds <= normalizedEndSec) {
          // This is in the early morning portion, add 24 hours for display
          date.setTime(date.getTime() + 24 * 3600 * 1000);
        }
      }
      
      return date;
    };
    
    // Process analog per-second data
    const analogMetrics: VehicleMetric[] = [];
    if (Array.isArray(perSecondData.analogPerSecond)) {
      perSecondData.analogPerSecond.forEach((series: any) => {
        if (series.display === false) return;
        
        const id = String(series.id);
        const resolution = Number(series.resolution ?? 1);
        const offset = Number(series.offset ?? 0);
        
        const applyTransformation = (value: number | null | undefined): number | null => {
          if (value === null || value === undefined) return null;
          const numValue = Number(value);
          if (!Number.isFinite(numValue) || isNaN(numValue)) return null;
          return (numValue * resolution) + offset;
        };
        
        const points = (series.points || []).map((p: any) => {
          const time = parseHMS(p.time);
          const avg = applyTransformation(p.avg);
          const min = applyTransformation(p.min);
          const max = applyTransformation(p.max);
          
          return {
            time,
            avg: (avg != null && Number.isFinite(avg) && !isNaN(avg)) ? avg : null,
            min: (min != null && Number.isFinite(min) && !isNaN(min)) ? min : null,
            max: (max != null && Number.isFinite(max) && !isNaN(max)) ? max : null
          };
        }).sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
        
        if (points.length === 0) return;
        
        const values = points.map((p: any) => p.avg).filter((v: any): v is number => v != null && Number.isFinite(v) && !isNaN(v));
        const allMins = points.map((p: any) => p.min).filter((v: any): v is number => v != null && Number.isFinite(v) && !isNaN(v));
        const allMaxs = points.map((p: any) => p.max).filter((v: any): v is number => v != null && Number.isFinite(v) && !isNaN(v));
        
        const minVal = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
        const maxVal = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
        const usedRange = series.yAxisRange ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) } : { min: minVal, max: maxVal };
        
        const safeAvg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
        const safeMin = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
        const safeMax = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
        
        analogMetrics.push({
          id,
          name: String(series.name ?? id),
          unit: String(series.unit ?? ''),
          color: String(series.color ?? '#2563eb'),
          min_color: series.min_color ? String(series.min_color) : undefined,
          max_color: series.max_color ? String(series.max_color) : undefined,
          data: points as any,
          currentValue: values.length > 0 ? values[values.length - 1] : 0,
          avg: safeAvg,
          min: safeMin,
          max: safeMax,
          yAxisRange: usedRange
        });
      });
    }
    
    // Process digital per-second data
    let digitalChart: DigitalStatusChart | null = null;
    if (Array.isArray(perSecondData.digitalPerSecond)) {
      const metrics = perSecondData.digitalPerSecond
        .filter((series: any) => series.display !== false)
        .map((series: any) => {
          const points = (series.points || []).map((p: any) => ({
            time: parseHMS(p.time),
            value: Number(p.value ?? 0)
          })).sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
          
          return {
            id: String(series.id),
            name: String(series.name ?? series.id),
            color: String(series.color ?? '#999'),
            data: points,
            currentValue: points.length > 0 ? Number(points[points.length - 1].value) : 0
          };
        });
      
      if (metrics.length > 0) {
        digitalChart = {
          id: 'digital-status',
          name: 'Digital Status Indicators',
          metrics
        };
      }
    }
    
    setVehicleMetrics(analogMetrics);
    if (digitalChart) {
      setDigitalStatusChart(digitalChart);
    }
    
    // Set initial time and selection range
    if (isSecondViewMode) {
      // Find the first and last timestamps from the data
      let firstTime: Date | null = null;
      let lastTime: Date | null = null;
      
      // Check analog data
      if (analogMetrics.length > 0 && analogMetrics[0].data.length > 0) {
        const first = analogMetrics[0].data[0].time;
        const last = analogMetrics[0].data[analogMetrics[0].data.length - 1].time;
        if (first instanceof Date) firstTime = first;
        if (last instanceof Date) lastTime = last;
      }
      
      // Check digital data
      if (digitalChart && digitalChart.metrics.length > 0) {
        digitalChart.metrics.forEach(m => {
          if (m.data && m.data.length > 0) {
            const first = m.data[0].time;
            const last = m.data[m.data.length - 1].time;
            if (first instanceof Date && (!firstTime || first < firstTime)) firstTime = first;
            if (last instanceof Date && (!lastTime || last > lastTime)) lastTime = last;
          }
        });
      }
      
      if (firstTime && lastTime) {
        // Set initial time to middle of range
        const centerTime = new Date((firstTime.getTime() + lastTime.getTime()) / 2);
        setSelectedTime(centerTime);
        
        // Set selection range: 10 minutes window centered on initial time
        const rangeStart = new Date(centerTime.getTime() - 5 * 60 * 1000); // 5 minutes before
        const rangeEnd = new Date(centerTime.getTime() + 5 * 60 * 1000); // 5 minutes after
        
        // Clamp to data range
        if (rangeStart < firstTime) {
          rangeStart.setTime(firstTime.getTime());
          rangeEnd.setTime(firstTime.getTime() + 10 * 60 * 1000);
        }
        if (rangeEnd > lastTime) {
          rangeEnd.setTime(lastTime.getTime());
          rangeStart.setTime(lastTime.getTime() - 10 * 60 * 1000);
        }
        
        setSelectionStart(rangeStart);
        setSelectionEnd(rangeEnd);
      } else if (selectedHourRange) {
        // Fallback to hour range if available
        const [hh, mm, ss] = selectedHourRange.start.split(':').map(Number);
        const initialTime = new Date(baseDate);
        initialTime.setHours(hh, mm, ss, 0);
        setSelectedTime(initialTime);
        
        const endTime = new Date(initialTime);
        endTime.setMinutes(mm + 10, 0, 0); // 10 minutes range
        if (endTime.getHours() !== hh) {
          endTime.setHours(hh, 59, 59, 999);
        }
        setSelectionStart(initialTime);
        setSelectionEnd(endTime);
      }
    } else if (selectedHourRange) {
      // Minute view mode with hour range
      const [hh, mm, ss] = selectedHourRange.start.split(':').map(Number);
      const initialTime = new Date(baseDate);
      initialTime.setHours(hh, mm, ss, 0);
      setSelectedTime(initialTime);
      
      const endTime = new Date(initialTime);
      endTime.setHours(hh + 1, 0, 0, 0); // 1 hour range
      setSelectionStart(initialTime);
      setSelectionEnd(endTime);
    }
  }, [perSecondData, selectedDate, selectedHourRange]);
  */

  useEffect(() => {
    // Only load chart data when vehicle and date are selected AND modal is closed
    // Always return early if modal is showing - don't load any data
    if (showAssetModal) {
      console.log('🚫 Modal is showing - skipping data load');
      return;
    }
    if (!selectedVehicleId || !selectedDate) {
      console.log('🚫 No vehicle or date selected - skipping data load');
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      // Increment load version so any previous in-flight processing stops applying updates.
      const loadVersion = ++loadVersionRef.current;
      try {
        setLoading(true);
        setProcessingProgress(0);
        setRawTimestamps([]); // Clear previous timestamps
        
        // COMMENTED OUT API CALL - Using dummy JSON file instead
        /*
        // Use the create_json.php API endpoint with reading_date and devices_serial_no parameters
        let json: any;
        try {
          // Build API URL with reading_date and devices_serial_no query parameters (via proxy)
          // Use relative URL so proxy can handle it
          const apiUrl = `/reet_python/create_json.php?reading_date=${encodeURIComponent(selectedDate)}&devices_serial_no=${encodeURIComponent(String(selectedVehicleId))}`;
          
          console.log('🔗 Fetching from API endpoint:', apiUrl);
          
          const apiRes = await fetch(apiUrl, {
            headers: { 
              'Accept': 'application/json'
            },
            cache: 'no-store',
            mode: 'cors',
            credentials: 'omit'
          });
          
          if (!apiRes.ok) {
            console.error('❌ API response not OK:', apiRes.status, apiRes.statusText);
            const errorText = await apiRes.text().catch(() => 'Unable to read error response');
            console.error('Error response body:', errorText);
            throw new Error(`API failed with status ${apiRes.status}: ${apiRes.statusText}`);
          }
          
          
          // Get response as text first to check if it's valid JSON
          const responseText = await apiRes.text();
          const contentType = apiRes.headers.get('content-type');
          console.log('📄 Raw API response text (first 200 chars):', responseText.substring(0, 200));
          console.log('📄 Content-Type:', contentType);
          
          // Try to parse as JSON
          try {
            json = JSON.parse(responseText);
            console.log('✅ API success, parsed JSON (Content-Type was:', contentType, ')');
          } catch (parseError: any) {
            console.error('❌ Failed to parse response as JSON:', parseError);
            console.error('❌ Content-Type:', contentType);
            console.error('❌ Response text (first 1000 chars):', responseText.substring(0, 1000));
            
            // Check if it's HTML
            if (responseText.includes('<!doctype') || responseText.includes('<html')) {
              console.error('❌ API returned HTML page instead of JSON');
              setErrorModal({
                isOpen: true,
                message: 'We could not load your data right now. Please refresh the page and try again.',
                details: undefined,
                endpoint: undefined,
                showRefresh: true
              });
              throw new Error('API returned HTML instead of JSON');
            } else {
              setErrorModal({
                isOpen: true,
                message: 'We could not load your data right now. Please refresh the page and try again.',
                details: undefined,
                endpoint: undefined,
                showRefresh: true
              });
              throw new Error('Invalid JSON response from API');
            }
          }
        } catch (err: any) {
          console.error('❌ API request failed:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
          });
          
          // Don't show alert if this is just a network error on page load
          // Only show if we actually have a selection
          if (selectedVehicleId && selectedDate) {
          // Provide helpful error message
          const errorMsg = err.message.includes('Failed to fetch') || err.message.includes('CORS')
            ? 'CORS or network error. The API server may not allow requests from this domain, or the endpoint may be incorrect.'
            : err.message;
          
          setLoading(false);
            setProcessingProgress(0);
            console.error('Full error details:', err);
            
            // Show simple refresh modal
            setErrorModal({
              isOpen: true,
              message: 'We could not load your data right now. Please refresh the page and try again.',
              details: undefined,
              endpoint: undefined,
              showRefresh: true
            });
          } else {
            // Just log the error, don't show alert if no selection
            console.warn('⚠️ API error but no valid selection - ignoring');
            setLoading(false);
            setProcessingProgress(0);
          }
          throw err;
        }
        */
        
        // LOAD FROM API BASED ON SCREEN MODE (using proxy to avoid CORS)
        // Always send start_time/end_time:
        // - Initial load: full shift range (shift start to shift end)
        // - Range change: selected range from scrubber
        const shiftMeta = getShiftMeta(selectedDate, selectedShift);
        const shiftParamForApi = shiftMeta.shiftApi;
        const shiftStartSec = shiftMeta.startSec;
        const shiftEndSec = shiftMeta.endSec;
        
        let startTimeStr: string;
        let endTimeStr: string;
        let apiDateForRequest = selectedDate;
        
        // Date semantics:
        // - Full-shift loads use the shift "timeline base day" (previous day for overnight shifts)
        // - Range loads use the UTC day of the selected range start
        if (apiRange) {
          const startDayMs = getUtcDayStartMsFromMs(apiRange.startMs);
          apiDateForRequest = formatUtcDayStartMsLike(startDayMs, selectedDate);
        } else if (shiftMeta.timelineBaseDayStartMs != null) {
          apiDateForRequest = formatUtcDayStartMsLike(shiftMeta.timelineBaseDayStartMs, selectedDate);
        }
        
        if (apiRange) {
          const startDate = new Date(apiRange.startMs);
          const endDate = new Date(apiRange.endMs);

          startTimeStr = formatDateUtcToHms(startDate);
          endTimeStr = formatDateUtcToHms(endDate);
        } else {
          startTimeStr = formatSecondsToHms(shiftStartSec);
          endTimeStr = formatSecondsToHms(shiftEndSec > 24 * 3600 ? shiftEndSec - 24 * 3600 : shiftEndSec);
        }

        let apiUrl: string;
        if (screenMode === 'Drilling') {
          // Use new drilling API with parameters
          // Use devices_serial_no (string) for API call
          const serialNo = selectedVehicleSerialNo || String(selectedVehicleId);
          apiUrl = `/reet_python/mccullochs/apis/get_drilling_json.php?devices_serial_no=${encodeURIComponent(serialNo)}&date=${encodeURIComponent(apiDateForRequest)}&shift=${encodeURIComponent(shiftParamForApi)}&start_time=${encodeURIComponent(startTimeStr)}&end_time=${encodeURIComponent(endTimeStr)}`;
          console.log(`📂 Loading ${screenMode} data from API:`, apiUrl);
        } else {
          // Maintenance mode - use new maintenance API with parameters
          // Use devices_serial_no (string) for API call
          const serialNo = selectedVehicleSerialNo || String(selectedVehicleId);
          apiUrl = `/reet_python/mccullochs/apis/get_maintenance_json.php?devices_serial_no=${encodeURIComponent(serialNo)}&date=${encodeURIComponent(apiDateForRequest)}&shift=${encodeURIComponent(shiftParamForApi)}&start_time=${encodeURIComponent(startTimeStr)}&end_time=${encodeURIComponent(endTimeStr)}`;
          console.log(`📂 Loading ${screenMode} data from API:`, apiUrl);
        }
        
        const response = await fetch(apiUrl, {
          headers: { 
            'Accept': 'application/json'
          },
          cache: 'no-store',
          mode: 'cors',
          signal: controller.signal
        });

        // Ignore stale loads (e.g., user dragged range again quickly)
        if (loadVersion !== loadVersionRef.current) return;
        
        if (!response.ok) {
          throw new Error(`Failed to load data from API: ${response.status} ${response.statusText}`);
        }
        
        const responseText = await response.text();
        if (loadVersion !== loadVersionRef.current) return;
        let json: any;
        
        try {
          json = JSON.parse(responseText);
        } catch (parseError) {
          console.error('❌ Failed to parse response as JSON:', parseError);
          console.error('❌ Response text (first 1000 chars):', responseText.substring(0, 1000));
          throw new Error('Invalid JSON response from API');
        }

        if (loadVersion !== loadVersionRef.current) return;
        
        // Handle API response structure: { success: true, data: {...} }
        if (json.success && json.data) {
          if (loadVersion !== loadVersionRef.current) return;
          // Extract table data for maintenance mode
          if (screenMode === 'Maintenance') {
            // Helper function to convert array format to object format
            // Preserves original value string and reading from API
            const convertArrayToObject = (arr: any[]): Record<string, { valueStr: string; reading: string; id: string }> => {
              const result: Record<string, { valueStr: string; reading: string; id: string }> = {};
              
              if (!Array.isArray(arr)) {
                // Already an object, return as-is
                return arr || {};
              }
              
              arr.forEach((item: any) => {
                const name = String(item.name || '');
                const valueStr = String(item.value || '0:00:00');
                const reading = String(item.reading || 'Hours');
                const id = String(item.id || '');
                
                if (name) {
                  result[name] = {
                    valueStr,
                    reading,
                    id
                  };
                  console.log(`📊 Maintenance item: "${name}" = ${valueStr} (${reading})`);
                }
              });
              
              return result;
            };
            
            const processedReportingOutputs = convertArrayToObject(json.data.reportingOutputs || []);
            const processedFaultReportingAnalog = convertArrayToObject(json.data.faultReportingAnalog || []);
            const processedFaultReportingDigital = convertArrayToObject(json.data.faultReportingDigital || []);
            
            setMaintenanceTablesData({
              reportingOutputs: processedReportingOutputs,
              faultReportingAnalog: processedFaultReportingAnalog,
              faultReportingDigital: processedFaultReportingDigital
            });
            console.log('✅ Set maintenance tables data from API:', {
              reportingOutputs: Object.keys(processedReportingOutputs).length,
              faultReportingAnalog: Object.keys(processedFaultReportingAnalog).length,
              faultReportingDigital: Object.keys(processedFaultReportingDigital).length
            });
          }
          json = json.data; // Extract data from response wrapper
        }
        
        console.log('✅ Loaded data from API');
        
        // Convert analogPerSecond to analogPerMinute format (aggregate 60 seconds into 1 minute)
        const convertPerSecondToPerMinute = (perSecondData: any[]) => {
          return perSecondData.map((series: any) => {
            const minuteMap = new Map<string, { avgs: number[]; mins: number[]; maxs: number[] }>();
            
            // Group points by minute
            (series.points || []).forEach((point: any) => {
              const [hh, mm, ss] = point.time.split(':').map(Number);
              const minuteKey = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
              
              if (!minuteMap.has(minuteKey)) {
                minuteMap.set(minuteKey, { avgs: [], mins: [], maxs: [] });
              }
              
              const minuteData = minuteMap.get(minuteKey)!;
              if (point.avg != null && !isNaN(point.avg)) minuteData.avgs.push(point.avg);
              if (point.min != null && !isNaN(point.min)) minuteData.mins.push(point.min);
              if (point.max != null && !isNaN(point.max)) minuteData.maxs.push(point.max);
            });
            
            // Create per-minute points
            const minutePoints = Array.from(minuteMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([minuteKey, data]) => {
                const avg = data.avgs.length > 0 ? data.avgs.reduce((a, b) => a + b, 0) / data.avgs.length : null;
                const min = data.mins.length > 0 ? Math.min(...data.mins) : (avg != null ? avg : null);
                const max = data.maxs.length > 0 ? Math.max(...data.maxs) : (avg != null ? avg : null);
                
                return {
                  time: `${minuteKey}:00`,
                  avg,
                  min,
                  max
                };
              });
            
            return {
              ...series,
              points: minutePoints
            };
          });
        };
        
        // Convert digitalPerSecond to per-minute (take value at :00 second of each minute)
        const convertDigitalPerSecondToPerMinute = (perSecondData: any[]) => {
          return perSecondData.map((series: any) => {
            const minutePoints: any[] = [];
            const minuteMap = new Map<string, number>();
            
            // Group by minute, take the value at :00 second
            (series.points || []).forEach((point: any) => {
              const [hh, mm, ss] = point.time.split(':').map(Number);
              if (ss === 0) {
                const minuteKey = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                minuteMap.set(minuteKey, point.value);
              }
            });
            
            // Create per-minute points
            Array.from(minuteMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .forEach(([minuteKey, value]) => {
                minutePoints.push({
                  time: `${minuteKey}:00`,
                  value
                });
              });
            
            return {
              ...series,
              points: minutePoints
            };
          });
        };
        
        // Convert timestamps to per-minute (take :00 second of each minute)
        const convertTimestampsToPerMinute = (timestamps: any[]) => {
          const minuteMap = new Map<string, any>();
          timestamps.forEach((ts: any) => {
            const [hh, mm, ss] = ts.time.split(':').map(Number);
            if (ss === 0) {
              const minuteKey = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
              minuteMap.set(minuteKey, ts);
            }
          });
          return Array.from(minuteMap.values()).sort((a, b) => a.time.localeCompare(b.time));
        };
        
        // Use the JSON structure directly - we have proper data files
        console.log('✅ Loaded JSON data with', json.analogPerMinute?.length || 0, 'analog series');
        console.log('✅ First series has', json.analogPerMinute?.[0]?.points?.length || 0, 'data points');
        console.log('✅ Timestamps count:', json.timestamps?.length || 0);
        console.log('✅ Table data keys:', json.tableData ? Object.keys(json.tableData) : 'none');
        
        let payload: any = {
          timestamps: json.timestamps || [],
          gpsPerSecond: json.gpsPerSecond || [],
          // New API can provide both per-second and per-minute series.
          digitalPerSecond: json.digitalPerSecond || [],
          digitalPerMinute: json.digitalPerMinute || [],
          analogPerSecond: json.analogPerSecond || [],
          analogPerMinute: json.analogPerMinute || []
        };
        
        // Extract table data - preserve original value string and reading from API
        if (json.tableData) {
          const processedTableData: Record<string, { valueStr: string; reading: string; id: string }> = {};
          
          if (Array.isArray(json.tableData)) {
            // Array format: array of objects with id, name, value (string), reading
            console.log('✅ Processing tableData as array format:', json.tableData.length, 'items');
            json.tableData.forEach((item: any) => {
              const name = String(item.name || '');
              const valueStr = String(item.value || '0:00:00');
              const reading = String(item.reading || 'Hours');
              const id = String(item.id || '');
              
              // Use name directly from API as key
              const key = name;
              
              processedTableData[key] = {
                valueStr,
                reading,
                id
              };
              
              console.log(`📊 Drilling table item: id=${id}, name="${name}", value="${valueStr}", reading="${reading}"`);
            });
          } else if (typeof json.tableData === 'object') {
            // Old format: convert if needed, but prefer array format
            console.log('⚠️ tableData is object format, expected array format from API');
            // Try to convert old format if it exists
            Object.entries(json.tableData).forEach(([key, value]: [string, any]) => {
              if (value && typeof value === 'object') {
                // If old format has value as number, we can't preserve original string
                // This should not happen with new API, but handle gracefully
                processedTableData[key] = {
                  valueStr: String(value.value || '0:00:00'),
                  reading: String(value.reading || 'Hours'),
                  id: String(value.id || '')
                };
              }
            });
          }
          
          console.log('✅ Setting processed table data:', Object.keys(processedTableData));
          setTableData(processedTableData);
        } else {
          console.warn('⚠️ No tableData in API response');
        }
        
        // Extract and process timestamps for scrubber
        // API can return timestamps as: array of numbers (Unix timestamps) or array of objects
        let processedTimestamps: number[] = [];
        if (payload.timestamps && Array.isArray(payload.timestamps)) {
          if (payload.timestamps.length > 0) {
            // Check if first element is a number (Unix timestamp) or an object
            const firstItem = payload.timestamps[0];
            if (typeof firstItem === 'number') {
              // Array of Unix timestamps (could be seconds or milliseconds)
              // Timestamps in seconds for years 2000-2100 are typically < 4,102,444,800 (year 2100 in seconds)
              // Timestamps in milliseconds for years 2000-2100 are typically > 946,684,800,000 (year 2000 in milliseconds)
              // Use 10 billion as threshold (year 2286 in seconds, year 2001 in milliseconds)
              processedTimestamps = payload.timestamps.map((ts: number) => {
                // If timestamp is less than 10 billion, assume it's in seconds
                if (ts < 10000000000) {
                  return ts * 1000; // Convert seconds to milliseconds
                }
                return ts; // Already in milliseconds
              });
            } else if (typeof firstItem === 'object' && firstItem !== null) {
              // Array of objects with timestamp property
              processedTimestamps = payload.timestamps
                .map((ts: any) => {
                  // Try different possible property names
                  const timestamp = ts.timestamp || ts.time || ts.ts;
                  if (typeof timestamp === 'number') {
                    // If timestamp is less than 10 billion, assume it's in seconds
                    if (timestamp < 10000000000) {
                      return timestamp * 1000; // Convert seconds to milliseconds
                    }
                    return timestamp; // Already in milliseconds
                  } else if (typeof timestamp === 'string') {
                    // Parse ISO string or other date format
                    const parsed = new Date(timestamp).getTime();
                    return isNaN(parsed) ? null : parsed;
                  }
                  return null;
                })
                .filter((ts: number | null): ts is number => ts !== null && Number.isFinite(ts));
            }
          }
        }
        
        // Sort timestamps and remove duplicates
        processedTimestamps = Array.from(new Set(processedTimestamps)).sort((a, b) => a - b);
        setRawTimestamps(processedTimestamps);
        console.log('✅ Extracted timestamps for scrubber:', processedTimestamps.length, 'points');
        if (processedTimestamps.length > 0) {
          const firstDate = new Date(processedTimestamps[0]);
          const lastDate = new Date(processedTimestamps[processedTimestamps.length - 1]);
          console.log('✅ First timestamp (UTC):', 
            `${String(firstDate.getUTCHours()).padStart(2, '0')}:${String(firstDate.getUTCMinutes()).padStart(2, '0')}:${String(firstDate.getUTCSeconds()).padStart(2, '0')} UTC`,
            `(${firstDate.toISOString()})`
          );
          console.log('✅ Last timestamp (UTC):', 
            `${String(lastDate.getUTCHours()).padStart(2, '0')}:${String(lastDate.getUTCMinutes()).padStart(2, '0')}:${String(lastDate.getUTCSeconds()).padStart(2, '0')} UTC`,
            `(${lastDate.toISOString()})`
          );
          
          // Set initial selection range based on actual data timestamps
          // Use the first and last timestamps from the API data
          const dataStart = new Date(processedTimestamps[0]);
          const dataEnd = new Date(processedTimestamps[processedTimestamps.length - 1]);
          
          // Set a reasonable initial selected time (center of the full data domain).
          // The visible window (selectionStart/End) is set later once all signals are processed.
          if (!selectedTime) {
            const centerTime = new Date((dataStart.getTime() + dataEnd.getTime()) / 2);
            setSelectedTime(centerTime);
          }
        }
        
        // Create a map of time strings to timestamps for efficient lookup
        const timeToTimestampMap = new Map<string, number>();
        if (payload.timestamps && Array.isArray(payload.timestamps)) {
          payload.timestamps.forEach((ts: any) => {
            if (!ts?.time) return;
            const raw = ts.timestamp ?? ts.time ?? ts.ts;
            let ms: number | null = null;
            if (typeof raw === 'number') {
              ms = raw < 1e12 ? raw * 1000 : raw;
            } else if (typeof raw === 'string') {
              const parsed = Date.parse(raw);
              ms = Number.isFinite(parsed) ? parsed : null;
            }
            if (ms != null && Number.isFinite(ms)) {
              timeToTimestampMap.set(String(ts.time), ms);
            }
          });
        }

        // Build shift-aware (UTC) time parsing helpers.
        // This is critical for overnight shifts (e.g. 18:00 -> 06:00) so that
        // points after 00:00 are placed on the *next* day in the same shift timeline.
        const shiftMetaForTimeline = getShiftMeta(selectedDate, selectedShift);
        const crossesMidnightForTimeline = shiftMetaForTimeline.crossesMidnight;
        const normalizedEndSecForTimeline = shiftMetaForTimeline.normalizedEndSec;
        let timelineBaseDayStartMsForTimeline = shiftMetaForTimeline.timelineBaseDayStartMs;
        if (timelineBaseDayStartMsForTimeline == null) {
          const base = new Date(processedTimestamps[0] ?? Date.now());
          base.setUTCHours(0, 0, 0, 0);
          timelineBaseDayStartMsForTimeline = base.getTime();
        }

        const hmsToTimelineMs = (hms: string): number => {
          const parts = String(hms || '00:00:00').split(':');
          const hh = Number(parts[0] || 0);
          const mm = Number(parts[1] || 0);
          const ss = Number(parts[2] || 0);

          const timeInSeconds = (hh * 3600) + (mm * 60) + ss;
          let timestamp =
            (timelineBaseDayStartMsForTimeline as number) +
            (timeInSeconds * 1000);

          if (crossesMidnightForTimeline && timeInSeconds <= normalizedEndSecForTimeline) {
            timestamp += DAY_MS;
          }

          return timestamp;
        };
        
        // Convert analogPerMinute to analogSignals format if needed
        // This conversion is needed because the rest of the code expects analogSignals format
        if (payload.analogPerMinute && payload.analogPerMinute.length > 0) {
          // Log series info for debugging
          console.log('📊 analogPerMinute series count:', payload.analogPerMinute.length);
          payload.analogPerMinute.forEach((series: any, idx: number) => {
            console.log(`Series ${idx + 1}:`, {
              id: series.id,
              name: series.name,
              hasPoints: !!series.points,
              pointsType: Array.isArray(series.points) ? 'array' : typeof series.points,
              pointsLength: Array.isArray(series.points) ? series.points.length : 'N/A'
            });
          });
          
          // Check if any series has points - but don't skip processing entirely
          // The later processing section will handle individual series
          const hasPoints = payload.analogPerMinute.some((series: any) => 
            series.points && 
            (Array.isArray(series.points) ? series.points.length > 0 : series.points !== null)
          );
          
          // Note: We still set analogSignals even if some series have null points
          // The later processing will handle each series individually
          if (hasPoints) {
          // Convert from analogPerMinute structure to analogSignals structure
          payload.analogSignals = payload.analogPerMinute.map((series: any) => {
            // Extract values, mins, maxs from points array
            const values: (number | null)[] = [];
            const mins: (number | null)[] = [];
            const maxs: (number | null)[] = [];
            const times: number[] = [];
            
            (series.points || []).forEach((point: any) => {
              // Use timestamp from map if available, otherwise derive from shift timeline.
              // IMPORTANT: For overnight shifts, convert "00:xx" into next-day timestamps so
              // they appear after 23:59:59 within the same selected shift.
              const timeKey = String(point.time || '00:00:00');
              const mapped = timeToTimestampMap.get(timeKey);
              const timelineTs = hmsToTimelineMs(timeKey);
              let timestamp = Number.isFinite(mapped as number) ? (mapped as number) : timelineTs;

              // If the mapped timestamp is clearly on the wrong day (common with overnight shifts),
              // prefer the shift-timeline timestamp so charts & scrubber share the same domain.
              if (Number.isFinite(mapped as number) && Math.abs((mapped as number) - timelineTs) > 12 * 3600 * 1000) {
                timestamp = timelineTs;
              }

              times.push(timestamp);
              
              // New drilling API often returns `value` (not `avg`). Treat value as avg when avg is missing.
              const avg = point.avg ?? point.value ?? point.val ?? null;
              const min = point.min ?? point.avg ?? point.value ?? point.val ?? null;
              const max = point.max ?? point.avg ?? point.value ?? point.val ?? null;
              values.push(avg === '' ? null : avg);
              mins.push(min === '' ? null : min);
              maxs.push(max === '' ? null : max);
            });
            
            // Preserve all series properties including min_color, max_color, and yAxisRange
            const converted = {
              ...series,
              values,
              mins,
              maxs,
              times,
              // Explicitly preserve color properties from API
              color: series.color,
              min_color: series.min_color,
              max_color: series.max_color,
              // Preserve yAxisRange if present
              yAxisRange: series.yAxisRange || { min: 0, max: 100 },
              // Preserve unit
              unit: series.unit || ''
            };
            
            console.log(`📊 Converted series ${series.id || series.name}:`, {
              pointsCount: series.points?.length || 0,
              valuesCount: values.length,
              timesCount: times.length,
              yAxisRange: converted.yAxisRange,
              unit: converted.unit,
              color: converted.color,
              firstValue: values[0],
              firstTime: times[0] ? new Date(times[0]).toISOString() : 'N/A',
              sampleValues: values.slice(0, 3),
              sampleTimes: times.slice(0, 3).map(t => new Date(t).toISOString())
            });
            
            // Debug: Log color extraction
            if (series.min_color || series.max_color) {
              console.log(`🎨 Extracted colors for ${series.id || series.name}:`, {
                color: series.color,
                min_color: series.min_color,
                max_color: series.max_color
              });
            }
            
            return converted;
          });
          }
        }
        
        // Convert digitalPerMinute to digitalSignals format if needed
        if (payload.digitalPerMinute && payload.digitalPerMinute.length > 0) {
          const hasPoints = payload.digitalPerMinute.some((series: any) => series.points && series.points.length > 0);
          if (hasPoints) {
          payload.digitalSignals = payload.digitalPerMinute.map((series: any) => {
            const values: number[] = [];
            const times: number[] = [];
            
            (series.points || []).forEach((point: any) => {
              const timeKey = String(point.time || '00:00:00');
              times.push(hmsToTimelineMs(timeKey));
              values.push(point.value != null ? point.value : 0);
            });
            
            return {
              ...series,
              values,
              times
            };
          });
          }
        }
        
        // Also handle digitalPerSecond format (from dummy data)
        if (!payload.digitalSignals && payload.digitalPerSecond && payload.digitalPerSecond.length > 0) {
          payload.digitalSignals = payload.digitalPerSecond.map((series: any) => {
            const values: number[] = [];
            const times: number[] = [];
            
            (series.points || []).forEach((point: any) => {
              const timeKey = String(point.time || '00:00:00');
              times.push(hmsToTimelineMs(timeKey));
              values.push(point.value != null ? point.value : 0);
            });
            
            return {
              ...series,
              values,
              times
            };
          });
        }
        
        // Filter by hour range if selected (only for maintenance mode, not drilling)
        // In drilling mode, show all data and let charts filter by timeDomain
        if (selectedHourRange && screenMode === 'Maintenance') {
          const filterByTimeRange = (items: any[], timeField: string) => {
            return items.map((item: any) => {
              if (Array.isArray(item.points)) {
                // For series with points array
                const filteredPoints = item.points.filter((point: any) => {
                  const pointTime = point.time || point[timeField];
                  return pointTime >= selectedHourRange.start && pointTime < selectedHourRange.end;
                });
                return { ...item, points: filteredPoints };
              } else if (Array.isArray(item)) {
                // For arrays of timestamps or GPS points
                return item.filter((point: any) => {
                  const pointTime = point.time || point[timeField];
                  return pointTime >= selectedHourRange.start && pointTime < selectedHourRange.end;
                });
              }
              return item;
            });
          };
          
          payload = {
            timestamps: filterByTimeRange(payload.timestamps, 'time'),
            gpsPerSecond: filterByTimeRange(payload.gpsPerSecond, 'time'),
            digitalPerSecond: filterByTimeRange(payload.digitalPerSecond, 'time'),
            analogPerMinute: filterByTimeRange(payload.analogPerMinute, 'time'),
            analogSignals: payload.analogSignals || [],
            digitalSignals: payload.digitalSignals || []
          };
          
          console.log('🔍 Filtered data by hour range:', selectedHourRange.start, 'to', selectedHourRange.end);
        } else if (screenMode === 'Drilling') {
          console.log('📊 Drilling mode: Not filtering by hour range - showing all data');
        }
        
        console.log('✅ Converted per-second data to per-minute format');
        console.log('📊 Per-minute data:', {
          timestamps: payload.timestamps.length,
          analogPerMinute: payload.analogPerMinute.length,
          digitalPerSecond: payload.digitalPerSecond.length,
          gpsPerSecond: payload.gpsPerSecond.length
        });
        
        // Log the payload structure for debugging
        console.group('📊 API Response - Full Payload');
        console.log('Raw JSON:', json);
        console.log('Payload keys:', typeof payload === 'object' && payload !== null ? Object.keys(payload) : 'N/A');
        console.log('Timestamps:', payload?.timestamps?.length || 0);
        console.log('GPS data:', payload?.gpsPerSecond?.length || 0);
        console.log('Digital signals:', payload?.digitalPerSecond?.length || 0);
        console.log('Analog signals:', payload?.analogPerMinute?.length || 0);
        console.groupEnd();
        
        // Handle empty/null data
        if (!payload || (!payload.timestamps && !payload.gpsPerSecond && !payload.digitalPerSecond && !payload.analogPerMinute)) {
          console.warn('⚠️ API returned empty data - showing empty charts');
          
          // Set empty data and return early
          setVehicleMetrics([]);
          setDigitalStatusChart({
            id: 'digital-status',
            name: 'Digital Status Indicators',
            metrics: []
          });
          setSelectedTime(null);
          setSelectionStart(null);
          setSelectionEnd(null);
          setLoading(false);
          return;
        }
        
        // Check if we have per-second/per-minute data format
        const hasPerSecondData = payload && (
          (Array.isArray(payload.digitalPerSecond) && payload.digitalPerSecond.length > 0) ||
          (Array.isArray(payload.analogPerSecond) && payload.analogPerSecond.length > 0) ||
          (Array.isArray(payload.analogPerMinute) && payload.analogPerMinute.length > 0)
        );
        
        // Check if payload is a flat array (alternative format)
        const isFlatArray = Array.isArray(payload) && payload.length > 0 && payload[0]?.chartName;
        
        console.log('📦 Data format detection:', {
          hasPerSecondData,
          isFlatArray,
          digitalPerSecond: payload?.digitalPerSecond,
          analogPerSecond: payload?.analogPerSecond,
          analogPerMinute: payload?.analogPerMinute,
          times: payload?.times
        });
        
        // If flat array format, transform it into grouped structure
        if (isFlatArray) {
          console.group('🔄 Transforming Flat Array to Grouped Structure');
          
          // Group readings by chartName
          const groupedByChart: Record<string, any[]> = {};
          (payload as any[]).forEach((reading: any) => {
            if (!reading.chartName) return;
            const chartName = String(reading.chartName);
            if (!groupedByChart[chartName]) {
              groupedByChart[chartName] = [];
            }
            groupedByChart[chartName].push(reading);
          });
          
          console.log('Grouped by chart:', groupedByChart);
          
          // Separate digital and analog signals
          const digitalSignals: any[] = [];
          const analogSignals: any[] = [];
          
          Object.entries(groupedByChart).forEach(([chartName, readings]) => {
            const firstReading = readings[0];
            const chartType = String(firstReading.chartType || '').toLowerCase();
            
            // Extract chart ID from chartName (e.g., "On-Track Status (D1)" -> "D1")
            const idMatch = chartName.match(/\(([^)]+)\)/);
            const chartId = idMatch ? idMatch[1] : chartName;
            
            // Sort readings by date_time
            readings.sort((a, b) => {
              const timeA = Date.parse(a.date_time || `${a.date} ${a.time}` || '');
              const timeB = Date.parse(b.date_time || `${b.date} ${b.time}` || '');
              return timeA - timeB;
            });
            
            if (chartType === 'digital') {
              // Check display field - only exclude if explicitly false
              const displayValue = firstReading.display;
              // Only filter out if display is explicitly false (boolean or string)
              const isExplicitlyFalse = displayValue === false || displayValue === 'false' || displayValue === 'False' || displayValue === 'FALSE';
              
              if (isExplicitlyFalse) {
                console.log('🚫 Filtered out digital signal (display=false):', chartName, 'display value:', displayValue);
                return;
              }
              // Include all others (true, undefined, null, or any other value)
              
              // Digital signal
              const values: number[] = [];
              const times: string[] = [];
              
              readings.forEach((r: any) => {
                const timeStr = r.date_time || `${r.date} ${r.time}`;
                times.push(timeStr);
                values.push(Number(r.value ?? 0));
              });
              
              digitalSignals.push({
                id: chartId,
                name: chartName.replace(/\([^)]+\)/, '').trim(),
                values,
                times,
                chartType: 'Digital'
              });
            } else if (chartType === 'analogue' || chartType === 'analog') {
              // Check display field - only include if display is true (or undefined for backward compatibility)
              const shouldDisplay = firstReading.display !== false;
              if (!shouldDisplay) {
                console.log('🚫 Filtered out analog signal (display=false):', chartName);
                return;
              }
              
              // Analog signal
              const avgValues: (number | null)[] = [];
              const minValues: (number | null)[] = [];
              const maxValues: (number | null)[] = [];
              const times: string[] = [];
              
              readings.forEach((r: any) => {
                const timeStr = r.date_time || `${r.date} ${r.time}`;
                times.push(timeStr);
                // Use null for missing values so line doesn't connect through missing data
                const avgVal = r.avg != null ? Number(r.avg) : null;
                const minVal = r.min != null ? Number(r.min) : (r.avg != null ? Number(r.avg) : null);
                const maxVal = r.max != null ? Number(r.max) : (r.avg != null ? Number(r.avg) : null);
                avgValues.push(avgVal != null && Number.isFinite(avgVal) && !isNaN(avgVal) ? avgVal : null);
                minValues.push(minVal != null && Number.isFinite(minVal) && !isNaN(minVal) ? minVal : null);
                maxValues.push(maxVal != null && Number.isFinite(maxVal) && !isNaN(maxVal) ? maxVal : null);
              });
              
              analogSignals.push({
                id: chartId,
                name: chartName.replace(/\([^)]+\)/, '').trim(),
                values: avgValues,
                avg: avgValues,
                mins: minValues,
                maxs: maxValues,
                times,
                chartType: 'Analogue'
              });
            }
          });
          
          console.log('Digital signals:', digitalSignals);
          console.log('Analog signals:', analogSignals);
          console.groupEnd();
          
          // Sort digital signals by ID number in ascending order, then reverse
          // This puts D64 at index 0 (bottom) and D44 at last index (top)
          if (digitalSignals.length > 0) {
            digitalSignals.sort((a, b) => {
              const getNumericId = (signal: any): number => {
                const id = String(signal.id || signal.name || '');
                const match = id.match(/\d+/);
                return match ? parseInt(match[0], 10) : 0;
              };
              const numA = getNumericId(a);
              const numB = getNumericId(b);
              // Sort ascending first (D44, D46, ..., D64)
              return numA - numB;
            }).reverse(); // Reverse so D64 is at index 0 (bottom) and D44 is at last index (top)
            (payload as any).digitalSignals = digitalSignals;
          }
          if (analogSignals.length > 0) (payload as any).analogSignals = analogSignals;
        }
        
        // Normalize possible server payloads into common structure
        // Prefer json.times, but also accept 'timestamps' variants and string times
        const pick = (...paths: string[]): any => {
          for (const p of paths) {
            const v = (payload as any)?.[p];
            if (v != null) return v;
          }
          return undefined;
        };
        // Helper function to parse timestamp and align to minute boundary
        const parseTimestampToMs = (timestamp: any): number => {
          let ts: number;
          if (typeof timestamp === 'number') {
            ts = timestamp;
          } else if (typeof timestamp === 'string') {
            ts = Date.parse(timestamp);
          } else {
            return NaN;
          }
          // If timestamp is in seconds (10 digits or less), convert to milliseconds
          if (ts < 1e12) {
            ts = ts * 1000;
          }
          return ts;
        };

        // Align timestamps to a time bucket.
        // - Minute view: 60s buckets
        // - Second view: 1s buckets
        let bucketMs = 60 * 1000;
        const alignToMinute = (timestampMs: number): number => {
          return Math.floor(timestampMs / bucketMs) * bucketMs;
        };

        // Get times array from timestamps field (new API format)
        // timestamps: [{time: "HH:mm:ss", timestamp: "YYYY-MM-DDTHH:mm:ss"}, ...]
        let timesRaw: any[] = [];
        if (Array.isArray(payload.timestamps)) {
          // Extract timestamp strings from the timestamps array
          timesRaw = payload.timestamps.map((t: any) => t.timestamp || t.time);
        } else {
          // Fallback to old format
          timesRaw = Array.isArray(pick('times', 'timeStamps', 'timestamps')) 
          ? pick('times', 'timeStamps', 'timestamps') 
          : [];
        }
        
        const parsedTimes: number[] = timesRaw
          .map(parseTimestampToMs)
          .filter((n: number) => Number.isFinite(n))
          .sort((a, b) => a - b);

        // Infer resolution from payload/timestamps.
        const hasPerSecondSeries =
          (Array.isArray((payload as any).analogPerSecond) && (payload as any).analogPerSecond.length > 0) ||
          (Array.isArray((payload as any).digitalPerSecond) && (payload as any).digitalPerSecond.length > 0);

        // Prefer the real timestamp array from the API when available (it can be numbers or parsed ISO strings).
        // Fall back to parsedTimes otherwise.
        const inferenceTimes =
          (Array.isArray(processedTimestamps) && processedTimestamps.length > 1)
            ? processedTimestamps
            : parsedTimes;

        // Scan a small prefix for the smallest positive delta.
        let minDelta = Number.POSITIVE_INFINITY;
        for (let i = 1; i < Math.min(inferenceTimes.length, 2000); i++) {
          const d = inferenceTimes[i] - inferenceTimes[i - 1];
          if (d > 0 && d < minDelta) minDelta = d;
          if (minDelta <= 1000) break; // can't get smaller than 1s for our use case
        }

        // If the server sent per-minute arrays but point times include non-zero seconds, treat as per-second.
        const hasSecondGranularityInPointTimes = (() => {
          const checkSeries = (arr: any): boolean => {
            if (!Array.isArray(arr)) return false;
            for (const series of arr.slice(0, 5)) {
              const pts = (series as any)?.points;
              if (!Array.isArray(pts)) continue;
              for (const p of pts.slice(0, 200)) {
                const t = String((p as any)?.time ?? '');
                const parts = t.split(':');
                if (parts.length >= 3) {
                  const ss = Number(parts[2]);
                  if (Number.isFinite(ss) && ss !== 0) return true;
                }
              }
            }
            return false;
          };
          return (
            checkSeries((payload as any).analogPerMinute) ||
            checkSeries((payload as any).digitalPerMinute) ||
            checkSeries((payload as any).analogPerSecond) ||
            checkSeries((payload as any).digitalPerSecond)
          );
        })();

        const inferredSecondView =
          hasPerSecondSeries ||
          hasSecondGranularityInPointTimes ||
          (Number.isFinite(minDelta) && minDelta > 0 && minDelta < 60 * 1000);

        // Update UI mode (used by scrubber + charts)
        setIsSecondViewMode(inferredSecondView);

        // Set alignment bucket for all subsequent parsing/series building in this load.
        bucketMs = inferredSecondView ? 1000 : 60 * 1000;

        const times: number[] = parsedTimes
          .map(alignToMinute)
          .filter((n: number) => Number.isFinite(n))
          .filter((n: number, i: number, arr: number[]) => i === 0 || n !== arr[i - 1])
          .sort((a, b) => a - b); // Sort ascending
        
        console.log('📅 Times array:', {
          rawCount: timesRaw.length,
          processedCount: times.length,
          firstFew: times.slice(0, 5),
          lastFew: times.slice(-5)
        });

        // Create series mapping function that uses exact API values and aligned timestamps
        // Skip data points with null/invalid values so line doesn't render at missing time points
        const toSeries = (values: (number | null)[], timestamps?: number[]): Array<{ time: Date; value: number }> => {
          // Use provided timestamps, or fallback to processedTimestamps or rawTimestamps
          const usedTimes = timestamps || (processedTimestamps.length > 0 ? processedTimestamps : rawTimestamps);
          if (!usedTimes || usedTimes.length === 0) {
            console.warn('⚠️ No timestamps available for toSeries');
            return [];
          }
          const points = values
            .map((v: number | null, idx: number) => {
              const timestamp = usedTimes[idx];
              if (!Number.isFinite(timestamp)) return null;
              const alignedTs = alignToMinute(timestamp);
              const numValue = v != null ? Number(v) : null;
              // Skip data point if value is invalid (return null)
              // This prevents creating data points for missing time slots
              if (numValue == null || !Number.isFinite(numValue) || isNaN(numValue)) {
                return null;
              }
              return { time: new Date(alignedTs), value: numValue };
            })
            .filter((p): p is { time: Date; value: number } => p !== null);
          
          // Sort by timestamp ascending
          return points.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        // Create triplet series with exact API values (no scaling)
        // Skip data points with null/invalid avg values so line doesn't render at missing time points
        const toSeriesTriplet = (
          avgVals: (number | null)[], 
          minVals?: (number | null)[] | null, 
          maxVals?: (number | null)[] | null,
          timestamps?: number[]
        ): Array<{ time: Date; avg: number; min: number | null; max: number | null }> => {
          // Use provided timestamps, or fallback to processedTimestamps or rawTimestamps
          const usedTimes = timestamps || (processedTimestamps.length > 0 ? processedTimestamps : rawTimestamps);
          if (!usedTimes || usedTimes.length === 0) {
            console.warn('⚠️ No timestamps available for toSeriesTriplet');
            return [];
          }
          const validPoints: Array<{ time: Date; avg: number; min: number | null; max: number | null }> = [];
          
          avgVals.forEach((v: number | null, idx: number) => {
            const timestamp = usedTimes[idx];
            if (!Number.isFinite(timestamp)) return;
            const alignedTs = alignToMinute(timestamp);
            const avgNum = v != null ? Number(v) : null;
            
            // If avg is null/invalid, skip this data point entirely
            // This prevents creating data points for missing time slots
            if (avgNum == null || !Number.isFinite(avgNum) || isNaN(avgNum)) {
              return;
            }
            
            // Process min and max - use avgNum as fallback if not available
            const minVal = minVals && idx < minVals.length ? minVals[idx] : null;
            const maxVal = maxVals && idx < maxVals.length ? maxVals[idx] : null;
            const minNum = minVal != null ? Number(minVal) : null;
            const maxNum = maxVal != null ? Number(maxVal) : null;
            
            validPoints.push({
              time: new Date(alignedTs),
              avg: avgNum,
              min: (minNum != null && Number.isFinite(minNum) && !isNaN(minNum)) ? minNum : avgNum,
              max: (maxNum != null && Number.isFinite(maxNum) && !isNaN(maxNum)) ? maxNum : avgNum
            });
          });
          
          // Sort by timestamp ascending
          return validPoints.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        const digitalSignalsRaw = pick('digitalSignals', 'digitals', 'digital') || [];
        console.group('📊 Digital Signals - Raw API Data');
        console.log('Number of digital signals:', digitalSignalsRaw.length);
        digitalSignalsRaw.forEach((s: any, idx: number) => {
          console.group(`📊 Digital Signal ${idx + 1} - Raw API Data: ${s.name || s.id || 'Unknown'}`);
          console.log('Complete API Object:', JSON.stringify(s, null, 2));
          console.log('Display field:', s.display, 'type:', typeof s.display);
          console.log('Values array (first 20):', s.values?.slice(0, 20));
          console.log('Values array (last 20):', s.values?.slice(-20));
          console.log('Total values count:', s.values?.length || 0);
          console.log('Times array:', s.times || s.timeStamps || s.timestamps || 'Using global times');
          console.groupEnd();
        });
        console.groupEnd();

        // Sort digital signals by ID number in ascending order, then reverse
        // This puts D64 at index 0 (bottom) and D44 at last index (top)
        // Filter by display field first, then sort
        // Only exclude if display is explicitly false (boolean or string), otherwise include
        const filteredDigitalSignals = digitalSignalsRaw.filter((s: any) => {
          const displayValue = s.display;
          // Only filter out if display is explicitly false (boolean or string)
          const isExplicitlyFalse = displayValue === false || displayValue === 'false' || displayValue === 'False' || displayValue === 'FALSE';
          
          if (isExplicitlyFalse) {
            console.log('🚫 Filtered out digital signal (display=false):', s.id || s.name, 'display value:', displayValue);
            return false;
          }
          // Include all others (true, undefined, null, or any other value)
          return true;
        });
        
        const sortedDigitalSignals = [...filteredDigitalSignals].sort((a, b) => {
          // Extract numeric part from ID (e.g., "D64" -> 64, "D44" -> 44)
          const getNumericId = (signal: any): number => {
            const id = String(signal.id || signal.name || '');
            const match = id.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
          };
          const numA = getNumericId(a);
          const numB = getNumericId(b);
          // Sort ascending first (D44, D46, ..., D64)
          return numA - numB;
        }).reverse(); // Reverse so D64 is at index 0 (bottom) and D44 is at last index (top)
        
        console.log('📊 Sorted digital signals order (D64 at bottom, D44 at top):', sortedDigitalSignals.map(s => s.id || s.name));

        let digitalChart: DigitalStatusChart = {
          id: 'digital-status',
          name: 'Digital Status Indicators',
          metrics: sortedDigitalSignals.map((s: any, idx: number) => {
            
            // Handle both string times (from flat array) and numeric timestamps
            let signalTimes: any[] = s.times || s.timeStamps || s.timestamps || [];
            if (signalTimes.length > 0 && typeof signalTimes[0] === 'string') {
              // Convert string times (date_time format) to timestamps
              signalTimes = signalTimes.map((t: string) => {
                const parsed = Date.parse(t);
                return Number.isFinite(parsed) ? parsed : null;
              }).filter((t): t is number => t !== null);
            }
            if (!signalTimes.length) {
              signalTimes = times;
            }
            const normalizedSignalTimes = Array.isArray(signalTimes)
              ? signalTimes.map(parseTimestampToMs).filter((n: number) => Number.isFinite(n)).map(alignToMinute).sort((a: number, b: number) => a - b)
              : times;
            
            // Use original API values directly - no inversion applied
            const values = s.values || [];
            
            const dataWithNulls = toSeries(values, normalizedSignalTimes);
            // Filter out null values for digital signals (they should always be 0 or 1)
            const data = dataWithNulls.filter((d): d is { time: Date; value: number } => d.value !== null);
            
            return {
              id: String(s.id),
              name: String(s.name ?? s.id),
              color: String(s.color ?? '#999'),
              data,
              currentValue: data.length > 0 ? Number(data[data.length - 1].value) : 0
            };
          })
        };

        const analogSignalsArr: any[] = (pick('analogSignals', 'analogs', 'analog') || []);
        console.group('📈 Analog Signals - API Response');
        console.log('Number of analog signals:', analogSignalsArr.length);
        if (analogSignalsArr.length === 0) {
          console.warn('⚠️ No analog signals found in API response');
        }
        analogSignalsArr.forEach((s: any, idx: number) => {
          console.group(`Analog Signal ${idx + 1}: ${s.id || s.name || 'Unknown'}`);
          console.log('Raw API Data:', s);
          console.log('Avg values:', s.values ?? s.avg ?? s.average);
          console.log('Min values:', s.mins ?? s.minValues ?? s.min);
          console.log('Max values:', s.maxs ?? s.maxValues ?? s.max);
          console.log('Y-Axis Range:', s.yAxisRange);
          console.log('Times array:', s.times || s.timeStamps || s.timestamps || 'Using global times');
          console.log('Values length:', (s.values ?? s.avg ?? s.average)?.length || 0);
          console.groupEnd();
        });
        console.groupEnd();

        const analogMetrics: VehicleMetric[] = analogSignalsArr
          .filter((s: any) => {
            // Check display field - only include if display is true (or undefined for backward compatibility)
            const shouldDisplay = s.display !== false;
            if (!shouldDisplay) {
              console.log('🚫 Filtered out analog signal (display=false):', s.id || s.name);
            }
            return shouldDisplay;
          })
          .map((s: any, idx: number) => {
          // Extract resolution and offset from signal
          const resolution = Number(s.resolution ?? 1); // Default to 1 if not provided
          const offset = Number(s.offset ?? 0); // Default to 0 if not provided
          
          // Helper function to apply resolution and offset transformation
          // Apply to all valid numeric values (including 0 and negative values)
          const applyTransformation = (value: number | null): number | null => {
            if (value === null || value === undefined) return null;
            const numValue = Number(value);
            if (!Number.isFinite(numValue) || isNaN(numValue)) return null;
            // Apply transformation: (value * resolution) + offset
            // Apply to all valid numeric values
            return (numValue * resolution) + offset;
          };
          
          // Use exact API values - preserve null for missing data so line doesn't connect
          // Apply resolution and offset transformation
          const avgRaw: (number | null)[] = (s.values ?? s.avg ?? s.average ?? [])
            .map((v: any) => {
              if (v == null) return null;
              const num = Number(v);
              const valid = Number.isFinite(num) && !isNaN(num) ? num : null;
              return applyTransformation(valid);
            });
          
          const minsRaw: (number | null)[] | undefined = (s.mins ?? s.minValues ?? s.min ?? null)?.map?.((v: any) => {
            if (v == null) return null;
            const num = Number(v);
            const valid = Number.isFinite(num) && !isNaN(num) ? num : null;
            return applyTransformation(valid);
          });
          
          const maxsRaw: (number | null)[] | undefined = (s.maxs ?? s.maxValues ?? s.max ?? null)?.map?.((v: any) => {
            if (v == null) return null;
            const num = Number(v);
            const valid = Number.isFinite(num) && !isNaN(num) ? num : null;
            return applyTransformation(valid);
          });
          
          // Get signal-specific timestamps if available, otherwise use global times
          let signalTimes: any[] = s.times || s.timeStamps || s.timestamps || [];
          if (signalTimes.length > 0 && typeof signalTimes[0] === 'string') {
            // Convert string times to timestamps
            signalTimes = signalTimes.map((t: string) => Date.parse(t));
          }
          // If no signal-specific times, use processedTimestamps or rawTimestamps from state
          if (!signalTimes.length) {
            // Use processedTimestamps if available (from current load), otherwise fallback to rawTimestamps from state
            signalTimes = processedTimestamps.length > 0 ? processedTimestamps : rawTimestamps;
          }
          const normalizedSignalTimes = Array.isArray(signalTimes) && signalTimes.length > 0
            ? signalTimes.map(parseTimestampToMs).filter((n: number) => Number.isFinite(n)).map(alignToMinute).sort((a: number, b: number) => a - b)
            : (processedTimestamps.length > 0 ? processedTimestamps : rawTimestamps);
          
          // Create data points with exact API values, aligned timestamps, and sorted
          console.log(`📊 Creating data points for ${s.id || s.name}:`, {
            avgRawLength: avgRaw.length,
            minsRawLength: minsRaw?.length || 0,
            maxsRawLength: maxsRaw?.length || 0,
            normalizedSignalTimesLength: normalizedSignalTimes.length,
            firstTime: normalizedSignalTimes[0] ? new Date(normalizedSignalTimes[0]).toISOString() : 'N/A',
            lastTime: normalizedSignalTimes[normalizedSignalTimes.length - 1] ? new Date(normalizedSignalTimes[normalizedSignalTimes.length - 1]).toISOString() : 'N/A'
          });
          const data = (minsRaw || maxsRaw) 
            ? toSeriesTriplet(avgRaw, minsRaw, maxsRaw, normalizedSignalTimes)
            : toSeries(avgRaw, normalizedSignalTimes);
          // Helper function to safely extract value from data point
          const getValue = (point: { time: Date; value?: number; avg?: number; min?: number | null; max?: number | null }): number | null => {
            if ('avg' in point && point.avg != null) return point.avg;
            if ('value' in point && point.value != null) return point.value;
            return null;
          };
          
          const firstPoint = data[0];
          const lastPoint = data[data.length - 1];
          console.log(`✅ Created ${data.length} data points for ${s.id || s.name}`, {
            firstPoint: firstPoint ? { 
              time: firstPoint.time.toISOString(), 
              value: getValue(firstPoint)
            } : 'N/A',
            lastPoint: lastPoint ? { 
              time: lastPoint.time.toISOString(), 
              value: getValue(lastPoint)
            } : 'N/A'
          });
          
          // Calculate stats from actual data points - use API data directly with time matching
          // Filter out invalid data points (NaN, null, undefined) before calculating
          type DataPoint = { time: Date; value: number } | { time: Date; avg: number; min: number; max: number };
          const validDataPoints = (data as DataPoint[]).filter((d: DataPoint) => {
            const val = ('avg' in d ? d.avg : d.value);
            return val != null && Number.isFinite(Number(val)) && !isNaN(Number(val));
          });
          
          // Extract values from valid data points
          const values = validDataPoints.map((d: DataPoint) => {
            const val = ('avg' in d ? d.avg : d.value);
            return Number(val);
          });
          
          // For min/max, use API provided values if available, otherwise use avg values
          let allMins: number[] = [];
          let allMaxs: number[] = [];
          
          if (minsRaw && minsRaw.length > 0) {
            allMins = minsRaw
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
          }
          
          if (maxsRaw && maxsRaw.length > 0) {
            allMaxs = maxsRaw
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
          }
          
          // If no separate min/max arrays, use values from data points
          if (allMins.length === 0) {
            allMins = validDataPoints
              .map((d: DataPoint) => {
                const val = ('min' in d ? d.min : ('avg' in d ? d.avg : d.value));
                return Number(val);
              })
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
          }
          
          if (allMaxs.length === 0) {
            allMaxs = validDataPoints
              .map((d: DataPoint) => {
                const val = ('max' in d ? d.max : ('avg' in d ? d.avg : d.value));
                return Number(val);
              })
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
          }
          
          // Fallback to values if still empty
          if (allMins.length === 0) allMins = values;
          if (allMaxs.length === 0) allMaxs = values;
          
          // Calculate stats safely with filtered values
          const calculateAvg = (vals: number[]) => {
            if (vals.length === 0) return 0;
            const sum = vals.reduce((a, b) => a + b, 0);
            const avg = sum / vals.length;
            return Number.isFinite(avg) && !isNaN(avg) ? avg : 0;
          };
          
          const calculateMin = (vals: number[]) => {
            if (vals.length === 0) return 0;
            const min = Math.min(...vals);
            return Number.isFinite(min) && !isNaN(min) ? min : 0;
          };
          
          const calculateMax = (vals: number[]) => {
            if (vals.length === 0) return 0;
            const max = Math.max(...vals);
            return Number.isFinite(max) && !isNaN(max) ? max : 0;
          };
          
          const avgValue = calculateAvg(values);
          const minValue = calculateMin(allMins);
          const maxValue = calculateMax(allMaxs);
          
          // Debug: Log processed data for this signal
          console.group(`🔍 Analog Signal ${idx + 1} - Processed Data: ${s.id || s.name || 'Unknown'}`);
          console.log('Resolution:', resolution, 'Offset:', offset);
          console.log('API Avg Values (after transformation):', avgRaw);
          console.log('API Min Values (after transformation):', minsRaw);
          console.log('API Max Values (after transformation):', maxsRaw);
          console.log('Filtered Values:', values);
          console.log('Calculated Stats (after transformation):', { avg: avgValue, min: minValue, max: maxValue });
          
          // Debug: Log color information from API
          console.log('🔍 Color info from API (analogSignalsArr):', {
            color: s.color,
            min_color: s.min_color,
            max_color: s.max_color,
            hasMinColor: !!s.min_color,
            hasMaxColor: !!s.max_color
          });
          console.groupEnd();
          
          const metric = {
            id: String(s.id),
            name: String(s.name ?? s.id),
            unit: String(s.unit ?? ''),
            color: String(s.color ?? '#3b82f6'),
            min_color: s.min_color ? String(s.min_color) : undefined,
            max_color: s.max_color ? String(s.max_color) : undefined,
            data: data as any,
            currentValue: values.length > 0 ? values[values.length - 1] : 0,
            avg: avgValue,
            min: minValue,
            max: maxValue,
            yAxisRange: s.yAxisRange ? { min: Number(s.yAxisRange.min), max: Number(s.yAxisRange.max) } : { min: 0, max: 100 }
          } as VehicleMetric;
          
          // Debug: Log what we're setting
          console.log('✅ Metric being created (analogSignalsArr):', {
            id: metric.id,
            min_color: metric.min_color,
            max_color: metric.max_color,
            hasMinColor: !!metric.min_color,
            hasMaxColor: !!metric.max_color
          });
          
          return metric;
        });

        // Optional per-second analog data embedded in telemetry.json
        // Expected shape: analogPerSecond: [{ id, name?, unit?, color?, yAxisRange?, points: [{ time: 'HH:mm:ss', avg, min, max }] }]
        let perSecondAnalogMinTs: number | null = null;
        let perSecondAnalogMaxTs: number | null = null;
        let perSecondDigitalMinTs: number | null = null;
        let perSecondDigitalMaxTs: number | null = null;
        // Digital per-second override (preferred when second-view is inferred)
        if (
          Array.isArray((payload as any).digitalPerSecond) &&
          (payload.digitalPerSecond as Array<any>).length > 0 &&
          (bucketMs === 1000 || !digitalChart.metrics.length)
        ) {
          // Get shift info to handle overnight shifts
          const shiftParamForApi = formatShiftForAPI(selectedShift);
          const { startSec: shiftStartSec, endSec: shiftEndSec } = parseShiftApiToSeconds(shiftParamForApi);
          const crossesMidnight = shiftEndSec > 24 * 3600;
          const normalizedEndSec = crossesMidnight ? shiftEndSec - 24 * 3600 : shiftEndSec;
          
          const timelineBaseDayStartMs = (() => {
            const parsedDay = parseDateToUtcDayStartMs(selectedDate);
            if (parsedDay != null) {
              return crossesMidnight ? parsedDay - DAY_MS : parsedDay;
            }
            const base = new Date((processedTimestamps[0] ?? times[0] ?? Date.now()));
            base.setUTCHours(0, 0, 0, 0);
            return base.getTime();
          })();

          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            let timestamp = timelineBaseDayStartMs + hh * 3600000 + mm * 60000 + ss * 1000;
            
            // For overnight shifts, if time is in early morning (00:00:00 to normalizedEndSec),
            // add 24 hours so it appears after 23:59:59 on the timeline
            if (crossesMidnight) {
              const timeInSeconds = hh * 3600 + mm * 60 + ss;
              if (timeInSeconds <= normalizedEndSec) {
                // This is in the early morning portion, add 24 hours for display
                timestamp += 24 * 3600 * 1000;
                // Debug log for first few early morning times
                if (hh === 0 || hh === 1 || hh === 2 || hh === 3 || hh === 4 || hh === 5 || hh === 6) {
                  console.log(`🔍 parseHMS (digital) overnight adjustment: "${hms}" -> ${new Date(timestamp).toISOString()} (added 24h)`, {
                    input: hms,
                    timeInSeconds,
                    normalizedEndSec
                  });
                }
              }
            }
            
            // Align to current bucket (second or minute)
            return new Date(alignToMinute(timestamp));
          };
          // Filter by display field first
          // Only exclude if display is explicitly false (boolean or string), otherwise include
          const filteredDigitalPerSecond = (payload.digitalPerSecond as Array<any>).filter((series: any) => {
            const displayValue = series.display;
            // Only filter out if display is explicitly false (boolean or string)
            const isExplicitlyFalse = displayValue === false || displayValue === 'false' || displayValue === 'False' || displayValue === 'FALSE';
            
            if (isExplicitlyFalse) {
              console.log('🚫 Filtered out digital per-second signal (display=false):', series.id || series.name, 'display value:', displayValue);
              return false;
            }
            // Include all others (true, undefined, null, or any other value)
            return true;
          });
          
          const metrics = filteredDigitalPerSecond.map((series: any, idx: number) => {
            // Use exact API values directly - no processing
            
            const pts = (series.points || []).map((p: any) => {
              const value = Number(p.value ?? 0);
              const timeDate = parseHMS(p.time);
              return {
                time: timeDate,
              value, // Exact API value: 0 or 1
                rawTime: p.time, // Keep original time string for reference
                rawValue: p.value // Keep original value for reference
              };
            });
            
            // Sort by timestamp
            pts.sort((a: { time: Date; value: number }, b: { time: Date; value: number }) => a.time.getTime() - b.time.getTime());
            
            if (pts.length) {
              const localMin = pts[0].time.getTime();
              const localMax = pts[pts.length - 1].time.getTime();
              perSecondDigitalMinTs = perSecondDigitalMinTs === null ? localMin : Math.min(perSecondDigitalMinTs, localMin);
              perSecondDigitalMaxTs = perSecondDigitalMaxTs === null ? localMax : Math.max(perSecondDigitalMaxTs, localMax);
            }
            const lastValue = pts.length ? Number(pts[pts.length - 1].value) : 0;
            return {
              id: String(series.id),
              name: String(series.name ?? series.id),
              color: String(series.color ?? '#999'),
              data: pts,
              currentValue: lastValue
            };
          });
          if (metrics.length) {
            digitalChart = {
              id: 'digital-status',
              name: 'Digital Status Indicators',
              metrics
            };
          }
        }
        if (
          Array.isArray((payload as any).analogPerSecond) &&
          (payload.analogPerSecond as Array<any>).length > 0 &&
          (bucketMs === 1000 || !analogMetrics.length)
        ) {
          // Prefer per-second series in second-view mode.
          if (bucketMs === 1000) {
            analogMetrics.length = 0;
          }
          // Get shift info to handle overnight shifts
          const shiftParamForApi2 = formatShiftForAPI(selectedShift);
          const { startSec: shiftStartSec2, endSec: shiftEndSec2 } = parseShiftApiToSeconds(shiftParamForApi2);
          const crossesMidnight2 = shiftEndSec2 > 24 * 3600;
          const normalizedEndSec2 = crossesMidnight2 ? shiftEndSec2 - 24 * 3600 : shiftEndSec2;
          
          const timelineBaseDayStartMs = (() => {
            const parsedDay = parseDateToUtcDayStartMs(selectedDate);
            if (parsedDay != null) {
              return crossesMidnight2 ? parsedDay - DAY_MS : parsedDay;
            }
            const base = new Date((processedTimestamps[0] ?? times[0] ?? Date.now()));
            base.setUTCHours(0, 0, 0, 0);
            return base.getTime();
          })();

          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            let timestamp = timelineBaseDayStartMs + hh * 3600000 + mm * 60000 + ss * 1000;
            
            // For overnight shifts, if time is in early morning (00:00:00 to normalizedEndSec),
            // add 24 hours so it appears after 23:59:59 on the timeline
            if (crossesMidnight2) {
              const timeInSeconds = hh * 3600 + mm * 60 + ss;
              if (timeInSeconds <= normalizedEndSec2) {
                // This is in the early morning portion, add 24 hours for display
                timestamp += 24 * 3600 * 1000;
              }
            }
            
            // Align to current bucket (second or minute)
            return new Date(alignToMinute(timestamp));
          };
          (payload.analogPerSecond as Array<any>)
            .filter((series: any) => {
              // Check display field - only include if display is true (or undefined for backward compatibility)
              const shouldDisplay = series.display !== false;
              if (!shouldDisplay) {
                console.log('🚫 Filtered out analog per-second signal (display=false):', series.id || series.name);
              }
              return shouldDisplay;
            })
            .forEach(series => {
            const id = String(series.id);
            
            // Debug: Log color information from API
            console.log(`🔍 analogPerSecond - Color info from API for ${id}:`, {
              color: series.color,
              min_color: series.min_color,
              max_color: series.max_color,
              hasMinColor: !!series.min_color,
              hasMaxColor: !!series.max_color
            });
            
            // Extract resolution and offset from series
            const resolution = Number(series.resolution ?? 1); // Default to 1 if not provided
            const offset = Number(series.offset ?? 0); // Default to 0 if not provided
            
            // Helper function to apply resolution and offset transformation
            // Apply to all valid numeric values (including 0 and negative values)
            // Return null for missing/invalid values so line doesn't connect through missing data
            const applyTransformation = (value: number | null | undefined): number | null => {
              if (value === null || value === undefined) return null;
              const numValue = Number(value);
              if (!Number.isFinite(numValue) || isNaN(numValue)) return null;
              // Apply transformation: (value * resolution) + offset
              // Apply to all valid numeric values
              return (numValue * resolution) + offset;
            };
            
            // Use exact API values, apply resolution and offset, align timestamps to minutes
            // Use null for missing avg/min/max values so line doesn't connect through missing data
            const rawPts = (series.points || []).map((r: any) => {
              const time = parseHMS(r.time);
              // New drilling API often returns `value` (not `avg`). Treat value as avg when avg is missing.
              const avgCandidate = r.avg ?? r.value ?? r.val;
              const minCandidate = r.min ?? r.value ?? r.avg ?? r.val;
              const maxCandidate = r.max ?? r.value ?? r.avg ?? r.val;
              const avgRaw = avgCandidate !== null && avgCandidate !== undefined && avgCandidate !== '' ? Number(avgCandidate) : null;
              const minRaw = minCandidate !== null && minCandidate !== undefined && minCandidate !== '' ? Number(minCandidate) : null;
              const maxRaw = maxCandidate !== null && maxCandidate !== undefined && maxCandidate !== '' ? Number(maxCandidate) : null;
              
              // Apply transformation to avg, min, max
              const avg = applyTransformation(avgRaw);
              const min = applyTransformation(minRaw);
              const max = applyTransformation(maxRaw);
              
              return {
                time,
                avg: (avg != null && Number.isFinite(avg) && !isNaN(avg)) ? avg : null,
                min: (min != null && Number.isFinite(min) && !isNaN(min)) ? min : null,
                max: (max != null && Number.isFinite(max) && !isNaN(max)) ? max : null,
                hms: String(r.time)
              };
            });
            
            // Sort by timestamp
            rawPts.sort((a: { time: Date; avg: number | null; min: number | null; max: number | null; hms: string }, b: { time: Date; avg: number | null; min: number | null; max: number | null; hms: string }) => a.time.getTime() - b.time.getTime());
            
            if (!rawPts.length) return;
            const localMin = rawPts[0].time.getTime();
            const localMax = rawPts[rawPts.length - 1].time.getTime();
            perSecondAnalogMinTs = perSecondAnalogMinTs === null ? localMin : Math.min(perSecondAnalogMinTs, localMin);
            perSecondAnalogMaxTs = perSecondAnalogMaxTs === null ? localMax : Math.max(perSecondAnalogMaxTs, localMax);
            const values: number[] = rawPts.map((p: { time: Date; avg: number | null; min: number | null; max: number | null; hms: string }) => p.avg)
              .filter((v: number | null): v is number => v != null && Number.isFinite(v) && !isNaN(v));
            const allMins = rawPts.map((p: { time: Date; avg: number | null; min: number | null; max: number | null; hms: string }) => p.min)
              .filter((v: number | null): v is number => v != null && Number.isFinite(v) && !isNaN(v));
            const allMaxs = rawPts.map((p: { time: Date; avg: number | null; min: number | null; max: number | null; hms: string }) => p.max)
              .filter((v: number | null): v is number => v != null && Number.isFinite(v) && !isNaN(v));
            
            // Calculate range safely
            const minVal = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
            const maxVal = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
            const usedRange = series.yAxisRange ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) } : { min: minVal, max: maxVal };
            
            const safeAvg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
            const safeMin = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
            const safeMax = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
            
            const existing = analogMetrics.find(m => m.id === id);
            if (existing) {
              (existing as any).data = rawPts;
              existing.avg = safeAvg;
              existing.min = safeMin;
              existing.max = safeMax;
              (existing as any).yAxisRange = usedRange;
              // Update colors if they exist
              if (series.min_color) (existing as any).min_color = String(series.min_color);
              if (series.max_color) (existing as any).max_color = String(series.max_color);
            } else {
              const metric = {
                id,
                name: String(series.name ?? id),
                unit: String(series.unit ?? ''),
                color: String(series.color ?? '#2563eb'),
                min_color: series.min_color ? String(series.min_color) : undefined,
                max_color: series.max_color ? String(series.max_color) : undefined,
                data: rawPts as any,
                currentValue: values.length > 0 ? values[values.length - 1] : 0,
                avg: safeAvg,
                min: safeMin,
                max: safeMax,
                yAxisRange: usedRange
              };
              
              analogMetrics.push(metric);
            }
          });
        }
        // Process analogPerMinute if available (new API returns this format)
        // Prioritize analogPerMinute over analogPerSecond for the new API
        if (bucketMs !== 1000 && Array.isArray((payload as any).analogPerMinute) && (payload.analogPerMinute as Array<any>).length > 0) {
          // Clear any existing analog metrics if we have analogPerMinute data
          analogMetrics.length = 0;
          console.group('📊 Analog Per-Minute Data - API Response');
          console.log('Number of analog per-minute series:', (payload.analogPerMinute as Array<any>).length);
          // Get shift info to handle overnight shifts
          const shiftParamForApi3 = formatShiftForAPI(selectedShift);
          const { startSec: shiftStartSec3, endSec: shiftEndSec3 } = parseShiftApiToSeconds(shiftParamForApi3);
          const crossesMidnight3 = shiftEndSec3 > 24 * 3600;
          const normalizedEndSec3 = crossesMidnight3 ? shiftEndSec3 - 24 * 3600 : shiftEndSec3;
          
          const timelineBaseDayStartMs = (() => {
            const parsedDay = parseDateToUtcDayStartMs(selectedDate);
            if (parsedDay != null) {
              return crossesMidnight3 ? parsedDay - DAY_MS : parsedDay;
            }
            const base = new Date((times[0] ?? processedTimestamps[0] ?? rawTimestamps[0] ?? Date.now()));
            base.setUTCHours(0, 0, 0, 0);
            return base.getTime();
          })();

          let parseHMSCallCount = 0;
          const parseHMS = (hms: string) => {
            const parts = String(hms).split(':');
            const hh = Number(parts[0] || 0);
            const mm = Number(parts[1] || 0);
            const ss = Number(parts[2] || 0);
            let timestamp = timelineBaseDayStartMs + hh * 3600000 + mm * 60000 + ss * 1000;
            
            // For overnight shifts, if time is in early morning (00:00:00 to normalizedEndSec),
            // add 24 hours so it appears after 23:59:59 on the timeline
            if (crossesMidnight3) {
              const timeInSeconds = hh * 3600 + mm * 60 + ss;
              if (timeInSeconds <= normalizedEndSec3) {
                // This is in the early morning portion, add 24 hours for display
                timestamp += 24 * 3600 * 1000;
              }
            }
            
            // Align to minute boundary
            const result = new Date(alignToMinute(timestamp));
            
            // 🔍 DEBUG: Log time parsing (only for first few calls to avoid spam)
            parseHMSCallCount++;
            if (parseHMSCallCount <= 3) {
              console.log(`🔍 parseHMS: "${hms}" -> ${result.toISOString()}`, {
                input: hms,
                parts: { hh, mm, ss },
                baseDate: new Date(timelineBaseDayStartMs).toISOString(),
                timestamp,
                result: result.toISOString(),
                crossesMidnight: crossesMidnight3,
                normalizedEndSec: normalizedEndSec3
              });
            }
            
            return result;
          };
          (payload.analogPerMinute as Array<any>)
            .filter((series: any) => {
              // Check display field - only include if display is true (or undefined for backward compatibility)
              const shouldDisplay = series.display !== false;
              if (!shouldDisplay) {
                console.log('🚫 Filtered out analog per-minute signal (display=false):', series.id || series.name);
              }
              return shouldDisplay;
            })
            .forEach((series: any, idx: number) => {
            console.group(`Analog Per-Minute Series ${idx + 1}: ${series.id || series.name || 'Unknown'}`);
            const id = String(series.id);
            
            // Debug: Log color information from API
            console.log('🔍 Color info from API:', {
              color: series.color,
              min_color: series.min_color,
              max_color: series.max_color,
              hasMinColor: !!series.min_color,
              hasMaxColor: !!series.max_color
            });
            
            // Extract resolution and offset from series
            const resolution = Number(series.resolution ?? 1); // Default to 1 if not provided
            const offset = Number(series.offset ?? 0); // Default to 0 if not provided
            
            // Helper function to apply resolution and offset transformation
            // Apply to all valid numeric values (including 0 and negative values)
            // Return null for missing/invalid values so line doesn't connect through missing data
            const applyTransformation = (value: number | null | undefined): number | null => {
              if (value === null || value === undefined) return null;
              const numValue = Number(value);
              if (!Number.isFinite(numValue) || isNaN(numValue)) return null;
              // Apply transformation: (value * resolution) + offset
              // Apply to all valid numeric values
              return (numValue * resolution) + offset;
            };
            
            // Check if points is null, undefined, or empty
            const pointsData = series.points;
            
            // 🔍 DEBUG: Log raw points data from API
            console.log(`🔍 [${series.id || series.name}] Raw points data from API:`, {
              pointsCount: Array.isArray(pointsData) ? pointsData.length : 'not an array',
              pointsType: typeof pointsData,
              isNull: pointsData === null,
              isUndefined: pointsData === undefined,
              isEmpty: Array.isArray(pointsData) && pointsData.length === 0,
              firstPoint: Array.isArray(pointsData) && pointsData.length > 0 ? pointsData[0] : null,
              lastPoint: Array.isArray(pointsData) && pointsData.length > 0 ? pointsData[pointsData.length - 1] : null,
              samplePoints: Array.isArray(pointsData) ? pointsData.slice(0, 5) : null
            });
            
            if (!pointsData || (Array.isArray(pointsData) && pointsData.length === 0)) {
              console.warn(`⚠️ Series ${series.id || series.name} has no points data (points is ${pointsData === null ? 'null' : pointsData === undefined ? 'undefined' : 'empty array'}), skipping`);
              console.groupEnd();
              return;
            }
            
            // Use exact API values, apply resolution and offset, align timestamps to minutes
            // Use null for missing avg/min/max values so line doesn't connect through missing data
            const rawPts = (Array.isArray(pointsData) ? pointsData : []).map((r: any) => {
              // Handle case where point might be a number (value) or an object with time/avg/min/max
              let time: Date;
              let avgRaw: number | null = null;
              let minRaw: number | null = null;
              let maxRaw: number | null = null;
              
              if (typeof r === 'number') {
                // Point is just a number - use timestamp from timestamps array if available
                const timestampIndex = rawPts.length; // Approximate index
                if (processedTimestamps.length > timestampIndex) {
                  time = new Date(processedTimestamps[timestampIndex]);
                } else {
                  // Fallback: use current time (shouldn't happen)
                  time = new Date();
                }
                avgRaw = r;
                minRaw = r;
                maxRaw = r;
              } else if (typeof r === 'object' && r !== null) {
                // Point is an object with time/avg/min/max
                if (r.time) {
                  time = parseHMS(r.time);
                } else {
                  // No time in point, try to use timestamp from timestamps array
                  const timestampIndex = rawPts.length;
                  if (processedTimestamps.length > timestampIndex) {
                    time = new Date(processedTimestamps[timestampIndex]);
                  } else {
                    console.warn(`⚠️ No time in point and no matching timestamp, skipping point`);
                    return null;
                  }
                }
                // New drilling API often returns `value` (not `avg`). Treat value as avg when avg is missing.
                const avgCandidate = (r as any).avg ?? (r as any).value ?? (r as any).val;
                const minCandidate = (r as any).min ?? (r as any).value ?? (r as any).avg ?? (r as any).val;
                const maxCandidate = (r as any).max ?? (r as any).value ?? (r as any).avg ?? (r as any).val;
                avgRaw = avgCandidate !== null && avgCandidate !== undefined && avgCandidate !== '' ? Number(avgCandidate) : null;
                minRaw = minCandidate !== null && minCandidate !== undefined && minCandidate !== '' ? Number(minCandidate) : null;
                maxRaw = maxCandidate !== null && maxCandidate !== undefined && maxCandidate !== '' ? Number(maxCandidate) : null;
              } else {
                console.warn(`⚠️ Unexpected point format, skipping:`, r);
                return null;
              }
              
              // Apply transformation to avg, min, max
              const avg = applyTransformation(avgRaw);
              const min = applyTransformation(minRaw);
              const max = applyTransformation(maxRaw);
              
              return {
                time,
                avg: (avg != null && Number.isFinite(avg) && !isNaN(avg)) ? avg : null,
                min: (min != null && Number.isFinite(min) && !isNaN(min)) ? min : null,
                max: (max != null && Number.isFinite(max) && !isNaN(max)) ? max : null,
                hms: r.time ? String(r.time) : time.toISOString()
              };
            }).filter((p): p is { time: Date; avg: number | null; min: number | null; max: number | null; hms: string } => p !== null); // Remove null entries with type guard
            
            // Sort by timestamp
            rawPts.sort((a, b) => a.time.getTime() - b.time.getTime());
            
            // 🔍 DEBUG: Log processed points data
            console.log(`🔍 [${series.id || series.name}] Processed points data:`, {
              processedPointsCount: rawPts.length,
              firstProcessedPoint: rawPts.length > 0 ? {
                time: rawPts[0].time.toISOString(),
                avg: rawPts[0].avg,
                min: rawPts[0].min,
                max: rawPts[0].max
              } : null,
              lastProcessedPoint: rawPts.length > 0 ? {
                time: rawPts[rawPts.length - 1].time.toISOString(),
                avg: rawPts[rawPts.length - 1].avg,
                min: rawPts[rawPts.length - 1].min,
                max: rawPts[rawPts.length - 1].max
              } : null,
              sampleProcessedPoints: rawPts.slice(0, 5).map(p => ({
                time: p.time.toISOString(),
                avg: p.avg,
                min: p.min,
                max: p.max
              })),
              pointsWithValidAvg: rawPts.filter(p => p.avg != null && Number.isFinite(p.avg)).length,
              pointsWithValidMin: rawPts.filter(p => p.min != null && Number.isFinite(p.min)).length,
              pointsWithValidMax: rawPts.filter(p => p.max != null && Number.isFinite(p.max)).length
            });
            
            if (!rawPts.length) {
              console.warn(`⚠️ No valid points in series ${series.id || series.name} after processing, skipping`);
              console.groupEnd();
              return;
            }
            
            // TypeScript now knows rawPts[0] and rawPts[rawPts.length - 1] are not null after length check
            const localMin = rawPts[0]!.time.getTime();
            const localMax = rawPts[rawPts.length - 1]!.time.getTime();
            perSecondAnalogMinTs = perSecondAnalogMinTs === null ? localMin : Math.min(perSecondAnalogMinTs, localMin);
            perSecondAnalogMaxTs = perSecondAnalogMaxTs === null ? localMax : Math.max(perSecondAnalogMaxTs, localMax);
            const values: number[] = rawPts.map((p) => p.avg)
              .filter((v: number | null): v is number => v != null && Number.isFinite(v) && !isNaN(v));
            const allMins = rawPts.map((p) => p.min)
              .filter((v: number | null): v is number => v != null && Number.isFinite(v) && !isNaN(v));
            const allMaxs = rawPts.map((p) => p.max)
              .filter((v: number | null): v is number => v != null && Number.isFinite(v) && !isNaN(v));
            
            // Calculate range safely
            const minVal = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
            const maxVal = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
            const usedRange = series.yAxisRange ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) } : { min: minVal, max: maxVal };
            
            const safeAvg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
            const safeMin = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
            const safeMax = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
            console.log('Resolution:', resolution, 'Offset:', offset);
            console.log('Processed Points Count:', rawPts.length);
            console.log('Calculated Stats (after transformation):', { avg: safeAvg, min: safeMin, max: safeMax });
            console.log('First 3 points (after transformation):', rawPts.slice(0, 3).map(p => ({
              time: p.time.toISOString(),
              avg: p.avg,
              min: p.min,
              max: p.max
            })));
            console.log('Last 3 points (after transformation):', rawPts.slice(-3).map(p => ({
              time: p.time.toISOString(),
              avg: p.avg,
              min: p.min,
              max: p.max
            })));
            console.groupEnd();
            
            const metric = {
              id,
              name: String(series.name ?? id),
              unit: String(series.unit ?? ''),
              color: String(series.color ?? '#2563eb'),
              min_color: series.min_color ? String(series.min_color) : undefined,
              max_color: series.max_color ? String(series.max_color) : undefined,
              data: rawPts as any,
              currentValue: values.length > 0 ? values[values.length - 1] : 0,
              avg: safeAvg,
              min: safeMin,
              max: safeMax,
              yAxisRange: usedRange
            };
            
            // 🔍 DEBUG: Log complete metric being created
            console.log(`✅ [${series.id || series.name}] Metric being created:`, {
              id: metric.id,
              name: metric.name,
              unit: metric.unit,
              color: metric.color,
              min_color: metric.min_color,
              max_color: metric.max_color,
              hasMinColor: !!metric.min_color,
              hasMaxColor: !!metric.max_color,
              dataPointsCount: metric.data.length,
              yAxisRange: metric.yAxisRange,
              stats: {
                avg: metric.avg,
                min: metric.min,
                max: metric.max,
                currentValue: metric.currentValue
              },
              firstDataPoint: metric.data.length > 0 ? {
                time: metric.data[0].time?.toISOString?.() || metric.data[0].time,
                avg: metric.data[0].avg,
                min: metric.data[0].min,
                max: metric.data[0].max
              } : null
            });
            
            analogMetrics.push(metric);
          });
          console.groupEnd();
        }

        // Allow empty data - show empty charts instead of fallback
        // If API returns empty/null data, we show empty charts (not generated data)
        if (!digitalChart.metrics.length && !analogMetrics.length) {
          console.warn('⚠️ No data found in API response - showing empty charts');
        }

        // Debug: Final data being set to state
        console.group('✅ Final Data - Ready for Charts');
        console.log('Analog Metrics Count:', analogMetrics.length);
        analogMetrics.forEach((metric, idx) => {
          console.group(`Final Analog Metric ${idx + 1}: ${metric.id} - ${metric.name}`);
          console.log('Data points count:', metric.data.length);
          console.log('First 3 data points:', metric.data.slice(0, 3));
          console.log('Last 3 data points:', metric.data.slice(-3));
          console.log('Stats:', { avg: metric.avg, min: metric.min, max: metric.max });
          console.log('Y-Axis Range:', metric.yAxisRange);
          console.groupEnd();
        });
        console.log('Digital Chart Metrics Count:', digitalChart.metrics.length);
        console.log('📊 Digital Chart - Final Signals Being Displayed:');
        digitalChart.metrics.forEach((metric, idx) => {
          console.group(`Final Digital Metric ${idx + 1}: ${metric.id} - ${metric.name}`);
          console.log('Data points count:', metric.data.length);
          console.log('First 3 data points:', metric.data.slice(0, 3));
          console.log('Last 3 data points:', metric.data.slice(-3));
          console.groupEnd();
        });
        console.log('📊 All Digital Signal IDs in final chart:', digitalChart.metrics.map(m => m.id));
        console.groupEnd();

        // Set digital chart immediately if present (ignore stale loads)
        if (digitalChart && digitalChart.metrics.length > 0) {
          if (loadVersion !== loadVersionRef.current) return;
        setDigitalStatusChart(digitalChart);
        }

        // Process all analog metrics but render progressively to avoid blocking UI
        if (loadVersion !== loadVersionRef.current) return;
        setProcessingProgress(10); // 10% - data received
        
        // Use requestAnimationFrame to process data in chunks for better performance
        const processDataInChunks = () => {
          if (loadVersion !== loadVersionRef.current) return;
          const CHUNK_SIZE = 10; // Process 10 charts at a time
          const totalCharts = analogMetrics.length;
          let processedCount = 0;
          
          const processChunk = () => {
            if (loadVersion !== loadVersionRef.current) return;
            const start = processedCount;
            const end = Math.min(start + CHUNK_SIZE, totalCharts);
            const chunk = analogMetrics.slice(start, end);
            
            if (start === 0) {
              // First chunk - set initial charts
              setVehicleMetrics(chunk);
            } else {
              // Subsequent chunks - append
              setVehicleMetrics(prev => [...prev, ...chunk]);
            }
            
            processedCount = end;
            const progress = 10 + Math.floor((processedCount / totalCharts) * 80); // 10-90%
            setProcessingProgress(progress);
            
            if (processedCount < totalCharts) {
              // Use requestAnimationFrame for smooth rendering
              requestAnimationFrame(() => {
                if (loadVersion !== loadVersionRef.current) return;
                setTimeout(processChunk, 0); // Allow browser to render between chunks
              });
            } else {
              // All processed
              if (loadVersion !== loadVersionRef.current) return;
              setProcessingProgress(100);
              setLoading(false);
            }
          };
          
          if (totalCharts > 0) {
            processChunk();
          } else {
            if (loadVersion !== loadVersionRef.current) return;
            setVehicleMetrics([]);
            setProcessingProgress(100);
            setLoading(false);
          }
        };
        
        // Start processing after a brief delay to show progress
        setTimeout(() => {
          if (loadVersion !== loadVersionRef.current) return;
          processDataInChunks();
        }, 50);

        // Set time range after all data is processed
        const shouldUpdateTimeRange = apiRange == null;
        if (shouldUpdateTimeRange) {
        // Determine the actual data range from all loaded signals
        const minCandidates: number[] = [];
        const maxCandidates: number[] = [];
        // Collect from per-second data first (most accurate)
        if (typeof perSecondAnalogMinTs === 'number') minCandidates.push(perSecondAnalogMinTs);
        if (typeof perSecondDigitalMinTs === 'number') minCandidates.push(perSecondDigitalMinTs);
        if (typeof perSecondAnalogMaxTs === 'number') maxCandidates.push(perSecondAnalogMaxTs);
        if (typeof perSecondDigitalMaxTs === 'number') maxCandidates.push(perSecondDigitalMaxTs);
          // Also collect from actual analog data points (current page only for now, will include all when digital chart loads)
        analogMetrics.forEach(m => {
          if (m.data && m.data.length > 0) {
            const first = m.data[0]?.time?.getTime?.();
            const last = m.data[m.data.length - 1]?.time?.getTime?.();
            if (typeof first === 'number') minCandidates.push(first);
            if (typeof last === 'number') maxCandidates.push(last);
          }
        });
        // Also collect from actual digital data points
        if (digitalChart && digitalChart.metrics.length > 0) {
          digitalChart.metrics.forEach(m => {
            if (m.data && m.data.length > 0) {
              const first = m.data[0]?.time?.getTime?.();
              const last = m.data[m.data.length - 1]?.time?.getTime?.();
              if (typeof first === 'number') minCandidates.push(first);
              if (typeof last === 'number') maxCandidates.push(last);
            }
          });
        }
        // Set initial selection window: full shift range (e.g., 6 AM to 6 PM).
        // The API call uses a 1-hour centered window, but the scrubber shows the full shift.
        const shiftMetaForTimeline = getShiftMeta(selectedDate, selectedShift);
        const shiftStartSec = shiftMetaForTimeline.startSec;
        const shiftEndSec = shiftMetaForTimeline.endSec;
        const shiftCenterSec = Math.floor((shiftStartSec + shiftEndSec) / 2);

        // Base day for the timeline: use selectedDate (and for overnight shifts, previous day).
        let baseDayMs: number | null = shiftMetaForTimeline.timelineBaseDayStartMs;

        // Fallback: if selectedDate isn't parseable, derive from actual API timestamps.
        if (baseDayMs == null) {
          const firstTs =
            processedTimestamps.length > 0
              ? processedTimestamps[0]
              : (minCandidates.length ? Math.min(...minCandidates) : NaN);
          if (Number.isFinite(firstTs)) {
            const d = new Date(firstTs);
            d.setUTCHours(0, 0, 0, 0);
            baseDayMs = d.getTime();
          }
        }

        if (baseDayMs == null) {
          const d = new Date();
          d.setUTCHours(0, 0, 0, 0);
          baseDayMs = d.getTime();
        }

        // Full shift range for scrubber display
        const startMs = baseDayMs + (shiftStartSec * 1000);
        const endMs = baseDayMs + (shiftEndSec * 1000);
        const centerMs = baseDayMs + (shiftCenterSec * 1000);

        if (loadVersion !== loadVersionRef.current) return;
        setSelectionStart(new Date(startMs));
        setSelectionEnd(new Date(endMs));
        setSelectedTime(new Date(centerMs));
        }
        
        // Loading state is managed by processDataInChunks
        return;
      } catch (e: any) {
        if (loadVersion !== loadVersionRef.current) return;
        // NO FALLBACK TO GENERATED DATA - show empty charts instead
        console.error('❌ Error loading data:', e);
        console.error('Error details:', {
          message: e.message,
          stack: e.stack
        });
        
        // Set empty data - show empty charts, not generated fallback
        setVehicleMetrics([]);
        setDigitalStatusChart({
          id: 'digital-status',
          name: 'Digital Status Indicators',
          metrics: []
        });
        
        // Reset time selection
        setSelectedTime(null);
        setSelectionStart(null);
        setSelectionEnd(null);
        
        // Show error message but don't generate fake data
        console.error('⚠️ Charts will be empty - no data loaded from API');
        setLoading(false);
        setProcessingProgress(0);
      }
    };
    
    // Load data ONLY when modal is closed AND vehicle and date are selected
    // This prevents auto-loading on page refresh
    if (showAssetModal) {
      console.log('🚫 Modal is showing - not loading data');
      return;
    }
    
    if (!selectedVehicleId || !selectedDate) {
      console.log('🚫 No vehicle or date - not loading data');
      return;
    }
    
    // Only load if all conditions are met
    console.log('✅ Loading data - modal closed, vehicle and date selected');
    load();
    return () => {
      controller.abort();
    };
  }, [selectedVehicleId, selectedDate, selectedShift, showAssetModal, selectedHourRange, screenMode, selectedVehicleSerialNo, apiRange]); // Reload when vehicle/date/shift/hour range/screen mode/range changes


  // Prepare scrubber data - always use full shift domain (so user can expand selection up to the full shift)
  const scrubberData = useMemo(() => {
    const shiftMeta = getShiftMeta(selectedDate, selectedShift);
    const shiftStartSec = shiftMeta.startSec;
    const shiftEndSec = shiftMeta.endSec;

    // Base day for the timeline: always anchor from selectedDate (overnight shifts use the previous day).
    let baseDayMs: number | null = shiftMeta.timelineBaseDayStartMs;
    if (baseDayMs == null && rawTimestamps.length > 0) {
      const d = new Date(rawTimestamps[0]);
      d.setUTCHours(0, 0, 0, 0);
      baseDayMs = d.getTime();
    }
    if (baseDayMs == null) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      baseDayMs = d.getTime();
    }

    const domainStart = baseDayMs + (shiftStartSec * 1000);
    const domainEnd = baseDayMs + (shiftEndSec * 1000);
    if (!Number.isFinite(domainStart) || !Number.isFinite(domainEnd) || domainStart >= domainEnd) {
      return [];
    }

    // Only endpoints are needed; scale/timeDomain drives interaction.
    return [{ time: domainStart }, { time: domainEnd }];
  }, [rawTimestamps, selectedDate, selectedShift]);

  // Calculate synchronized time domain from selection range
  const timeDomain = useMemo<[number, number] | null>(() => {
    if (selectionStart && selectionEnd) {
      // Get shift info to handle overnight shifts
      const shiftParamForApi = formatShiftForAPI(selectedShift);
      const { startSec: shiftStartSec, endSec: shiftEndSec } = parseShiftApiToSeconds(shiftParamForApi);
      const crossesMidnight = shiftEndSec > 24 * 3600;
      const normalizedEndSec = crossesMidnight ? shiftEndSec - 24 * 3600 : shiftEndSec;
      
      let startTs = selectionStart.getTime();
      let endTs = selectionEnd.getTime();
      
      // For overnight shifts, adjust timestamps to match the adjusted data points
      // Data points after midnight (00:00:00 to normalizedEndSec) have 24 hours added
      // So we need to adjust the timeDomain to match
      if (crossesMidnight) {
        // Get the base day - use the EXACT same logic as parseHMS in data processing
        // parseHMS uses: new Date((processedTimestamps[0] ?? times[0] ?? Date.now()))
        // Since rawTimestamps is set from processedTimestamps, use rawTimestamps[0]
        // This ensures we use the same base day that the data points use
        let baseDayMs: number;
        const shiftMetaForDomain = getShiftMeta(selectedDate, selectedShift);
        if (shiftMetaForDomain.timelineBaseDayStartMs != null) {
          baseDayMs = shiftMetaForDomain.timelineBaseDayStartMs;
        } else if (rawTimestamps.length > 0) {
          // Fallback: derive from first timestamp and set to midnight
          const d = new Date(rawTimestamps[0]);
          d.setUTCHours(0, 0, 0, 0);
          baseDayMs = d.getTime();
        } else {
          // Fallback: use selectedDate or current date
          baseDayMs = parseDateToUtcDayStartMs(selectedDate) || (() => {
            const d = new Date();
            d.setUTCHours(0, 0, 0, 0);
            return d.getTime();
          })();
        }
        
        // Get time portion (hours:minutes:seconds) from the Date objects
        const startHours = selectionStart.getUTCHours();
        const startMinutes = selectionStart.getUTCMinutes();
        const startSeconds = selectionStart.getUTCSeconds();
        const startTimeInSeconds = startHours * 3600 + startMinutes * 60 + startSeconds;
        
        const endHours = selectionEnd.getUTCHours();
        const endMinutes = selectionEnd.getUTCMinutes();
        const endSeconds = selectionEnd.getUTCSeconds();
        const endTimeInSeconds = endHours * 3600 + endMinutes * 60 + endSeconds;
        
        // Reconstruct timestamps on base day, then add 24 hours if in early morning portion
        // This matches how parseHMS adjusts the data points
        if (startTimeInSeconds <= normalizedEndSec) {
          // Time is in early morning (00:00:00 to 06:00:00), add 24 hours to match data points
          startTs = baseDayMs + (startTimeInSeconds + 24 * 3600) * 1000;
        } else {
          // Time is in first part of shift (18:00:00 to 23:59:59), use as-is
          startTs = baseDayMs + startTimeInSeconds * 1000;
        }
        
        if (endTimeInSeconds <= normalizedEndSec) {
          // Time is in early morning (00:00:00 to 06:00:00), add 24 hours to match data points
          endTs = baseDayMs + (endTimeInSeconds + 24 * 3600) * 1000;
        } else {
          // Time is in first part of shift (18:00:00 to 23:59:59), use as-is
          endTs = baseDayMs + endTimeInSeconds * 1000;
        }
        
        // Debug log for overnight shifts
        console.log(`🔍 timeDomain overnight adjustment:`, {
          baseDayMs: new Date(baseDayMs).toISOString(),
          selectionStart: selectionStart.toISOString(),
          selectionEnd: selectionEnd.toISOString(),
          startTimeInSeconds,
          endTimeInSeconds,
          normalizedEndSec,
          adjustedStartTs: new Date(startTs).toISOString(),
          adjustedEndTs: new Date(endTs).toISOString()
        });
      }
      
      return [startTs, endTs];
    }

    // Fallback: compute union of available series
    const candidateStarts: number[] = [];
    const candidateEnds: number[] = [];

    vehicleMetrics.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    digitalStatusChart?.metrics?.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    if (candidateStarts.length === 0 || candidateEnds.length === 0) return null;

    const first = Math.min(...candidateStarts);
    const last = Math.max(...candidateEnds);
    return [first, last];
  }, [selectionStart, selectionEnd, vehicleMetrics, digitalStatusChart, selectedShift]);

  // Defer expensive chart updates while user is dragging/interacting with the scrubber.
  // This keeps the scrubber pointer/handles responsive.
  const deferredTimeDomain = useDeferredValue(timeDomain);
  const deferredSelectedTime = useDeferredValue(selectedTime);

  const visibleDigitalSignals = useMemo(() => {
    if (!digitalStatusChart?.metrics?.length) return [];
    return digitalStatusChart.metrics.filter(
      (m) => forceAllChartsVisible || (visibleDigital[m.id] ?? true)
    );
  }, [digitalStatusChart, forceAllChartsVisible, visibleDigital]);

  const visibleAnalogMetrics = useMemo(() => {
    return vehicleMetrics.filter((m) => {
      // Standard analog visibility
      let shouldShow = forceAllChartsVisible || (visibleAnalog[m.id] ?? true);

      // Drilling mode: also check downhole chart filters
      if (screenMode === 'Drilling' && shouldShow) {
        if (Object.keys(visibleDownholeCharts).length === 0) {
          shouldShow = true;
        } else {
          shouldShow = visibleDownholeCharts[m.name] === true;
        }
      }

      return shouldShow;
    });
  }, [vehicleMetrics, forceAllChartsVisible, visibleAnalog, visibleDownholeCharts, screenMode]);

  // Use refs to track throttling for smooth scrubber performance
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 33; // ~30fps (smoother under heavy chart load)
  
  // Handle time change from scrubber with throttling for smooth performance
  const handleTimeChange = useCallback((timestamp: number) => {
    const now = Date.now();
    
    // Cancel any pending animation frame
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    
    // In second view mode, use smaller throttle to allow second-by-second updates
    // In minute view mode, use normal throttle
    const throttleMs = THROTTLE_MS; // Always use standard throttle (minute view)
    
    // Throttle updates to prevent excessive re-renders
    if (now - lastUpdateRef.current >= throttleMs) {
      setSelectedTime(new Date(timestamp));
      setCrosshairActive(true);
      lastUpdateRef.current = now;
      rafRef.current = null;
    } else {
      // Schedule deferred update
      rafRef.current = requestAnimationFrame(() => {
        setSelectedTime(new Date(timestamp));
        setCrosshairActive(true);
        lastUpdateRef.current = Date.now();
        rafRef.current = null;
      });
    }
  }, []); // Always use minute view settings

  const normalizeRange = useCallback((startTimestamp: number, endTimestamp: number) => {
    // Allow user to expand the range (no max cap). Keep a small minimum range for usability.
    const minRangeMs = 60 * 60 * 1000; // minimum 1 hour (even in second view mode)

    let startMs = Math.min(startTimestamp, endTimestamp);
    let endMs = Math.max(startTimestamp, endTimestamp);

    // Enforce minimum range
    if (endMs - startMs < minRangeMs) {
      endMs = startMs + minRangeMs;
    }

    // Clamp selection inside the full SHIFT domain (not just loaded timestamps),
    // so user can expand up to the full shift even if the loaded data window is smaller.
    const shiftMeta = getShiftMeta(selectedDate, selectedShift);
    const shiftStartSec = shiftMeta.startSec;
    const shiftEndSec = shiftMeta.endSec;

    let baseDayMs: number | null = shiftMeta.timelineBaseDayStartMs;
    if (baseDayMs == null && rawTimestamps.length > 0) {
      const d = new Date(rawTimestamps[0]);
      d.setUTCHours(0, 0, 0, 0);
      baseDayMs = d.getTime();
    }
    if (baseDayMs == null) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      baseDayMs = d.getTime();
    }

    const domainStart = baseDayMs + (shiftStartSec * 1000);
    const domainEnd = baseDayMs + (shiftEndSec * 1000);
    const domainRange = domainEnd - domainStart;

    if (domainRange <= minRangeMs) {
      startMs = domainStart;
      endMs = domainEnd;
    } else {
      if (startMs < domainStart) startMs = domainStart;
      if (endMs > domainEnd) endMs = domainEnd;

      // Re-apply min range after clamping
      if (endMs - startMs < minRangeMs) {
        if (startMs + minRangeMs <= domainEnd) {
          endMs = startMs + minRangeMs;
            } else {
          startMs = domainEnd - minRangeMs;
          endMs = domainEnd;
        }
      }
    }

    return { startMs, endMs };
  }, [rawTimestamps, selectedDate, selectedShift]);

  const handleSelectionChange = useCallback((startTimestamp: number, endTimestamp: number) => {
    const { startMs, endMs } = normalizeRange(startTimestamp, endTimestamp);
    const newStart = new Date(startMs);
    const newEnd = new Date(endMs);

    setSelectionStart(newStart);
    setSelectionEnd(newEnd);
    
    // Keep selected time inside the visible window (don’t force recenter every time).
    const current = selectedTime?.getTime?.() ?? null;
    if (current == null) {
      setSelectedTime(new Date(Math.floor((startMs + endMs) / 2)));
    } else if (current < startMs) {
      setSelectedTime(new Date(startMs));
    } else if (current > endMs) {
      setSelectedTime(new Date(endMs));
    }
  }, [normalizeRange, selectedTime, setSelectedTime]);

  const handleSelectionCommit = useCallback((startTimestamp: number, endTimestamp: number) => {
    const { startMs, endMs } = normalizeRange(startTimestamp, endTimestamp);
    setApiRange({ startMs, endMs });
  }, [normalizeRange]);

  // Handle time range selection from modal
  const handleTimeRangeSelect = useCallback((startTimeStr: string, endTimeStr: string) => {
    if (!selectedDate) return;

    // Parse the time strings (HH:MM:SS)
    const [startH, startM, startS] = startTimeStr.split(':').map(Number);
    const [endH, endM, endS] = endTimeStr.split(':').map(Number);

    const shiftMeta = getShiftMeta(selectedDate, selectedShift);
    const baseDayStartMs = shiftMeta.timelineBaseDayStartMs;
    if (baseDayStartMs == null) return;

    const startSeconds = startH * 3600 + startM * 60 + startS;
    const endSeconds = endH * 3600 + endM * 60 + endS;

    const mapToShiftTimestamp = (sec: number) => {
      if (shiftMeta.crossesMidnight && sec <= shiftMeta.normalizedEndSec) {
        return baseDayStartMs + (sec + 24 * 3600) * 1000;
      }
      return baseDayStartMs + sec * 1000;
    };

    const startMs = mapToShiftTimestamp(startSeconds);
    const endMs = mapToShiftTimestamp(endSeconds);

    // Normalize/clamp inside shift boundaries
    const { startMs: normalizedStart, endMs: normalizedEnd } = normalizeRange(startMs, endMs);

    setSelectionStart(new Date(normalizedStart));
    setSelectionEnd(new Date(normalizedEnd));
    setSelectedTime(new Date(Math.floor((normalizedStart + normalizedEnd) / 2)));

    // Trigger API call by setting apiRange
    setApiRange({ startMs: normalizedStart, endMs: normalizedEnd });
  }, [selectedDate, selectedShift, normalizeRange, setSelectedTime]);

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // Intentionally no-op: keep pointer/red-line fixed unless knob is dragged
  }, []);

  // Always show asset selection modal first on page load/refresh
  // Only hide it after user clicks "Show Graph"
  // Check showAssetModal first - if true, always show modal
  if (showAssetModal) {
    return <AssetSelectionModal onShowGraph={handleShowGraph} />;
  }
  
  // Also show modal if vehicle or date is not selected (safety check)
  if (!selectedVehicleId || !selectedDate) {
    return <AssetSelectionModal onShowGraph={handleShowGraph} />;
  }

  return (
    <React.Fragment>
    <ErrorModal
      isOpen={errorModal.isOpen}
      onClose={() => setErrorModal({ isOpen: false, message: '' })}
      title="Something went wrong"
      message={errorModal.message}
      showRefresh={true}
    />
    <div className={styles.dashboard}>
      <div className={styles.topPanel}>
        <div className={styles.headerBar}>
          <div className={styles.headerStatus}>
            {/* <span className={styles.headerLabel}>Time:</span> */}
            {/* <span className={styles.headerValue}>
              {selectedTime ? format(selectedTime, 'HH:mm:ss') : '—'}
            </span> */}
          </div>
        </div>
        {scrubberData.length > 0 && selectionStart && selectionEnd && (
          <TimeScrubber
            data={scrubberData}
            selectedTime={selectedTime?.getTime() || null}
            selectionStart={selectionStart.getTime()}
            selectionEnd={selectionEnd.getTime()}
            onTimeChange={handleTimeChange}
            onSelectionChange={handleSelectionChange}
            onSelectionCommit={handleSelectionCommit}
            onHover={handleHover}
            isSecondViewMode={isSecondViewMode}
            showVehiclePointer={screenMode === 'Drilling'}
            onTimeRangeSelect={handleTimeRangeSelect}
            shift={selectedShift}
          />
        )}
      </div>

      <div className={styles.scrollArea}>
        {loading && (
          <div className={styles.loaderOverlay}>
            <div className={styles.loader}>
              <div className={styles.loaderSpinner}>
                <div className={styles.spinnerRing}></div>
                <div className={styles.spinnerRing}></div>
                <div className={styles.spinnerRing}></div>
              </div>
              <div className={styles.loaderText}>Loading data...</div>
            </div>
          </div>
        )}
        <div className={styles.scrollContent}>
          {/* Maintenance Mode: Show Tables Instead of Graphs */}
          {screenMode === 'Maintenance' && maintenanceTablesData ? (
            <MaintenanceTables
              reportingOutputs={maintenanceTablesData.reportingOutputs}
              faultReportingAnalog={maintenanceTablesData.faultReportingAnalog}
              faultReportingDigital={maintenanceTablesData.faultReportingDigital}
              selectionStart={selectionStart}
              selectionEnd={selectionEnd}
              visibleRows={visibleMaintenanceRows}
            />
          ) : (
            <>
              {/* Digital Signal Timeline Chart - Only show in Maintenance mode (if tables not loaded) */}
              {screenMode === 'Maintenance' && (
          <div id="digitalSignalContainer">
            {digitalStatusChart && digitalStatusChart.metrics.length > 0 && (
              <DigitalSignalTimeline
                signals={visibleDigitalSignals}
                selectedTime={deferredSelectedTime}
                crosshairActive={crosshairActive}
                timeDomain={deferredTimeDomain}
                isSecondViewMode={isSecondViewMode}
              />
            )}
          </div>
              )}

              {/* Analog Charts - Only show in Drilling mode */}
              {screenMode === 'Drilling' && (
          <div id="analogChartsContainer" className={styles.chartsContainer} data-print-full-page={forceAllChartsVisible}>
            {visibleAnalogMetrics.map(metric => {
              return (
                <AnalogChart
                  key={metric.id}
                  id={metric.id}
                  name={metric.name}
                  unit={metric.unit}
                  color={metric.color}
                  min_color={metric.min_color}
                  max_color={metric.max_color}
                  data={metric.data}
                  yAxisRange={metric.yAxisRange}
                  selectedTime={deferredSelectedTime}
                  crosshairActive={crosshairActive}
                  timeDomain={deferredTimeDomain}
                  isSecondViewMode={isSecondViewMode}
                />
              );
            })}
            
            {/* Processing progress indicator */}
            {loading && processingProgress > 0 && processingProgress < 100 && (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                color: '#666',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{ 
                  width: '200px', 
                  height: '4px', 
                  backgroundColor: '#e5e7eb', 
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${processingProgress}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease'
                  }}></div>
          </div>
                <div style={{ fontSize: '12px' }}>
                  Processing charts... {processingProgress}%
        </div>
      </div>
            )}
    </div>
              )}

              {/* Operations Table - Only show in Drilling mode */}
              {screenMode === 'Drilling' && (
                <DrillingOperationsTable 
                  mode={screenMode} 
                  tableData={tableData || undefined}
                  selectionStart={selectionStart}
                  selectionEnd={selectionEnd}
                  visibleRows={visibleRigOpsRows}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
    {showFilters && screenMode === 'Maintenance' && maintenanceTablesData && (
      <MaintenanceFilterModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={(rows) => {
          console.log('🔍 Maintenance filter applied:', rows);
          setVisibleMaintenanceRows(rows);
          setShowFilters(false);
        }}
        initialRows={visibleMaintenanceRows}
        availableTableRows={[
          ...(maintenanceTablesData.reportingOutputs ? Object.keys(maintenanceTablesData.reportingOutputs).map(name => ({ name, section: 'MAINTENANCE - REPORTING OUTPUTS' })) : []),
          ...(maintenanceTablesData.faultReportingAnalog ? Object.keys(maintenanceTablesData.faultReportingAnalog).map(name => ({ name, section: 'MAINTENANCE - FAULT REPORTING OUTPUTS (ANALOG)' })) : []),
          ...(maintenanceTablesData.faultReportingDigital ? Object.keys(maintenanceTablesData.faultReportingDigital).map(name => ({ name, section: 'MAINTENANCE - FAULT REPORTING OUTPUTS (DIGITAL)' })) : [])
        ]}
      />
    )}
    {showDrillingFilters && screenMode === 'Drilling' && (
      <DrillingFilterModal
        isOpen={showDrillingFilters}
        onClose={() => setShowDrillingFilters(false)}
        onApply={(downhole, rigOps) => {
          // Store visibility directly (true = visible, false = hidden)
          console.log('🔍 onApply called with:', { 
            downhole, 
            rigOps, 
            rigOpsKeys: Object.keys(rigOps),
            rigOpsEntries: Object.entries(rigOps)
          });
          console.log('🔍 Setting visibleRigOpsRows to:', rigOps);
          setVisibleDownholeCharts(downhole);
          setVisibleRigOpsRows(rigOps);
          setShowDrillingFilters(false);
        }}
        initialDownhole={visibleDownholeCharts}
        initialRigOps={visibleRigOpsRows}
        availableCharts={vehicleMetrics.map(m => ({ name: m.name, id: m.id }))}
        availableTableRows={tableData ? Object.entries(tableData).map(([name, entry]) => {
          // Use the ID from the API entry as the code
          const code = entry.id || name;
          console.log(`🔍 Table row: name="${name}", id="${entry.id}", code="${code}"`);
          return { name, code };
        }) : []}
      />
    )}
    </React.Fragment>
  );
};

export default VehicleDashboard;