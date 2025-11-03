import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import TimeScrubber from '../components/TimeScrubber';
import DigitalSignalTimeline from '../components/DigitalSignalTimeline';
import AnalogChart from '../components/AnalogChart';
import styles from './VehicleDashboard.module.css';
import { useTimeContext } from '../context/TimeContext';

interface VehicleMetric {
  id: string;
  name: string;
  unit: string;
  color: string;
  data: Array<{ time: Date; value: number }>;
  currentValue: number;
  avg: number;
  min: number;
  max: number;
  yAxisRange: { min: number; max: number };
}

interface DigitalStatusChart {
  id: string;
  name: string;
  metrics: Array<{
    id: string;
    name: string;
    color: string;
    data: Array<{ time: Date; value: number }>;
    currentValue: number;
  }>;
}

const VehicleDashboard: React.FC = () => {
  const [vehicleMetrics, setVehicleMetrics] = useState<VehicleMetric[]>([]);
  const [digitalStatusChart, setDigitalStatusChart] = useState<DigitalStatusChart | null>(null);
  const { selectedTime, setSelectedTime } = useTimeContext();
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [crosshairActive, setCrosshairActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Generate realistic vehicle data patterns
  const generateVehicleData = useCallback((): { analogMetrics: VehicleMetric[]; digitalChart: DigitalStatusChart } => {
    const baseDate = parseISO('2025-10-27');
    const startTime = new Date(baseDate);
    startTime.setHours(0, 0, 0, 0);

    const intervalMinutes = 15;
    const totalPoints = Math.floor((24 * 60) / intervalMinutes);

    const digitalMetrics: Array<{
      id: string;
      name: string;
      color: string;
      data: Array<{ time: Date; value: number }>;
      currentValue: number;
    }> = [
      { id: 'D1', name: 'On-Track Status', color: '#ff6b35', data: [], currentValue: 1 },
      { id: 'D6', name: 'Park Brake Output', color: '#8b5cf6', data: [], currentValue: 0 },
      { id: 'D11', name: 'Front Rail Gear Down', color: '#2563eb', data: [], currentValue: 0 },
      { id: 'D12', name: 'Front Rail Gear Up', color: '#0ea5e9', data: [], currentValue: 0 },
      { id: 'D21', name: 'Rail Gear Up', color: '#a16207', data: [], currentValue: 0 },
      { id: 'D27', name: 'EWP Stowed', color: '#84cc16', data: [], currentValue: 0 }
    ];

    const createDigitalSeries = (windows: Array<[number, number]>) => {
      const points: Array<{ time: Date; value: number }> = [];
      const currentTime = new Date(startTime);
      for (let i = 0; i < totalPoints; i++) {
        const hourValue = currentTime.getHours() + currentTime.getMinutes() / 60;
        const active = windows.some(([start, end]) => hourValue >= start && hourValue < end);
        points.push({ time: new Date(currentTime), value: active ? 1 : 0 });
        currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
      }
      return points;
    };

    digitalMetrics.forEach(metric => {
      let windows: Array<[number, number]> = [];
      switch (metric.id) {
        case 'D1':
          windows = [[0, 24]];
          break;
        case 'D6':
          windows = [[8, 10.5], [11.5, 12.5], [13.5, 14.25]];
          break;
        case 'D11':
          windows = [[11, 11.75]];
          break;
        case 'D12':
          windows = [[11.5, 12.75]];
          break;
        case 'D21':
          windows = [[12.0, 13.25]];
          break;
        case 'D27':
          windows = [[7.5, 8.25], [12.5, 13.5]];
          break;
        default:
          windows = [];
      }
      metric.data = createDigitalSeries(windows);
      metric.currentValue = metric.data[metric.data.length - 1]?.value ?? 0;
    });

    const analogMetrics: VehicleMetric[] = [
      {
        id: 'A5',
        name: 'Primary Air Pressure - PSI 1',
        unit: 'PSI',
        color: '#2563eb',
        data: [],
        currentValue: 0,
        avg: 0,
        min: 0,
        max: 0,
        yAxisRange: { min: 0, max: 120 }
      },
      {
        id: 'A9',
        name: 'EWP Jib Tilt Angle - Degree',
        unit: '°',
        color: '#0ea5e9',
        data: [],
        currentValue: 0,
        avg: 0,
        min: -120,
        max: 0,
        yAxisRange: { min: -120, max: 10 }
      },
      {
        id: 'A14',
        name: 'Engine Speed - rpm',
        unit: 'rpm',
        color: '#f97316',
        data: [],
        currentValue: 0,
        avg: 0,
        min: 0,
        max: 0,
        yAxisRange: { min: 0, max: 1200 }
      },
      {
        id: 'A15',
        name: 'Hydraulic Brake Pressures - PSI',
        unit: 'PSI',
        color: '#10b981',
        data: [],
        currentValue: 0,
        avg: 0,
        min: 0,
        max: 0,
        yAxisRange: { min: -1, max: 1 }
      }
    ];

    const createAnalogSeries = (generator: (hourValue: number) => number) => {
      const dataPoints: Array<{ time: Date; value: number }> = [];
      const currentTime = new Date(startTime);
      for (let i = 0; i < totalPoints; i++) {
        const hourValue = currentTime.getHours() + currentTime.getMinutes() / 60;
        dataPoints.push({ time: new Date(currentTime), value: generator(hourValue) });
        currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
      }
      return dataPoints;
    };

    analogMetrics.forEach(metric => {
      let dataPoints: Array<{ time: Date; value: number }> = [];
      if (metric.id === 'A5') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.75) return 110;
          if (hourValue >= 13 && hourValue < 14.5) return 95 + Math.sin((hourValue - 13) * Math.PI) * 5;
          return 0;
        });
      } else if (metric.id === 'A9') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.5) return -100;
          if (hourValue >= 13 && hourValue < 13.75) return -40;
          return 0;
        });
      } else if (metric.id === 'A14') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.5) return 900;
          if (hourValue >= 13 && hourValue < 14) return 600;
          return 0;
        });
      } else if (metric.id === 'A15') {
        dataPoints = createAnalogSeries(hourValue => {
          if (hourValue >= 9 && hourValue < 9.5) return 0.4;
          if (hourValue >= 13 && hourValue < 14) return 0.6;
          return 0;
        });
      }

      metric.data = dataPoints;
      metric.currentValue = dataPoints[dataPoints.length - 1]?.value ?? 0;
      const values = dataPoints.map(d => d.value);
      metric.avg = values.reduce((a, b) => a + b, 0) / values.length;
      metric.min = Math.min(...values);
      metric.max = Math.max(...values);
    });

    return {
      analogMetrics,
      digitalChart: {
        id: 'digital-status',
        name: 'Digital Status Indicators',
        metrics: digitalMetrics
      }
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Prefer external API, fall back to local JSON if unavailable
        let json: any;
        try {
          const apiUrl = new URL('https://no-reply.com.au/smart_data_link/get_charts_data_1');
          apiUrl.search = window.location.search; // pass through any query params
          const apiRes = await fetch(apiUrl.toString(), {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
          });
          if (!apiRes.ok) throw new Error('api failed');
          json = await apiRes.json();
        } catch {
          const resLocal = await fetch('/data/telemetry.json', {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
          });
          if (!resLocal.ok) throw new Error('no json');
          json = await resLocal.json();
        }
        // Unwrap common API envelope { status, message, data }
        const payload: any = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
        // Normalize possible server payloads into common structure
        // Prefer json.times, but also accept 'timestamps' variants and string times
        const pick = (...paths: string[]): any => {
          for (const p of paths) {
            const v = (payload as any)?.[p];
            if (v != null) return v;
          }
          return undefined;
        };
        const timesRaw: any[] = Array.isArray(pick('times', 'timeStamps', 'timestamps')) ? pick('times', 'timeStamps', 'timestamps') : [];
        const normalizeTimes = (arr: any[]): number[] => {
          const nums = arr.map((t: any) => typeof t === 'number' ? t : Date.parse(String(t))).filter((n: number) => Number.isFinite(n));
          if (!nums.length) return [];
          const max = Math.max(...nums);
          // If looks like seconds precision (10 digits), convert to ms
          if (max < 1e12) return nums.map(n => n * 1000);
          return nums;
        };
        const times: number[] = normalizeTimes(timesRaw);
        const toSeries = (values: number[]) => values.map((v: number, idx: number) => {
          const base = times[idx] ?? (times[0] ?? Date.now()) + idx * 60000;
          return { time: new Date(base), value: Number(v) };
        });
        const toSeriesTriplet = (avgVals: number[], minVals?: number[] | null, maxVals?: number[] | null) => {
          return avgVals.map((v: number, idx: number) => {
            const base = times[idx] ?? (times[0] ?? Date.now()) + idx * 60000;
            const avg = Number(v);
            const min = Number(minVals?.[idx]);
            const max = Number(maxVals?.[idx]);
            return { time: new Date(base), avg, min: Number.isFinite(min) ? min : avg, max: Number.isFinite(max) ? max : avg } as any;
          });
        };
        const computeScale = (vals: number[], range?: { min: number; max: number }): number => {
          if (!range || !vals.length) return 1;
          const vmin = Math.min(...vals);
          const vmax = Math.max(...vals);
          if (vmin >= range.min && vmax <= range.max) return 1;
          const factors = [10, 100, 1000];
          for (const f of factors) {
            const vmind = vmin / f;
            const vmaxd = vmax / f;
            if (vmind >= range.min && vmaxd <= range.max) return 1 / f;
          }
          return 1;
        };

        let digitalChart: DigitalStatusChart = {
          id: 'digital-status',
          name: 'Digital Status Indicators',
          metrics: (pick('digitalSignals', 'digitals', 'digital') || []).map((s: any) => ({
            id: String(s.id),
            name: String(s.name ?? s.id),
            color: String(s.color ?? '#999'),
            data: toSeries(s.values || []),
            currentValue: Number((s.values || []).slice(-1)[0] ?? 0)
          }))
        };

        const analogSignalsArr: any[] = (pick('analogSignals', 'analogs', 'analog') || []);
        const analogMetrics: VehicleMetric[] = analogSignalsArr.map((s: any) => {
          const avgRaw: number[] = (s.values ?? s.avg ?? s.average ?? []).map((v: any) => Number(v));
          const minsRaw: number[] | undefined = (s.mins ?? s.minValues ?? s.min ?? null)?.map?.((v: any) => Number(v));
          const maxsRaw: number[] | undefined = (s.maxs ?? s.maxValues ?? s.max ?? null)?.map?.((v: any) => Number(v));
          const scale = computeScale(avgRaw, s.yAxisRange ? { min: Number(s.yAxisRange.min), max: Number(s.yAxisRange.max) } : undefined);
          const avgScaled = avgRaw.map(v => v * scale);
          let minsScaled = minsRaw ? minsRaw.map(v => v * scale) : undefined;
          let maxsScaled = maxsRaw ? maxsRaw.map(v => v * scale) : undefined;
          const isAllZero = (arr?: number[]) => Array.isArray(arr) && arr.every((n: number) => !Number.isFinite(n) || n === 0);
          if (isAllZero(minsScaled)) minsScaled = undefined;
          if (isAllZero(maxsScaled)) maxsScaled = undefined;
          const data = (minsScaled || maxsScaled) ? toSeriesTriplet(avgScaled, minsScaled, maxsScaled) : toSeries(avgScaled);
          const values = avgScaled;
          return {
            id: String(s.id),
            name: String(s.name ?? s.id),
            unit: String(s.unit ?? ''),
            color: String(s.color ?? '#3b82f6'),
            data: data as any,
            currentValue: Number(values.slice(-1)[0] ?? 0),
            avg: values.length ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0,
            min: values.length ? (minsScaled && minsScaled.length ? Math.min(...minsScaled) : Math.min(...values)) : 0,
            max: values.length ? (maxsScaled && maxsScaled.length ? Math.max(...maxsScaled) : Math.max(...values)) : 0,
            yAxisRange: s.yAxisRange ? { min: Number(s.yAxisRange.min), max: Number(s.yAxisRange.max) } : { min: 0, max: 100 }
          } as VehicleMetric;
        });

        // Optional per-second analog data embedded in telemetry.json
        // Expected shape: analogPerSecond: [{ id, name?, unit?, color?, yAxisRange?, points: [{ time: 'HH:mm:ss', avg, min, max }] }]
        let perSecondAnalogMinTs: number | null = null;
        let perSecondAnalogMaxTs: number | null = null;
        let perSecondDigitalMinTs: number | null = null;
        let perSecondDigitalMaxTs: number | null = null;
        // Digital per-second override
        if (!digitalChart.metrics.length && Array.isArray((payload as any).digitalPerSecond)) {
          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            const base = new Date(times[0] ?? Date.now());
            base.setHours(0, 0, 0, 0);
            return new Date(base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000);
          };
          const metrics = (payload.digitalPerSecond as Array<any>).map((series: any) => {
            const pts = (series.points || []).map((p: any) => ({ time: parseHMS(p.time), value: Number(p.value ?? 0) }));
            if (pts.length) {
              const localMin = pts[0].time.getTime();
              const localMax = pts[pts.length - 1].time.getTime();
              perSecondDigitalMinTs = perSecondDigitalMinTs === null ? localMin : Math.min(perSecondDigitalMinTs, localMin);
              perSecondDigitalMaxTs = perSecondDigitalMaxTs === null ? localMax : Math.max(perSecondDigitalMaxTs, localMax);
            }
            return {
              id: String(series.id),
              name: String(series.name ?? series.id),
              color: String(series.color ?? '#999'),
              data: pts,
              currentValue: pts.length ? Number(pts[pts.length - 1].value) : 0
            };
          });
          if (metrics.length) {
            digitalChart = {
              id: 'digital-status',
              name: 'Digital Status Indicators',
              metrics
            };
          }
        }
        if (!analogMetrics.length && Array.isArray((payload as any).analogPerSecond)) {
          const parseHMS = (hms: string) => {
            const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
            const base = new Date(times[0] ?? Date.now());
            base.setHours(0, 0, 0, 0);
            return new Date(base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000);
          };
          (payload.analogPerSecond as Array<any>).forEach(series => {
            const id = String(series.id);
          const rawPts = (series.points || []).map((r: any) => ({ time: parseHMS(r.time), avg: Number(r.avg), min: Number(r.min), max: Number(r.max), hms: String(r.time) }));
            const rawVals: number[] = [];
            rawPts.forEach((p: { avg: number; min: number; max: number }) => { rawVals.push(p.avg, p.min, p.max); });
            const scale = computeScale(rawVals, series.yAxisRange ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) } : undefined);
            const pts = rawPts.map((p: { time: Date; avg: number; min: number; max: number; hms: string }) => ({ time: p.time, avg: p.avg * scale, min: p.min * scale, max: p.max * scale, rawAvg: p.avg, rawMin: p.min, rawMax: p.max, hms: p.hms }));
            if (!pts.length) return;
            const localMin = pts[0].time.getTime();
            const localMax = pts[pts.length - 1].time.getTime();
            perSecondAnalogMinTs = perSecondAnalogMinTs === null ? localMin : Math.min(perSecondAnalogMinTs, localMin);
            perSecondAnalogMaxTs = perSecondAnalogMaxTs === null ? localMax : Math.max(perSecondAnalogMaxTs, localMax);
            const values: number[] = pts.map((p: { avg: number }) => p.avg);
            const usedRange = series.yAxisRange ? { min: Number(series.yAxisRange.min), max: Number(series.yAxisRange.max) } : { min: Math.min(...values), max: Math.max(...values) };
            const existing = analogMetrics.find(m => m.id === id);
            if (existing) {
              (existing as any).data = pts;
              existing.avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
              existing.min = Math.min(...values);
              existing.max = Math.max(...values);
              (existing as any).yAxisRange = usedRange;
            } else {
              analogMetrics.push({
                id,
                name: String(series.name ?? id),
                unit: String(series.unit ?? ''),
                color: String(series.color ?? '#2563eb'),
                data: pts as any,
                currentValue: values[values.length - 1] ?? 0,
                avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
                min: Math.min(...values),
                max: Math.max(...values),
                yAxisRange: usedRange
              });
            }
          });
        }

        // If json invalid, fallback
        if ((!times || !times.length) && (!digitalChart.metrics.length && !analogMetrics.length)) {
          throw new Error('invalid');
        }

        setVehicleMetrics(analogMetrics);
        setDigitalStatusChart(digitalChart);

        // If per-second data exists, focus initial selection on that span; otherwise use full times range
        const minCandidates: number[] = [];
        if (typeof perSecondAnalogMinTs === 'number') minCandidates.push(perSecondAnalogMinTs);
        if (typeof perSecondDigitalMinTs === 'number') minCandidates.push(perSecondDigitalMinTs);
        const maxCandidates: number[] = [];
        if (typeof perSecondAnalogMaxTs === 'number') maxCandidates.push(perSecondAnalogMaxTs);
        if (typeof perSecondDigitalMaxTs === 'number') maxCandidates.push(perSecondDigitalMaxTs);
        const combinedMin = minCandidates.length ? Math.min(...minCandidates) : null;
        const combinedMax = maxCandidates.length ? Math.max(...maxCandidates) : null;
        if (combinedMin !== null && combinedMax !== null) {
          const start = new Date(combinedMin);
          const end = new Date(combinedMax);
          const center = new Date(Math.floor((start.getTime() + end.getTime()) / 2));
          setSelectedTime(center);
          setSelectionStart(start);
          setSelectionEnd(end);
        } else {
          const firstTs = times[0];
          const lastTs = times[times.length - 1];
          if (firstTs) {
            const first = new Date(firstTs);
            setSelectionStart(first);
          }
          if (lastTs) {
            const last = new Date(lastTs);
            setSelectionEnd(last);
            if (firstTs) {
              const center = new Date(Math.floor((firstTs + lastTs) / 2));
              setSelectedTime(center);
            } else {
              setSelectedTime(new Date(lastTs));
            }
          }
        }
        setLoading(false);
        return;
      } catch (e) {
        // fallback to generator
        const { analogMetrics, digitalChart } = generateVehicleData();
        setVehicleMetrics(analogMetrics);
        setDigitalStatusChart(digitalChart);
        try {
          const first = analogMetrics?.[0]?.data?.[0]?.time || digitalChart?.metrics?.[0]?.data?.[0]?.time || null;
          const last = analogMetrics?.[0]?.data?.[analogMetrics[0]?.data.length - 1]?.time || digitalChart?.metrics?.[0]?.data?.[digitalChart.metrics[0]?.data.length - 1]?.time || null;
          if (first) setSelectedTime(new Date(first));
          if (first) setSelectionStart(new Date(first));
          if (last) setSelectionEnd(new Date(last));
        } catch {}
        setLoading(false);
      }
    };
    load();
  }, [generateVehicleData]);

  // Prepare scrubber data as a dense per-minute grid using the full available range
  const scrubberData = useMemo(() => {
    // Prefer explicit selection range when available
    const candidateStarts: number[] = [];
    const candidateEnds: number[] = [];

    if (selectionStart) candidateStarts.push(selectionStart.getTime());
    if (selectionEnd) candidateEnds.push(selectionEnd.getTime());

    // Consider all analog series
    vehicleMetrics.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    // Consider all digital series
    digitalStatusChart?.metrics?.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    if (candidateStarts.length === 0 || candidateEnds.length === 0) return [];

    const startTs = Math.min(...candidateStarts);
    const endTs = Math.max(...candidateEnds);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) return [];

    const data: Array<{ time: number }> = [];
    const step = 60 * 1000; // 1 minute resolution
    for (let t = startTs; t <= endTs; t += step) {
      data.push({ time: t });
    }
    if (data.length === 0 || data[data.length - 1].time !== endTs) data.push({ time: endTs });
    return data;
  }, [vehicleMetrics, digitalStatusChart, selectionStart, selectionEnd]);

  // Calculate synchronized time domain from selection range
  const timeDomain = useMemo<[number, number] | null>(() => {
    if (selectionStart && selectionEnd) {
      return [selectionStart.getTime(), selectionEnd.getTime()];
    }

    // Fallback: compute union of available series
    const candidateStarts: number[] = [];
    const candidateEnds: number[] = [];

    vehicleMetrics.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    digitalStatusChart?.metrics?.forEach(m => {
      const first = m.data?.[0]?.time?.getTime?.();
      const last = m.data?.[m.data.length - 1]?.time?.getTime?.();
      if (typeof first === 'number') candidateStarts.push(first);
      if (typeof last === 'number') candidateEnds.push(last);
    });

    if (candidateStarts.length === 0 || candidateEnds.length === 0) return null;

    const first = Math.min(...candidateStarts);
    const last = Math.max(...candidateEnds);
    return [first, last];
  }, [selectionStart, selectionEnd, vehicleMetrics, digitalStatusChart]);

  // Handle time change from scrubber
  const handleTimeChange = useCallback((timestamp: number) => {
    setSelectedTime(new Date(timestamp));
    setCrosshairActive(true);
  }, []);

  // Handle selection range change from scrubber
  const handleSelectionChange = useCallback((startTimestamp: number, endTimestamp: number) => {
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    
    // Enforce MIN 1 hour range
    const minRangeMs = 60 * 60 * 1000; // 1 hour
    const rangeMs = endTimestamp - startTimestamp;
    const newStart = start;
    let newEnd = end;
    if (rangeMs < minRangeMs) {
      newEnd = new Date(startTimestamp + minRangeMs);
    }
    setSelectionStart(newStart);
    setSelectionEnd(newEnd);
    
    // Update selected time to center of range if needed
    const centerTime = new Date((newStart.getTime() + newEnd.getTime()) / 2);
    setSelectedTime(centerTime);
  }, []);

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // Intentionally no-op: keep pointer/red-line fixed unless knob is dragged
  }, []);

  return (
    <div className={styles.dashboard}>
      <div className={styles.topPanel}>
        <div className={styles.headerBar}>
          <div className={styles.headerTitle}>Smart Data Link</div>
          <div className={styles.headerStatus}>
            <span className={styles.headerLabel}>Time:</span>
            <span className={styles.headerValue}>
              {selectedTime ? format(selectedTime, 'HH:mm:ss') : '—'}
            </span>
          </div>
        </div>
        {scrubberData.length > 0 && (
          <TimeScrubber
            data={scrubberData}
            selectedTime={selectedTime?.getTime() || null}
            selectionStart={selectionStart?.getTime() || null}
            selectionEnd={selectionEnd?.getTime() || null}
            onTimeChange={handleTimeChange}
            onSelectionChange={handleSelectionChange}
            onHover={handleHover}
          />
        )}
      </div>

      <div className={styles.scrollArea}>
        {loading && (
          <div className={styles.loaderOverlay}>
            <div className={styles.loader}>
              <div className={styles.loaderRing} />
              <div className={styles.loaderDot} />
            </div>
          </div>
        )}
        {/* Digital Signal Timeline Chart */}
        {digitalStatusChart && digitalStatusChart.metrics.length > 0 && (
          <DigitalSignalTimeline
            signals={digitalStatusChart.metrics}
            selectedTime={selectedTime}
            crosshairActive={crosshairActive}
            timeDomain={timeDomain}
          />
        )}

        {/* Analog Charts */}
        <div className={styles.chartsContainer}>
          {vehicleMetrics.map(metric => (
            <AnalogChart
              key={metric.id}
              id={metric.id}
              name={metric.name}
              unit={metric.unit}
              color={metric.color}
              data={metric.data}
              yAxisRange={metric.yAxisRange}
              selectedTime={selectedTime}
              crosshairActive={crosshairActive}
              timeDomain={timeDomain}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default VehicleDashboard;