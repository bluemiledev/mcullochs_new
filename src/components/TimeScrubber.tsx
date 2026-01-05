import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import styles from './TimeScrubber.module.css';

interface TimeScrubberProps {
  data: Array<{ time: number }>;
  selectedTime: number | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  onTimeChange: (time: number) => void;
  onSelectionChange: (start: number, end: number) => void;
  onHover: (time: number | null) => void;
  isSecondViewMode?: boolean;
  showVehiclePointer?: boolean; // Show vehicle pointer (default: true for drilling, false for maintenance)
}

const BASE_LEFT_MARGIN = 20; // same as charts
const RIGHT_MARGIN = 30;     // same as charts
const Y_AXIS_LEFT_WIDTH = 140; // align with widest chart YAxis (Digital timeline)
const ALIGN_TWEAK_PX = 4;    // fine-tune to match chart plotting origin exactly
const POINTER_ALIGN_TWEAK_PX = 3; // nudge so icon sits exactly under ReferenceLine across DPRs
const CHART_LEFT_OFFSET = BASE_LEFT_MARGIN + Y_AXIS_LEFT_WIDTH + ALIGN_TWEAK_PX;

const TimeScrubber: React.FC<TimeScrubberProps> = ({
  data,
  selectedTime,
  selectionStart,
  selectionEnd,
  onTimeChange,
  onSelectionChange,
  onHover,
  isSecondViewMode = false,
  showVehiclePointer = true,
}) => {
  const scrubberData = useMemo(() => {
    return data.map(d => ({
      time: d.time,
      value: 1,
    }));
  }, [data]);

  const timeDomain = useMemo(() => {
    if (data.length === 0) {
      console.warn('⚠️ TimeScrubber: No data provided, using default time domain');
      // Return a default time domain (6 AM to 6 PM today) if no data
      const now = new Date();
      const start = new Date(now);
      start.setHours(6, 0, 0, 0);
      const end = new Date(now);
      end.setHours(18, 0, 0, 0);
      return [start.getTime(), end.getTime()] as [number, number];
    }
    const domain: [number, number] = [data[0].time, data[data.length - 1].time];
    // Ensure valid domain
    if (!Number.isFinite(domain[0]) || !Number.isFinite(domain[1]) || domain[0] >= domain[1]) {
      console.warn('⚠️ TimeScrubber: Invalid time domain, using default');
      const now = new Date();
      const start = new Date(now);
      start.setHours(6, 0, 0, 0);
      const end = new Date(now);
      end.setHours(18, 0, 0, 0);
      return [start.getTime(), end.getTime()] as [number, number];
    }
    return domain;
  }, [data]);

  const formatTime = (tick: number) => {
    // Format time in UTC
    const date = new Date(tick);
    if (isSecondViewMode) {
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [dragMode, setDragMode] = useState<null | 'left' | 'right' | 'range'>(null);
  const isDraggingRef = useRef(false);

  const clampToDay = (t: number) => Math.max(timeDomain[0], Math.min(timeDomain[1], t));

  const enforceMaxHour = (start: number, end: number): [number, number] => {
    // In second view mode: max range is 10 minutes
    // In minute view mode: max range is 1 hour
    const maxRangeMs = isSecondViewMode ? (10 * 60 * 1000) : (60 * 60 * 1000);
    if (end - start > maxRangeMs) {
      return [start, start + maxRangeMs];
    }
    return [start, end];
  };

  const rafRef = useRef<number | null>(null);
  const lastEmittedRef = useRef<number | null>(null);
  const handleMouseMove = useCallback((e: any) => {
    if (!e) return;
    const activeLabel = e?.activeLabel as number | undefined;
    if (activeLabel === undefined || activeLabel === null) return;

    const run = () => {
      const time = clampToDay(activeLabel);
      // In second view mode, allow updates every second (1000ms)
      // In minute view mode, throttle to prevent excessive updates (but still allow minute-by-minute)
      const throttleMs = isSecondViewMode ? 100 : 1000;
      if (lastEmittedRef.current !== null && Math.abs(time - lastEmittedRef.current) < throttleMs) return;
      lastEmittedRef.current = time;
      
      // Only call onTimeChange when dragging, not on hover
      // Hover should only update the visual indicator, not the actual selected time
      if (isDraggingRef.current && dragMode) {
        if (dragMode === 'left' && selectionEnd !== null) {
          const [s, e2] = enforceMaxHour(time, selectionEnd);
          const start = Math.min(s, e2);
          const end = Math.max(s, e2);
          onSelectionChange(start, end);
        } else if (dragMode === 'right' && selectionStart !== null) {
          const [s, e2] = enforceMaxHour(selectionStart, time);
          const start = Math.min(s, e2);
          const end = Math.max(s, e2);
          onSelectionChange(start, end);
        } else if (dragMode === 'range' && selectionStart !== null && selectionEnd !== null) {
          const width = selectionEnd - selectionStart;
          let newStart = clampToDay(time - Math.floor(width / 2));
          let newEnd = newStart + width;
          if (newEnd > timeDomain[1]) {
            newEnd = timeDomain[1];
            newStart = newEnd - width;
          }
          if (newStart < timeDomain[0]) {
            newStart = timeDomain[0];
            newEnd = newStart + width;
          }
          onSelectionChange(newStart, newEnd);
        }
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(run);
  }, [dragMode, onSelectionChange, selectionEnd, selectionStart, timeDomain, isSecondViewMode, onTimeChange]);
  
  // Snap time to nearest minute for minute-by-minute movement, or second for second-by-second
  const snapToTime = useCallback((t: number) => {
    if (isSecondViewMode) {
      // In second view mode, snap to nearest second
      const secondMs = 1000;
      return Math.round(t / secondMs) * secondMs;
    } else {
      // In minute view mode, snap to nearest minute
      const minuteMs = 60 * 1000;
      return Math.round(t / minuteMs) * minuteMs;
    }
  }, [isSecondViewMode]);
  
  const near = (a: number | null, b: number | null, toleranceMs: number) => {
    if (a === null || b === null) return false;
    return Math.abs(a - b) <= toleranceMs;
  };

  const handleMouseDown = useCallback((e: any) => {
    const time = (e?.activeLabel as number | undefined) ?? null;
    if (time === null) return;
    const tol = 15 * 60 * 1000;

    if (near(selectionStart, time, tol)) {
      setDragMode('left');
    } else if (near(selectionEnd, time, tol)) {
      setDragMode('right');
    } else if (selectionStart !== null && selectionEnd !== null && time >= Math.min(selectionStart, selectionEnd) && time <= Math.max(selectionStart, selectionEnd)) {
      setDragMode('range');
    } else {
      // In second view mode: default range is 10 minutes
      // In minute view mode: default range is 1 hour
      const defaultMs = isSecondViewMode ? (10 * 60 * 1000) : (60 * 60 * 1000);
      const width = selectionStart !== null && selectionEnd !== null ? Math.max(1, Math.min(defaultMs, Math.abs(selectionEnd - selectionStart))) : defaultMs;
      let newStart = clampToDay(time - Math.floor(width / 2));
      let newEnd = newStart + width;
      if (newEnd > timeDomain[1]) {
        newEnd = timeDomain[1];
        newStart = newEnd - width;
      }
      onSelectionChange(newStart, newEnd);
      setDragMode('range');
    }
    
    // Update selected time when clicking (not just hovering)
    const snappedTime = snapToTime(time);
    onTimeChange(snappedTime);
    
    isDraggingRef.current = true;
  }, [selectionStart, selectionEnd, onSelectionChange, timeDomain, snapToTime, onTimeChange]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setDragMode(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // keep steady
  }, []);

  // Hover tooltip removed per requirement

  const overlayRef = useRef<HTMLDivElement | null>(null);

  const knobDraggingRef = useRef(false);

  const [overlayWidth, setOverlayWidth] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (rect) {
        setOverlayWidth(rect.width);
      }
    };
    // Initial update
    update();
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(update);
    // Also update after a short delay to catch any layout changes
    const timeoutId = setTimeout(update, 100);
    window.addEventListener('resize', update);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', update);
    };
  }, []);

  const percentForSelected = useMemo(() => {
    if (selectedTime == null) return null;
    const denom = timeDomain[1] - timeDomain[0] || 1;
    return Math.max(0, Math.min(1, (selectedTime - timeDomain[0]) / denom));
  }, [selectedTime, timeDomain]);

  const selectedLeftPx = useMemo(() => {
    if (percentForSelected === null || overlayWidth === 0) return null;
    const inner = Math.max(1, overlayWidth - CHART_LEFT_OFFSET - RIGHT_MARGIN);
    return CHART_LEFT_OFFSET + inner * percentForSelected;
  }, [percentForSelected, overlayWidth]);

  const positionForTime = useCallback((t: number | null) => {
    if (t === null || !timeDomain || timeDomain[0] === timeDomain[1]) return null;
    const inner = Math.max(1, overlayWidth - CHART_LEFT_OFFSET - RIGHT_MARGIN);
    const p = (t - timeDomain[0]) / (timeDomain[1] - timeDomain[0]);
    const position = CHART_LEFT_OFFSET + inner * Math.max(0, Math.min(1, p));
    return position;
  }, [overlayWidth, timeDomain]);

  const leftHandlePx = useMemo(() => {
    if (selectionStart === null) {
      return null;
    }
    const pos = positionForTime(selectionStart);
    return pos;
  }, [positionForTime, selectionStart]);
  
  const rightHandlePx = useMemo(() => {
    if (selectionEnd === null) {
      return null;
    }
    const pos = positionForTime(selectionEnd);
    return pos;
  }, [positionForTime, selectionEnd]);

  // Dynamic ticks based on data range: 30 minutes for 12 hours, 1 hour for 24 hours
  // In second view mode, use smaller intervals (every 5 minutes)
  const ticks = useMemo(() => {
    if (!timeDomain) return undefined;
    const [start, end] = timeDomain;
    const dataRangeHours = (end - start) / (60 * 60 * 1000);
    
    if (isSecondViewMode) {
      // In second view mode, show ticks every 5 minutes for better readability
      const step = 5 * 60 * 1000; // 5 minutes
      const alignedStart = Math.floor(start / step) * step;
      const arr: number[] = [];
      for (let t = alignedStart; t <= end; t += step) arr.push(t);
      return arr;
    }
    
    // Use 30-minute intervals for 12-hour data, 1-hour intervals for 24-hour data
    const step = dataRangeHours <= 12 ? (30 * 60 * 1000) : (60 * 60 * 1000);
    
    const alignedStart = Math.floor(start / step) * step;
    const arr: number[] = [];
    for (let t = alignedStart; t <= end; t += step) arr.push(t);
    return arr;
  }, [timeDomain, isSecondViewMode]);


  const timeFromClientX = useCallback((clientX: number) => {
    const el = overlayRef.current;
    if (!el) return selectedTime ?? timeDomain[0];
    const rect = el.getBoundingClientRect();
    const innerWidth = Math.max(1, rect.width - CHART_LEFT_OFFSET - RIGHT_MARGIN);
    const raw = (clientX - rect.left - CHART_LEFT_OFFSET) / innerWidth;
    const p = Math.max(0, Math.min(1, raw));
    const t = timeDomain[0] + p * (timeDomain[1] - timeDomain[0]);
    const clamped = clampToDay(t);
    return snapToTime(clamped);
  }, [selectedTime, timeDomain, snapToTime]);

  const onKnobMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    knobDraggingRef.current = true;
    isDraggingRef.current = true;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    let t = timeFromClientX(e.clientX);
    // Clamp knob inside selection when both ends defined
    if (selectionStart !== null && selectionEnd !== null) {
      t = Math.max(selectionStart, Math.min(selectionEnd, t));
    }
    t = snapToTime(t);
    onTimeChange(t);
    
    let rafId: number | null = null;
    let lastTime = t;
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      if (!knobDraggingRef.current) return;
      
      // Throttle using requestAnimationFrame
      if (rafId !== null) return;
      
      rafId = requestAnimationFrame(() => {
        rafId = null;
        let t2 = timeFromClientX(ev.clientX);
        if (selectionStart !== null && selectionEnd !== null) {
          t2 = Math.max(selectionStart, Math.min(selectionEnd, t2));
        }
        t2 = snapToTime(t2);
        // Only update if time changed
        if (t2 !== lastTime) {
          lastTime = t2;
          onTimeChange(t2);
        }
      });
    };
    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      knobDraggingRef.current = false;
      isDraggingRef.current = false;
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // In second view mode: min range is 10 minutes
  // In minute view mode: min range is 1 hour
  const MIN_RANGE = isSecondViewMode ? (10 * 60 * 1000) : (60 * 60 * 1000);

  const onLeftHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionStart === null || selectionEnd === null) return;
    
    const startStart = selectionStart;
    let rafId: number | null = null;
    let lastStart = startStart;
    
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Throttle using requestAnimationFrame
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        let newStart = timeFromClientX(ev.clientX);
        const end = selectionEnd ?? timeDomain[1];
        // Enforce minimum range (10 minutes in second view, 1 hour in minute view)
        if (end - newStart < MIN_RANGE) {
          newStart = end - MIN_RANGE;
        }
        // Ensure newStart doesn't go before timeDomain start
        if (newStart < timeDomain[0]) {
          newStart = timeDomain[0];
        }
        newStart = clampToDay(newStart);
        // Update on every significant change (reduced threshold for smoother dragging)
        if (Math.abs(newStart - lastStart) > 50) {
          lastStart = newStart;
          onSelectionChange(newStart, end);
        }
      });
    };
    
    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onRightHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionStart === null || selectionEnd === null) return;
    
    const start = selectionStart;
    let rafId: number | null = null;
    let lastEnd = selectionEnd;
    
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Throttle using requestAnimationFrame
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        let newEnd = timeFromClientX(ev.clientX);
        // Enforce minimum range
        if (newEnd - start < MIN_RANGE) {
          newEnd = start + MIN_RANGE;
        }
        // Ensure newEnd doesn't go beyond timeDomain end
        if (newEnd > timeDomain[1]) {
          newEnd = timeDomain[1];
        }
        newEnd = clampToDay(newEnd);
        // Update on every significant change (reduced threshold for smoother dragging)
        if (Math.abs(newEnd - lastEnd) > 50) {
          lastEnd = newEnd;
          onSelectionChange(start, newEnd);
        }
      });
    };
    
    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className={styles.scrubberContainer}>
      <div className={styles.scrubberHeader}>
        <div className={styles.scrubberTitle}>Time Range Selector</div>
        <div className={styles.scrubberInfo}>
          {selectionStart && selectionEnd && (
            <>
              <span>
                {(() => {
                  const date = new Date(selectionStart);
                  const hours = String(date.getUTCHours()).padStart(2, '0');
                  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                  return `${hours}:${minutes}:${seconds}`;
                })()}
              </span>
              <span> → </span>
              <span>
                {(() => {
                  const date = new Date(selectionEnd);
                  const hours = String(date.getUTCHours()).padStart(2, '0');
                  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                  return `${hours}:${minutes}:${seconds}`;
                })()}
              </span>
            </>
          )}
        </div>
      </div>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={56}>
          <AreaChart
            data={scrubberData}
            margin={{ top: 4, right: RIGHT_MARGIN, left: CHART_LEFT_OFFSET, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            {/* removed yellow gradient */}
            <YAxis yAxisId={0} domain={[0, 1]} hide />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={timeDomain}
              ticks={ticks as any}
              tickFormatter={formatTime}
              tick={{ fill: '#6b7280', fontSize: 9 }}
              style={{ fontSize: '9px' }}
            />
            {/* Area component is required for mouse events to work */}
            <Area
              type="linear"
              dataKey="value"
              stroke="none"
              fill="#e5e7eb"
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            {/* Show vehicle pointer line (selected time) only if showVehiclePointer is true */}
            {showVehiclePointer && selectedTime !== null && (
              <ReferenceLine
                x={selectedTime}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
        <div className={styles.pointerOverlay} ref={overlayRef}>
          {showVehiclePointer && selectedLeftPx !== null && (
            <div
              className={styles.vehiclePointer}
              style={{ left: `${selectedLeftPx}px`, transform: 'translateX(-50%)' }}
              onMouseDown={onKnobMouseDown}
              title="Drag to set time"
            >
              <div className={styles.vehiclePointerIcon} />
            </div>
          )}
          {(() => {
            console.log('🔍 TimeScrubber render - leftHandlePx:', leftHandlePx, 'selectionStart:', selectionStart, 'rightHandlePx:', rightHandlePx, 'selectionEnd:', selectionEnd, 'overlayWidth:', overlayWidth, 'timeDomain:', timeDomain);
            return null;
          })()}
          {(() => {
            if (leftHandlePx !== null || rightHandlePx !== null) {
              console.log('🔍 TimeScrubber handles:', {
                leftHandlePx,
                rightHandlePx,
                selectionStart,
                selectionEnd,
                overlayWidth,
                timeDomain,
                dataLength: data.length
              });
            }
            return null;
          })()}
          {leftHandlePx !== null && selectionStart !== null && (
            <div
              className={styles.rangeHandle}
              style={{ 
                left: `${leftHandlePx}px`,
                zIndex: 20,
                pointerEvents: 'auto'
              }}
              onMouseDown={onLeftHandleMouseDown}
              title="Drag left handle"
            />
          )}
          {rightHandlePx !== null && selectionEnd !== null && (
            <div
              className={styles.rangeHandle}
              style={{ 
                left: `${rightHandlePx}px`,
                zIndex: 20,
                pointerEvents: 'auto'
              }}
              onMouseDown={onRightHandleMouseDown}
              title="Drag right handle"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeScrubber;
