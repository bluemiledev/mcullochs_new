import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import {
  AreaChart,
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
}

const BASE_LEFT_MARGIN = 20; // same as charts
const RIGHT_MARGIN = 30;     // same as charts
const Y_AXIS_LEFT_WIDTH = 115; // align with charts' YAxis width
const CHART_LEFT_OFFSET = BASE_LEFT_MARGIN + Y_AXIS_LEFT_WIDTH;

const TimeScrubber: React.FC<TimeScrubberProps> = ({
  data,
  selectedTime,
  selectionStart,
  selectionEnd,
  onTimeChange,
  onSelectionChange,
  onHover,
}) => {
  const scrubberData = useMemo(() => {
    return data.map(d => ({
      time: d.time,
      value: 1,
    }));
  }, [data]);

  const timeDomain = useMemo(() => {
    if (data.length === 0) return [0, 0] as [number, number];
    return [data[0].time, data[data.length - 1].time] as [number, number];
  }, [data]);

  const formatTime = (tick: number) => {
    return format(new Date(tick), 'HH:mm');
  };

  const [dragMode, setDragMode] = useState<null | 'left' | 'right' | 'range'>(null);
  const isDraggingRef = useRef(false);

  const clampToDay = (t: number) => Math.max(timeDomain[0], Math.min(timeDomain[1], t));

  const enforceMaxHour = (start: number, end: number): [number, number] => {
    const maxRangeMs = 60 * 60 * 1000;
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
      if (lastEmittedRef.current !== null && Math.abs(time - lastEmittedRef.current) < 1000) return;
      lastEmittedRef.current = time;

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
  }, [dragMode, onSelectionChange, selectionEnd, selectionStart, timeDomain]);
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
      const defaultMs = 60 * 60 * 1000;
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
    isDraggingRef.current = true;
  }, [selectionStart, selectionEnd, onSelectionChange, timeDomain]);

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
      setOverlayWidth(rect?.width || 0);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const percentForSelected = useMemo(() => {
    if (selectedTime == null) return null;
    const denom = timeDomain[1] - timeDomain[0] || 1;
    return Math.max(0, Math.min(1, (selectedTime - timeDomain[0]) / denom));
  }, [selectedTime, timeDomain]);

  const selectedLeftPx = useMemo(() => {
    if (percentForSelected === null) return null;
    const inner = Math.max(1, overlayWidth - CHART_LEFT_OFFSET - RIGHT_MARGIN);
    return CHART_LEFT_OFFSET + inner * percentForSelected;
  }, [percentForSelected, overlayWidth]);

  const timeFromClientX = useCallback((clientX: number) => {
    const el = overlayRef.current;
    if (!el) return selectedTime ?? timeDomain[0];
    const rect = el.getBoundingClientRect();
    const innerWidth = Math.max(1, rect.width - CHART_LEFT_OFFSET - RIGHT_MARGIN);
    const raw = (clientX - rect.left - CHART_LEFT_OFFSET) / innerWidth;
    const p = Math.max(0, Math.min(1, raw));
    const t = timeDomain[0] + p * (timeDomain[1] - timeDomain[0]);
    return clampToDay(Math.round(t));
  }, [selectedTime, timeDomain]);

  const onKnobMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    knobDraggingRef.current = true;
    isDraggingRef.current = true;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    const t = timeFromClientX(e.clientX);
    onTimeChange(t);
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      if (!knobDraggingRef.current) return;
      const t2 = timeFromClientX(ev.clientX);
      onTimeChange(t2);
    };
    const onUp = () => {
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

  return (
    <div className={styles.scrubberContainer}>
      <div className={styles.scrubberHeader}>
        <div className={styles.scrubberTitle}>Time Range Selector</div>
        <div className={styles.scrubberInfo}>
          {selectionStart && selectionEnd && (
            <>
              <span>{format(new Date(selectionStart), 'HH:mm:ss')}</span>
              <span> → </span>
              <span>{format(new Date(selectionEnd), 'HH:mm:ss')}</span>
            </>
          )}
        </div>
      </div>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={80}>
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
              tickFormatter={formatTime}
              tick={{ fill: '#6b7280', fontSize: 9 }}
              style={{ fontSize: '9px' }}
            />
            {/* Tooltip removed */}
            {/* background fill removed; keep axis only */}
            {selectionStart !== null && (
              <ReferenceLine x={selectionStart} stroke="#f59e0b" strokeWidth={2} />
            )}
            {selectionEnd !== null && (
              <ReferenceLine x={selectionEnd} stroke="#f59e0b" strokeWidth={2} />
            )}
            {selectedTime !== null && (
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
          {selectedLeftPx !== null && (
            <div
              className={styles.vehiclePointer}
              style={{ left: `${selectedLeftPx}px` }}
              onMouseDown={onKnobMouseDown}
              title="Drag to set time"
            >
              <div className={styles.vehiclePointerIcon} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeScrubber;
