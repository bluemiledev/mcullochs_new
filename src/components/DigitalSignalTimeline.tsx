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
}

interface ChartDataPoint {
  time: number; // Timestamp for Recharts time scale
  [key: string]: number | undefined;
}

const DigitalSignalTimeline: React.FC<DigitalSignalTimelineProps> = ({
  signals,
  selectedTime,
  crosshairActive,
  timeDomain
}) => {
  // Dynamically size chart height based on number of signals to avoid overlap
  const chartHeight = useMemo(() => {
    const perRow = 30; // px per signal row for clearer spacing
    const minH = 260;  // minimum height when few signals
    const maxH = 1200; // safety cap
    const desired = Math.max(minH, signals.length * perRow);
    return Math.min(maxH, desired);
  }, [signals.length]);
  const chartData = useMemo(() => {
    if (!signals.length || !signals[0].data.length) return [];

    // Determine visible range
    const PAD = 5 * 60 * 1000; // 5 min padding
    const [startTs, endTs] = timeDomain || [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    const lo = startTs - PAD;
    const hi = endTs + PAD;

    // Build list of visible times from first signal (assumed common grid)
    let times = signals[0].data
      .map(d => d.time.getTime())
      .filter(t => t >= lo && t <= hi);

    // Decimate if too dense
    const MAX_POINTS = 1200;
    if (times.length > MAX_POINTS) {
      const stride = Math.ceil(times.length / MAX_POINTS);
      times = times.filter((_, idx) => idx % stride === 0);
    }

    const dataMap = new Map<number, ChartDataPoint>();
    times.forEach(t => {
      const point: ChartDataPoint = { time: t };
      signals.forEach((signal, index) => {
        // Find nearest sample to t
        let nearest = signal.data[0];
        let minDiff = Math.abs(nearest.time.getTime() - t);
        for (const s of signal.data) {
          const diff = Math.abs(s.time.getTime() - t);
          if (diff < minDiff) { minDiff = diff; nearest = s; }
        }
        point[signal.id] = nearest?.value === 1 ? index : index - 0.5;
      });
      dataMap.set(t, point);
    });

    return Array.from(dataMap.values()).sort((a, b) => a.time - b.time);
  }, [signals, timeDomain]);

  const formatTime = (tickItem: number) => {
    return format(new Date(tickItem), 'HH:mm');
  };

  // Uniform ticks every 10 minutes
  const ticks = React.useMemo(() => {
    if (!timeDomain) return undefined;
    const [start, end] = timeDomain;
    const step = 10 * 60 * 1000;
    const alignedStart = Math.floor(start / step) * step;
    const arr: number[] = [];
    for (let t = alignedStart; t <= end; t += step) arr.push(t);
    return arr;
  }, [timeDomain]);

  const formatYAxisLabel = (value: number) => {
    const signal = signals[value];
    return signal ? signal.name : '';
  };

  const getSignalStatus = (signal: DigitalSignalData): string => {
    if (!selectedTime) {
      return signal.currentValue === 1 ? 'ON' : 'OFF';
    }
    const point = signal.data.find(d => 
      Math.abs(d.time.getTime() - selectedTime.getTime()) < 900000 // 15 min tolerance
    );
    return point?.value === 1 ? 'ON' : 'OFF';
  };

  // Hover tooltip removed per requirement

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      setSize({ w: rect?.width || 0, h: rect?.height || 0 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!signals.length || !chartData.length) {
    return (
      <div className={styles.container}>
        <div className={styles.noData}>No digital signal data available</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.chartRow}>
        <div className={styles.chartArea}>
          <div className={styles.chartWrapper} ref={containerRef} style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 20, bottom: 40 }}
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
                  domain={[-0.5, signals.length - 0.5]}
                  ticks={signals.map((_, index) => index)}
                  tickFormatter={formatYAxisLabel}
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280', fontSize: 9 }}
                  width={140}
                />
                {/* Tooltip removed */}
                {crosshairActive && selectedTime && (
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
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: signal.color }}
                    connectNulls={true}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className={styles.overlay}>
              {signals.map((signal, idx) => {
                const status = getSignalStatus(signal);
                const top = 20; // chart margin top
                const bottom = 40; // chart margin bottom
                const h = size.h > 0 ? size.h : chartHeight; // fallback height matches dynamic height
                const innerH = Math.max(1, h - top - bottom);
                const y = top + ((idx + 0.25) / Math.max(1, signals.length)) * innerH;
                return (
                  <div
                    key={signal.id}
                    className={`${styles.rowStatus} ${status === 'ON' ? styles.on : styles.off}`}
                    style={{ top: y - 8 }}
                  >
                    {status}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* Status panel removed per request */}
      </div>
    </div>
  );
};

export default DigitalSignalTimeline;
