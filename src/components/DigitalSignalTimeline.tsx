import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import styles from './DigitalSignalTimeline.module.css';

interface DigitalSignalData {
  id: string;
  name: string;
  color: string;
  data: Array<{ time: Date; value: number }>;
  currentValue: number;
}

interface DigitalSignalTimelineProps {
  signals: DigitalSignalData[];
  selectedTime: Date | null;
  crosshairActive: boolean;
  timeDomain: [number, number] | null; // Timestamp range for synchronization
  isSecondViewMode?: boolean;
}

interface ChartDataPoint {
  time: number; // Timestamp for Recharts time scale
  [key: string]: number | undefined;
}

const DigitalSignalTimeline: React.FC<DigitalSignalTimelineProps> = ({
  signals,
  selectedTime,
  crosshairActive,
  timeDomain,
  isSecondViewMode = false
}) => {
  // Track window width for responsive sizing
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Dynamically size chart height based on number of signals to avoid overlap
  // For 64 signals, we need proper spacing to show all names clearly
  // Responsive per-row spacing based on screen size
  const chartHeight = useMemo(() => {
    let perRow = 40; // Default spacing
    
    // Adjust spacing based on screen size
    if (windowWidth >= 1921) {
      perRow = 45; // More spacing on ultra-wide screens
    } else if (windowWidth >= 1441) {
      perRow = 42; // Slightly more on large desktops
    } else if (windowWidth <= 640) {
      perRow = 35; // Less spacing on small screens
    }
    
    const minH = 300;  // minimum height when few signals
    // Remove max height cap to allow all 64 signals to be displayed
    // For 64 signals: 64 * 40 = 2560px
    const desired = Math.max(minH, signals.length * perRow);
    return desired; // No max cap - show all signals
  }, [signals.length, windowWidth]);
  const chartData = useMemo(() => {
    if (!signals.length || !signals[0].data.length) return [];

    // Determine visible range
    const PAD = 5 * 60 * 1000; // 5 min padding
    const [startTs, endTs] = timeDomain || [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    const lo = startTs - PAD;
    const hi = endTs + PAD;

    // Collect ALL unique timestamps from ALL signals (no decimation)
    const allTimesSet = new Set<number>();
    signals.forEach(signal => {
      signal.data.forEach(d => {
        const t = d.time.getTime();
        if (t >= lo && t <= hi) {
          allTimesSet.add(t);
        }
      });
    });

    // Convert to sorted array
    const allTimes = Array.from(allTimesSet).sort((a, b) => a - b);

    // Build data points using EXACT API values ONLY - no interpolation, no nearest neighbor
    // Show exact value (0 = OFF, 1 = ON) at exact time from API
    const dataMap = new Map<number, ChartDataPoint>();
    
    // Console log all API data for verification
    console.group('📊 Digital Chart: API Data - Exact Values by Time');
    signals.forEach((signal, signalIndex) => {
      console.log(`Signal ${signalIndex + 1}: ${signal.name} (${signal.id})`, {
        totalPoints: signal.data.length,
        dataPoints: signal.data.map(d => ({
          time: format(d.time, 'HH:mm:ss'),
          timestamp: d.time.getTime(),
          value: d.value,
          status: d.value === 1 ? 'ON' : 'OFF'
        }))
      });
    });
    console.groupEnd();
    
    allTimes.forEach(t => {
      const point: ChartDataPoint = { time: t };
      signals.forEach((signal, index) => {
        // ONLY use exact match - no fallback to closest point
        // This ensures we show exact API value at exact time
        const exactMatch = signal.data.find(d => d.time.getTime() === t);
        if (exactMatch) {
          // Use exact API value: 1 = ON (upper position at index + 3.5), 0 = OFF (lower position at index + 3.0)
          const apiValue = Number(exactMatch.value);
          point[signal.id] = apiValue === 1 ? index + 3.5 : index + 3.0;
        } else {
          // If no exact match, set to null (not undefined) so line breaks at missing data
          point[signal.id] = null as any;
        }
      });
      dataMap.set(t, point);
    });
    
    // Console log processed chart data for verification
    console.group('📊 Digital Chart: Processed Chart Data - Exact Time Points');
    const processedData = Array.from(dataMap.values()).sort((a, b) => a.time! - b.time!);
    console.log('Total time points in chart:', processedData.length);
    console.log('Sample points (first 10):', processedData.slice(0, 10).map(p => ({
      time: format(new Date(p.time!), 'HH:mm:ss'),
      timestamp: p.time,
      signals: signals.map((s, sigIdx) => {
        const yPos = p[s.id];
        const expectedOnPos = sigIdx + 3.5;  // ON is upper position
        const expectedOffPos = sigIdx + 3.0;  // OFF is lower position
        let value = 'NO DATA';
        if (yPos !== undefined) {
          value = Math.abs(yPos - expectedOnPos) < 0.1 ? 'ON (1)' : 'OFF (0)';
        }
        return {
          id: s.id,
          name: s.name,
         value,
          yPosition: yPos
        };
      })
    })));
    console.groupEnd();

    // Detect time gaps for each signal and insert null points to break the line
    // Expected interval is 1 minute (60000 ms), but allow up to 2 minutes before breaking
    const EXPECTED_INTERVAL = 60 * 1000; // 1 minute
    const MAX_GAP = 2 * 60 * 1000; // 2 minutes - if gap is larger, insert null point
    
    // For each signal, check for gaps in its data and insert null points
    signals.forEach((signal, signalIndex) => {
      const signalData = signal.data
        .filter(d => {
          const t = d.time.getTime();
          return t >= lo && t <= hi;
        })
        .sort((a, b) => a.time.getTime() - b.time.getTime());
      
      // Check for gaps in this signal's data
      for (let i = 0; i < signalData.length - 1; i++) {
        const current = signalData[i];
        const next = signalData[i + 1];
        const gap = next.time.getTime() - current.time.getTime();
        
        // If gap is larger than threshold, insert null points to break the line
        if (gap >= MAX_GAP) {
          // Insert null point at expected next interval time
          const nullPointTime = current.time.getTime() + EXPECTED_INTERVAL;
          
          // Check if this time point already exists (another signal might have data here)
          if (!dataMap.has(nullPointTime)) {
            // Create new null point - check if other signals have data at this time
            const nullPoint: ChartDataPoint = { time: nullPointTime };
            signals.forEach((s, idx) => {
              // Check if this signal has data at nullPointTime
              const exactMatch = s.data.find(d => d.time.getTime() === nullPointTime);
              if (exactMatch) {
                // This signal has data, use it
                const apiValue = Number(exactMatch.value);
                nullPoint[s.id] = apiValue === 1 ? idx + 3.5 : idx + 3.0;
              } else {
                // No data for this signal, set to null
                nullPoint[s.id] = null as any;
              }
            });
            dataMap.set(nullPointTime, nullPoint);
            allTimesSet.add(nullPointTime);
          } else {
            // Point already exists - just update this signal to null if it doesn't have data
            const existingPoint = dataMap.get(nullPointTime)!;
            const exactMatch = signal.data.find(d => d.time.getTime() === nullPointTime);
            if (!exactMatch) {
              // This signal doesn't have data at this time, set to null
              existingPoint[signal.id] = null as any;
            }
          }
        }
      }
    });
    
    // Return sorted by timestamp (already sorted from allTimes, but ensure)
    return Array.from(dataMap.values()).sort((a, b) => a.time! - b.time!);
  }, [signals, timeDomain]);

  const formatTime = (tickItem: number) => {
    if (isSecondViewMode) {
      return format(new Date(tickItem), 'HH:mm:ss');
    }
    return format(new Date(tickItem), 'HH:mm');
  };

  // Dynamic ticks based on data range: 30 minutes for 12 hours, 1 hour for 24 hours
  const ticks = React.useMemo(() => {
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

  const formatYAxisLabel = (value: number) => {
    // Y-axis ticks are at index + 3.0, so we round to get the signal index
    const signalIndex = Math.round(value - 3.0);
    const signal = signals[signalIndex];
    
    if (!signal) {
      return '';
    }
    return `${signal.name}`;
  };

  const getSignalStatus = (signal: DigitalSignalData): string => {
    if (!selectedTime) {
      // Use the last value in the data array if available, otherwise use currentValue
      const lastValue = signal.data.length > 0 
        ? signal.data[signal.data.length - 1].value 
        : signal.currentValue;
      const isOn = Number(lastValue) === 1;
      return isOn ? 'ON' : 'OFF';
    }
    
    // First check for exact match at selected time
    const exactMatch = signal.data.find(d => d.time.getTime() === selectedTime.getTime());
    if (exactMatch) {
      const isOn = Number(exactMatch.value) === 1;
      return isOn ? 'ON' : 'OFF';
    }
    
    // If no exact match, data is missing - show OFF status
    return 'OFF';
  };

  // Hover tooltip removed per requirement

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [referenceLineViewportX, setReferenceLineViewportX] = useState<number | null>(null);
  const [isChartVisible, setIsChartVisible] = useState<boolean>(true);
  const [scrollContainerTop, setScrollContainerTop] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      setSize({ w: rect?.width || 0, h: rect?.height || 0 });
    };
    update();
    // Use ResizeObserver to detect when chart height changes
    const resizeObserver = new ResizeObserver(update);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', update);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [chartHeight]); // Re-run when chartHeight changes

  // Track ReferenceLine position in viewport for fixed label
  useEffect(() => {
    if (!selectedTime || !chartWrapperRef.current) {
      setReferenceLineViewportX(null);
      setIsChartVisible(false);
      return;
    }

    const updatePosition = () => {
      // Find the ReferenceLine in the SVG
      const svg = chartWrapperRef.current?.querySelector('svg');
      if (!svg) {
        setReferenceLineViewportX(null);
        return;
      }

      const lines = svg.querySelectorAll('line');
      for (const line of Array.from(lines)) {
        const stroke = line.getAttribute('stroke');
        const strokeDasharray = line.getAttribute('stroke-dasharray');
        if (stroke === '#ef4444' && (strokeDasharray === '3,3' || strokeDasharray === '3 3')) {
          const lineRect = line.getBoundingClientRect();
          // Get the center X position in viewport coordinates
          const viewportX = lineRect.left + (lineRect.width / 2);
          
          // Check if chart is visible in viewport
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            const isVisible = containerRect.top < window.innerHeight && containerRect.bottom > 0;
            setIsChartVisible(isVisible);
            
            // Find scroll container to get its top position
            if (containerRef.current) {
              let scrollContainer: HTMLElement | null = containerRef.current.parentElement;
              while (scrollContainer && scrollContainer !== document.body) {
                const style = window.getComputedStyle(scrollContainer);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                    scrollContainer.classList.contains('scrollArea') ||
                    scrollContainer.classList.contains('scrollContent')) {
                  const scrollRect = scrollContainer.getBoundingClientRect();
                  setScrollContainerTop(scrollRect.top);
                  break;
                }
                scrollContainer = scrollContainer.parentElement;
              }
            }
          }
          
          setReferenceLineViewportX(viewportX);
          return;
        }
      }
      setReferenceLineViewportX(null);
    };

    // Initial update
    const timeoutId = setTimeout(updatePosition, 100);

    // Update on scroll and resize
    const handleUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate, { passive: true });
    
    // Use MutationObserver to watch for chart updates
    const svg = chartWrapperRef.current?.querySelector('svg');
    let observer: MutationObserver | null = null;
    
    if (svg) {
      observer = new MutationObserver(handleUpdate);
      observer.observe(svg, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['x1', 'x2', 'stroke', 'stroke-dasharray']
      });
    }

    const intervalId = setInterval(updatePosition, 200);
    
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [selectedTime, timeDomain, size.w]);

  // Calculate ReferenceLine position for time label
  const referenceLineX = useMemo(() => {
    if (!selectedTime || !timeDomain) return null;
    
    // Calculate position based on time domain
    const [visStart, visEnd] = timeDomain;
    if (visEnd <= visStart) return null;
    
    const timeValue = selectedTime.getTime();
    const percent = (timeValue - visStart) / (visEnd - visStart);
    const clampedPercent = Math.max(0, Math.min(1, percent));
    
    // Get container width - use size.w if available, otherwise try to get from ref
    let containerWidth = size.w;
    if (!containerWidth && containerRef.current) {
      containerWidth = containerRef.current.getBoundingClientRect().width;
    }
    if (!containerWidth || containerWidth <= 0) return null;
    
    // Calculate left margin (same as chart)
    const leftMargin = windowWidth >= 1921 ? 25 : windowWidth <= 640 ? 15 : 20;
    const rightMargin = 30;
    const yAxisWidth = windowWidth >= 1921 ? 180 : windowWidth <= 640 ? 120 : 160;
    const chartLeftOffset = leftMargin + yAxisWidth;
    const innerWidth = containerWidth - chartLeftOffset - rightMargin;
    
    if (innerWidth <= 0) return null;
    
    // Calculate X position
    const x = chartLeftOffset + (innerWidth * clampedPercent);
    return x;
  }, [selectedTime, timeDomain, size.w, windowWidth]);

  // Also try to find actual ReferenceLine from DOM for more accuracy
  useEffect(() => {
    if (!selectedTime || !chartWrapperRef.current || !containerRef.current) {
      return;
    }

    const findReferenceLine = () => {
      const svg = chartWrapperRef.current?.querySelector('svg');
      if (!svg || !containerRef.current) return null;

      const lines = svg.querySelectorAll('line');
      for (const line of Array.from(lines)) {
        const stroke = line.getAttribute('stroke');
        const strokeDasharray = line.getAttribute('stroke-dasharray');
        if (stroke === '#ef4444' && (strokeDasharray === '3,3' || strokeDasharray === '3 3')) {
          const lineRect = line.getBoundingClientRect();
          const containerRect = containerRef.current.getBoundingClientRect();
          const relativeX = lineRect.left + (lineRect.width / 2) - containerRect.left;
          return relativeX;
        }
      }
      return null;
    };

    const updatePosition = () => {
      const x = findReferenceLine();
      if (x !== null && !isNaN(x) && x > 0) {
        // Update state if we find a valid position from DOM
        // This will override the calculated position
      }
    };

    const timeoutId = setTimeout(updatePosition, 100);
    const intervalId = setInterval(updatePosition, 300);
    
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [selectedTime, timeDomain, size.w]);


  if (!signals.length || !chartData.length) {
    return (
      <div className={styles.container}>
        <div className={styles.noData}>No digital signal data available</div>
      </div>
    );
  }

  return (
    <>
      {/* Fixed time label at top of visible area when chart is visible and scrolled */}
      {selectedTime && isChartVisible && referenceLineViewportX !== null && (
        <div
          className={styles.fixedTimeLabel}
          style={{ 
            left: `${referenceLineViewportX}px`, 
            transform: 'translateX(-50%)',
            top: `${scrollContainerTop + 10}px`
          }}
        >
{isSecondViewMode 
          ? format(selectedTime, 'HH:mm:ss')
          : `${format(new Date(Math.floor(selectedTime.getTime() / 60000) * 60000), 'HH:mm')}:00`}
        </div>
      )}
      <div className={styles.container}>
        <div className={styles.chartRow}>
          <div className={styles.chartArea}>
            <div className={styles.chartWrapper} ref={containerRef} style={{ height: chartHeight }}>
            <div ref={chartWrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart
                data={chartData}
                margin={{
                  top: windowWidth >= 1921 ? 140 : windowWidth <= 640 ? 100 : 120,
                  right: 30,
                  left: windowWidth >= 1921 ? 25 : windowWidth <= 640 ? 15 : 20,
                  bottom: windowWidth >= 1921 ? 50 : windowWidth <= 640 ? 35 : 40
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  type="number"
                  scale="time"
                  domain={timeDomain || ['dataMin', 'dataMax']}
                  ticks={ticks as any}
                  tickFormatter={formatTime}
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280', fontSize: 9 }}
                  style={{ fontSize: '9px' }}
                />
                <YAxis
                  type="number"
                  domain={[3.0, signals.length + 3.0]}
                  ticks={signals.map((_, index) => index + 3.0)}
                  tickFormatter={formatYAxisLabel}
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280', fontSize: windowWidth >= 1921 ? 10 : windowWidth <= 640 ? 8 : 9 }}
                  width={windowWidth >= 1921 ? 180 : windowWidth <= 640 ? 120 : 160}
                  interval={0}
                />
                {/* Tooltip removed */}
                {selectedTime && (
                  <ReferenceLine
                    x={selectedTime.getTime()}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                  />
                )}
                {signals.map((signal) => (
                  <Line
                    key={signal.id}
                    type="stepAfter"
                    dataKey={signal.id}
                    stroke={signal.color}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 6, fill: signal.color }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.overlay}>
              {signals.map((signal, idx) => {
                const status = getSignalStatus(signal);
                
                // Get the actual current value at the rightmost visible point
                let currentValue = signal.currentValue;
                if (timeDomain && signal.data.length > 0) {
                  // Find the last data point within the visible time domain
                  const [startTs, endTs] = timeDomain;
                  const visibleData = signal.data.filter(d => {
                    const t = d.time.getTime();
                    return t >= startTs && t <= endTs;
                  });
                  if (visibleData.length > 0) {
                    // Get the last value in the visible range
                    currentValue = visibleData[visibleData.length - 1].value;
                  } else {
                    // If no data in visible range, find closest point
                    const closest = signal.data.reduce((prev, curr) => {
                      const prevDiff = Math.abs(prev.time.getTime() - endTs);
                      const currDiff = Math.abs(curr.time.getTime() - endTs);
                      return currDiff < prevDiff ? curr : prev;
                    });
                    currentValue = closest.value;
                  }
                } else if (signal.data.length > 0) {
                  currentValue = signal.data[signal.data.length - 1].value;
                }
                
                const isOn = Number(currentValue) === 1;
                
                // Get actual chart margins from LineChart (top: 120, bottom: 40)
                const chartTop = 120;
                const chartBottom = 40;
                // Use the actual rendered container height, fallback to chartHeight if not available
                const actualContainerHeight = size.h > 0 ? size.h : chartHeight;
                // The ResponsiveContainer height matches chartHeight, so use that for inner height calculation
                const actualChartHeight = chartHeight;
                const innerH = Math.max(1, actualChartHeight - chartTop - chartBottom);
                
                // Y-axis domain is [3.0, signals.length + 3.0]
                // Each signal has two positions: ON = idx + 3.5 (upper), OFF = idx + 3.0 (lower)
                // We need to position the label exactly at the signal's current state line
                const yAxisMin = 3.0;
                const yAxisMax = signals.length + 3.0;
                const yAxisRange = yAxisMax - yAxisMin;
                
                // Position label at THIS signal's line position (ON = idx + 3.5 upper, OFF = idx + 3.0 lower)
                // This ensures each label is positioned exactly at its own signal line, not overlapping with others
                // Each signal has a unique Y-axis position based on its index
                const yAxisValue = isOn ? idx + 3.5 : idx + 3.8;
                
                // Convert Y-axis value to pixel: normalize to [0, 1] then scale to innerH
                // Recharts Y-axis: higher values at top, so we invert (1 - normalized)
                // Ensure we have a valid range to avoid division by zero
                const normalized = yAxisRange > 0 ? Math.max(0, Math.min(1, (yAxisValue - yAxisMin) / yAxisRange)) : 0.5;
                
                // Calculate pixel position relative to chartWrapper (overlay is positioned absolutely within chartWrapper)
                // chartWrapper has padding-top: 20px, and the chart's inner area starts at chartTop (120px) from ResponsiveContainer top
                const wrapperPaddingTop = 20;
                // Calculate the exact pixel position for this signal's label
                // The (1 - normalized) inverts because Recharts Y-axis has higher values at top
                let pixelY = wrapperPaddingTop + chartTop + (1 - normalized) * innerH;
                
                // Ensure label stays within the chart's inner rendering area
                // Each signal's label should be positioned exactly at its line, so we clamp to valid range
                const minY = wrapperPaddingTop + chartTop;
                const maxY = wrapperPaddingTop + chartTop + innerH;
                pixelY = Math.max(minY, Math.min(maxY, pixelY));
                
                // Final safety check: ensure label doesn't exceed the actual container height
                if (actualContainerHeight > 0) {
                  const absoluteMaxY = actualContainerHeight - 15; // account for padding-bottom: 15px
                  pixelY = Math.min(pixelY, absoluteMaxY);
                }
                
                // Center the label vertically on the line (offset by half label height ~8px)
                // This ensures the label is centered on its signal's line position
                // Use signal index for z-index to ensure proper stacking order
                return (
                  <div
                    key={signal.id}
                    className={`${styles.rowStatus} ${status === 'ON' ? styles.on : styles.off}`}
                    style={{ 
                      top: `${pixelY - 8}px`,
                      zIndex: 10 + idx // Ensure each label has unique z-index for proper stacking
                    }}
                  >
                    {status}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default DigitalSignalTimeline;
