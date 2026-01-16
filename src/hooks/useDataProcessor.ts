import { useCallback, useRef } from 'react';
import { processRawData, getWindowedData, clearDataCache } from '../utils/dataProcessor';

// Type definitions matching the return type of getWindowedData
interface WindowedAnalogMetric {
  id: string;
  name: string;
  unit: string;
  color: string;
  min_color?: string;
  max_color?: string;
  currentValue: number;
  avg: number;
  min: number;
  max: number;
  yAxisRange: { min: number; max: number };
  resolution: number;
  offset: number;
  data: Array<{ time: Date; avg: number | null; min: number | null; max: number | null }>;
}

interface WindowedDigitalMetric {
  id: string;
  name: string;
  color: string;
  currentValue: number;
  data: Array<{ time: Date; value: number }>;
}

interface ProcessedData {
  analogMetrics: WindowedAnalogMetric[];
  digitalMetrics: WindowedDigitalMetric[];
  gpsData: Array<{ time: number; lat: number; lng: number }>;
  timestamps: number[];
}

interface RawData {
  analogPerSecond?: Array<{
    id: string | number;
    name?: string;
    unit?: string;
    color?: string;
    min_color?: string;
    max_color?: string;
    resolution?: number;
    offset?: number;
    yAxisRange?: { min: number; max: number };
    display?: boolean;
    points?: Array<{
      time: string;
      avg?: number | null;
      min?: number | null;
      max?: number | null;
      value?: number | null;
    }>;
  }>;
  digitalPerSecond?: Array<{
    id: string | number;
    name?: string;
    color?: string;
    display?: boolean;
    points?: Array<{
      time: string;
      value?: number | null;
    }>;
  }>;
  gpsData?: Array<{
    time: string;
    lat: number;
    lng: number;
  }>;
}

interface UseDataProcessorReturn {
  processData: (
    rawData: RawData,
    selectedDate: string,
    isSecondView: boolean,
    windowStart?: number,
    windowEnd?: number
  ) => Promise<ProcessedData>;
  getWindow: (
    windowStart: number,
    windowEnd: number,
    isSecondView: boolean
  ) => Promise<ProcessedData>;
  clearCache: () => void;
}

export const useDataProcessor = (): UseDataProcessorReturn => {
  // TODO: Move to Web Worker for better performance with very large datasets
  // For now, using direct processing with requestAnimationFrame for non-blocking updates
  const processingRef = useRef<boolean>(false);

  // Process data asynchronously using requestAnimationFrame to avoid blocking UI
  const processDataAsync = useCallback((fn: () => ProcessedData): Promise<ProcessedData> => {
    return new Promise((resolve) => {
      if (processingRef.current) {
        // If already processing, queue this request
        requestAnimationFrame(() => {
          resolve(processDataAsync(fn));
        });
        return;
      }
      
      processingRef.current = true;
      requestAnimationFrame(() => {
        try {
          const result = fn();
          processingRef.current = false;
          resolve(result);
        } catch (error) {
          processingRef.current = false;
          throw error;
        }
      });
    });
  }, []);

  const processData = useCallback(
    (
      rawData: RawData,
      selectedDate: string,
      isSecondView: boolean,
      windowStart?: number,
      windowEnd?: number
    ): Promise<ProcessedData> => {
      return processDataAsync(() => {
        // Process raw data (cached internally)
        const processed = processRawData(rawData, selectedDate);
        
        // Get windowed data if window specified
        if (windowStart != null && windowEnd != null) {
          return getWindowedData(windowStart, windowEnd, isSecondView);
        } else {
          // Return full dataset
          if (processed.timestamps.length === 0) {
            return {
              analogMetrics: [],
              digitalMetrics: [],
              gpsData: [],
              timestamps: [],
            };
          }
          // For second view, return full data without downsampling (all per-second points)
          // For minute view, use normal downsampling
          const firstTimestamp = processed.timestamps[0];
          const lastTimestamp = processed.timestamps[processed.timestamps.length - 1];
          return getWindowedData(firstTimestamp, lastTimestamp, isSecondView);
        }
      });
    },
    [processDataAsync]
  );

  const getWindow = useCallback(
    (windowStart: number, windowEnd: number, isSecondView: boolean): Promise<ProcessedData> => {
      return processDataAsync(() => {
        return getWindowedData(windowStart, windowEnd, isSecondView);
      });
    },
    [processDataAsync]
  );

  const clearCache = useCallback(() => {
    clearDataCache();
  }, []);

  return {
    processData,
    getWindow,
    clearCache,
  };
};

