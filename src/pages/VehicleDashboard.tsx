import React, { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { format, parseISO } from 'date-fns';
import styles from './VehicleDashboard.module.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

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
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [crosshairActive, setCrosshairActive] = useState<boolean>(false);
  const dragModeRef = React.useRef<'none' | 'left' | 'right' | 'move'>('none');
  const lastPointerXRef = React.useRef<number | null>(null);
  const selectionStartRef = React.useRef<Date | null>(null);
  const selectionEndRef = React.useRef<Date | null>(null);

  useEffect(() => { selectionStartRef.current = selectionStart; }, [selectionStart]);
  useEffect(() => { selectionEndRef.current = selectionEnd; }, [selectionEnd]);

  // Crosshair plugin draws a vertical line at selectedTime
  const crosshairPlugin = React.useMemo(() => ({
    id: 'crosshairPlugin',
    afterDraw: (chart: any, _args: any, pluginOptions: any) => {
      if (!pluginOptions || !pluginOptions.show) return;
      const time: Date | null = pluginOptions?.selectedTime || null;
      if (!time) return;
      const xScale = chart?.scales?.x;
      if (!xScale) return;
      const x = xScale.getPixelForValue(time);
      if (!isFinite(x)) return;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = pluginOptions?.color || '#ef4444';
      ctx.lineWidth = pluginOptions?.lineWidth || 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    }
  }), []);

  const chartPlugins = React.useMemo(() => [
    { ...crosshairPlugin, selectedTime }
  ] as any, [crosshairPlugin, selectedTime]);

  const handleHover = useCallback((event: any, _elements: any, chart: any) => {
    const xScale = chart?.scales?.x;
    if (!xScale) return;
    const x = event?.x;
    if (typeof x !== 'number') return;
    const value = xScale.getValueForPixel(x);
    if (value !== undefined && value !== null && isFinite(value)) {
      setSelectedTime(new Date(value));
    }
  }, []);

  const getValueAtTime = useCallback((series: Array<{ time: Date; value: number }>, time: Date | null): number | null => {
    if (!time || !series || series.length === 0) return null;
    const target = time.getTime();
    let bestIndex = 0;
    let bestDiff = Math.abs(series[0].time.getTime() - target);
    for (let i = 1; i < series.length; i++) {
      const diff = Math.abs(series[i].time.getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
    return series[bestIndex].value;
  }, []);

  const formatAnalogValue = useCallback((metric: VehicleMetric, value: number | null | undefined, options?: { digits?: number }) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const digits = options?.digits ?? 1;
    switch (metric.id) {
      case 'A5':
      case 'A9':
      case 'A14':
        return value.toFixed(0);
      case 'A15':
        return value.toFixed(2);
      default:
        return value.toFixed(digits);
    }
  }, []);

  const getStatsForMetric = useCallback((metric: VehicleMetric) => {
    let points: Array<{ time: Date; value: number }> = [];
    if (selectionStart && selectionEnd) {
      const startMs = selectionStart.getTime();
      const endMs = selectionEnd.getTime();
      points = metric.data.filter(d => {
        const t = d.time.getTime();
        return t >= Math.min(startMs, endMs) && t <= Math.max(startMs, endMs);
      });
    } else if (selectedTime) {
      // Fallback: a moving 60-minute window centered on the red line
      const center = selectedTime.getTime();
      const halfWindow = 30 * 60 * 1000;
      points = metric.data.filter(d => {
        const t = d.time.getTime();
        return t >= center - halfWindow && t <= center + halfWindow;
      });
      if (points.length === 0) {
        // if sampling sparse, take nearest 2 points around selectedTime
        const times = metric.data.map(d => d.time.getTime());
        let nearestIdx = 0;
        let best = Math.abs(times[0] - center);
        for (let i = 1; i < times.length; i++) {
          const diff = Math.abs(times[i] - center);
          if (diff < best) { best = diff; nearestIdx = i; }
        }
        const slice = metric.data.slice(Math.max(0, nearestIdx - 1), Math.min(metric.data.length, nearestIdx + 2));
        points = slice.length > 0 ? slice : [metric.data[nearestIdx]];
      }
    } else {
      // initial
      points = metric.data;
    }
    const vals = points.map(p => p.value);
    if (vals.length === 0) return { avg: 0, min: 0, max: 0 };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { avg, min, max };
  }, [selectionStart, selectionEnd, selectedTime]);

  // Scrubber interaction plugin for top scrubber chart
  const scrubberPlugin = React.useMemo(() => ({
    id: 'scrubberInteraction',
    beforeEvent: (chart: any, args: any) => {
      const e = args.event;
      const xScale = chart?.scales?.x;
      if (!xScale) return;
      const toTime = (px: number) => {
        const v = xScale.getValueForPixel(px);
        return v !== undefined && v !== null && isFinite(v) ? new Date(v) : null;
      };
      const px = (e.native?.offsetX ?? e.x) as number;

      const left = selectionStart ? xScale.getPixelForValue(selectionStart) : null;
      const right = selectionEnd ? xScale.getPixelForValue(selectionEnd) : null;
      const minGapPx = 6;
      const clampToDomain = (date: Date) => {
        // clamp to visible scale range
        const min = xScale.min as number; // millis
        const max = xScale.max as number;
        const t = date.getTime();
        return new Date(Math.min(max, Math.max(min, t)));
      };
      const pxToMs = (dx: number) => {
        const v1 = xScale.getValueForPixel(0) as number;
        const v2 = xScale.getValueForPixel(dx) as number;
        return (v2 - v1);
      };

      const near = (a: number | null, b: number, radius = 12) => (a !== null ? Math.abs(a - b) <= radius : false);
      const inside = (x: number, a: number | null, b: number | null) => (a !== null && b !== null ? x >= Math.min(a, b) && x <= Math.max(a, b) : false);

      if (e.type === 'mousedown' || e.type === 'touchstart') {
        setCrosshairActive(true);
        lastPointerXRef.current = px;
        // decide drag mode
        if (near(left, px)) {
          dragModeRef.current = 'left';
        } else if (near(right, px)) {
          dragModeRef.current = 'right';
        } else if (inside(px, left, right)) {
          dragModeRef.current = 'move';
        } else {
          // Click on track: move the existing band (keep width); if none, create 1h band
          const clickedTime = toTime(px);
          if (clickedTime) {
            const currentStart = selectionStartRef.current || selectionStart;
            const currentEnd = selectionEndRef.current || selectionEnd;
            const widthMs = currentStart && currentEnd ? (currentEnd.getTime() - currentStart.getTime()) : (60 * 60 * 1000);
            let newStart = new Date(clickedTime.getTime() - widthMs / 2);
            let newEnd = new Date(clickedTime.getTime() + widthMs / 2);
            newStart = clampToDomain(newStart);
            newEnd = clampToDomain(newEnd);
            setSelectionStart(newStart);
            setSelectionEnd(newEnd);
            selectionStartRef.current = newStart;
            selectionEndRef.current = newEnd;
            dragModeRef.current = 'move';
          } else {
            dragModeRef.current = 'none';
          }
        }
        const t = toTime(px);
        if (t) setSelectedTime(t);
      }
      if (e.type === 'mouseup' || e.type === 'mouseout' || e.type === 'touchend') {
        setCrosshairActive(false);
        dragModeRef.current = 'none';
        lastPointerXRef.current = null;
      }
      if (e.type === 'mousemove' || e.type === 'touchmove') {
        setCrosshairActive(true);
        const t = toTime(px);
        if (t) setSelectedTime(t);

        const mode = dragModeRef.current;
        if (!mode) return;
        if (mode === 'left' && selectionEnd) {
          let candidateStart: Date | null = toTime(px);
          if (!candidateStart) candidateStart = selectionStartRef.current || selectionEndRef.current || null;
          if (!candidateStart) return;
          const newStart = clampToDomain(candidateStart);
          // Ensure minimum gap
          const endPx = xScale.getPixelForValue((selectionEndRef.current || selectionEnd) as Date);
          const startPx = xScale.getPixelForValue(newStart);
          if (endPx - startPx >= minGapPx) setSelectionStart(newStart);
          selectionStartRef.current = newStart;
        } else if (mode === 'right' && selectionStart) {
          let candidateEnd: Date | null = toTime(px);
          if (!candidateEnd) candidateEnd = selectionEndRef.current || selectionStartRef.current || null;
          if (!candidateEnd) return;
          const newEnd = clampToDomain(candidateEnd);
          const startPx = xScale.getPixelForValue((selectionStartRef.current || selectionStart) as Date);
          const endPx = xScale.getPixelForValue(newEnd);
          if (endPx - startPx >= minGapPx) setSelectionEnd(newEnd);
          selectionEndRef.current = newEnd;
        } else if (mode === 'move' && selectionStart && selectionEnd && lastPointerXRef.current !== null) {
          const dx = px - lastPointerXRef.current;
          lastPointerXRef.current = px;
          const deltaMs = pxToMs(dx);
          const baseStart = selectionStartRef.current || selectionStart;
          const baseEnd = selectionEndRef.current || selectionEnd;
          if (!baseStart || !baseEnd) return;
          const newStart = clampToDomain(new Date(baseStart.getTime() + deltaMs));
          const newEnd = clampToDomain(new Date(baseEnd.getTime() + deltaMs));
          setSelectionStart(newStart);
          setSelectionEnd(newEnd);
          selectionStartRef.current = newStart;
          selectionEndRef.current = newEnd;
        }
      }
    },
    afterDraw: (chart: any) => {
      const xScale = chart?.scales?.x;
      if (!xScale) return;

      // Draw selection range band with handles
      const selStart = selectionStartRef.current || selectionStart;
      const selEnd = selectionEndRef.current || selectionEnd;
      if (selStart && selEnd) {
        const x1 = xScale.getPixelForValue(selStart);
        const x2 = xScale.getPixelForValue(selEnd);
        const { top, bottom } = chart.chartArea;
        const leftX = Math.min(x1, x2);
        const rightX = Math.max(x1, x2);
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(leftX, top, rightX - leftX, bottom - top);
        ctx.fill();
        ctx.stroke();

        // Handles
        const drawHandle = (x: number) => {
          ctx.fillStyle = '#facc15';
          ctx.strokeStyle = '#a16207';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          // @ts-ignore
          ctx.roundRect?.(x - 6, top - 10, 12, 10, 2);
        // Fallback for older canvases
          if (!ctx.roundRect) ctx.rect(x - 6, top - 10, 12, 10);
          ctx.fill();
          ctx.stroke();
        };
        drawHandle(leftX);
        drawHandle(rightX);
        ctx.restore();
      }

      // Do not draw a third indicator (only two endpoints should be visible)
    }
  }), [selectedTime, selectionStart, selectionEnd]);

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
    const { analogMetrics, digitalChart } = generateVehicleData();
    setVehicleMetrics(analogMetrics);
    setDigitalStatusChart(digitalChart);
    // Initialize selected time to start of data so crosshair is visible
    try {
      const first = analogMetrics?.[0]?.data?.[0]?.time || digitalChart?.metrics?.[0]?.data?.[0]?.time || null;
      const last = analogMetrics?.[0]?.data?.[analogMetrics[0]?.data.length - 1]?.time || digitalChart?.metrics?.[0]?.data?.[digitalChart.metrics[0]?.data.length - 1]?.time || null;
      if (first) setSelectedTime(new Date(first));
      if (first) setSelectionStart(new Date(first));
      if (last) setSelectionEnd(new Date(last));
    } catch {}

    // Cleanup function to destroy charts when component unmounts
    return () => {
      ChartJS.unregister();
    };
  }, [generateVehicleData]);

  const getChartOptions = (metric: VehicleMetric): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: ({
      legend: {
        display: false,
      },
      tooltip: { enabled: false },
      crosshairPlugin: {
        selectedTime,
        show: crosshairActive,
        lineWidth: 2,
        color: '#ef4444'
      }
    } as any),
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm',
          },
        },
        grid: {
          color: '#e5e7eb',
          lineWidth: 1,
        },
        ticks: {
          font: {
            size: 8,
          },
          color: '#6b7280',
          maxTicksLimit: 12,
        },
        border: {
          display: false,
        },
      },
      y: {
        min: metric.yAxisRange.min,
        max: metric.yAxisRange.max,
        grid: {
          color: '#e5e7eb',
          lineWidth: 1,
        },
        ticks: {
          font: {
            size: 8,
          },
          color: '#6b7280',
          maxTicksLimit: 6,
          callback(value: any) {
            if (metric.id === 'A15') {
              return Number(value).toFixed(2);
            }
            if (metric.id === 'A5' || metric.id === 'A9' || metric.id === 'A14') {
              return Number(value).toFixed(0);
            }
            return Number(value).toFixed(1);
          },
        },
        border: {
          display: false,
        },
      },
    },
    elements: {
      point: {
        radius: 0,
        hoverRadius: 4,
      },
      line: {
        borderWidth: 1.5,
        tension: 0,
      },
    },
  });

  const getChartData = (metric: VehicleMetric) => ({
    labels: metric.data.map(d => d.time),
    datasets: [
      {
        label: metric.name,
        data: metric.data.map(d => d.value),
        borderColor: metric.color,
        backgroundColor: `${metric.color}10`,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0,
        borderWidth: 1.5,
      },
    ],
  });

  const getDigitalSingleChartOptions = (count: number) : ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: ({
      legend: { display: true, position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
      tooltip: { enabled: false },
      crosshairPlugin: {
        selectedTime,
        show: crosshairActive,
        lineWidth: 2,
        color: '#ef4444'
      }
    } as any),
    scales: {
      x: {
        type: 'time',
        time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
        grid: { color: '#e5e7eb' },
        ticks: { font: { size: 8 }, color: '#6b7280', maxTicksLimit: 12 },
        border: { display: false }
      },
      y: {
        min: -0.5,
        max: Math.max(1, count) + 0.5,
        ticks: {
          callback(value) {
            const idx = Number(value) - 1;
            return DIGITAL_ORDER[idx] || '';
          },
          color: '#6b7280',
          font: { size: 9 },
          maxTicksLimit: count + 2
        },
        grid: { color: '#f3f4f6' },
        border: { display: false }
      }
    },
    elements: {
      point: { radius: 0, hoverRadius: 3 },
      line: { borderWidth: 2, tension: 0 }
    }
  });

  const DIGITAL_ORDER = ['D1', 'D6', 'D11', 'D12', 'D21', 'D27'];

  const getDigitalCombinedData = () => {
    if (!digitalStatusChart) return { labels: [], datasets: [] };
    const sortedMetrics = [...digitalStatusChart.metrics].sort((a, b) => DIGITAL_ORDER.indexOf(a.id) - DIGITAL_ORDER.indexOf(b.id));
    const labels = sortedMetrics[0]?.data.map(d => d.time) || [];
    const SPACING = 1;
    return {
      labels,
    datasets: sortedMetrics.map((metric, index) => ({
        label: metric.name,
        data: metric.data.map(d => (d.value === 1 ? index + 1 : Number.NaN)),
        borderColor: metric.color,
        backgroundColor: metric.color,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0,
        borderWidth: 2,
        stepped: true,
        spanGaps: false
      }))
    };
  };


  return (
    <div className={styles.dashboard}>
      <div className={styles.topPanel}>
        <div className={styles.headerBar}>
          <div className={styles.headerTitle}>Smart Data Link</div>
          <div className={styles.headerStatus}>
            <span className={styles.headerLabel}>Time:</span>
            <span className={styles.headerValue}>{selectedTime ? format(selectedTime, 'HH:mm:ss') : '—'}</span>
          </div>
        </div>
        {vehicleMetrics.length > 0 && (
          <div className={styles.chartWrapper}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitle}>Time Range</div>
              <div className={styles.chartSummary}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Drag or hover to scrub all charts</span>
                </div>
              </div>
            </div>
            <div className={styles.scrubberContainer}>
              <Line
                data={{ labels: vehicleMetrics[0].data.map(d => d.time), datasets: [{ label: 'scrubber', data: vehicleMetrics[0].data.map(() => null as unknown as number), borderColor: 'transparent' }] }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: false,
                  events: ['mousemove', 'mouseout', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'],
                  plugins: ({
                    legend: { display: false },
                    tooltip: { enabled: false },
                    crosshairPlugin: { selectedTime, lineWidth: 2, color: '#ef4444' }
                  } as any),
                  scales: {
                    x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } }, grid: { color: '#e5e7eb' }, ticks: { color: '#6b7280', font: { size: 8 } }, border: { display: false } },
                    y: { display: false }
                  },
                  onHover: handleHover
                }}
                plugins={[...chartPlugins, scrubberPlugin] as any}
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.scrollArea}>
        {/* Digital chart temporarily removed */}

        <div className={styles.chartsContainer}>
          {vehicleMetrics.map(metric => (
            <div key={metric.id} className={styles.chartWrapper}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitle}>{metric.name} ({metric.id})</div>
                <div className={styles.chartSummary}>
                  {(() => { const s = getStatsForMetric(metric); return (
                    <>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Avg</span>
                        <span className={styles.summaryValue}>{formatAnalogValue(metric, s.avg, { digits: 1 })}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Min</span>
                        <span className={styles.summaryValue}>{formatAnalogValue(metric, s.min, { digits: 1 })}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Max</span>
                        <span className={styles.summaryValue}>{formatAnalogValue(metric, s.max, { digits: 1 })}</span>
                      </div>
                    </>
                  );})()}
                </div>
              </div>
              <div className={styles.chartContainer}>
                <Line data={getChartData(metric)} options={getChartOptions(metric)} plugins={chartPlugins as any} />
              </div>
              <div className={styles.currentStatus}>
                <span className={styles.statusValue} style={{ color: metric.color }}>
                  {formatAnalogValue(metric, getValueAtTime(metric.data, selectedTime), { digits: 1 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VehicleDashboard;