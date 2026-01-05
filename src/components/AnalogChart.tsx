import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from './AnalogChart.module.css';

const formatHmsUTC = (d: Date) => {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

interface AnalogChartProps {
  id: string;
  name: string;
  unit: string;
  color: string;
  min_color?: string;
  max_color?: string;
  data: Array<{ time: Date; value?: number; avg?: number | null; min?: number | null; max?: number | null }>;
  yAxisRange: { min: number; max: number };
  selectedTime: Date | null;
  crosshairActive: boolean;
  timeDomain: [number, number] | null;
  perSecondStats?: { avg: number[]; min: number[]; max: number[] } | null;
  isSecondViewMode?: boolean;
}

const AnalogChart: React.FC<AnalogChartProps> = ({
  id,
  name,
  unit,
  color,
  min_color,
  max_color,
  data,
  yAxisRange,
  selectedTime,
  crosshairActive,
  timeDomain,
  perSecondStats,
  isSecondViewMode = false,
}) => {
  // 🔍 DEBUG: Log data received by AnalogChart component
  React.useEffect(() => {
    console.log(`🔍 AnalogChart [${id}] received data:`, {
      id,
      name,
      dataPointsCount: data?.length || 0,
      dataType: Array.isArray(data) ? 'array' : typeof data,
      firstDataPoint: data && data.length > 0 ? {
        time: data[0].time,
        avg: data[0].avg,
        min: data[0].min,
        max: data[0].max,
        timeType: typeof data[0].time,
        timeValue: data[0].time instanceof Date ? data[0].time.toISOString() : data[0].time
      } : null,
      lastDataPoint: data && data.length > 0 ? {
        time: data[data.length - 1].time,
        avg: data[data.length - 1].avg,
        min: data[data.length - 1].min,
        max: data[data.length - 1].max,
        timeType: typeof data[data.length - 1].time,
        timeValue: data[data.length - 1].time instanceof Date ? data[data.length - 1].time.toISOString() : data[data.length - 1].time
      } : null,
      sampleDataPoints: data && data.length > 0 ? data.slice(0, 3).map((d: any) => ({
        time: d.time instanceof Date ? d.time.toISOString() : d.time,
        avg: d.avg,
        min: d.min,
        max: d.max
      })) : null,
      yAxisRange,
      color,
      min_color,
      max_color
    });
  }, [id, name, data, yAxisRange, color, min_color, max_color]);

  const chartData = useMemo(() => {
    // Type for chart data points
    type ChartPoint = {
      time: number;
      avg: number | null;
      min: number | null;
      max: number | null;
    };
    
    // Convert data points to chart format using EXACT API values (no decimation, no smoothing)
    // Use null for missing avg/min/max values so line doesn't connect through missing data
    const toPoint = (d: any): ChartPoint => {
      // Check if data point has valid avg value
      const avgRaw = d.avg ?? d.value;
      const minRaw = d.min;
      const maxRaw = d.max;
      
      // If avg is null/undefined/NaN, the data point is missing - return null
      const avgNum = avgRaw != null ? Number(avgRaw) : null;
      const hasValidAvg = avgNum != null && Number.isFinite(avgNum) && !isNaN(avgNum);
      
      if (!hasValidAvg) {
        // No valid data - return null so line doesn't connect
        return { 
          time: d.time.getTime(), 
          avg: null, 
          min: null, 
          max: null 
        };
      }
      
      // Has valid avg - process min and max
      const minNum = minRaw != null ? Number(minRaw) : avgNum;
      const maxNum = maxRaw != null ? Number(maxRaw) : avgNum;
      
      return { 
        time: d.time.getTime(), 
        avg: avgNum, 
        min: (minNum != null && Number.isFinite(minNum) && !isNaN(minNum)) ? minNum : avgNum, 
        max: (maxNum != null && Number.isFinite(maxNum) && !isNaN(maxNum)) ? maxNum : avgNum 
      };
    };

    // Filter to visible domain with small padding to avoid gaps at edges
    const PAD = 5 * 60 * 1000; // 5 min pad
    const filtered: ChartPoint[] = (() => {
      if (!timeDomain) {
        const allPoints = data.map(toPoint);
        console.log(`🔍 AnalogChart [${id}] No timeDomain - using all ${allPoints.length} points`);
        return allPoints;
      }
      const [start, end] = timeDomain;
      const lo = start - PAD;
      const hi = end + PAD;
      
      // 🔍 DEBUG: Log timeDomain and data time range
      const dataTimeRange = data.length > 0 ? {
        first: data[0].time.getTime(),
        last: data[data.length - 1].time.getTime(),
        firstISO: data[0].time.toISOString(),
        lastISO: data[data.length - 1].time.toISOString()
      } : null;
      
      console.log(`🔍 AnalogChart [${id}] Filtering with timeDomain:`, {
        timeDomainStart: new Date(start).toISOString(),
        timeDomainEnd: new Date(end).toISOString(),
        timeDomainStartTs: start,
        timeDomainEndTs: end,
        filterLo: new Date(lo).toISOString(),
        filterHi: new Date(hi).toISOString(),
        dataTimeRange,
        totalDataPoints: data.length
      });
      
      const filteredData = data
        .filter((d: any) => {
          const t = d.time.getTime();
          const inRange = t >= lo && t <= hi;
          if (!inRange && data.indexOf(d) < 3) {
            console.log(`🔍 Point filtered out:`, {
              time: d.time.toISOString(),
              timestamp: t,
              lo: new Date(lo).toISOString(),
              hi: new Date(hi).toISOString(),
              inRange: false
            });
          }
          return inRange;
        })
        .map(toPoint);
      
      console.log(`🔍 AnalogChart [${id}] Filtered result:`, {
        originalCount: data.length,
        filteredCount: filteredData.length,
        firstFiltered: filteredData.length > 0 ? {
          time: new Date(filteredData[0].time).toISOString(),
          avg: filteredData[0].avg
        } : null
      });
      
      // 🔍 FIX: If filtering removed all data, fall back to showing all data
      // This can happen if timeDomain doesn't match the data timezone/range
      if (filteredData.length === 0 && data.length > 0) {
        console.warn(`⚠️ AnalogChart [${id}] Filtering removed all ${data.length} data points! Falling back to showing all data.`);
        console.warn(`⚠️ This suggests a timeDomain mismatch. TimeDomain: ${new Date(start).toISOString()} to ${new Date(end).toISOString()}, Data range: ${dataTimeRange?.firstISO} to ${dataTimeRange?.lastISO}`);
        // Return all data points instead of empty array
        return data.map(toPoint);
      }
      
      return filteredData;
    })();

    // Keep null points in the data so Recharts can break the line at missing time points
    // With connectNulls={false}, Recharts will not connect through null values
    // Also detect time gaps and insert null points to break the line at missing intervals
    // Prepare data for Area components: maxArea (above avg) and minArea (below avg)
    type ChartDataPoint = ChartPoint & {
      maxArea: number | null;
      minArea: number | null;
      minToMaxArea: number | null;
      minToMaxBaseline: number | null;
      avgBase: number | null;
      minBase: number | null;
    };
    
    const result: ChartDataPoint[] = filtered.map((p: ChartPoint) => {
      return {
        time: p.time,
        avg: p.avg, // Can be null - this will break the line
        min: p.min,
        max: p.max,
        // For max shadow: use max value (area from baseline to max)
        maxArea: (p.max != null && Number.isFinite(p.max)) ? p.max : null,
        // For min shadow: use min value (area from baseline to min) - kept for backward compatibility
        minArea: (p.min != null && Number.isFinite(p.min)) ? p.min : null,
        // For min color: use max value (area from min to max)
        minToMaxArea: (p.min != null && Number.isFinite(p.min) && p.max != null && Number.isFinite(p.max)) ? p.max : null,
        // Baseline for min color area (the min value itself)
        minToMaxBaseline: (p.min != null && Number.isFinite(p.min)) ? p.min : null,
        // Base line for areas (avg line) - used for white overlay to mask max shadow below avg
        avgBase: (p.avg != null && Number.isFinite(p.avg)) ? p.avg : null,
        // Base line for white overlay below min (to mask max shadow, but not cover min-to-max area)
        minBase: (p.min != null && Number.isFinite(p.min)) ? p.min : null
      };
    });

    // Detect time gaps and insert null points to break the line
    // Expected interval is 1 minute (60000 ms), but allow up to 2 minutes before breaking
    const EXPECTED_INTERVAL = 60 * 1000; // 1 minute
    const MAX_GAP = 2 * 60 * 1000; // 2 minutes - if gap is larger, insert null point
    const withGaps: ChartDataPoint[] = [];
    
    for (let i = 0; i < result.length; i++) {
      const current = result[i];
      withGaps.push(current);
      
      // Check gap to next point (if exists)
      if (i < result.length - 1) {
        const next = result[i + 1];
        const gap = next.time - current.time;
        
        // If gap is larger than or equal to the threshold and both points have valid data, insert null point
        // This breaks the line at missing time intervals
        if (gap >= MAX_GAP && current.avg != null && next.avg != null) {
          // Insert a null point at the expected next interval time to break the line
          // This represents the first missing time point and ensures the line doesn't connect
          const nullPointTime = current.time + EXPECTED_INTERVAL;
          withGaps.push({
            time: nullPointTime,
            avg: null,
            min: null,
            max: null,
            maxArea: null,
            minArea: null,
            minToMaxArea: null,
            minToMaxBaseline: null,
            avgBase: null,
            minBase: null
          });
        }
      }
    }
    
    // Sort by time to ensure proper order after inserting gap points
    const sortedData = withGaps.sort((a, b) => a.time - b.time);
    
    // 🔍 DEBUG: Log chartData after processing
    const validAvgPoints = sortedData.filter(d => d.avg != null && Number.isFinite(d.avg)).length;
    console.log(`🔍 AnalogChart [${id}] chartData after processing:`, {
      id,
      name,
      chartDataPointsCount: sortedData.length,
      validAvgPoints,
      firstChartPoint: sortedData.length > 0 ? {
        time: new Date(sortedData[0].time).toISOString(),
        avg: sortedData[0].avg,
        min: sortedData[0].min,
        max: sortedData[0].max
      } : null,
      lastChartPoint: sortedData.length > 0 ? {
        time: new Date(sortedData[sortedData.length - 1].time).toISOString(),
        avg: sortedData[sortedData.length - 1].avg,
        min: sortedData[sortedData.length - 1].min,
        max: sortedData[sortedData.length - 1].max
      } : null,
      pointsWithValidAvg: validAvgPoints,
      pointsWithValidMin: sortedData.filter(d => d.min != null && Number.isFinite(d.min)).length,
      pointsWithValidMax: sortedData.filter(d => d.max != null && Number.isFinite(d.max)).length,
      sampleChartPoints: sortedData.slice(0, 5).map(d => ({
        time: new Date(d.time).toISOString(),
        avg: d.avg,
        min: d.min,
        max: d.max
      }))
    });
    
    // 🔍 WARNING: If we have no valid avg points, the line won't render
    if (sortedData.length > 0 && validAvgPoints === 0) {
      console.error(`❌ AnalogChart [${id}] WARNING: chartData has ${sortedData.length} points but NONE have valid avg values! Line will not render.`);
      console.error(`❌ Sample points:`, sortedData.slice(0, 3));
    }
    
    return sortedData;
  }, [data, timeDomain, id, name]);

  // Debug: Log if colors are provided and check shadow data
  React.useEffect(() => {
    if (min_color || max_color) {
      const maxPoints = chartData.filter((d: any) => d.maxArea != null && max_color).length;
      const minPoints = chartData.filter((d: any) => d.minToMaxArea != null && min_color).length;
      console.log(`✅ AnalogChart ${id}: Shadow colors provided - min_color=${min_color}, max_color=${max_color}`);
      console.log(`📊 AnalogChart ${id}: Shadow data points - max: ${maxPoints}, min: ${minPoints}`);
      if (maxPoints > 0 && max_color) {
        console.log(`📊 AnalogChart ${id}: Sample max shadow data:`, 
          chartData.filter((d: any) => d.maxArea != null).slice(0, 2)
        );
      }
      if (minPoints > 0 && min_color) {
        console.log(`📊 AnalogChart ${id}: Sample min shadow data:`, 
          chartData.filter((d: any) => d.minToMaxArea != null).slice(0, 2)
        );
      }
    } else {
      console.log(`❌ AnalogChart ${id}: No min_color or max_color provided`);
    }
  }, [id, min_color, max_color, chartData]);

  // Build a per-second lookup map from the original data to preserve exact second stats
  const perSecondMap = useMemo(() => {
    const map = new Map<string, { avg: number; min: number; max: number }>();
    (data as any[]).forEach((d: any) => {
      const key = (d.hms as string) || formatHmsUTC(d.time);
      const avg = Number(d.rawAvg ?? d.avg ?? d.value);
      const minSource = d.rawMin ?? d.min ?? d.value;
      const maxSource = d.rawMax ?? d.max ?? d.value;
      const min = Number(minSource);
      const max = Number(maxSource);
      if (key && Number.isFinite(avg)) {
        map.set(key, {
          avg,
          min: Number.isFinite(min) ? min : avg,
          max: Number.isFinite(max) ? max : avg,
        });
      }
    });
    return map;
  }, [data]);

  const formatTime = (tick: number) => {
    // Keep time formatting consistent with the TimeScrubber (UTC)
    const d = new Date(tick);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return isSecondViewMode ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  };

  const formatYAxisLabel = (value: number) => {
    return `${value} ${unit}`;
  };

  const getPointAtTime = (time: Date | null): { time: number; avg: number; min: number; max: number } | null => {
    if (!time || chartData.length === 0) return null;
    const timestamp = time.getTime();
    const alignedTimestamp = isSecondViewMode ? timestamp : Math.floor(timestamp / 60000) * 60000;

    // Prefer exact per-second values when available from original data
    if (perSecondMap.size > 0) {
      const keyTime = isSecondViewMode ? time : new Date(alignedTimestamp);
      const key = formatHmsUTC(keyTime);
      const hit = perSecondMap.get(key);
      if (hit) {
        const avg = Number.isFinite(hit.avg) && !isNaN(hit.avg) ? hit.avg : 0;
        const min = Number.isFinite(hit.min) && !isNaN(hit.min) ? hit.min : 0;
        const max = Number.isFinite(hit.max) && !isNaN(hit.max) ? hit.max : 0;
        return { time: time.getTime(), avg, min, max };
      }
      // If perSecondMap exists but no exact match, fall back to chartData matching.
    }

    // Look for exact match first
    const exactMatch = chartData.find((p: any) => p.time === alignedTimestamp);
    if (exactMatch) {
      const c: any = exactMatch;
      const avg: number = Number.isFinite(Number(c.avg)) && !isNaN(Number(c.avg)) ? Number(c.avg) : 0;
      const min: number = Number.isFinite(Number(c.min)) && !isNaN(Number(c.min)) ? Number(c.min) : 0;
      const max: number = Number.isFinite(Number(c.max)) && !isNaN(Number(c.max)) ? Number(c.max) : 0;
      return { time: c.time, avg, min, max };
    }

    // If no exact match, find closest point but only use it if very close (within 30 seconds)
    let closest = chartData[0];
    let minDiff = Math.abs(closest.time - alignedTimestamp);

    for (const point of chartData) {
      const diff = Math.abs(point.time - alignedTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point as any;
      }
    }

    // Only use closest point if within 30 seconds (half a minute)
    // If data is missing for this time point, return 0 instead of using nearby values
    const tolerance = 30 * 1000; // 30 seconds
    if (minDiff > tolerance) {
      // Data is missing for this time point - return 0
      return { time: alignedTimestamp, avg: 0, min: 0, max: 0 };
    }

    // Use closest point if within tolerance
    const c: any = closest;
    const avg: number = Number.isFinite(Number(c.avg)) && !isNaN(Number(c.avg)) ? Number(c.avg) : 0;
    const min: number = Number.isFinite(Number(c.min)) && !isNaN(Number(c.min)) ? Number(c.min) : 0;
    const max: number = Number.isFinite(Number(c.max)) && !isNaN(Number(c.max)) ? Number(c.max) : 0;
    
    return { time: c.time, avg, min, max };
  };

  // Hover tooltip removed per requirement

  const visibleStats = useMemo(() => {
    // Compute stats from original data (per-minute) not decimated chartData
    // This ensures accurate Min/Max/Avg values from actual API data
    const getValue = (d: any): { avg: number; min: number; max: number } | null => {
      // Handle string values from API (e.g., "102" -> 102)
      // Check for null/undefined before converting to Number
      const avgRaw = d.avg ?? d.value;
      const minRaw = d.min;
      const maxRaw = d.max;
      
      // If avg is null/undefined, the data point is missing
      if (avgRaw == null) {
        return null;
      }
      
      const avg = Number(avgRaw);
      // Return null if avg is invalid (NaN or not finite)
      if (!Number.isFinite(avg) || isNaN(avg)) {
        return null;
      }
      
      // Process min and max - use avg as fallback if they're null
      const min = minRaw != null ? Number(minRaw) : avg;
      const max = maxRaw != null ? Number(maxRaw) : avg;
      
      return {
        avg,
        min: Number.isFinite(min) && !isNaN(min) ? min : avg,
        max: Number.isFinite(max) && !isNaN(max) ? max : avg,
      };
    };

    let filtered = data;
    if (timeDomain) {
      filtered = data.filter((d: any) => {
        const t = d.time.getTime();
        return t >= timeDomain[0] && t <= timeDomain[1];
      });
    }

    if (!filtered.length) {
      // Fallback to all data
      filtered = data;
    }

    if (!filtered.length) return { avg: 0, min: 0, max: 0 };

    // Collect all avg, min, max values from actual data points - filter out invalid
    const allAvgs: number[] = [];
    const allMins: number[] = [];
    const allMaxs: number[] = [];

    filtered.forEach((d: any) => {
      const vals = getValue(d);
      if (vals) {
        if (Number.isFinite(vals.avg) && !isNaN(vals.avg)) allAvgs.push(vals.avg);
        if (Number.isFinite(vals.min) && !isNaN(vals.min)) allMins.push(vals.min);
        if (Number.isFinite(vals.max) && !isNaN(vals.max)) allMaxs.push(vals.max);
      }
    });

    if (allAvgs.length === 0) return { avg: 0, min: 0, max: 0 };

    const avg = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;
    const min = allMins.length > 0 ? Math.min(...allMins) : (allAvgs.length > 0 ? Math.min(...allAvgs) : 0);
    const max = allMaxs.length > 0 ? Math.max(...allMaxs) : (allAvgs.length > 0 ? Math.max(...allAvgs) : 0);

    // Final validation to prevent NaN
    return {
      avg: Number.isFinite(avg) && !isNaN(avg) ? avg : 0,
      min: Number.isFinite(min) && !isNaN(min) ? min : 0,
      max: Number.isFinite(max) && !isNaN(max) ? max : 0,
    };
  }, [data, timeDomain]);

  const xDomain = useMemo(() => {
    // 🔍 DEBUG: Log xDomain calculation
    console.log(`🔍 AnalogChart [${id}] xDomain calculation:`, {
      chartDataLength: chartData.length,
      timeDomain: timeDomain ? {
        start: new Date(timeDomain[0]).toISOString(),
        end: new Date(timeDomain[1]).toISOString()
      } : null,
      hasChartData: chartData.length > 0
    });
    
    if (!chartData.length) {
      console.warn(`⚠️ AnalogChart [${id}] chartData is empty! Cannot render chart.`);
      // If no chart data, try to use timeDomain or fallback to dataMin/dataMax
      if (timeDomain) {
        return timeDomain as [number, number];
      }
      return ['dataMin', 'dataMax'] as const;
    }
    const dataMin = chartData[0].time;
    const dataMax = chartData[chartData.length - 1].time;
    if (!timeDomain) {
      console.log(`🔍 AnalogChart [${id}] No timeDomain, using data range:`, {
        dataMin: new Date(dataMin).toISOString(),
        dataMax: new Date(dataMax).toISOString()
      });
      return ['dataMin', 'dataMax'] as const;
    }
    const hasAny = chartData.some(d => d.time >= timeDomain[0] && d.time <= timeDomain[1]);
    const result = hasAny ? (timeDomain as [number, number]) : ([dataMin, dataMax] as [number, number]);
    console.log(`🔍 AnalogChart [${id}] xDomain result:`, {
      hasAny,
      result: result.map((t: number) => new Date(t).toISOString())
    });
    return result;
  }, [chartData, timeDomain, id]);

  // Dynamic ticks based on data range: 30 minutes for 12 hours, 1 hour for 24 hours
  const ticks = useMemo(() => {
    if (!timeDomain) return undefined;
    const [start, end] = timeDomain;
    const dataRangeHours = (end - start) / (60 * 60 * 1000);
    
    // Use 30-minute intervals for 12-hour data, 1-hour intervals for 24-hour data
    const step = dataRangeHours <= 12 ? (30 * 60 * 1000) : (60 * 60 * 1000);
    
    const alignedStart = Math.floor(start / step) * step;
    const arr: number[] = [];
    for (let t = alignedStart; t <= end; t += step) arr.push(t);
    return arr;
  }, [timeDomain]);

  // Calculate baseline array for min color area (from min to max)
  const minColorBaseline = useMemo(() => {
    return chartData.map((d: any) => 
      d.minToMaxBaseline != null && Number.isFinite(d.minToMaxBaseline) 
        ? d.minToMaxBaseline 
        : yAxisRange.min
    );
  }, [chartData, yAxisRange.min]);

  // Calculate baseline array for max color area (from avg to max)
  const maxColorBaseline = useMemo(() => {
    return chartData.map((d: any) => 
      d.avg != null && Number.isFinite(d.avg) ? d.avg : yAxisRange.min
    );
  }, [chartData, yAxisRange.min]);

  const selectedPoint = getPointAtTime(selectedTime);
  const displayStats = selectedPoint
    ? { avg: selectedPoint.avg, min: selectedPoint.min, max: selectedPoint.max }
    : visibleStats;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      setContainerWidth(rect?.width || 0);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Calculate ReferenceLine position for time label
  const referenceLineX = useMemo(() => {
    if (!selectedTime || !timeDomain || !containerWidth) return null;
    
    const [visStart, visEnd] = timeDomain;
    const timeValue = selectedTime.getTime();
    const percent = (timeValue - visStart) / (visEnd - visStart);
    
    // Calculate left margin (same as chart)
    const leftMargin = 20;
    const rightMargin = 30;
    const yAxisWidth = 140;
    const chartLeftOffset = leftMargin + yAxisWidth;
    const innerWidth = containerWidth - chartLeftOffset - rightMargin;
    
    const x = chartLeftOffset + (innerWidth * Math.max(0, Math.min(1, percent)));
    return x;
  }, [selectedTime, timeDomain, containerWidth]);

  // 🔍 DEBUG: Log final chartData before rendering
  React.useEffect(() => {
    console.log(`🔍 AnalogChart [${id}] Final chartData before render:`, {
      chartDataLength: chartData.length,
      hasData: chartData.length > 0,
      firstPoint: chartData.length > 0 ? {
        time: new Date(chartData[0].time).toISOString(),
        avg: chartData[0].avg,
        min: chartData[0].min,
        max: chartData[0].max
      } : null,
      pointsWithValidAvg: chartData.filter(d => d.avg != null && Number.isFinite(d.avg)).length,
      xDomain,
      willRender: chartData.length > 0
    });
    
    if (chartData.length === 0) {
      console.error(`❌ AnalogChart [${id}] Cannot render - chartData is empty!`);
    } else if (chartData.filter(d => d.avg != null && Number.isFinite(d.avg)).length === 0) {
      console.error(`❌ AnalogChart [${id}] Cannot render - no valid avg values in chartData!`);
    }
  }, [chartData, id, xDomain]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>
          {name} ({id})
        </div>
        <div className={styles.chartSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Avg</span>
            <span className={styles.summaryValue}>
              {displayStats.avg.toFixed(1)} {unit}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Min</span>
            <span className={styles.summaryValue}>
              {displayStats.min.toFixed(1)} {unit}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Max</span>
            <span className={styles.summaryValue}>
              {displayStats.max.toFixed(1)} {unit}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.chartWrapper} style={{ position: 'relative' }}>
        <div ref={chartWrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={xDomain as any}
              ticks={ticks as any}
              tickFormatter={formatTime}
              stroke="#6b7280"
              tick={{ fill: '#6b7280', fontSize: 9 }}
            />
            <YAxis
              domain={[yAxisRange.min, yAxisRange.max] as [number, number]}
              allowDataOverflow={true}
              allowDecimals={true}
              type="number"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              width={140}
            />
            {/* Tooltip removed */}
            {/* Shadow area from min to max using min_color */}
            {/* Step 1: Render colored area from baseline (0) to max */}
            {min_color && (
              <Area
                type="linear"
                dataKey="minToMaxArea"
                baseLine={yAxisRange.min}
                stroke="none"
                fill={min_color}
                fillOpacity={0.3}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {/* Step 2: White overlay from baseline (0) to min - masks the colored area below min */}
            {/* This leaves only the area from min to max visible with the color */}
            <Area
              type="linear"
              dataKey="minToMaxBaseline"
              baseLine={yAxisRange.min}
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Average line - type="linear" instead of "monotone" to disable smoothing and show exact values */}
            <Line type="linear" dataKey="avg" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} isAnimationActive={false} connectNulls={false} />
            {crosshairActive && selectedTime && (
              <ReferenceLine
                x={selectedTime.getTime()}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
        {/* Time label overlay */}
        {selectedTime && referenceLineX !== null && (
          <div
            className={styles.timeLabel}
            style={{ 
              left: `${referenceLineX}px`, 
              transform: 'translateX(-50%)',
              top: '5px'
            }}
          >
            {isSecondViewMode 
              ? formatTime(selectedTime.getTime())
              : `${formatTime(Math.floor(selectedTime.getTime() / 60000) * 60000)}:00`}
          </div>
        )}
      </div>
      {/* Per-time stats footer removed */}
    </div>
  );
};

export default AnalogChart;
