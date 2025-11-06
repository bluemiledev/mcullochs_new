import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import TimeScrubber from '../components/TimeScrubber';
import DigitalSignalTimeline from '../components/DigitalSignalTimeline';
import AnalogChart from '../components/AnalogChart';
import AssetSelectionModal from '../components/AssetSelectionModal';
import FilterOptionsModal from '../components/FilterOptionsModal';
import styles from './VehicleDashboard.module.css';
import { useTimeContext } from '../context/TimeContext';

interface VehicleMetric {
  id: string;
  name: string;
  unit: string;
  color: string;
  data: Array<{ time: Date; value: number }>;
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
  const [showAssetModal, setShowAssetModal] = useState<boolean>(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [visibleChartsCount, setVisibleChartsCount] = useState<number>(5); // Start with 5 charts, progressively render more
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [vehicles, setVehicles] = useState<Array<{ id: number; rego: string }>>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState<boolean>(false);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [visibleDigital, setVisibleDigital] = useState<Record<string, boolean>>({});
  const [visibleAnalog, setVisibleAnalog] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState<boolean>(false);

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
        // Map: [{ devices_serial_no: "6363299" }, ...]
        const arr = (Array.isArray(json) ? json : [])
          .map((v: any) => String(v?.devices_serial_no || ''))
          .filter((s: string) => s.length > 0)
          .map((serial: string) => ({ id: Number(serial), rego: serial }));
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
    window.addEventListener('filters:apply', onApply as any);
    window.addEventListener('filters:open', onOpen as any);
    window.addEventListener('filters:clear', onClear as any);
    return () => {
      window.removeEventListener('filters:apply', onApply as any);
      window.removeEventListener('filters:open', onOpen as any);
      window.removeEventListener('filters:clear', onClear as any);
    };
  }, [handleShowGraph]);

  useEffect(() => {
    // Only load chart data when vehicle and date are selected
    if (showAssetModal || !selectedVehicleId || !selectedDate) {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setProcessingProgress(0);
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
              throw new Error(`API returned HTML page instead of JSON. This usually means the proxy isn't working or the endpoint doesn't exist. Check console for full response.`);
            } else {
              throw new Error(`Invalid JSON response from API. The server may be returning PHP serialized data or HTML. Response starts with: ${responseText.substring(0, 100)}`);
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
            alert(`Failed to load chart data from API.\n\nEndpoint: /reet_python/create_json.php?reading_date=${selectedDate}&devices_serial_no=${selectedVehicleId}\n\nError: ${errorMsg}\n\nTroubleshooting:\n1. Check browser console (F12) for detailed error\n2. Check Network tab to see if request was blocked\n3. Restart dev server (npm start) - proxy needs restart to take effect\n4. Verify the API endpoint is accessible\n\nNote: Make sure your dev server is running and has been restarted after proxy configuration.`);
          } else {
            // Just log the error, don't show alert if no selection
            console.warn('⚠️ API error but no valid selection - ignoring');
            setLoading(false);
            setProcessingProgress(0);
          }
          throw err;
        }
        // The create_json.php API returns data directly (not wrapped in {status, message, data})
        // Structure: { timestamps, gpsPerSecond, digitalPerSecond, analogPerMinute }
        const payload: any = json;
        
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
              // Analog signal
              const avgValues: number[] = [];
              const minValues: number[] = [];
              const maxValues: number[] = [];
              const times: string[] = [];
              
              readings.forEach((r: any) => {
                const timeStr = r.date_time || `${r.date} ${r.time}`;
                times.push(timeStr);
                avgValues.push(Number(r.avg ?? 0));
                minValues.push(Number(r.min ?? r.avg ?? 0));
                maxValues.push(Number(r.max ?? r.avg ?? 0));
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
          
          // Replace payload with grouped structure
          if (digitalSignals.length > 0) (payload as any).digitalSignals = digitalSignals;
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
        const toSeries = (values: number[], timestamps?: number[]): Array<{ time: Date; value: number }> => {
          const usedTimes = timestamps || times;
          const points = values.map((v: number, idx: number) => {
            const timestamp = usedTimes[idx];
            if (!Number.isFinite(timestamp)) return null;
            const alignedTs = alignToMinute(timestamp);
            return { time: new Date(alignedTs), value: Number(v) };
          }).filter((p): p is { time: Date; value: number } => p !== null);
          
          // Sort by timestamp ascending
          return points.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        // Create triplet series with exact API values (no scaling)
        const toSeriesTriplet = (
          avgVals: number[], 
          minVals?: number[] | null, 
          maxVals?: number[] | null,
          timestamps?: number[]
        ): Array<{ time: Date; avg: number; min: number; max: number }> => {
          const usedTimes = timestamps || times;
          const points = avgVals.map((v: number, idx: number) => {
            const timestamp = usedTimes[idx];
            if (!Number.isFinite(timestamp)) return null;
            const alignedTs = alignToMinute(timestamp);
            const avg = Number(v);
            const min = minVals && idx < minVals.length ? Number(minVals[idx]) : avg;
            const max = maxVals && idx < maxVals.length ? Number(maxVals[idx]) : avg;
            return {
              time: new Date(alignedTs),
              avg: Number.isFinite(avg) ? avg : 0,
              min: Number.isFinite(min) ? min : avg,
              max: Number.isFinite(max) ? max : avg
            };
          }).filter((p): p is { time: Date; avg: number; min: number; max: number } => p !== null);
          
          // Sort by timestamp ascending
          return points.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        const digitalSignalsRaw = pick('digitalSignals', 'digitals', 'digital') || [];
        console.group('📊 Digital Signals - Raw API Data');
        console.log('Number of digital signals:', digitalSignalsRaw.length);
        digitalSignalsRaw.forEach((s: any, idx: number) => {
          console.group(`📊 Digital Signal ${idx + 1} - Raw API Data: ${s.name || s.id || 'Unknown'}`);
          console.log('Complete API Object:', JSON.stringify(s, null, 2));
          console.log('Inverse value from API:', s.inverse, '(type:', typeof s.inverse, ')');
          console.log('Inverse normalized:', String(s.inverse || '').toLowerCase().trim());
          console.log('Will invert?', String(s.inverse || '').toLowerCase().trim() === 'yes');
          console.log('Values array (first 20):', s.values?.slice(0, 20));
          console.log('Values array (last 20):', s.values?.slice(-20));
          console.log('Total values count:', s.values?.length || 0);
          console.log('Times array:', s.times || s.timeStamps || s.timestamps || 'Using global times');
          console.groupEnd();
        });
        console.groupEnd();

        let digitalChart: DigitalStatusChart = {
          id: 'digital-status',
          name: 'Digital Status Indicators',
          metrics: digitalSignalsRaw.map((s: any, idx: number) => {
            // Check if inverse is EXACTLY "yes" (case-insensitive) - only then invert values
            // If inverse = "no", "No", undefined, null, or anything else → show original values
            const inverseStr = String(s.inverse || '').toLowerCase().trim();
            const isInverse = inverseStr === 'yes';
            console.group(`🔍 Digital Signal ${idx + 1} - Inverse Processing: ${s.name || s.id || 'Unknown'}`);
            console.log('Raw inverse from API:', s.inverse);
            console.log('Inverse type:', typeof s.inverse);
            console.log('Normalized inverse:', inverseStr);
            console.log('Will invert?', isInverse);
            console.log('Original values (first 20):', s.values?.slice(0, 20));
            console.log('Original values (last 20):', s.values?.slice(-20));
            console.groupEnd();
            
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
            
            // Apply inverse logic to values before creating series
            // If inverse = "yes" or "Yes", reverse ALL values at EVERY time point (0→1, 1→0)
            // If inverse = "no" or "No" or anything else, show original values as-is
            let values = s.values || [];
            // ONLY invert when isInverse is explicitly true (inverse === "yes")
            // If inverse = "no", "No", undefined, null, or anything else → keep original values
            if (isInverse === true && Array.isArray(values)) {
              console.log(`🔄 Inverting values for ${s.name || s.id} (inverse = "yes")`);
              values = values.map((v: any, vIdx: number) => {
                const numValue = Number(v);
                let invertedValue = numValue;
                // Invert ALL values: 0 becomes 1, 1 becomes 0
                if (numValue === 1) {
                  invertedValue = 0;
                } else if (numValue === 0) {
                  invertedValue = 1;
                }
                // Log first 10 inversions for debugging
                if (vIdx < 10) {
                  console.log(`  Value ${vIdx}: ${numValue} → ${invertedValue}`);
                }
                return invertedValue;
              });
              console.log('Inverted values (first 20):', values.slice(0, 20));
              console.log('Inverted values (last 20):', values.slice(-20));
            } else {
              // When inverse is "no" or not set, keep original values unchanged
              console.log(`✅ Keeping original values for ${s.name || s.id} (inverse = "${s.inverse}")`);
            }
            
            const data = toSeries(values, normalizedSignalTimes);
            
            // Debug: Log processed data for this signal
            console.group(`🔍 Digital Signal ${idx + 1} - Processed Data: ${s.id || s.name || 'Unknown'}`);
            console.log('Inverse:', s.inverse, '→ Applied:', isInverse);
            console.log('API Values (original):', s.values);
            console.log('API Values (after inverse):', values);
            console.log('API Timestamps:', signalTimes);
            console.log('Normalized Timestamps (aligned to minutes):', normalizedSignalTimes);
            console.log('Processed Data Points:', data);
            console.log('Data Points Count:', data.length);
            console.log('First 5 data points:', data.slice(0, 5));
            console.log('Last 5 data points:', data.slice(-5));
            console.groupEnd();
            
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

        const analogMetrics: VehicleMetric[] = analogSignalsArr.map((s: any, idx: number) => {
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
          
          // Use exact API values - filter out invalid values immediately to prevent NaN
          // Apply resolution and offset transformation
          const avgRaw: number[] = (s.values ?? s.avg ?? s.average ?? [])
            .map((v: any) => {
              const num = Number(v);
              const valid = Number.isFinite(num) && !isNaN(num) ? num : null;
              return applyTransformation(valid);
            })
            .filter((v: number | null): v is number => v !== null);
          
          const minsRaw: number[] | undefined = (s.mins ?? s.minValues ?? s.min ?? null)?.map?.((v: any) => {
            const num = Number(v);
            const valid = Number.isFinite(num) && !isNaN(num) ? num : null;
            return applyTransformation(valid);
          })?.filter((v: number | null): v is number => v !== null);
          
          const maxsRaw: number[] | undefined = (s.maxs ?? s.maxValues ?? s.max ?? null)?.map?.((v: any) => {
            const num = Number(v);
            const valid = Number.isFinite(num) && !isNaN(num) ? num : null;
            return applyTransformation(valid);
          })?.filter((v: number | null): v is number => v !== null);
          
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
          console.groupEnd();
          
          return {
            id: String(s.id),
            name: String(s.name ?? s.id),
            unit: String(s.unit ?? ''),
            color: String(s.color ?? '#3b82f6'),
            data: data as any,
            currentValue: values.length > 0 ? values[values.length - 1] : 0,
            avg: avgValue,
            min: minValue,
            max: maxValue,
            yAxisRange: s.yAxisRange ? { min: Number(s.yAxisRange.min), max: Number(s.yAxisRange.max) } : { min: 0, max: 100 }
          } as VehicleMetric;
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
            console.log('Inverse value from API:', series.inverse, '(type:', typeof series.inverse, ')');
            console.log('Inverse normalized:', String(series.inverse || '').toLowerCase().trim());
            console.log('Will invert?', String(series.inverse || '').toLowerCase().trim() === 'yes');
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
          const metrics = (payload.digitalPerSecond as Array<any>).map((series: any, idx: number) => {
            // Check if inverse is EXACTLY "yes" (case-insensitive) - only then invert values
            // If inverse = "no", "No", undefined, null, or anything else → show original values
            const inverseStr = String(series.inverse || '').toLowerCase().trim();
            const isInverse = inverseStr === 'yes';
            console.group(`🔍 Digital Per-Second Series ${idx + 1} - Inverse Processing: ${series.name || series.id || 'Unknown'}`);
            console.log('Raw inverse from API:', series.inverse);
            console.log('Inverse type:', typeof series.inverse);
            console.log('Normalized inverse:', inverseStr);
            console.log('Will invert?', isInverse);
            console.log('Original points (first 20):', series.points?.slice(0, 20));
            console.log('Original points (last 20):', series.points?.slice(-20));
            
            // Use exact API values, align timestamps to minutes, sort
            // If inverse = "yes", reverse ALL values at EVERY time point (0→1, 1→0)
            // If inverse = "no" or not present, show values as-is
            const pts = (series.points || []).map((p: any, pointIdx: number) => {
              const originalValue = Number(p.value ?? 0);
              let value = originalValue;
              
              // Apply inverse logic: ONLY if inverse is EXACTLY "yes" (case-insensitive)
              // If inverse = "no", "No", undefined, null, or anything else → keep original value
              if (isInverse === true) {
                // Only invert when isInverse is explicitly true
                if (originalValue === 1) {
                  value = 0;
                } else if (originalValue === 0) {
                  value = 1;
                }
                // Keep other values as-is
                
                // Log first 10 inversions for debugging
                if (pointIdx < 10) {
                  console.log(`  Point ${pointIdx}: original=${originalValue} → inverted=${value}`);
                }
              } else {
                // When inverse is "no" or not set, value remains unchanged
                if (pointIdx < 10) {
                  console.log(`  Point ${pointIdx}: original=${originalValue} → kept=${value} (no inversion)`);
                }
              }
              
              return {
                time: parseHMS(p.time),
                value
              };
            });
            
            if (isInverse) {
              console.log('Inverted points (first 20):', pts.slice(0, 20));
              console.log('Inverted points (last 20):', pts.slice(-20));
            } else {
              console.log('✅ Kept original values (no inversion applied)');
            }
            console.groupEnd();
            // Sort by timestamp
            pts.sort((a: { time: Date; value: number }, b: { time: Date; value: number }) => a.time.getTime() - b.time.getTime());
            
            // Debug: Log processed per-second data
            console.group(`🔍 Digital Per-Second Series ${idx + 1} - Processed Data: ${series.id || series.name || 'Unknown'}`);
            console.log('Inverse:', series.inverse, '→ Applied:', isInverse);
            console.log('Inverse check details:', {
              raw: series.inverse,
              normalized: inverseStr,
              isInverse,
              isInverseType: typeof isInverse,
              isInverseStrict: isInverse === true
            });
            console.log('API Points (raw - first 5):', series.points?.slice(0, 5));
            console.log('Processed Points (first 5):', pts.slice(0, 5));
            console.log('Points Count:', pts.length);
            console.log('Sample comparison:', {
              firstRaw: series.points?.[0],
              firstProcessed: pts[0],
              shouldBeSame: !isInverse,
              isSame: series.points?.[0]?.value === pts[0]?.value
            });
            console.groupEnd();
            
            if (pts.length) {
              const localMin = pts[0].time.getTime();
              const localMax = pts[pts.length - 1].time.getTime();
              perSecondDigitalMinTs = perSecondDigitalMinTs === null ? localMin : Math.min(perSecondDigitalMinTs, localMin);
              perSecondDigitalMaxTs = perSecondDigitalMaxTs === null ? localMax : Math.max(perSecondDigitalMaxTs, localMax);
            }
            const lastValue = pts.length ? Number(pts[pts.length - 1].value) : 0;
            // Debug log for Jib Chain Fault
            if (String(series.name ?? series.id) === 'Jib Chain Fault') {
              console.log('🔍 Jib Chain Fault - Setting currentValue:', {
                name: series.name,
                inverse: series.inverse,
                isInverse,
                lastPoint: pts.length > 0 ? pts[pts.length - 1] : null,
                lastValue,
                first5Points: pts.slice(0, 5),
                last5Points: pts.slice(-5)
              });
            }
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
          (payload.analogPerSecond as Array<any>).forEach(series => {
            const id = String(series.id);
            
            // Extract resolution and offset from series
            const resolution = Number(series.resolution ?? 1); // Default to 1 if not provided
            const offset = Number(series.offset ?? 0); // Default to 0 if not provided
            
            // Helper function to apply resolution and offset transformation
            // Apply to all valid numeric values (including 0 and negative values)
            const applyTransformation = (value: number | null | undefined): number => {
              if (value === null || value === undefined) return 0;
              const numValue = Number(value);
              if (!Number.isFinite(numValue)) return 0;
              // Apply transformation: (value * resolution) + offset
              // Apply to all valid numeric values
              return (numValue * resolution) + offset;
            };
            
            // Use exact API values, apply resolution and offset, align timestamps to minutes
            const rawPts = (series.points || []).map((r: any) => {
              const time = parseHMS(r.time);
              const avgRaw = r.avg !== null && r.avg !== undefined ? Number(r.avg) : null;
              const minRaw = r.min !== null && r.min !== undefined ? Number(r.min) : null;
              const maxRaw = r.max !== null && r.max !== undefined ? Number(r.max) : null;
              
              // Apply transformation to avg, min, max
              const avg = applyTransformation(avgRaw);
              const min = applyTransformation(minRaw);
              const max = applyTransformation(maxRaw);
              
              return {
                time,
                avg: Number.isFinite(avg) ? avg : 0,
                min: Number.isFinite(min) ? min : 0,
                max: Number.isFinite(max) ? max : 0,
                hms: String(r.time)
              };
            });
            
            // Sort by timestamp
            rawPts.sort((a: { time: Date; avg: number; min: number; max: number; hms: string }, b: { time: Date; avg: number; min: number; max: number; hms: string }) => a.time.getTime() - b.time.getTime());
            
            if (!rawPts.length) return;
            const localMin = rawPts[0].time.getTime();
            const localMax = rawPts[rawPts.length - 1].time.getTime();
            perSecondAnalogMinTs = perSecondAnalogMinTs === null ? localMin : Math.min(perSecondAnalogMinTs, localMin);
            perSecondAnalogMaxTs = perSecondAnalogMaxTs === null ? localMax : Math.max(perSecondAnalogMaxTs, localMax);
            const values: number[] = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.avg)
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
            const allMins = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.min)
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
            const allMaxs = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.max)
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
            
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
            } else {
              analogMetrics.push({
                id,
                name: String(series.name ?? id),
                unit: String(series.unit ?? ''),
                color: String(series.color ?? '#2563eb'),
                data: rawPts as any,
                currentValue: values.length > 0 ? values[values.length - 1] : 0,
                avg: safeAvg,
                min: safeMin,
                max: safeMax,
                yAxisRange: usedRange
              });
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
          (payload.analogPerMinute as Array<any>).forEach((series: any, idx: number) => {
            console.group(`Analog Per-Minute Series ${idx + 1}: ${series.id || series.name || 'Unknown'}`);
            const id = String(series.id);
            
            // Extract resolution and offset from series
            const resolution = Number(series.resolution ?? 1); // Default to 1 if not provided
            const offset = Number(series.offset ?? 0); // Default to 0 if not provided
            
            // Helper function to apply resolution and offset transformation
            // Apply to all valid numeric values (including 0 and negative values)
            const applyTransformation = (value: number | null | undefined): number => {
              if (value === null || value === undefined) return 0;
              const numValue = Number(value);
              if (!Number.isFinite(numValue)) return 0;
              // Apply transformation: (value * resolution) + offset
              // Apply to all valid numeric values
              return (numValue * resolution) + offset;
            };
            
            // Use exact API values, apply resolution and offset, align timestamps to minutes
            const rawPts = (series.points || [])
              .filter((r: any) => r.avg !== null && r.avg !== undefined) // Filter out null values
              .map((r: any) => {
                const time = parseHMS(r.time);
                const avgRaw = r.avg !== null && r.avg !== undefined ? Number(r.avg) : null;
                const minRaw = r.min !== null && r.min !== undefined ? Number(r.min) : null;
                const maxRaw = r.max !== null && r.max !== undefined ? Number(r.max) : null;
                
                // Apply transformation to avg, min, max
                const avg = applyTransformation(avgRaw);
                const min = applyTransformation(minRaw !== null ? minRaw : avgRaw); // Use avg if min not provided
                const max = applyTransformation(maxRaw !== null ? maxRaw : avgRaw); // Use avg if max not provided
                
                return {
                  time,
                  avg: Number.isFinite(avg) ? avg : 0,
                  min: Number.isFinite(min) ? min : 0,
                  max: Number.isFinite(max) ? max : 0,
                  hms: String(r.time)
                };
              });
            
            // Sort by timestamp
            rawPts.sort((a: { time: Date; avg: number; min: number; max: number; hms: string }, b: { time: Date; avg: number; min: number; max: number; hms: string }) => a.time.getTime() - b.time.getTime());
            
            if (!rawPts.length) {
              console.warn('No points in series, skipping');
              console.groupEnd();
              return;
            }
            const localMin = rawPts[0].time.getTime();
            const localMax = rawPts[rawPts.length - 1].time.getTime();
            perSecondAnalogMinTs = perSecondAnalogMinTs === null ? localMin : Math.min(perSecondAnalogMinTs, localMin);
            perSecondAnalogMaxTs = perSecondAnalogMaxTs === null ? localMax : Math.max(perSecondAnalogMaxTs, localMax);
            const values: number[] = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.avg)
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
            const allMins = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.min)
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
            const allMaxs = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.max)
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && !isNaN(v));
            
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
            
            analogMetrics.push({
              id,
              name: String(series.name ?? id),
              unit: String(series.unit ?? ''),
              color: String(series.color ?? '#2563eb'),
              data: rawPts as any,
              currentValue: values.length > 0 ? values[values.length - 1] : 0,
              avg: safeAvg,
              min: safeMin,
              max: safeMax,
              yAxisRange: usedRange
            });
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
        digitalChart.metrics.forEach((metric, idx) => {
          console.group(`Final Digital Metric ${idx + 1}: ${metric.id} - ${metric.name}`);
          console.log('Data points count:', metric.data.length);
          console.log('First 3 data points:', metric.data.slice(0, 3));
          console.log('Last 3 data points:', metric.data.slice(-3));
          console.groupEnd();
        });
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
  }, [selectedVehicleId, selectedDate, showAssetModal]); // Reload when vehicle/date changes


  // Prepare scrubber data as a dense per-minute grid using the full available range
  const scrubberData = useMemo(() => {
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
  }, [vehicleMetrics, digitalStatusChart, selectionStart, selectionEnd]);

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
    
    // Throttle updates to prevent excessive re-renders
    if (now - lastUpdateRef.current >= THROTTLE_MS) {
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
  }, []);

  // Handle selection range change from scrubber
  const handleSelectionChange = useCallback((startTimestamp: number, endTimestamp: number) => {
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    
    // Enforce MIN 1 hour range
    const minRangeMs = 60 * 60 * 1000; // 1 hour
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
  }, []);

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // Intentionally no-op: keep pointer/red-line fixed unless knob is dragged
  }, []);

  // Show asset selection modal first - always show if no valid selection
  if (showAssetModal || !selectedVehicleId || !selectedDate) {
    return <AssetSelectionModal onShowGraph={handleShowGraph} />;
  }

  return (
    <>
    <div className={styles.dashboard}>
      <div className={styles.topPanel}>
        <div className={styles.headerBar}>
          <div className={styles.headerTitle}>Smart Data Link</div>
          <div className={styles.headerStatus}>
            <span className={styles.headerLabel}>Time:</span>
            <span className={styles.headerValue}>
              {selectedTime ? format(selectedTime, 'HH:mm:ss') : '—'}
            </span>
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
          {/* Digital Signal Status Panel */}
          {digitalStatusChart && digitalStatusChart.metrics.length > 0 && (
            <div className={styles.digitalStatusPanel}>
              <div className={styles.statusPanelHeader}>
                <h3 className={styles.statusPanelTitle}>Digital Signal Status</h3>
                <span className={styles.statusPanelCount}>
                  {digitalStatusChart.metrics.length} signals
                </span>
              </div>
              <div className={styles.statusPanelGrid}>
                {digitalStatusChart.metrics.map((signal) => {
                  // Get value at selected time if available, otherwise use currentValue
                  let value = signal.currentValue;
                  if (selectedTime && signal.data.length > 0) {
                    const point = signal.data.find(d => 
                      Math.abs(d.time.getTime() - selectedTime.getTime()) < 900000 // 15 min tolerance
                    );
                    if (point) {
                      value = point.value;
                    }
                  }
                  const status = value === 1 ? 'ON' : 'OFF';
                  const isOn = status === 'ON';
                  return (
                    <div key={signal.id} className={styles.statusItem}>
                      <div 
                        className={styles.statusColorIndicator} 
                        style={{ backgroundColor: signal.color }}
                      />
                      <span className={styles.statusName}>{signal.name}</span>
                      <span 
                        className={`${styles.statusValue} ${isOn ? styles.statusOn : styles.statusOff}`}
                      >
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Digital Signal Timeline Chart */}
          {digitalStatusChart && digitalStatusChart.metrics.length > 0 && (
            <DigitalSignalTimeline
              signals={digitalStatusChart.metrics.filter(m => (visibleDigital[m.id] ?? true))}
              selectedTime={selectedTime}
              crosshairActive={crosshairActive}
              timeDomain={timeDomain}
            />
          )}

          {/* Analog Charts */}
          <div className={styles.chartsContainer}>
            {vehicleMetrics.filter(m => (visibleAnalog[m.id] ?? true)).map(metric => (
              <AnalogChart
                key={metric.id}
                id={metric.id}
                name={metric.name}
                unit={metric.unit}
                color={metric.color}
                data={metric.data}
                yAxisRange={metric.yAxisRange}
                selectedTime={selectedTime}
                crosshairActive={crosshairActive}
                timeDomain={timeDomain}
              />
            ))}
            
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