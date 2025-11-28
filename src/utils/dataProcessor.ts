// Data processing utilities (can be moved to worker)
// This is a non-worker version for now - will be wrapped in worker

import { processData as lttbDownsample } from 'downsample-lttb';

// Cache for processed data
let cachedProcessedData: {
  analogMetrics: any[];
  digitalMetrics: any[];
  timestamps: number[];
  baseDate: Date;
} | null = null;

let cachedRawData: any = null;
let cachedSelectedDate: string = '';

// Helper to parse time string to timestamp
const parseHMS = (hms: string, baseDate: Date): number => {
  const [hh, mm, ss] = hms.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(hh, mm, ss, 0);
  return date.getTime();
};

// Helper to apply transformations
const applyTransformation = (
  value: number | null | undefined,
  resolution: number,
  offset: number
): number | null => {
  if (value === null || value === undefined) return null;
  const numValue = Number(value);
  if (!Number.isFinite(numValue) || isNaN(numValue)) return null;
  return numValue * resolution + offset;
};

// Process raw data into structured format
export const processRawData = (rawData: any, selectedDate: string) => {
  const baseDate = new Date(selectedDate);
  baseDate.setHours(0, 0, 0, 0);

  // Process analog per-second data
  const analogMetrics: any[] = [];
  if (Array.isArray(rawData.analogPerSecond)) {
    rawData.analogPerSecond.forEach((series: any) => {
      if (series.display === false) return;

      const id = String(series.id);
      const resolution = Number(series.resolution ?? 1);
      const offset = Number(series.offset ?? 0);

      const points = (series.points || [])
        .map((p: any) => {
          const time = parseHMS(p.time, baseDate);
          const avg = applyTransformation(p.avg, resolution, offset);
          const min = applyTransformation(p.min, resolution, offset);
          const max = applyTransformation(p.max, resolution, offset);

          return {
            time,
            avg: avg != null && Number.isFinite(avg) && !isNaN(avg) ? avg : null,
            min: min != null && Number.isFinite(min) && !isNaN(min) ? min : null,
            max: max != null && Number.isFinite(max) && !isNaN(max) ? max : null,
          };
        })
        .filter((p: any) => p.time != null)
        .sort((a: any, b: any) => a.time - b.time);

      if (points.length === 0) return;

      const values = points
        .map((p: any) => p.avg)
        .filter((v: any): v is number => v != null && Number.isFinite(v) && !isNaN(v));
      const allMins = points
        .map((p: any) => p.min)
        .filter((v: any): v is number => v != null && Number.isFinite(v) && !isNaN(v));
      const allMaxs = points
        .map((p: any) => p.max)
        .filter((v: any): v is number => v != null && Number.isFinite(v) && !isNaN(v));

      const minVal =
        allMins.length > 0
          ? Math.min(...allMins)
          : values.length > 0
          ? Math.min(...values)
          : 0;
      const maxVal =
        allMaxs.length > 0
          ? Math.max(...allMaxs)
          : values.length > 0
          ? Math.max(...values)
          : 0;
      const usedRange = series.yAxisRange
        ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) }
        : { min: minVal, max: maxVal };

      const safeAvg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
      const safeMin =
        allMins.length > 0
          ? Math.min(...allMins)
          : values.length > 0
          ? Math.min(...values)
          : 0;
      const safeMax =
        allMaxs.length > 0
          ? Math.max(...allMaxs)
          : values.length > 0
          ? Math.max(...values)
          : 0;

      analogMetrics.push({
        id,
        name: String(series.name ?? id),
        unit: String(series.unit ?? ''),
        color: String(series.color ?? '#2563eb'),
        min_color: series.min_color ? String(series.min_color) : undefined,
        max_color: series.max_color ? String(series.max_color) : undefined,
        allPoints: points, // Store all points for windowing
        currentValue: values.length > 0 ? values[values.length - 1] : 0,
        avg: safeAvg,
        min: safeMin,
        max: safeMax,
        yAxisRange: usedRange,
        resolution,
        offset,
      });
    });
  }

  // Process digital per-second data
  const digitalMetrics: any[] = [];
  if (Array.isArray(rawData.digitalPerSecond)) {
    rawData.digitalPerSecond
      .filter((series: any) => series.display !== false)
      .forEach((series: any) => {
        const points = (series.points || [])
          .map((p: any) => ({
            time: parseHMS(p.time, baseDate),
            value: Number(p.value ?? 0),
          }))
          .filter((p: any) => p.time != null)
          .sort((a: any, b: any) => a.time - b.time);

        if (points.length === 0) return;

        digitalMetrics.push({
          id: String(series.id),
          name: String(series.name ?? series.id),
          color: String(series.color ?? '#999'),
          allPoints: points, // Store all points for windowing
          currentValue: points.length > 0 ? Number(points[points.length - 1].value) : 0,
        });
      });
  }

  // Collect all timestamps
  const timestamps = new Set<number>();
  analogMetrics.forEach((m) => {
    m.allPoints.forEach((p: any) => timestamps.add(p.time));
  });
  digitalMetrics.forEach((m) => {
    m.allPoints.forEach((p: any) => timestamps.add(p.time));
  });

  const result = {
    analogMetrics,
    digitalMetrics,
    timestamps: Array.from(timestamps).sort((a, b) => a - b),
    baseDate,
  };

  // Update cache
  cachedProcessedData = result;
  cachedRawData = rawData;
  cachedSelectedDate = selectedDate;

  return result;
};

// Downsample data using LTTB
const downsampleData = (
  data: Array<{ time: number; value: number }>,
  threshold: number
): Array<{ time: number; value: number }> => {
  if (data.length <= threshold) return data;

  // Prepare data for LTTB (needs x, y format)
  const lttbData = data.map((d) => [d.time, d.value] as [number, number]);
  const downsampled = lttbDownsample(lttbData, threshold);

  // Convert back to our format
  return downsampled.map(([time, value]: [number, number]) => ({ time, value }));
};

// Downsample analog data (handles avg, min, max)
const downsampleAnalogData = (
  points: Array<{ time: number; avg: number | null; min: number | null; max: number | null }>,
  threshold: number
): Array<{ time: number; avg: number | null; min: number | null; max: number | null }> => {
  if (points.length <= threshold) return points;

  // Downsample avg, min, max separately, then merge by time
  const avgData = points
    .filter((p) => p.avg != null)
    .map((p) => ({ time: p.time, value: p.avg! }));
  const minData = points
    .filter((p) => p.min != null)
    .map((p) => ({ time: p.time, value: p.min! }));
  const maxData = points
    .filter((p) => p.max != null)
    .map((p) => ({ time: p.time, value: p.max! }));

  const downsampledAvg = downsampleData(avgData, threshold);
  const downsampledMin = downsampleData(minData, threshold);
  const downsampledMax = downsampleData(maxData, threshold);

  // Create a map of times to merge
  const timeMap = new Map<number, { avg: number | null; min: number | null; max: number | null }>();

  downsampledAvg.forEach((d) => {
    timeMap.set(d.time, { avg: d.value, min: null, max: null });
  });
  downsampledMin.forEach((d) => {
    const existing = timeMap.get(d.time);
    if (existing) existing.min = d.value;
    else timeMap.set(d.time, { avg: null, min: d.value, max: null });
  });
  downsampledMax.forEach((d) => {
    const existing = timeMap.get(d.time);
    if (existing) existing.max = d.value;
    else timeMap.set(d.time, { avg: null, min: null, max: d.value });
  });

  return Array.from(timeMap.entries())
    .map(([time, values]) => ({ time, ...values }))
    .sort((a, b) => a.time - b.time);
};

// Get windowed data around a time range
export const getWindowedData = (
  windowStart: number,
  windowEnd: number,
  isSecondView: boolean
): any => {
  if (!cachedProcessedData) {
    return {
      analogMetrics: [],
      digitalMetrics: [],
      timestamps: [],
    };
  }

  const windowSize = windowEnd - windowStart;
  const padding = windowSize * 0.1; // 10% padding on each side
  const paddedStart = windowStart - padding;
  const paddedEnd = windowEnd + padding;

  // Filter points within window
  const filterPoints = (points: Array<{ time: number }>) => {
    return points.filter((p) => p.time >= paddedStart && p.time <= paddedEnd);
  };

  // Process analog metrics with downsampling
  const analogMetrics = cachedProcessedData.analogMetrics.map((metric) => {
    const windowedPoints = filterPoints(metric.allPoints) as Array<{ time: number; avg: number | null; min: number | null; max: number | null }>;
    
    if (windowedPoints.length === 0) {
      return {
        ...metric,
        data: [],
      };
    }

    // Downsample based on view mode
    // For second view: show all per-second data (no downsampling to preserve detail)
    // For minute view: downsample to 300 points
    if (isSecondView) {
      // Return all per-second points without downsampling
      return {
        ...metric,
        data: windowedPoints.map((p) => ({
          time: new Date(p.time),
          avg: p.avg,
          min: p.min,
          max: p.max,
        })),
      };
    } else {
      // Minute view: downsample to 300 points
      const threshold = 300;
      const downsampled = downsampleAnalogData(windowedPoints, threshold);
      return {
        ...metric,
        data: downsampled.map((p: { time: number; avg: number | null; min: number | null; max: number | null }) => ({
          time: new Date(p.time),
          avg: p.avg,
          min: p.min,
          max: p.max,
        })),
      };
    }
  });

  // Process digital metrics with downsampling
  const digitalMetrics = cachedProcessedData.digitalMetrics.map((metric) => {
    const windowedPoints = filterPoints(metric.allPoints) as Array<{ time: number; value: number }>;
    
    if (windowedPoints.length === 0) {
      return {
        ...metric,
        data: [],
      };
    }

    // Downsample based on view mode
    // For second view: show all per-second data (no downsampling to preserve detail)
    // For minute view: downsample to 300 points
    if (isSecondView) {
      // Return all per-second points without downsampling
      return {
        ...metric,
        data: windowedPoints.map((p) => ({
          time: new Date(p.time),
          value: p.value,
        })),
      };
    } else {
      // Minute view: downsample to 300 points
      const threshold = 300;
      const dataPoints = windowedPoints.map((p) => ({ time: p.time, value: p.value }));
      const downsampled = downsampleData(dataPoints, threshold);
      return {
        ...metric,
        data: downsampled.map((p: { time: number; value: number }) => ({
          time: new Date(p.time),
          value: p.value,
        })),
      };
    }
  });

  // Get windowed timestamps
  const timestamps = cachedProcessedData.timestamps.filter(
    (t) => t >= paddedStart && t <= paddedEnd
  );

  return {
    analogMetrics,
    digitalMetrics,
    timestamps,
  };
};

// Clear cache
export const clearDataCache = () => {
  cachedProcessedData = null;
  cachedRawData = null;
  cachedSelectedDate = '';
};

