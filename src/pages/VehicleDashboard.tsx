import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { format, parseISO } from 'date-fns';
import TimeScrubber from '../components/TimeScrubber';
import DigitalSignalTimeline from '../components/DigitalSignalTimeline';
import AnalogChart from '../components/AnalogChart';
import AssetSelectionModal from '../components/AssetSelectionModal';
import FilterOptionsModal from '../components/FilterOptionsModal';
import ErrorModal from '../components/ErrorModal';
import styles from './VehicleDashboard.module.css';
import { useTimeContext } from '../context/TimeContext';

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

const VehicleDashboard: React.FC = () => {
  const [vehicleMetrics, setVehicleMetrics] = useState<VehicleMetric[]>([]);
  const [digitalStatusChart, setDigitalStatusChart] = useState<DigitalStatusChart | null>(null);
  const { selectedTime, setSelectedTime } = useTimeContext();
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [crosshairActive, setCrosshairActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  // Commented out asset modal - using dummy data
  // const [showAssetModal, setShowAssetModal] = useState<boolean>(true);
  const [showAssetModal, setShowAssetModal] = useState<boolean>(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(6363298);
  const [selectedDate, setSelectedDate] = useState<string>('2025-01-15');
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
  const [isSecondViewMode, setIsSecondViewMode] = useState<boolean>(false);
  const [perSecondData, setPerSecondData] = useState<any>(null);
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


  const handleShowGraph = useCallback((vehicleId: number, date: string) => {
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
    
    setSelectedVehicleId(vehicleId);
    setSelectedDate(date);
    setShowAssetModal(false);
    
    // Dispatch event so FilterControls can initialize with selected values
    window.dispatchEvent(new CustomEvent('asset:selected', {
      detail: {
        vehicleId,
        date
      }
    }));
    
    // Dispatch event so MapComponent can load GPS data
    window.dispatchEvent(new CustomEvent('filters:apply', { 
      detail: { device_id: vehicleId, date } 
    }));
  }, []);

  

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

  // Listen to top-left controls events
  useEffect(() => {
    const onApply = (e: any) => {
      const deviceId = Number(e?.detail?.device_id);
      const date = String(e?.detail?.date || '');
      if (deviceId) setSelectedVehicleId(deviceId);
      if (date) setSelectedDate(date);
      if (deviceId && date) handleShowGraph(deviceId, date);
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
  }, [handleShowGraph]);

  // Listen to hour range selection events
  useEffect(() => {
    const handleHourRangeSelected = async (e: any) => {
      const { start, end, label } = e.detail;
      setSelectedHourRange({ start, end, label });
      setIsSecondViewMode(true);
      console.log('🕐 Hour range selected - Switching to second view:', start, 'to', end);
      
      // Load per-second data for the selected hour range
      try {
        setLoading(true);
        const response = await fetch('/data/dummy-per-second-1hour.json', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load dummy data: ${response.status}`);
        }
        
        const json = await response.json();
        
        // Filter data to only the selected hour range (per-second, not per-minute)
        const filterPerSecondData = (data: any) => {
          return data.filter((point: any) => {
            const pointTime = point.time;
            return pointTime >= start && pointTime < end;
          });
        };
        
        const filteredData = {
          timestamps: filterPerSecondData(json.timestamps || []),
          gpsPerSecond: filterPerSecondData(json.gpsPerSecond || []),
          digitalPerSecond: (json.digitalPerSecond || []).map((series: any) => ({
            ...series,
            points: filterPerSecondData(series.points || [])
          })),
          analogPerSecond: (json.analogPerSecond || []).map((series: any) => ({
            ...series,
            points: filterPerSecondData(series.points || [])
          }))
        };
        
        setPerSecondData(filteredData);
        setLoading(false);
        console.log('✅ Loaded per-second data for hour range');
      } catch (error) {
        console.error('Error loading per-second data:', error);
        setLoading(false);
      }
    };
    
    const handleHourRangeCleared = () => {
      setSelectedHourRange(null);
      setIsSecondViewMode(false);
      setPerSecondData(null);
      console.log('🕐 Hour range cleared - Switching back to minute view');
    };
    
    window.addEventListener('hour-range:selected', handleHourRangeSelected as any);
    window.addEventListener('hour-range:cleared', handleHourRangeCleared);
    
    return () => {
      window.removeEventListener('hour-range:selected', handleHourRangeSelected as any);
      window.removeEventListener('hour-range:cleared', handleHourRangeCleared);
    };
  }, [selectedDate]);
  
  // Process per-second data when it's loaded
  useEffect(() => {
    if (!perSecondData || !isSecondViewMode) return;
    
    const baseDate = new Date(selectedDate);
    baseDate.setHours(0, 0, 0, 0);
    
    const parseHMS = (hms: string): Date => {
      const [hh, mm, ss] = hms.split(':').map(Number);
      const date = new Date(baseDate);
      date.setHours(hh, mm, ss, 0);
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
    
    // Dispatch GPS data - convert time strings to timestamps
    if (Array.isArray(perSecondData.gpsPerSecond) && perSecondData.gpsPerSecond.length > 0) {
      const processedGpsData = perSecondData.gpsPerSecond.map((point: any) => {
        // Convert time string (HH:mm:ss) to timestamp
        const [hh, mm, ss] = (point.time || '00:00:00').split(':').map(Number);
        const gpsTime = new Date(baseDate);
        gpsTime.setHours(hh, mm, ss, 0);
        
        return {
          ...point,
          time: gpsTime.getTime(), // Convert to timestamp
          lat: point.lat,
          lng: point.lng,
          speed: point.speed,
          heading: point.heading
        };
      }).sort((a: any, b: any) => a.time - b.time);
      
      window.dispatchEvent(new CustomEvent('gps:data', { 
        detail: { gpsData: processedGpsData } 
      }));
      console.log('📍 Dispatched processed GPS data for second view:', processedGpsData.length, 'points');
    }
    
    setVehicleMetrics(analogMetrics);
    if (digitalChart) {
      setDigitalStatusChart(digitalChart);
    }
    
    // Set initial time to start of range
    if (selectedHourRange) {
      const [hh, mm, ss] = selectedHourRange.start.split(':').map(Number);
      const initialTime = new Date(baseDate);
      initialTime.setHours(hh, mm, ss, 0);
      setSelectedTime(initialTime);
      
      // Set selection range: 10 minutes in second view mode, 1 hour in minute view mode
      const endTime = new Date(initialTime);
      if (isSecondViewMode) {
        endTime.setMinutes(mm + 10, 0, 0); // 10 minutes range
        // If adding 10 minutes crosses hour boundary, cap at hour end
        if (endTime.getHours() !== hh) {
          endTime.setHours(hh, 59, 59, 999);
        }
      } else {
        endTime.setHours(hh + 1, 0, 0, 0); // 1 hour range
      }
      setSelectionStart(initialTime);
      setSelectionEnd(endTime);
    }
  }, [perSecondData, isSecondViewMode, selectedDate, selectedHourRange]);

  useEffect(() => {
    // Only load chart data when vehicle and date are selected
    // Skip loading if in second view mode (per-second data is loaded separately)
    if (showAssetModal || !selectedVehicleId || !selectedDate || isSecondViewMode) {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setProcessingProgress(0);
        
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
        
        // LOAD FROM DUMMY JSON FILE INSTEAD
        console.log('📂 Loading dummy data from JSON file...');
        const response = await fetch('/data/dummy-per-second-1hour.json', {
          headers: { 
            'Accept': 'application/json'
          },
          cache: 'no-store'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load dummy data: ${response.status} ${response.statusText}`);
        }
        
        const json = await response.json();
        console.log('✅ Loaded dummy JSON data');
        
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
        
        // Create payload with converted per-minute data
        let payload: any = {
          timestamps: convertTimestampsToPerMinute(json.timestamps || []),
          gpsPerSecond: json.gpsPerSecond || [],
          digitalPerSecond: convertDigitalPerSecondToPerMinute(json.digitalPerSecond || []),
          analogPerMinute: convertPerSecondToPerMinute(json.analogPerSecond || [])
        };
        
        // Filter by hour range if selected
        if (selectedHourRange) {
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
            analogPerMinute: filterByTimeRange(payload.analogPerMinute, 'time')
          };
          
          console.log('🔍 Filtered data by hour range:', selectedHourRange.start, 'to', selectedHourRange.end);
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
        
        // Dispatch GPS data to MapComponent if available (only in minute view mode)
        // In second view mode, GPS data is dispatched separately from perSecondData processing
        if (!isSecondViewMode) {
          const gpsData = payload?.gpsPerSecond || payload?.gps_per_second || payload?.gps || payload?.locations || payload?.gpsPoints || payload?.track || payload?.route || null;
          if (Array.isArray(gpsData) && gpsData.length > 0) {
            console.log('📍 Dispatching GPS data to MapComponent (minute view):', gpsData.length, 'points');
            
            // Process GPS data - convert time strings to timestamps if needed
            const baseDate = new Date(selectedDate);
            baseDate.setHours(0, 0, 0, 0);
            
            const processedGpsData = gpsData.map((point: any) => {
              let timeNum: number;
              if (typeof point.time === 'number') {
                timeNum = point.time;
              } else if (typeof point.time === 'string') {
                // Check if it's HH:mm:ss format
                if (point.time.match(/^\d{2}:\d{2}:\d{2}$/)) {
                  const [hh, mm, ss] = point.time.split(':').map(Number);
                  timeNum = baseDate.getTime() + (hh || 0) * 3600000 + (mm || 0) * 60000 + (ss || 0) * 1000;
                } else {
                  timeNum = Date.parse(point.time) || Date.now();
                }
              } else {
                timeNum = point.timestamp || point.timeStamp || Date.now();
              }
              
              return {
                ...point,
                time: timeNum,
                lat: point.lat,
                lng: point.lng,
                speed: point.speed,
                heading: point.heading
              };
            }).sort((a: any, b: any) => a.time - b.time);
            
            window.dispatchEvent(new CustomEvent('gps:data', { 
              detail: { gpsData: processedGpsData } 
            }));
          } else {
            console.log('📍 No GPS data found in payload to dispatch');
          }
        }
        
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

        // Align timestamp to minute boundary: Math.floor(timestamp / 60000) * 60000
        const alignToMinute = (timestampMs: number): number => {
          return Math.floor(timestampMs / 60000) * 60000;
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
        
        const times: number[] = timesRaw
          .map(parseTimestampToMs)
          .filter((n: number) => Number.isFinite(n))
          .map(alignToMinute)
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
          const usedTimes = timestamps || times;
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
          const usedTimes = timestamps || times;
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
          if (!signalTimes.length) {
            signalTimes = times;
          }
          const normalizedSignalTimes = Array.isArray(signalTimes)
            ? signalTimes.map(parseTimestampToMs).filter((n: number) => Number.isFinite(n)).map(alignToMinute).sort((a: number, b: number) => a - b)
            : times;
          
          // Create data points with exact API values, aligned timestamps, and sorted
          const data = (minsRaw || maxsRaw) 
            ? toSeriesTriplet(avgRaw, minsRaw, maxsRaw, normalizedSignalTimes)
            : toSeries(avgRaw, normalizedSignalTimes);
          
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
        // Digital per-second override
        if (!digitalChart.metrics.length && Array.isArray((payload as any).digitalPerSecond)) {
          console.group('📊 Digital Per-Second Signals - Raw API Data');
          console.log('Number of digital per-second series:', (payload.digitalPerSecond as Array<any>).length);
          (payload.digitalPerSecond as Array<any>).forEach((series: any, idx: number) => {
            console.group(`📊 Digital Per-Second Series ${idx + 1} - Raw API Data: ${series.name || series.id || 'Unknown'}`);
            console.log('Complete API Object:', JSON.stringify(series, null, 2));
            console.log('Points array (first 20):', series.points?.slice(0, 20));
            console.log('Points array (last 20):', series.points?.slice(-20));
            console.log('Total points count:', series.points?.length || 0);
            console.groupEnd();
          });
          console.groupEnd();
          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            const base = new Date(times[0] ?? Date.now());
            base.setHours(0, 0, 0, 0);
            const timestamp = base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
            // Align to minute boundary
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
            // Log raw API data for verification
            console.group(`📡 Digital Signal API Data: ${series.name || series.id} (${series.id})`);
            console.log('Raw API points:', series.points);
            console.log('Total points:', (series.points || []).length);
            
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
            
            // Log processed points with exact values
            console.log('Processed points (first 20):', pts.slice(0, 20).map((p:any) => ({
              time: format(p.time, 'HH:mm:ss'),
              timestamp: p.time.getTime(),
              value: p.value,
              status: p.value === 1 ? 'ON' : 'OFF',
              rawTime: p.rawTime,
              rawValue: p.rawValue
            })));
            console.log('Processed points (last 10):', pts.slice(-10).map((p: { time: Date; value: number; rawTime: string; rawValue: any }) => ({
              time: format(p.time, 'HH:mm:ss'),
              timestamp: p.time.getTime(),
              value: p.value,
              status: p.value === 1 ? 'ON' : 'OFF'
            })));
            console.groupEnd();
            
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
        if (!analogMetrics.length && Array.isArray((payload as any).analogPerSecond)) {
          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            const base = new Date(times[0] ?? Date.now());
            base.setHours(0, 0, 0, 0);
            const timestamp = base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
            // Align to minute boundary
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
              // If avg is missing, use null; if min/max are missing, use null or avg if available
              const avgRaw = r.avg !== null && r.avg !== undefined ? Number(r.avg) : null;
              const minRaw = r.min !== null && r.min !== undefined ? Number(r.min) : (r.avg !== null && r.avg !== undefined ? Number(r.avg) : null);
              const maxRaw = r.max !== null && r.max !== undefined ? Number(r.max) : (r.avg !== null && r.avg !== undefined ? Number(r.avg) : null);
              
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
            
            // Debug: Log processed per-second data
            console.group(`🔍 Analog Per-Second Series - Processed Data: ${id}`);
            console.log('Resolution:', resolution, 'Offset:', offset);
            console.log('API Points (raw):', series.points);
            console.log('Processed Points (after transformation):', rawPts);
            console.log('Points Count:', rawPts.length);
            console.log('First 5 points:', rawPts.slice(0, 5));
            console.log('Last 5 points:', rawPts.slice(-5));
            const safeAvg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
            const safeMin = allMins.length > 0 ? Math.min(...allMins) : (values.length > 0 ? Math.min(...values) : 0);
            const safeMax = allMaxs.length > 0 ? Math.max(...allMaxs) : (values.length > 0 ? Math.max(...values) : 0);
            console.log('Calculated Stats (after transformation):', {
              avg: safeAvg,
              min: safeMin,
              max: safeMax
            });
            console.log('Y-Axis Range:', usedRange);
            console.groupEnd();
            
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
              
              // Debug: Log what we're setting
              console.log(`✅ analogPerSecond - Metric being created for ${id}:`, {
                min_color: metric.min_color,
                max_color: metric.max_color,
                hasMinColor: !!metric.min_color,
                hasMaxColor: !!metric.max_color
              });
              
              analogMetrics.push(metric);
            }
          });
        }
        // Process analogPerMinute if available (new API returns this format)
        // Prioritize analogPerMinute over analogPerSecond for the new API
        if (Array.isArray((payload as any).analogPerMinute) && (payload.analogPerMinute as Array<any>).length > 0) {
          // Clear any existing analog metrics if we have analogPerMinute data
          analogMetrics.length = 0;
          console.group('📊 Analog Per-Minute Data - API Response');
          console.log('Number of analog per-minute series:', (payload.analogPerMinute as Array<any>).length);
          const parseHMS = (hms: string) => {
            const parts = String(hms).split(':');
            const hh = Number(parts[0] || 0);
            const mm = Number(parts[1] || 0);
            const ss = Number(parts[2] || 0);
            const base = new Date(times[0] ?? Date.now());
            base.setHours(0, 0, 0, 0);
            const timestamp = base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
            // Align to minute boundary
            return new Date(alignToMinute(timestamp));
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
            
            // Use exact API values, apply resolution and offset, align timestamps to minutes
            // Use null for missing avg/min/max values so line doesn't connect through missing data
            const rawPts = (series.points || []).map((r: any) => {
              const time = parseHMS(r.time);
              // If avg is missing, use null; if min/max are missing, use null or avg if available
              const avgRaw = r.avg !== null && r.avg !== undefined ? Number(r.avg) : null;
              const minRaw = r.min !== null && r.min !== undefined ? Number(r.min) : (r.avg !== null && r.avg !== undefined ? Number(r.avg) : null);
              const maxRaw = r.max !== null && r.max !== undefined ? Number(r.max) : (r.avg !== null && r.avg !== undefined ? Number(r.avg) : null);
              
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
            
            if (!rawPts.length) {
              console.warn('No points in series, skipping');
              console.groupEnd();
              return;
            }
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
            console.log('Resolution:', resolution, 'Offset:', offset);
            console.log('Processed Points Count:', rawPts.length);
            console.log('Calculated Stats (after transformation):', { avg: safeAvg, min: safeMin, max: safeMax });
            console.log('First 3 points (after transformation):', rawPts.slice(0, 3));
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
            
            // Debug: Log what we're setting
            console.log('✅ Metric being created:', {
              id: metric.id,
              min_color: metric.min_color,
              max_color: metric.max_color,
              hasMinColor: !!metric.min_color,
              hasMaxColor: !!metric.max_color
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

        // Set digital chart immediately if present
        if (digitalChart && digitalChart.metrics.length > 0) {
        setDigitalStatusChart(digitalChart);
        }

        // Process all analog metrics but render progressively to avoid blocking UI
        setProcessingProgress(10); // 10% - data received
        
        // Use requestAnimationFrame to process data in chunks for better performance
        const processDataInChunks = () => {
          const CHUNK_SIZE = 10; // Process 10 charts at a time
          const totalCharts = analogMetrics.length;
          let processedCount = 0;
          
          const processChunk = () => {
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
                setTimeout(processChunk, 0); // Allow browser to render between chunks
              });
            } else {
              // All processed
              setProcessingProgress(100);
              setLoading(false);
            }
          };
          
          if (totalCharts > 0) {
            processChunk();
          } else {
            setVehicleMetrics([]);
            setProcessingProgress(100);
            setLoading(false);
          }
        };
        
        // Start processing after a brief delay to show progress
        setTimeout(processDataInChunks, 50);

        // Set time range after all data is processed
        const shouldUpdateTimeRange = true;
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
        const combinedMin = minCandidates.length ? Math.min(...minCandidates) : null;
        const combinedMax = maxCandidates.length ? Math.max(...maxCandidates) : null;
        if (combinedMin !== null && combinedMax !== null) {
          const start = new Date(combinedMin);
          const end = new Date(combinedMax);
          const center = new Date(Math.floor((start.getTime() + end.getTime()) / 2));
          setSelectedTime(center);
          setSelectionStart(start);
          setSelectionEnd(end);
        } else {
          // Fallback to times array only if no data points found
          const firstTs = times[0];
          const lastTs = times[times.length - 1];
          if (firstTs) {
            const first = new Date(firstTs);
            setSelectionStart(first);
          }
          if (lastTs) {
            const last = new Date(lastTs);
            setSelectionEnd(last);
            if (firstTs) {
              const center = new Date(Math.floor((firstTs + lastTs) / 2));
              setSelectedTime(center);
            } else {
              setSelectedTime(new Date(lastTs));
            }
          }
        }
        }
        
        // Loading state is managed by processDataInChunks
        return;
      } catch (e: any) {
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
    
    // Load data when vehicle and date are selected
    load();
  }, [selectedVehicleId, selectedDate, showAssetModal, selectedHourRange, isSecondViewMode]); // Reload when vehicle/date/hour range changes, but skip if in second view mode


  // Prepare scrubber data - per-second in second view mode, per-minute otherwise
  const scrubberData = useMemo(() => {
    // In second view mode, use actual per-second timestamps from the data
    if (isSecondViewMode && perSecondData && selectedHourRange) {
      const baseDate = new Date(selectedDate);
      baseDate.setHours(0, 0, 0, 0);
      
      // Get all unique timestamps from per-second data
      const timestamps = new Set<number>();
      
      // Collect timestamps from analog per-second data
      if (Array.isArray(perSecondData.analogPerSecond)) {
        perSecondData.analogPerSecond.forEach((series: any) => {
          (series.points || []).forEach((p: any) => {
            const [hh, mm, ss] = (p.time || '00:00:00').split(':').map(Number);
            const time = new Date(baseDate);
            time.setHours(hh, mm, ss, 0);
            timestamps.add(time.getTime());
          });
        });
      }
      
      // Collect timestamps from digital per-second data
      if (Array.isArray(perSecondData.digitalPerSecond)) {
        perSecondData.digitalPerSecond.forEach((series: any) => {
          (series.points || []).forEach((p: any) => {
            const [hh, mm, ss] = (p.time || '00:00:00').split(':').map(Number);
            const time = new Date(baseDate);
            time.setHours(hh, mm, ss, 0);
            timestamps.add(time.getTime());
          });
        });
      }
      
      // Collect timestamps from GPS per-second data
      if (Array.isArray(perSecondData.gpsPerSecond)) {
        perSecondData.gpsPerSecond.forEach((point: any) => {
          const [hh, mm, ss] = (point.time || '00:00:00').split(':').map(Number);
          const time = new Date(baseDate);
          time.setHours(hh, mm, ss, 0);
          timestamps.add(time.getTime());
        });
      }
      
      // Filter to selected hour range and sort
      const [startH, startM, startS] = selectedHourRange.start.split(':').map(Number);
      const [endH, endM, endS] = selectedHourRange.end.split(':').map(Number);
      
      const startTime = new Date(baseDate);
      startTime.setHours(startH, startM, startS, 0);
      
      const endTime = new Date(baseDate);
      endTime.setHours(endH, endM, endS, 0);
      
      const filteredTimestamps = Array.from(timestamps)
        .filter(t => t >= startTime.getTime() && t <= endTime.getTime())
        .sort((a, b) => a - b);
      
      return filteredTimestamps.map(t => ({ time: t }));
    }
    
    // Default: per-minute resolution
    // Prefer explicit selection range when available
    const candidateStarts: number[] = [];
    const candidateEnds: number[] = [];

    if (selectionStart) candidateStarts.push(selectionStart.getTime());
    if (selectionEnd) candidateEnds.push(selectionEnd.getTime());

    // Consider all analog series
    vehicleMetrics.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    // Consider all digital series
    digitalStatusChart?.metrics?.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    if (candidateStarts.length === 0 || candidateEnds.length === 0) return [];

    const startTs = Math.min(...candidateStarts);
    const endTs = Math.max(...candidateEnds);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) return [];

    const data: Array<{ time: number }> = [];
    const step = 60 * 1000; // 1 minute resolution
    for (let t = startTs; t <= endTs; t += step) {
      data.push({ time: t });
    }
    if (data.length === 0 || data[data.length - 1].time !== endTs) data.push({ time: endTs });
    return data;
  }, [vehicleMetrics, digitalStatusChart, selectionStart, selectionEnd, isSecondViewMode, selectedHourRange, selectedDate, perSecondData]);

  // Calculate synchronized time domain from selection range
  const timeDomain = useMemo<[number, number] | null>(() => {
    if (selectionStart && selectionEnd) {
      return [selectionStart.getTime(), selectionEnd.getTime()];
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
  }, [selectionStart, selectionEnd, vehicleMetrics, digitalStatusChart]);

  // Use refs to track throttling for smooth scrubber performance
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 16; // ~60fps
  
  // Handle time change from scrubber with throttling for smooth performance
  const handleTimeChange = useCallback((timestamp: number) => {
    const now = Date.now();
    
    // Cancel any pending animation frame
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    
    // In second view mode, use smaller throttle to allow second-by-second updates
    // In minute view mode, use normal throttle
    const throttleMs = isSecondViewMode ? 50 : THROTTLE_MS;
    
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
  }, [isSecondViewMode]);

  // Handle selection range change from scrubber
  const handleSelectionChange = useCallback((startTimestamp: number, endTimestamp: number) => {
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    
    // In second view mode: enforce MIN 10 minutes range
    // In minute view mode: enforce MIN 1 hour range
    const minRangeMs = isSecondViewMode ? (10 * 60 * 1000) : (60 * 60 * 1000); // 10 minutes or 1 hour
    const rangeMs = endTimestamp - startTimestamp;
    const newStart = start;
    let newEnd = end;
    if (rangeMs < minRangeMs) {
      newEnd = new Date(startTimestamp + minRangeMs);
    }
    setSelectionStart(newStart);
    setSelectionEnd(newEnd);
    
    // Update selected time to center of range if needed
    const centerTime = new Date((newStart.getTime() + newEnd.getTime()) / 2);
    setSelectedTime(centerTime);
  }, [isSecondViewMode]);

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // Intentionally no-op: keep pointer/red-line fixed unless knob is dragged
  }, []);

  // COMMENTED OUT ASSET MODAL - Using dummy data, showing graphs directly
  // Show asset selection modal first - always show if no valid selection
  // if (showAssetModal || !selectedVehicleId || !selectedDate) {
  //   return <AssetSelectionModal onShowGraph={handleShowGraph} />;
  // }

  return (
    <>
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
          <div className={styles.headerTitle}>Smart Data Link</div>
          <div className={styles.headerStatus}>
            {/* <span className={styles.headerLabel}>Time:</span> */}
            {/* <span className={styles.headerValue}>
              {selectedTime ? format(selectedTime, 'HH:mm:ss') : '—'}
            </span> */}
          </div>
        </div>
        {scrubberData.length > 0 && (
          <TimeScrubber
            data={scrubberData}
            selectedTime={selectedTime?.getTime() || null}
            selectionStart={selectionStart?.getTime() || null}
            selectionEnd={selectionEnd?.getTime() || null}
            onTimeChange={handleTimeChange}
            onSelectionChange={handleSelectionChange}
            onHover={handleHover}
            isSecondViewMode={isSecondViewMode}
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
          {/* Digital Signal Timeline Chart */}
          <div id="digitalSignalContainer">
            {digitalStatusChart && digitalStatusChart.metrics.length > 0 && (
              <DigitalSignalTimeline
                signals={digitalStatusChart.metrics.filter(m => forceAllChartsVisible || (visibleDigital[m.id] ?? true))}
                selectedTime={selectedTime}
                crosshairActive={crosshairActive}
                timeDomain={timeDomain}
                isSecondViewMode={isSecondViewMode}
              />
            )}
          </div>

          {/* Analog Charts */}
          <div id="analogChartsContainer" className={styles.chartsContainer} data-print-full-page={forceAllChartsVisible}>
            {(() => {
              // Debug: Log filter results
              if (forceAllChartsVisible) {
                console.log('🖨️ forceAllChartsVisible is TRUE - showing all', vehicleMetrics.length, 'charts');
              }
              const filtered = vehicleMetrics.filter(m => {
                const shouldShow = forceAllChartsVisible || (visibleAnalog[m.id] ?? true);
                if (!shouldShow && forceAllChartsVisible) {
                  console.warn('🖨️ Chart filtered out despite forceAllChartsVisible:', m.id);
                }
                return shouldShow;
              });
              if (forceAllChartsVisible && filtered.length !== vehicleMetrics.length) {
                console.error('🖨️ ERROR: Not all charts are visible! Expected:', vehicleMetrics.length, 'Got:', filtered.length);
              }
              return filtered;
            })().map(metric => {
              // Debug: Log what we're passing to AnalogChart
              console.log(`📤 Passing to AnalogChart ${metric.id}:`, {
                min_color: metric.min_color,
                max_color: metric.max_color,
                hasMinColor: !!metric.min_color,
                hasMaxColor: !!metric.max_color
              });
              
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
                  selectedTime={selectedTime}
                  crosshairActive={crosshairActive}
                  timeDomain={timeDomain}
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
        </div>
      </div>
    </div>
    {showFilters && (
      <FilterOptionsModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={(d, a) => { setVisibleDigital(d); setVisibleAnalog(a); setShowFilters(false); }}
        initialDigital={visibleDigital}
        initialAnalog={visibleAnalog}
      />
    )}
    </>
  );
};

export default VehicleDashboard;