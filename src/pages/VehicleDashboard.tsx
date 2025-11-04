import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import TimeScrubber from '../components/TimeScrubber';
import DigitalSignalTimeline from '../components/DigitalSignalTimeline';
import AnalogChart from '../components/AnalogChart';
import AssetSelectionModal from '../components/AssetSelectionModal';
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
  }, []);

  useEffect(() => {
    // Only load data if asset modal is closed and we have vehicleId and date
    if (showAssetModal || !selectedVehicleId || !selectedDate) {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        // Use the selected vehicle ID and date in the API call
        let json: any;
        try {
          // Use the correct API endpoint: https://www.smartdatalink.com.au/get-data-by-devices-id-and-date
          const apiUrl = new URL('https://www.smartdatalink.com.au/get-data-by-devices-id-and-date');
          // Add id and date as query parameters
          apiUrl.searchParams.set('id', selectedVehicleId.toString());
          apiUrl.searchParams.set('date', selectedDate);
          
          console.log('🔗 Fetching from API endpoint:', apiUrl.toString());
          console.log('Vehicle ID:', selectedVehicleId, 'Date:', selectedDate);
          
          const apiRes = await fetch(apiUrl.toString(), {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
            mode: 'cors'
          });
          
          if (!apiRes.ok) {
            console.error('❌ API response not OK:', apiRes.status, apiRes.statusText);
            throw new Error(`API failed with status ${apiRes.status}: ${apiRes.statusText}`);
          }
          
          json = await apiRes.json();
          console.log('✅ API success, response:', json);
        } catch (err: any) {
          console.error('❌ All API attempts failed:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
          });
          
          // Provide helpful error message
          const errorMsg = err.message.includes('Failed to fetch') || err.message.includes('CORS')
            ? 'CORS or network error. The API server may not allow requests from this domain, or the endpoint may be incorrect.'
            : err.message;
          
          setLoading(false);
          alert(`Failed to load chart data from API.\n\nEndpoint: https://www.smartdatalink.com.au/get-data-by-devices-id-and-date\nVehicle ID: ${selectedVehicleId}\nDate: ${selectedDate}\n\nError: ${errorMsg}\n\nPossible issues:\n- CORS policy blocking the request\n- Network connectivity\n- API endpoint may require different authentication\n- Date format may need adjustment\n\nPlease check the browser console for more details.`);
          throw err;
        }
        // Unwrap common API envelope { status, message, data }
        const payload: any = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
        
        // Log the payload structure for debugging
        console.group('📊 API Response - Full Payload');
        console.log('Raw JSON:', json);
        console.log('Payload:', payload);
        console.log('Payload keys:', typeof payload === 'object' && payload !== null ? Object.keys(payload) : 'N/A');
        console.groupEnd();
        
        // The API response structure is: { status, message, data: { times, digitalPerSecond, analogPerSecond, gpsPerSecond } }
        // Handle null values from API (when no data available)
        if (payload && payload.times === null && payload.digitalPerSecond === null && payload.analogPerSecond === null) {
          console.warn('⚠️ API returned null data - showing empty charts');
          console.log('API Response:', { status: json.status, message: json.message, data: payload });
          
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
        
        // Check if we have per-second data format
        const hasPerSecondData = payload && (
          (Array.isArray(payload.digitalPerSecond) && payload.digitalPerSecond.length > 0) ||
          (Array.isArray(payload.analogPerSecond) && payload.analogPerSecond.length > 0)
        );
        
        // Check if payload is a flat array (alternative format)
        const isFlatArray = Array.isArray(payload) && payload.length > 0 && payload[0]?.chartName;
        
        console.log('📦 Data format detection:', {
          hasPerSecondData,
          isFlatArray,
          digitalPerSecond: payload?.digitalPerSecond,
          analogPerSecond: payload?.analogPerSecond,
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

        const timesRaw: any[] = Array.isArray(pick('times', 'timeStamps', 'timestamps')) ? pick('times', 'timeStamps', 'timestamps') : [];
        const times: number[] = timesRaw
          .map(parseTimestampToMs)
          .filter((n: number) => Number.isFinite(n))
          .map(alignToMinute)
          .sort((a, b) => a - b); // Sort ascending

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
        console.group('📡 Digital Signals - API Response');
        console.log('Number of digital signals:', digitalSignalsRaw.length);
        digitalSignalsRaw.forEach((s: any, idx: number) => {
          console.group(`Digital Signal ${idx + 1}: ${s.id || s.name || 'Unknown'}`);
          console.log('Raw API Data:', s);
          console.log('Values array:', s.values);
          console.log('Values length:', s.values?.length || 0);
          console.log('Times array:', s.times || s.timeStamps || s.timestamps || 'Using global times');
          console.groupEnd();
        });
        console.groupEnd();

        let digitalChart: DigitalStatusChart = {
          id: 'digital-status',
          name: 'Digital Status Indicators',
          metrics: digitalSignalsRaw.map((s: any, idx: number) => {
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
            const data = toSeries(s.values || [], normalizedSignalTimes);
            
            // Debug: Log processed data for this signal
            console.group(`🔍 Digital Signal ${idx + 1} - Processed Data: ${s.id || s.name || 'Unknown'}`);
            console.log('API Values:', s.values);
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
          // Use exact API values without scaling
          const avgRaw: number[] = (s.values ?? s.avg ?? s.average ?? []).map((v: any) => Number(v));
          const minsRaw: number[] | undefined = (s.mins ?? s.minValues ?? s.min ?? null)?.map?.((v: any) => Number(v));
          const maxsRaw: number[] | undefined = (s.maxs ?? s.maxValues ?? s.max ?? null)?.map?.((v: any) => Number(v));
          
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
          
          // Calculate stats from actual data points
          const values = data.map(d => ('avg' in d ? d.avg : d.value));
          const allMins = minsRaw && minsRaw.length ? minsRaw : values;
          const allMaxs = maxsRaw && maxsRaw.length ? maxsRaw : values;
          
          // Debug: Log processed data for this signal
          console.group(`🔍 Analog Signal ${idx + 1} - Processed Data: ${s.id || s.name || 'Unknown'}`);
          console.log('API Avg Values:', avgRaw);
          console.log('API Min Values:', minsRaw);
          console.log('API Max Values:', maxsRaw);
          console.log('API Timestamps:', signalTimes);
          console.log('Normalized Timestamps (aligned to minutes):', normalizedSignalTimes);
          console.log('Processed Data Points:', data);
          console.log('Data Points Count:', data.length);
          console.log('First 5 data points:', data.slice(0, 5));
          console.log('Last 5 data points:', data.slice(-5));
          console.log('Calculated Stats:', {
            avg: values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0,
            min: allMins.length > 0 ? Math.min(...allMins) : 0,
            max: allMaxs.length > 0 ? Math.max(...allMaxs) : 0
          });
          console.log('Y-Axis Range:', s.yAxisRange ? { min: Number(s.yAxisRange.min), max: Number(s.yAxisRange.max) } : { min: 0, max: 100 });
          console.groupEnd();
          
          return {
            id: String(s.id),
            name: String(s.name ?? s.id),
            unit: String(s.unit ?? ''),
            color: String(s.color ?? '#3b82f6'),
            data: data as any,
            currentValue: values.length > 0 ? Number(values[values.length - 1]) : 0,
            avg: values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0,
            min: allMins.length > 0 ? Math.min(...allMins) : 0,
            max: allMaxs.length > 0 ? Math.max(...allMaxs) : 0,
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
          console.group('📡 Digital Per-Second Data - API Response');
          console.log('Number of digital per-second series:', (payload.digitalPerSecond as Array<any>).length);
          (payload.digitalPerSecond as Array<any>).forEach((series: any, idx: number) => {
            console.group(`Digital Per-Second Series ${idx + 1}: ${series.id || series.name || 'Unknown'}`);
            console.log('Raw API Data:', series);
            console.log('Points count:', series.points?.length || 0);
            console.log('First 3 points:', series.points?.slice(0, 3));
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
            // Use exact API values, align timestamps to minutes, sort
            const pts = (series.points || []).map((p: any) => ({
              time: parseHMS(p.time),
              value: Number(p.value ?? 0)
            }));
            // Sort by timestamp
            pts.sort((a: { time: Date; value: number }, b: { time: Date; value: number }) => a.time.getTime() - b.time.getTime());
            
            // Debug: Log processed per-second data
            console.group(`🔍 Digital Per-Second Series ${idx + 1} - Processed Data: ${series.id || series.name || 'Unknown'}`);
            console.log('API Points (raw):', series.points);
            console.log('Processed Points:', pts);
            console.log('Points Count:', pts.length);
            console.log('First 5 points:', pts.slice(0, 5));
            console.log('Last 5 points:', pts.slice(-5));
            console.groupEnd();
            
            if (pts.length) {
              const localMin = pts[0].time.getTime();
              const localMax = pts[pts.length - 1].time.getTime();
              perSecondDigitalMinTs = perSecondDigitalMinTs === null ? localMin : Math.min(perSecondDigitalMinTs, localMin);
              perSecondDigitalMaxTs = perSecondDigitalMaxTs === null ? localMax : Math.max(perSecondDigitalMaxTs, localMax);
            }
            return {
              id: String(series.id),
              name: String(series.name ?? series.id),
              color: String(series.color ?? '#999'),
              data: pts,
              currentValue: pts.length ? Number(pts[pts.length - 1].value) : 0
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
            // Use exact API values without scaling, align timestamps to minutes
            const rawPts = (series.points || []).map((r: any) => {
              const time = parseHMS(r.time);
              return {
                time,
                avg: Number(r.avg),
                min: Number(r.min),
                max: Number(r.max),
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
            const values: number[] = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.avg);
            const allMins = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.min);
            const allMaxs = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => p.max);
            const usedRange = series.yAxisRange ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) } : { min: Math.min(...allMins), max: Math.max(...allMaxs) };
            
            // Debug: Log processed per-second data
            console.group(`🔍 Analog Per-Second Series - Processed Data: ${id}`);
            console.log('API Points (raw):', series.points);
            console.log('Processed Points:', rawPts);
            console.log('Points Count:', rawPts.length);
            console.log('First 5 points:', rawPts.slice(0, 5));
            console.log('Last 5 points:', rawPts.slice(-5));
            console.log('Calculated Stats:', {
              avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
              min: Math.min(...allMins),
              max: Math.max(...allMaxs)
            });
            console.log('Y-Axis Range:', usedRange);
            console.groupEnd();
            
            const existing = analogMetrics.find(m => m.id === id);
            if (existing) {
              (existing as any).data = rawPts;
              existing.avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
              existing.min = Math.min(...allMins);
              existing.max = Math.max(...allMaxs);
              (existing as any).yAxisRange = usedRange;
            } else {
              analogMetrics.push({
                id,
                name: String(series.name ?? id),
                unit: String(series.unit ?? ''),
                color: String(series.color ?? '#2563eb'),
                data: rawPts as any,
                currentValue: values[values.length - 1] ?? 0,
                avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
                min: Math.min(...allMins),
                max: Math.max(...allMaxs),
                yAxisRange: usedRange
              });
            }
          });
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

        // Always set the API data (even if empty) - never use generated fallback
        setVehicleMetrics(analogMetrics);
        setDigitalStatusChart(digitalChart);

        // Determine the actual data range from all loaded signals
        const minCandidates: number[] = [];
        const maxCandidates: number[] = [];
        // Collect from per-second data first (most accurate)
        if (typeof perSecondAnalogMinTs === 'number') minCandidates.push(perSecondAnalogMinTs);
        if (typeof perSecondDigitalMinTs === 'number') minCandidates.push(perSecondDigitalMinTs);
        if (typeof perSecondAnalogMaxTs === 'number') maxCandidates.push(perSecondAnalogMaxTs);
        if (typeof perSecondDigitalMaxTs === 'number') maxCandidates.push(perSecondDigitalMaxTs);
        // Also collect from actual analog data points
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
        setLoading(false);
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
      }
    };
    load();
  }, [showAssetModal, selectedVehicleId, selectedDate]);

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

  // Handle time change from scrubber
  const handleTimeChange = useCallback((timestamp: number) => {
    setSelectedTime(new Date(timestamp));
    setCrosshairActive(true);
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

  // Show asset selection modal first
  if (showAssetModal) {
    return <AssetSelectionModal onShowGraph={handleShowGraph} />;
  }

  return (
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
          {/* Digital Signal Timeline Chart */}
          {digitalStatusChart && digitalStatusChart.metrics.length > 0 && (
            <DigitalSignalTimeline
              signals={digitalStatusChart.metrics}
              selectedTime={selectedTime}
              crosshairActive={crosshairActive}
              timeDomain={timeDomain}
            />
          )}

          {/* Analog Charts */}
          <div className={styles.chartsContainer}>
            {vehicleMetrics.map(metric => (
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleDashboard;