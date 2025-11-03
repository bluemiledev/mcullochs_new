import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import styles from './AnalogChart.module.css';

interface AnalogChartProps {
  id: string;
  name: string;
  unit: string;
  color: string;
  data: Array<{ time: Date; value: number }>;
  yAxisRange: { min: number; max: number };
  selectedTime: Date | null;
  crosshairActive: boolean;
  timeDomain: [number, number] | null;
  perSecondStats?: { avg: number[]; min: number[]; max: number[] } | null;
}

const AnalogChart: React.FC<AnalogChartProps> = ({
  id,
  name,
  unit,
  color,
  data,
  yAxisRange,
  selectedTime,
  crosshairActive,
  timeDomain,
  perSecondStats,
}) => {
  const chartData = useMemo(() => {
    const toPoint = (d: any) => {
      const avg = d.avg ?? d.value;
      const min = d.min ?? d.value;
      const max = d.max ?? d.value;
      return { time: d.time.getTime(), avg, min, max };
    };

    // 1) Filter to visible domain with small padding to avoid gaps at edges
    const PAD = 5 * 60 * 1000; // 5 min pad
    const filtered = (() => {
      if (!timeDomain) return data.map(toPoint);
      const [start, end] = timeDomain;
      const lo = start - PAD;
      const hi = end + PAD;
      return data
        .filter((d: any) => {
          const t = d.time.getTime();
          return t >= lo && t <= hi;
        })
        .map(toPoint);
    })();

    // 2) Decimate to a manageable number of points (SVG-friendly)
    const MAX_POINTS = 1500;
    if (filtered.length <= MAX_POINTS) {
      return filtered.map(p => ({
        time: p.time,
        avg: p.avg,
        min: p.min,
        max: p.max,
        deltaTop: p.max - p.avg,
        deltaBottom: -(p.avg - p.min)
      }));
    }

    const bucketSize = Math.ceil(filtered.length / MAX_POINTS);
    const out: Array<{ time: number; avg: number; min: number; max: number; deltaTop: number; deltaBottom: number }> = [];
    for (let i = 0; i < filtered.length; i += bucketSize) {
      const bucket = filtered.slice(i, i + bucketSize);
      let min = Infinity, max = -Infinity, sum = 0;
      const t = bucket[0].time;
      for (const p of bucket) {
        if (p.min < min) min = p.min;
        if (p.max > max) max = p.max;
        sum += p.avg;
      }
      const avg = sum / bucket.length;
      out.push({
        time: t,
        avg,
        min,
        max,
        deltaTop: max - avg,
        deltaBottom: -(avg - min)
      });
    }
    return out;
  }, [data, timeDomain]);

  // Build a per-second lookup map from the original data to preserve exact second stats
  const perSecondMap = useMemo(() => {
    const map = new Map<string, { avg: number; min: number; max: number }>();
    (data as any[]).forEach((d: any) => {
      const key = (d.hms as string) || format(d.time, 'HH:mm:ss');
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
    return format(new Date(tick), 'HH:mm');
  };

  const formatYAxisLabel = (value: number) => {
    return `${value} ${unit}`;
  };

  const getPointAtTime = (time: Date | null): { time: number; avg: number; min: number; max: number } | null => {
    if (!time || chartData.length === 0) return null;
    const timestamp = time.getTime();

    // Prefer exact per-second values when available from original data
    if (perSecondMap.size > 0) {
      const key = format(time, 'HH:mm:ss');
      const hit = perSecondMap.get(key);
      if (hit) return { time: time.getTime(), avg: hit.avg, min: hit.min, max: hit.max };
    }

    let closest = chartData[0];
    let minDiff = Math.abs(closest.time - timestamp);

    for (const point of chartData) {
      const diff = Math.abs(point.time - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point as any;
      }
    }

    const step = chartData.length > 1 ? Math.abs(chartData[1].time - chartData[0].time) : 0;
    const tolerance = Math.max(60 * 1000, step > 0 ? Math.floor(step / 2) : 0);
    if (minDiff > tolerance) return null;
    const c: any = closest;
    const avg: number = Number(c.avg);
    const min: number = Number.isFinite(Number(c.min)) ? Number(c.min) : avg;
    const max: number = Number.isFinite(Number(c.max)) ? Number(c.max) : avg;
    return { time: c.time, avg, min, max };
  };

  // Hover tooltip removed per requirement

  const visibleStats = useMemo(() => {
    const compute = (arr: Array<{ avg: number }>) => {
      if (!arr.length) return { avg: 0, min: 0, max: 0 };
      const values = arr.map(d => d.avg);
      return {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };

    if (!timeDomain) return compute(chartData);

    const visibleData = chartData.filter(d => d.time >= timeDomain[0] && d.time <= timeDomain[1]);
    return visibleData.length ? compute(visibleData) : compute(chartData);
  }, [chartData, timeDomain]);

  const xDomain = useMemo(() => {
    if (!chartData.length) return ['dataMin', 'dataMax'] as const;
    const dataMin = chartData[0].time;
    const dataMax = chartData[chartData.length - 1].time;
    if (!timeDomain) return ['dataMin', 'dataMax'] as const;
    const hasAny = chartData.some(d => d.time >= timeDomain[0] && d.time <= timeDomain[1]);
    return hasAny ? (timeDomain as [number, number]) : ([dataMin, dataMax] as [number, number]);
  }, [chartData, timeDomain]);

  // Uniform ticks every 10 minutes to match scrubber
  const ticks = useMemo(() => {
    if (!timeDomain) return undefined;
    const [start, end] = timeDomain;
    const step = 10 * 60 * 1000;
    const alignedStart = Math.floor(start / step) * step;
    const arr: number[] = [];
    for (let t = alignedStart; t <= end; t += step) arr.push(t);
    return arr;
  }, [timeDomain]);

  const selectedPoint = getPointAtTime(selectedTime);
  const displayStats = selectedPoint
    ? { avg: selectedPoint.avg, min: selectedPoint.min, max: selectedPoint.max }
    : visibleStats;

  return (
    <div className={styles.container}>
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
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 40 }}
            stackOffset="sign"
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
              domain={[yAxisRange.min, yAxisRange.max]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              width={115}
              label={{ value: unit, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />
            {/* Tooltip removed */}
            {/* Show only avg line; min/max colored areas removed per request */}
            <Line type="monotone" dataKey="avg" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} isAnimationActive={false} />
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
      {/* Per-time stats footer removed */}
    </div>
  );
};

export default AnalogChart;
