import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import FilterControls from '../components/FilterControls';
import FilterOptionsModal from '../components/FilterOptionsModal';
import { formatDateForAPI } from '../utils';
import styles from './TableReport.module.css';

interface TableRow {
  device: string;
  time: string;
  chartName: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  value: number;
  actualMin: number | null;
  actualMax: number | null;
  actualAvg: number | null;
  actualValue: number;
  type: 'digital' | 'analog';
}

type TabType = 'all' | 'analog' | 'digital';

const TableReport: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [rawApiData, setRawApiData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [visibleDigital, setVisibleDigital] = useState<Record<string, boolean>>({});
  const [visibleAnalog, setVisibleAnalog] = useState<Record<string, boolean>>({});
  const [vehicleName, setVehicleName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Debug: Log component mount
  useEffect(() => {
    console.log('📊 TableReport: Component mounted');
    console.log('📊 TableReport: Current URL:', window.location.href);
    console.log('📊 TableReport: Current pathname:', window.location.pathname);
  }, []);

  // Get vehicle and date from URL params or listen to filters:apply event
  useEffect(() => {
    try {
      // First, try to get from URL params (support both device_id and vehicle)
      const vehicleParam = searchParams.get('device_id') || searchParams.get('vehicle');
      const dateParam = searchParams.get('date');
      
      console.log('📊 TableReport: URL params - device_id:', vehicleParam, 'date:', dateParam);
      
      if (vehicleParam && dateParam) {
        const vehicleId = Number(vehicleParam);
        console.log('📊 TableReport: Setting from URL params - vehicleId:', vehicleId, 'date:', dateParam);
        setSelectedVehicleId(vehicleId);
        setSelectedDate(dateParam);
        setError(null);
        return;
      }

      // If not in URL, listen to filters:apply event (from FilterControls)
      const onApply = (e: any) => {
        try {
          const deviceId = Number(e?.detail?.device_id);
          const date = String(e?.detail?.date || '');
          console.log('📊 TableReport: Received filters:apply event - deviceId:', deviceId, 'date:', date);
          if (deviceId && date) {
            setSelectedVehicleId(deviceId);
            setSelectedDate(date);
            setError(null);
          }
        } catch (err: any) {
          console.error('📊 TableReport: Error handling filters:apply:', err);
          setError(err.message);
        }
      };

      window.addEventListener('filters:apply', onApply as any);
      
      // Also check if there's already a selection (from previous navigation)
      return () => {
        window.removeEventListener('filters:apply', onApply as any);
      };
    } catch (err: any) {
      console.error('📊 TableReport: Error in URL params effect:', err);
      setError(err.message);
    }
  }, [searchParams]);

  // Load table data from API
  useEffect(() => {
    if (!selectedVehicleId || !selectedDate) {
      return;
    }

    const loadTableData = async () => {
      try {
        setLoading(true);
        // Convert date to YYYY-MM-DD format for API if needed
        const apiDate = formatDateForAPI(selectedDate);
        // Use the correct API endpoint: /reet_python/create_json.php?reading_date=YYYY-MM-DD&devices_serial_no=XXXXX
        const apiUrl = `/reet_python/create_json.php?reading_date=${encodeURIComponent(apiDate)}&devices_serial_no=${encodeURIComponent(String(selectedVehicleId))}`;
        
        console.log('📊 TableReport: Fetching data from API endpoint:', apiUrl);
        console.log('📊 TableReport: Parameters - reading_date:', apiDate, 'devices_serial_no:', selectedVehicleId);
        
        const apiRes = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
          mode: 'cors',
        });

        if (!apiRes.ok) {
          const errorText = await apiRes.text().catch(() => 'Unable to read error response');
          console.error('❌ TableReport API Error:', errorText.substring(0, 500));
          throw new Error(`HTTP ${apiRes.status}: ${apiRes.statusText}`);
        }

        // Get response as text first to check if it's actually JSON
        const responseText = await apiRes.text();
        const contentType = apiRes.headers.get('content-type');
        
        console.log('📡 TableReport: Response Content-Type:', contentType);
        console.log('📡 TableReport: Response text (first 1000 chars):', responseText.substring(0, 1000));
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        let cleanedText = responseText.trim();
        
        // Try to extract JSON from HTML if it's embedded (look for <pre> tags or script tags)
        if (responseText.includes('<!doctype') || responseText.includes('<html') || responseText.includes('<body')) {
          console.warn('⚠️ TableReport: Response appears to be HTML, attempting to extract JSON...');
          
          // Try to find JSON in <pre> tags
          const preMatch = responseText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
          if (preMatch) {
            cleanedText = preMatch[1].trim();
            console.log('📡 TableReport: Extracted JSON from <pre> tag:', cleanedText.substring(0, 200));
          } else {
            // Try to find JSON object in script tags
            const scriptMatch = responseText.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            if (scriptMatch) {
              cleanedText = scriptMatch[1].trim();
              console.log('📡 TableReport: Extracted JSON from <script> tag:', cleanedText.substring(0, 200));
            } else {
              // Try to find JSON object directly in the text (look for { or [)
              const jsonMatch = responseText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
              if (jsonMatch) {
                cleanedText = jsonMatch[1].trim();
                console.log('📡 TableReport: Extracted JSON from text:', cleanedText.substring(0, 200));
              }
            }
          }
        }
        
        try {
          json = JSON.parse(cleanedText);
          console.log('✅ TableReport: Successfully parsed JSON (Content-Type was:', contentType, ')');
        } catch (parseError: any) {
          console.error('❌ TableReport: Failed to parse JSON. Parse error:', parseError.message);
          console.error('❌ TableReport: Attempted to parse:', cleanedText.substring(0, 500));
          console.error('❌ TableReport: Full response text (first 2000 chars):', responseText.substring(0, 2000));
          
          // If it's HTML, try to show a more helpful error
          if (responseText.includes('<!doctype') || responseText.includes('<html')) {
            // Try to extract error message from HTML
            const errorMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i) || 
                             responseText.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                             responseText.match(/<p[^>]*>([^<]+)<\/p>/i);
            const errorMsg = errorMatch ? errorMatch[1] : 'Unknown error';
            throw new Error(`API returned HTML instead of JSON. Server message: ${errorMsg}`);
          } else {
            throw new Error(`API returned invalid JSON: ${parseError.message}. Response preview: ${cleanedText.substring(0, 200)}`);
          }
        }

        setRawApiData(json);
        
        // Process the data into table rows - using same logic as VehicleDashboard
        const rows: TableRow[] = [];
        const payload: any = json;
        
        console.log('📊 TableReport: Processing payload:', payload);
        console.log('📊 TableReport: Payload keys:', Object.keys(payload || {}));
        
        // Check if payload is a flat array (alternative format) - same logic as VehicleDashboard
        const isFlatArray = Array.isArray(payload) && payload.length > 0 && payload[0]?.chartName;
        
        if (isFlatArray) {
          console.log('📊 TableReport: Processing flat array format - transforming to structured format');
          // Transform flat array to grouped structure (same as VehicleDashboard)
          const groupedByChart: Record<string, any[]> = {};
          (payload as any[]).forEach((reading: any) => {
            if (!reading.chartName) return;
            const chartName = String(reading.chartName);
            if (!groupedByChart[chartName]) {
              groupedByChart[chartName] = [];
            }
            groupedByChart[chartName].push(reading);
          });
          
          // Separate digital and analog signals (same as VehicleDashboard)
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
          
          console.log('📊 TableReport: Transformed - Digital signals:', digitalSignals.length);
          console.log('📊 TableReport: Transformed - Analog signals:', analogSignals.length);
          
          // Replace payload with grouped structure (same as VehicleDashboard)
          if (digitalSignals.length > 0) (payload as any).digitalSignals = digitalSignals;
          if (analogSignals.length > 0) (payload as any).analogSignals = analogSignals;
        }
        
        // Now process structured format (either original or transformed from flat array)
        console.log('📊 TableReport: Processing structured format');
        
        // Handle structured format - use same logic as VehicleDashboard
        const pick = (...paths: string[]): any => {
          for (const p of paths) {
            const v = payload?.[p];
            if (v != null) return v;
          }
          return undefined;
        };
        
        // Parse timestamps and times - same as VehicleDashboard
        const parseTimestampToMs = (timestamp: any): number => {
          let ts: number;
          if (typeof timestamp === 'number') {
            ts = timestamp;
          } else if (typeof timestamp === 'string') {
            ts = Date.parse(timestamp);
          } else {
            return NaN;
          }
          if (ts < 1e12) {
            ts = ts * 1000;
          }
          return ts;
        };
        
        const alignToMinute = (timestampMs: number): number => {
          return Math.floor(timestampMs / 60000) * 60000;
        };
        
        // Get times array from timestamps field (new API format)
        let timesRaw: any[] = [];
        if (Array.isArray(payload.timestamps)) {
          timesRaw = payload.timestamps.map((t: any) => t.timestamp || t.time);
        } else {
          timesRaw = Array.isArray(pick('times', 'timeStamps', 'timestamps')) 
            ? pick('times', 'timeStamps', 'timestamps') 
            : [];
        }
        
        const times: number[] = timesRaw
          .map(parseTimestampToMs)
          .filter((n: number) => Number.isFinite(n))
          .map(alignToMinute)
          .sort((a, b) => a - b);
        
        console.log('📊 TableReport: Processed times:', times.length, 'time points');
        
        // Process analogPerSecond data if available (similar to digitalPerSecond)
        if (Array.isArray(payload.analogPerSecond) && payload.analogPerSecond.length > 0) {
          console.log('📊 TableReport: Processing analogPerSecond data:', payload.analogPerSecond.length, 'series');
          
          // Use the first timestamp from times array, or current date if times is empty
          const baseDate = times.length > 0 ? new Date(times[0]) : new Date();
          baseDate.setHours(0, 0, 0, 0);
          
          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            const timestamp = baseDate.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
            // Align to minute boundary
            return new Date(alignToMinute(timestamp));
          };
          
          payload.analogPerSecond.forEach((series: any) => {
            const signalName = String(series.name ?? series.id ?? 'Analog Signal');
            const signalId = String(series.id ?? '');
            
            // Extract resolution and offset from series
            const resolution = Number(series.resolution ?? 1);
            const offset = Number(series.offset ?? 0);
            
            // Helper function to apply resolution and offset transformation
            const applyTransformation = (value: number | null | undefined): number => {
              if (value === null || value === undefined) return 0;
              const numValue = Number(value);
              if (!Number.isFinite(numValue)) return 0;
              return (numValue * resolution) + offset;
            };
            
            // Process each point in the series
            const points = series.points || [];
            if (points.length === 0) return;
            
            // Pre-parse all times once for efficient sorting
            const pointsWithTime = points.map((p: any) => ({
              point: p,
              timeMs: parseHMS(p.time)
            }));
            
            // Sort points by time
            pointsWithTime.sort((a: { point: any; timeMs: number }, b: { point: any; timeMs: number }) => a.timeMs - b.timeMs);
            
            // Track cumulative stats efficiently (O(n) instead of O(n²))
            let cumulativeMin: number | null = null;
            let cumulativeMax: number | null = null;
            let cumulativeSum = 0;
            let cumulativeCount = 0;
            
            pointsWithTime.forEach(({ point, timeMs }: { point: any; timeMs: number }) => {
              const timeDate = new Date(timeMs);
              const timeStr = format(timeDate, 'hh:mm a');
              
              // Apply transformation to avg, min, max
              const avgRaw = point.avg !== null && point.avg !== undefined ? Number(point.avg) : null;
              const minRaw = point.min !== null && point.min !== undefined ? Number(point.min) : null;
              const maxRaw = point.max !== null && point.max !== undefined ? Number(point.max) : null;
              
              const avg = applyTransformation(avgRaw);
              const min = applyTransformation(minRaw);
              const max = applyTransformation(maxRaw);
              
              // For analog signals, use avg as the value
              const value = Number.isFinite(avg) ? avg : 0;
              
              // Update cumulative stats efficiently
              if (Number.isFinite(avg)) {
                cumulativeSum += avg;
                cumulativeCount++;
              }
              if (Number.isFinite(min)) {
                cumulativeMin = cumulativeMin === null ? min : Math.min(cumulativeMin, min);
              }
              if (Number.isFinite(max)) {
                cumulativeMax = cumulativeMax === null ? max : Math.max(cumulativeMax, max);
              }
              
              const cumulativeAvg = cumulativeCount > 0 ? cumulativeSum / cumulativeCount : null;
              
              rows.push({
                device: `${selectedVehicleId}`,
                time: timeStr,
                chartName: signalName,
                min: cumulativeMin,
                max: cumulativeMax,
                avg: cumulativeAvg,
              value,
                actualMin: Number.isFinite(min) ? min : null,
                actualMax: Number.isFinite(max) ? max : null,
                actualAvg: Number.isFinite(avg) ? avg : null,
                actualValue: value,
                type: 'analog'
              });
            });
          });
          
          console.log('📊 TableReport: Added', rows.length, 'rows from analogPerSecond');
        }
        
        // Process digitalPerSecond data if available
        if (Array.isArray(payload.digitalPerSecond) && payload.digitalPerSecond.length > 0) {
          console.log('📊 TableReport: Processing digitalPerSecond data:', payload.digitalPerSecond.length, 'series');
          
          // Use the first timestamp from times array, or current date if times is empty
          const baseDate = times.length > 0 ? new Date(times[0]) : new Date();
          baseDate.setHours(0, 0, 0, 0);
          
          const parseHMS = (hms: string): number => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            const timestamp = baseDate.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
            // Align to minute boundary
            return alignToMinute(timestamp);
          };
          
          payload.digitalPerSecond.forEach((series: any) => {
            const signalName = String(series.name ?? series.id ?? 'Digital Signal');
            const signalId = String(series.id ?? '');
            
            // Process each point in the series
            const points = series.points || [];
            if (points.length === 0) return;
            
            // Pre-parse all times once for efficient sorting
            const pointsWithTime = points.map((p: any) => ({
              point: p,
              timeMs: parseHMS(p.time)
            }));
            
            // Sort points by time
            pointsWithTime.sort((a: { point: any; timeMs: number }, b: { point: any; timeMs: number }) => a.timeMs - b.timeMs);
            
            // Track cumulative stats efficiently (O(n) instead of O(n²))
            let cumulativeMin: number | null = null;
            let cumulativeMax: number | null = null;
            let cumulativeSum = 0;
            let cumulativeCount = 0;
            
            pointsWithTime.forEach(({ point, timeMs }: { point: any; timeMs: number }) => {
              const timeDate = new Date(timeMs);
              const timeStr = format(timeDate, 'hh:mm a');
              
              const value = Number(point.value ?? 0);
              
              // Update cumulative stats efficiently
              if (Number.isFinite(value)) {
                cumulativeSum += value;
                cumulativeCount++;
                cumulativeMin = cumulativeMin === null ? value : Math.min(cumulativeMin, value);
                cumulativeMax = cumulativeMax === null ? value : Math.max(cumulativeMax, value);
              }
              
              const cumulativeAvg = cumulativeCount > 0 ? cumulativeSum / cumulativeCount : null;
              
              rows.push({
                device: `${selectedVehicleId}`,
                time: timeStr,
                chartName: signalName,
                min: cumulativeMin,
                max: cumulativeMax,
                avg: cumulativeAvg,
                value,
                actualMin: null, // Digital signals don't have separate min/max/avg per point
                actualMax: null,
                actualAvg: null,
                actualValue: value,
                type: 'digital'
              });
            });
          });
          
          console.log('📊 TableReport: Added', rows.length, 'rows from digitalPerSecond');
        }
        
        // Get digital and analog signals (fallback to old format)
        const digitalSignals = pick('digitalSignals', 'digitals', 'digital') || [];
        const analogSignals = pick('analogSignals', 'analogs', 'analog') || [];
        
        console.log('📊 TableReport: Digital signals (old format):', digitalSignals.length);
        console.log('📊 TableReport: Analog signals (old format):', analogSignals.length);
        
        // Process digital signals
        digitalSignals.forEach((signalData: any) => {
          const signalName = signalData?.name || signalData?.chartName || `Digital ${signalData?.id || ''}`;
          const values = signalData?.values || signalData?.data || [];
          
          // Get signal-specific times or use global times
          let signalTimes: any[] = signalData?.times || signalData?.timeStamps || signalData?.timestamps || [];
          if (signalTimes.length > 0 && typeof signalTimes[0] === 'string') {
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
          
          // Get actual stats from API
          const actualMin = signalData?.actualMin ?? signalData?.min ?? null;
          const actualMax = signalData?.actualMax ?? signalData?.max ?? null;
          const actualAvg = signalData?.actualAvg ?? signalData?.avg ?? null;
          
          normalizedSignalTimes.forEach((timestamp: number, index: number) => {
            const timeStr = format(new Date(timestamp), 'hh:mm a');
            const value = values[index] ?? 0;
            const actualValue = signalData?.actualValues?.[index] ?? value;
            
            // Calculate min/max/avg from graph data
            const valuesUpToNow = values.slice(0, index + 1).filter((v: any) => v != null && v !== undefined);
            const min = valuesUpToNow.length > 0 ? Math.min(...valuesUpToNow) : null;
            const max = valuesUpToNow.length > 0 ? Math.max(...valuesUpToNow) : null;
            const avg = valuesUpToNow.length > 0 
              ? valuesUpToNow.reduce((a: number, b: number) => a + b, 0) / valuesUpToNow.length 
              : null;
            
            rows.push({
              device: `${selectedVehicleId}`,
              time: timeStr,
              chartName: signalName,
              min,
              max,
              avg,
              value,
              actualMin,
              actualMax,
              actualAvg,
              actualValue,
              type: 'digital'
            });
          });
        });
        
        // Process analog signals
        analogSignals.forEach((signalData: any) => {
          const signalName = signalData?.name || signalData?.chartName || `Analog ${signalData?.id || ''}`;
          const values = signalData?.values || signalData?.data || signalData?.avg || [];
          
          // Get signal-specific times or use global times
          let signalTimes: any[] = signalData?.times || signalData?.timeStamps || signalData?.timestamps || [];
          if (signalTimes.length > 0 && typeof signalTimes[0] === 'string') {
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
          
          // Get actual stats from API
          const actualMin = signalData?.actualMin ?? signalData?.min ?? null;
          const actualMax = signalData?.actualMax ?? signalData?.max ?? null;
          const actualAvg = signalData?.actualAvg ?? signalData?.avg ?? null;
          
          normalizedSignalTimes.forEach((timestamp: number, index: number) => {
            const timeStr = format(new Date(timestamp), 'hh:mm a');
            const value = values[index] ?? 0;
            const actualValue = signalData?.actualValues?.[index] ?? value;
            
            // Calculate min/max/avg from graph data
            const valuesUpToNow = values.slice(0, index + 1).filter((v: any) => v != null && v !== undefined);
            const min = valuesUpToNow.length > 0 ? Math.min(...valuesUpToNow) : null;
            const max = valuesUpToNow.length > 0 ? Math.max(...valuesUpToNow) : null;
            const avg = valuesUpToNow.length > 0 
              ? valuesUpToNow.reduce((a: number, b: number) => a + b, 0) / valuesUpToNow.length 
              : null;
            
            rows.push({
              device: `${selectedVehicleId}`,
              time: timeStr,
              chartName: signalName,
              min,
              max,
              avg,
              value,
              actualMin,
              actualMax,
              actualAvg,
              actualValue,
              type: 'analog'
            });
          });
        });
        
        console.log('📊 TableReport: Processed rows:', rows.length);
        console.log('📊 TableReport: Sample rows (first 3):', rows.slice(0, 3));

        if (rows.length === 0) {
          console.warn('⚠️ TableReport: No rows generated from API data');
          console.warn('⚠️ TableReport: Payload structure:', {
            hasDigitalSignals: !!payload?.digitalSignals,
            hasAnalogSignals: !!payload?.analogSignals,
            digitalCount: Array.isArray(payload?.digitalSignals) ? payload.digitalSignals.length : 0,
            analogCount: Array.isArray(payload?.analogSignals) ? payload.analogSignals.length : 0,
            payloadKeys: Object.keys(payload || {})
          });
        }

        setTableData(rows);
        
        // Get vehicle name if available
        if (payload?.device_name) {
          setVehicleName(payload.device_name);
        }
        
      } catch (error: any) {
        console.error('❌ Failed to load table data:', error);
        console.error('❌ Error stack:', error.stack);
        setError(`Failed to load table data: ${error.message}`);
        setTableData([]);
      } finally {
        setLoading(false);
      }
    };

    if (selectedVehicleId && selectedDate) {
      console.log('📊 TableReport: Starting data load for vehicleId:', selectedVehicleId, 'date:', selectedDate);
      loadTableData();
    } else {
      console.log('📊 TableReport: Skipping data load - missing vehicleId or date');
    }
  }, [selectedVehicleId, selectedDate]);

  // Filter data based on active tab and visibility filters
  const filteredData = useMemo(() => {
    let filtered = tableData;

    // Filter by tab
    if (activeTab === 'analog') {
      filtered = filtered.filter(row => row.type === 'analog');
    } else if (activeTab === 'digital') {
      filtered = filtered.filter(row => row.type === 'digital');
    }

    // Filter by visibility settings
    filtered = filtered.filter(row => {
      if (row.type === 'digital') {
        return visibleDigital[row.chartName] !== false;
      } else {
        return visibleAnalog[row.chartName] !== false;
      }
    });

    return filtered;
  }, [tableData, activeTab, visibleDigital, visibleAnalog]);

  // Format number for display
  const formatNumber = (value: number | null): string => {
    if (value === null || value === undefined) return '-';
    return Number(value).toFixed(2);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Device', 'Time', 'Chart Name', 'Min', 'Max', 'Avg', 'Value', 'Actual Min', 'Actual Max', 'Actual Avg', 'Actual Value'];
    const csvRows = [
      headers.join(','),
      ...filteredData.map(row => [
        row.device,
        row.time,
        `"${row.chartName}"`,
        formatNumber(row.min),
        formatNumber(row.max),
        formatNumber(row.avg),
        formatNumber(row.value),
        formatNumber(row.actualMin),
        formatNumber(row.actualMax),
        formatNumber(row.actualAvg),
        formatNumber(row.actualValue)
      ].join(','))
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `table_report_${selectedVehicleId}_${selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Navigate to chart view
  const goToChart = () => {
    window.location.href = '/';
  };

  // Always render something - show loading or content
  // Add a simple test to ensure component is rendering
  console.log('📊 TableReport: Component rendering - selectedVehicleId:', selectedVehicleId, 'selectedDate:', selectedDate);
  
  return (
    <div className={styles.container} style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ padding: '20px', background: 'white', marginBottom: '20px', borderRadius: '8px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Table Report</h1>
        <p style={{ margin: '10px 0 0 0', color: '#666' }}>
          Debug: VehicleId={selectedVehicleId || 'null'}, Date={selectedDate || 'null'}
        </p>
        <p style={{ margin: '5px 0', color: '#666', fontSize: '12px' }}>
          URL Params: device_id={searchParams.get('device_id') || 'none'}, date={searchParams.get('date') || 'none'}
        </p>
      </div>
      
      {error && (
        <div style={{ 
          padding: '20px', 
          background: '#fee2e2', 
          color: '#dc2626', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {/* Show message if no vehicle/date selected */}
      {!selectedVehicleId || !selectedDate ? (
        <>
          <div className={styles.noData}>
            <h2>Table Report</h2>
            <p>Please select a vehicle and date from the filters above, or navigate from the Chart page.</p>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#6b7280' }}>
              Current URL params: device_id={searchParams.get('device_id') || 'none'}, date={searchParams.get('date') || 'none'}
            </p>
          </div>
          <FilterControls />
        </>
      ) : (
        <>
      <div className={styles.header}>
        <h1 className={styles.title}>Table Report</h1>
        <div className={styles.headerActions}>
          <button className={styles.chartButton} onClick={goToChart}>
            Chart
          </button>
          <button className={styles.exportButton} onClick={exportToCSV}>
            Export CSV
          </button>
        </div>
      </div>

      <FilterControls key={`filter-${selectedVehicleId}-${selectedDate}`} />

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Readings
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'analog' ? styles.active : ''}`}
          onClick={() => setActiveTab('analog')}
        >
          Analog Readings
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'digital' ? styles.active : ''}`}
          onClick={() => setActiveTab('digital')}
        >
          Digital Readings
        </button>
      </div>

      {loading && (
        <div className={styles.loading}>
          <div>Loading table data...</div>
        </div>
      )}

      {/* Always show table structure - static columns */}
      <div className={styles.tableWrapper}>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device</th>
                <th>Time</th>
                <th>Chart Name</th>
                <th>Min</th>
                <th>Max</th>
                <th>Avg</th>
                <th>Value</th>
                <th>Actual Min</th>
                <th>Actual Max</th>
                <th>Actual Avg</th>
                <th>Actual Value</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredData.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                    {selectedVehicleId && selectedDate 
                      ? 'No data available for the selected device and date.' 
                      : 'Please select a device and date to view data.'}
                  </td>
                </tr>
              ) : (
                filteredData.map((row, index) => (
                  <tr key={`${row.chartName}-${row.time}-${index}`}>
                    <td>{vehicleName || row.device}</td>
                    <td>{row.time}</td>
                    <td>{row.chartName}</td>
                    <td>{formatNumber(row.min)}</td>
                    <td>{formatNumber(row.max)}</td>
                    <td>{formatNumber(row.avg)}</td>
                    <td>{formatNumber(row.value)}</td>
                    <td>{formatNumber(row.actualMin)}</td>
                    <td>{formatNumber(row.actualMax)}</td>
                    <td>{formatNumber(row.actualAvg)}</td>
                    <td>{formatNumber(row.actualValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showFilters && (
        <FilterOptionsModal
          isOpen={showFilters}
          onClose={() => setShowFilters(false)}
          onApply={(d, a) => {
            setVisibleDigital(d);
            setVisibleAnalog(a);
            setShowFilters(false);
          }}
          initialDigital={visibleDigital}
          initialAnalog={visibleAnalog}
        />
      )}
        </>
      )}
    </div>
  );
};

export default TableReport;

