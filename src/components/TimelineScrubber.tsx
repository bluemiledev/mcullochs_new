import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../pages/VehicleDashboard.module.css';

type Props = {
  allTimes: Date[];
  selectedTime: Date | null;
  onSelectedTimeChange: (t: Date) => void;
  selectionStart: Date | null;
  selectionEnd: Date | null;
  onSelectionChange: (start: Date, end: Date) => void;
};

const TimelineScrubber: React.FC<Props> = ({
  allTimes,
  selectedTime,
  onSelectedTimeChange,
  selectionStart,
  selectionEnd,
  onSelectionChange,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const leftHandleRef = useRef<HTMLDivElement | null>(null);
  const rightHandleRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const [dragMode, setDragMode] = useState<'none' | 'left' | 'right' | 'move'>('none');
  const startLeftPctRef = useRef(0);
  const startWidthPctRef = useRef(100);
  const startPointerXRef = useRef(0);

  const rangeStartMs = useMemo(() => (allTimes.length ? allTimes[0].getTime() : 0), [allTimes]);
  const rangeEndMs = useMemo(() => (allTimes.length ? allTimes[allTimes.length - 1].getTime() : 0), [allTimes]);
  const totalMs = useMemo(() => Math.max(1, rangeEndMs - rangeStartMs), [rangeStartMs, rangeEndMs]);

  const ticks = useMemo(() => {
    if (!rangeStartMs || !rangeEndMs) return [] as Array<{ leftPct: number; label: string; major: boolean }>;
    const duration = totalMs;
    // choose interval
    let major = 60 * 60 * 1000; // 1h
    let minor = 30 * 60 * 1000; // 30m
    if (duration > 24 * 60 * 60 * 1000) {
      major = 2 * 60 * 60 * 1000; // 2h
      minor = 60 * 60 * 1000;
    } else if (duration < 6 * 60 * 60 * 1000) {
      major = 30 * 60 * 1000;
      minor = 15 * 60 * 1000;
    }
    const startAligned = Math.ceil(rangeStartMs / major) * major;
    const arr: Array<{ leftPct: number; label: string; major: boolean }> = [];
    for (let t = startAligned; t <= rangeEndMs; t += major) {
      const p = (t - rangeStartMs) / totalMs;
      arr.push({
        leftPct: Math.max(0, Math.min(1, p)) * 100,
        label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        major: true
      });
      // minor ticks
      for (let m = t - major + minor; m < t; m += minor) {
        if (m <= rangeStartMs || m >= rangeEndMs) continue;
        const pm = (m - rangeStartMs) / totalMs;
        arr.push({ leftPct: pm * 100, label: '', major: false });
      }
    }
    return arr.sort((a, b) => a.leftPct - b.leftPct);
  }, [rangeStartMs, rangeEndMs, totalMs]);

  // Initialize viewport to full width (or provided selection)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !rangeStartMs) return;
    const start = selectionStart?.getTime() ?? rangeStartMs;
    const end = selectionEnd?.getTime() ?? rangeEndMs;
    const leftPct = ((start - rangeStartMs) / totalMs) * 100;
    const widthPct = ((end - start) / totalMs) * 100;
    viewport.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
    viewport.style.width = `${Math.max(5, Math.min(100, widthPct || 100))}%`;
  }, [selectionStart, selectionEnd, rangeStartMs, rangeEndMs, totalMs]);

  // Update cursor when selectedTime changes
  useEffect(() => {
    const cursor = cursorRef.current;
    const track = trackRef.current;
    if (!cursor || !track || !selectedTime) return;
    const rect = track.getBoundingClientRect();
    const p = (selectedTime.getTime() - rangeStartMs) / totalMs;
    cursor.style.left = `${Math.max(0, Math.min(1, p)) * rect.width}px`;
  }, [selectedTime, rangeStartMs, totalMs]);

  const pctToTime = (pct: number) => new Date(rangeStartMs + pct * totalMs);

  const handlePointerDown = (e: React.PointerEvent, mode: 'left' | 'right' | 'move') => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const trackRect = track.getBoundingClientRect();
    startPointerXRef.current = e.clientX;
    startLeftPctRef.current = parseFloat(viewport.style.left || '0');
    startWidthPctRef.current = parseFloat(viewport.style.width || '100');
    setDragMode(mode);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerMove = (e: PointerEvent) => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;

    // Hover updates selected time
    const rect = track.getBoundingClientRect();
    const pHover = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSelectedTimeChange(pctToTime(pHover));

    if (dragMode === 'none') return;

    const deltaPct = ((e.clientX - startPointerXRef.current) / rect.width) * 100;
    let newLeft = startLeftPctRef.current;
    let newWidth = startWidthPctRef.current;

    if (dragMode === 'left') {
      const maxLeft = startLeftPctRef.current + startWidthPctRef.current - 5;
      newLeft = Math.max(0, Math.min(startLeftPctRef.current + deltaPct, maxLeft));
      newWidth = startWidthPctRef.current - (newLeft - startLeftPctRef.current);
    } else if (dragMode === 'right') {
      const maxWidth = 100 - startLeftPctRef.current;
      newWidth = Math.max(5, Math.min(startWidthPctRef.current + deltaPct, maxWidth));
    } else if (dragMode === 'move') {
      const maxLeft = 100 - startWidthPctRef.current;
      newLeft = Math.max(0, Math.min(startLeftPctRef.current + deltaPct, maxLeft));
    }

    viewport.style.left = `${newLeft}%`;
    viewport.style.width = `${newWidth}%`;

    const start = pctToTime(newLeft / 100);
    const end = pctToTime((newLeft + newWidth) / 100);
    onSelectionChange(start, end);
  };

  const onPointerUp = () => {
    setDragMode('none');
  };

  useEffect(() => {
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  });

  const onTrackClick = (e: React.MouseEvent) => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    const rect = track.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const widthPct = parseFloat(viewport.style.width || '20');
    let leftPct = p * 100 - widthPct / 2;
    leftPct = Math.max(0, Math.min(100 - widthPct, leftPct));
    viewport.style.left = `${leftPct}%`;
    const start = pctToTime(leftPct / 100);
    const end = pctToTime((leftPct + widthPct) / 100);
    onSelectionChange(start, end);
    onSelectedTimeChange(new Date((start.getTime() + end.getTime()) / 2));
  };

  return (
    <div className={styles.scrubberContainer}>
      <div className={styles.scrubberTrack} ref={trackRef} onClick={onTrackClick as any}>
        {/* ticks */}
        {ticks.map((t, i) => (
          <div key={i} className={t.major ? styles.scrubberTickMajor : styles.scrubberTickMinor} style={{ left: `${t.leftPct}%` }}>
            {t.major && <div className={styles.scrubberTickLabel}>{t.label}</div>}
          </div>
        ))}
        <div className={styles.scrubberViewport} id="scrubberViewport" ref={viewportRef}>
          <div className={styles.scrubberHandleLeft} id="leftHandle" ref={leftHandleRef}
               onPointerDown={(e) => handlePointerDown(e, 'left')} />
          <div className={styles.scrubberHandleRight} id="rightHandle" ref={rightHandleRef}
               onPointerDown={(e) => handlePointerDown(e, 'right')} />
        </div>
        <div className={styles.scrubberCursor} id="timelineCursor" ref={cursorRef} />
      </div>
    </div>
  );
};

export default TimelineScrubber;


