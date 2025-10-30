let charts = [];
let chartContainers = [];

// Global hover synchronization variables
let globalHoverTime = null;
let isUpdatingFromHover = false;
let globalAnalogData = {};


// Floating label that shows the current cursor time (used by charts & timeline)
function createOrUpdateRedlineLabel(timeValue) {
  if (!timeValue) return;

  let el = document.getElementById('redlineTimeLabel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'redlineTimeLabel';
    Object.assign(el.style, {
      position: 'absolute',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff',
      fontSize: '11px',
      padding: '3px 6px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: '9999',
      transition: 'opacity 120ms',
      opacity: '0',
    });
    document.body.appendChild(el);
  }

  // Prefer the main digital chart canvas; never anchor to the timeline canvas
  let canvas = null;

  // 1) Prefer the main digital chart if visible
  const preferred = document.getElementById('signalChart');
  if (preferred && preferred.offsetParent !== null) {
    canvas = preferred;
  }

  // 2) Otherwise pick any visible Chart.js canvas, but skip the timeline (#overviewChart)
  if (!canvas) {
    canvas = Array.from(document.querySelectorAll('canvas')).find(c => {
      if (c.id === 'overviewChart') return false; // skip timeline canvas
      const r = c.getBoundingClientRect();
      return c.offsetParent !== null && r.width > 10 && r.height > 10;
    });
  }

  if (!canvas) { el.style.opacity = '0'; return; }

  const rect = canvas.getBoundingClientRect();
  const label = new Date(Number(timeValue)).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  el.textContent = label;

  // Try to get x-pixel from the chart scale
  let xPixel = NaN;
  const chart = Chart.getChart?.(canvas) || canvas.__chartjsInstance || canvas._chart;
  try { if (chart?.scales?.x) xPixel = chart.scales.x.getPixelForValue(Number(timeValue)); } catch {}

  // Fallback if needed
  if (Number.isNaN(xPixel)) {
    if (window.allTimes?.length) {
      const start = Number(window.allTimes[0]);
      const end = Number(window.allTimes[window.allTimes.length - 1]);
      const p = Math.max(0, Math.min(1, (Number(timeValue) - start) / (end - start)));
      xPixel = p * rect.width;
    } else {
      xPixel = rect.width / 2;
    }
  }

  const labelW = el.offsetWidth || 60;
  const left = rect.left + xPixel - labelW / 2;
  el.style.left = `${Math.max(6, Math.min(left, rect.right - labelW - 6))}px`;
  el.style.top = `${rect.top - 28}px`;
  el.style.opacity = '1';
}


// make available to timeline-scrubber.js
window.createOrUpdateRedlineLabel = createOrUpdateRedlineLabel;


export async function initializeCharts(signalData, gpsCoordinates) {
    // Clear previous charts and data
    charts = [];
    chartContainers = [];
    globalAnalogData = {};
    globalHoverTime = null;

    // Clear existing analog charts
    const analogChartsContainer = document.getElementById('analogChartsContainer');
    if (analogChartsContainer) {
        analogChartsContainer.innerHTML = '';
    }

    // Register chart plugins
    registerChartPlugins();

    // Process the actual data from JSON files
    const { grouped, allTimes } = organizeChartData(signalData);

    console.log('Organized chart data:', grouped);
    console.log('All times:', allTimes.length, 'time points');
    // ✅ Make the master time axis available globally for timeline + map sync
    window.allTimes = allTimes.map(t => new Date(t).getTime());
    console.log("✅ window.allTimes SET:", window.allTimes.length);

    // Create digital chart
    const digitalChart = createDigitalChart(grouped, allTimes);

    // Create analog charts (now stores data globally for sync)
    createAnalogCharts(grouped, allTimes);

    // Initialize chart synchronization after all charts are created
    // setTimeout(() => {
    //     initializeChartSync();
    // }, 100);

    console.log('Total charts created:', charts.length);

    return digitalChart;
}

function registerChartPlugins() {
    // Register Vertical Line Plugin
    Chart.register({
        id: 'verticalLinePlugin',
        afterDraw: (chart, args, options) => {
            if (chart.options.verticalLineX !== undefined && chart.options.showVerticalLine === true) {
                const ctx = chart.ctx;
                const xPixel = chart.scales.x.getPixelForValue(chart.options.verticalLineX);

                // Ensure the line stays within the chart area bounds
                if (xPixel >= chart.chartArea.left && xPixel <= chart.chartArea.right) {
                    ctx.save();
                    ctx.beginPath();
                    // Constrain the line to only the chart area, not extending beyond y-axis
                    ctx.moveTo(xPixel, chart.chartArea.top);
                    ctx.lineTo(xPixel, chart.chartArea.bottom);
                    ctx.strokeStyle = options?.lineColor || 'rgba(255, 0, 0, 0.7)';
                    ctx.lineWidth = options?.lineWidth || 1;
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    });

    // Custom plugin to draw signal names OUTSIDE the chart area - adjusted for reduced padding
    Chart.register({
        id: 'signalLabelsPlugin',
        afterDatasetsDraw: (chart, args, options) => {
            if (chart.canvas.id !== 'signalChart') return;

            const ctx = chart.ctx;
            const chartArea = chart.chartArea;

            chart.data.datasets.forEach((dataset, i) => {
                if (dataset.data.length > 0) {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;

                    if (meta.data.length > 0) {
                        const firstPoint = meta.data[0];
                        ctx.save();
                        ctx.font = '10px Inter, Arial'; // Reduced font size and added Inter
                        ctx.fillStyle = dataset.borderColor;
                        ctx.textAlign = 'right';
                        ctx.textBaseline = 'middle';
                        const yPos = firstPoint.y;

                        // Split text at bracket for better readability
                        const fullText = dataset.label;
                        const bracketIndex = fullText.indexOf('(');

                        if (bracketIndex > 0) {
                            // Split into two lines: title and bracket content
                            const titleText = fullText.substring(0, bracketIndex).trim();
                            const bracketText = fullText.substring(bracketIndex).trim();

                            // Draw title text above - positioned closer to chart
                            ctx.fillText(titleText, chartArea.left - 8, yPos - 5); // Reduced spacing
                            // Draw bracket text below
                            ctx.fillText(bracketText, chartArea.left - 8, yPos + 5);
                        } else {
                            // No bracket, draw single line - positioned closer to chart
                            ctx.fillText(fullText, chartArea.left - 8, yPos);
                        }

                        ctx.restore();
                    }
                }
            });
        }
    });
}

function organizeChartData(processedData) {
    // Extract unique times and sort them - preserve full timestamp precision
    const allTimes = [...new Set(processedData.map(item => item.time))].sort();
    const grouped = {};

    // Group data by chartName
    processedData.forEach(item => {
        if (!item.chartName || item.chartName.trim() === '') {
            return; // Skip items without chart names
        }

        if (!grouped[item.chartName]) {
            grouped[item.chartName] = {
                data: [],
                chartType: item.chartType || 'Digital' // Default to Digital if not specified
            };
        }
        grouped[item.chartName].data.push(item);
    });

    // Sort data by time for each chart
    for (const chartName in grouped) {
        grouped[chartName].data.sort((a, b) => new Date(a.time) - new Date(b.time));

        // Remove duplicate time entries, keeping the last one for each timestamp
        const uniqueData = [];
        const timeMap = new Map();

        grouped[chartName].data.forEach(item => {
            timeMap.set(item.time, item);
        });

        // Convert back to array, preserving the chronological order
        for (const time of allTimes) {
            if (timeMap.has(time)) {
                uniqueData.push(timeMap.get(time));
            }
        }

        grouped[chartName].data = uniqueData;
    }

    return { allTimes, grouped };
}

function createDigitalChart(grouped, allTimes) {
    const digitalDataset = {};
    const digitalChartNames = [];

    // Extract digital chart data
    for (const chartName in grouped) {
        if (grouped[chartName].chartType === 'Digital') {
            digitalChartNames.push(chartName);
            digitalDataset[chartName] = grouped[chartName].data.map(item =>
                item.value !== undefined ? item.value : 0
            );
        }
    }

    // If no digital charts found, create a sample one for demonstration
    if (digitalChartNames.length === 0) {
        console.warn('No digital chart data found, creating sample digital signals');
        // const sampleSignals = ['GPS Status', 'Signal 1', 'Signal 2'];
        // sampleSignals.forEach(signalName => {
        //     digitalChartNames.push(signalName);
        //     digitalDataset[signalName] = allTimes.map((_, index) => index % 3 === 0 ? 1 : 0);
        // });
    }

    const SPACING = 2;
    const digitalDatasets = digitalChartNames.map((name, index) => {
        const offset = (digitalChartNames.length - 1 - index) * SPACING;
        const colors = getChartColors(name, index);

        return {
            label: name,
            data: allTimes.map((t, i) => ({
                x: new Date(t).getTime(),
                y: Number((digitalDataset[name][i] + offset).toFixed(2))
            })),
            borderColor: colors.borderColor,
            backgroundColor: colors.backgroundColor,
            stepped: 'before',
            fill: {
                target: {
                    value: offset
                }
            },
            tension: 0,
            originalData: digitalDataset[name]
        };
    });

    const digitalChartData = {
        // labels: allTimes,
        datasets: digitalDatasets
    };

    // Better height calculation for digital chart
    const BASE_HEIGHT = 60;
    const PER_SIGNAL_HEIGHT = 50;
    const PADDING = 40;

    const digitalChartHeight = BASE_HEIGHT + (digitalChartNames.length * PER_SIGNAL_HEIGHT) + PADDING;

    // Set digital container height
    const digitalContainer = document.getElementById('digitalSignalContainer');
    digitalContainer.style.height = `${digitalChartHeight}px`;

    // Create value display elements for each signal
    digitalChartNames.forEach((name, index) => {
        const colors = getChartColors(name, index);

        // Extract signal identifier (like D1, D6, etc.)
        const signalMatch = name.match(/\(([AD]\d+)\)/);
        const signalId = signalMatch ? signalMatch[1] : `D${index + 1}`;

        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'digital-value-simple';
        valueDisplay.id = `digitalValue-${signalId}`;
        valueDisplay.innerHTML = `<span style="color: ${colors.borderColor}; font-weight: bold;">${signalId}:</span> <span class="status" style="color: #666; font-weight: bold;">OFF</span>`;

        digitalContainer.appendChild(valueDisplay);
    });

    chartContainers.push(digitalContainer);

    // Common chart configuration
    const commonOptions = getCommonChartOptions();

    const digitalChartConfig = {
        type: 'line',
        data: digitalChartData,
        options: {
            ...commonOptions,
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: false,
            // onHover: (event, elements, chart) => {
            //     handleDigitalChartHover(event, chart);
            // },
            // onMouseMove: (event, elements, chart) => {
            //     handleDigitalChartHover(event, chart);
            // },
            plugins: {
                ...commonOptions.plugins,
                signalLabelsPlugin: {
                    enabled: true
                },
                tooltip: {
                    enabled: false
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        onPanComplete: function (context) {
                            syncZoom(context);
                        }
                    },
                    zoom: {
                        wheel: {
                            enabled: false,
                        },
                        pinch: {
                            enabled: false
                        },
                        mode: 'x',
                        onZoomComplete: function (context) {
                            syncZoom(context);
                        }
                    }
                }
            },
            scales: {
                ...commonOptions.scales,
                x: {
                    ...commonOptions.scales.x,
                    display: true,
                    ticks: {
                        source: 'data',
                        // autoSkip: false,
                        // maxRotation: 45,
                        // maxTicksLimit: 24,
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    min: -0.5,
                    max: digitalChartNames.length * SPACING - 0.5,
                    ticks: {
                        display: false,
                    },
                    grid: {
                        display: true,
                        color: function (context) {
                            if (context.tick && digitalChartNames.some((_, idx) =>
                                Math.abs(context.tick.value - ((digitalChartNames.length - 1 - idx) * SPACING)) < 0.1)) {
                                return 'rgba(0, 0, 0, 0.15)';
                            }
                            return 'rgba(0, 0, 0, 0.05)';
                        }
                    },
                    title: {
                        display: false
                    },
                    border: {
                        display: true
                    }
                }
            },
            layout: {
                padding: {
                    left: 95,  // MATCH analog charts exactly
                    right: 50,  // MATCH analog charts exactly  
                    top: 5,
                    bottom: 5
                }
            }
        }
    };

    // Create the digital chart
    const digitalCtx = document.getElementById('signalChart').getContext('2d');
    const digitalChart = new Chart(digitalCtx, digitalChartConfig);
    charts.push(digitalChart);
    window.digitalChart = digitalChart;
    // Position digital value displays after chart is rendered
    setTimeout(() => {
        positionDigitalValueDisplays(digitalChart, digitalChartNames);
    }, 100);

    return digitalChart;
}

function createAnalogCharts(grouped, allTimes) {
    const analogList = [];
    const analogChartsContainer = document.getElementById('analogChartsContainer');
    const commonOptions = getCommonChartOptions();

    for (const chartName in grouped) {
        if (grouped[chartName].chartType === 'Analogue') {
            const chartData = grouped[chartName].data;

            // Store chart data globally for sync access
            globalAnalogData[chartName] = chartData;

            // Create container for this analog chart - more compact
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container analog-chart-container';
            // chartContainer.style.height = '100px';
            chartContainer.style.position = 'relative';
            chartContainers.push(chartContainer);

            // Create canvas for chart
            const canvas = document.createElement('canvas');
            canvas.id = `chart-${chartName.replace(/\s+/g, '-').toLowerCase()}`;
            canvas.className = 'analog-chart-canvas';

            // Set canvas to use more of the container height
            // canvas.style.height = '80px';
            canvas.style.width = '100%';

            chartContainer.appendChild(canvas);

            // Extract signal identifier (like A5, A11, etc.)
            const signalMatch = chartName.match(/\(([AD]\d+)\)/);
            const signalId = signalMatch ? signalMatch[1] : `A${Math.floor(Math.random() * 100)}`;

            // Create custom analog value display - positioned more efficiently
            const colors = getChartColors(chartName, 0);
            const valueDisplay = document.createElement('div');
            valueDisplay.className = 'analog-value-custom';
            valueDisplay.id = `analogValue-${signalId}`;
            valueDisplay.style.position = 'absolute';
            valueDisplay.style.right = '10px'; // Reduced from 15px
            valueDisplay.style.top = '50%';
            valueDisplay.style.transform = 'translateY(-50%)';
            valueDisplay.style.zIndex = '100';
            valueDisplay.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            valueDisplay.style.padding = '6px 8px'; // Reduced padding
            valueDisplay.style.borderRadius = '4px'; // Reduced border radius
            valueDisplay.style.border = '1px solid #e5e5e5';
            valueDisplay.style.fontSize = '10px'; // Reduced font size
            valueDisplay.style.lineHeight = '1.2';
            valueDisplay.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)';
            valueDisplay.innerHTML = `
                <div style="color: ${colors.borderColor}; font-weight: bold; margin-bottom: 3px; font-size: 11px;">${signalId}</div>
                <div style="color: #374151;">
                    <div>Avg: <span class="avg" style="font-weight: bold;">0</span></div>
                    <div>Min: <span class="min" style="font-weight: bold;">0</span></div>
                    <div>Max: <span class="max" style="font-weight: bold;">0</span></div>
                </div>
            `;

            chartContainer.appendChild(valueDisplay);

            // Add Y-axis value indicators - positioned more efficiently
            const yAxisValues = document.createElement('div');
            yAxisValues.className = 'analog-y-values';
            yAxisValues.id = `yValues-${signalId}`;
            yAxisValues.style.position = 'absolute';
            yAxisValues.style.left = '10px'; // Reduced from 15px
            yAxisValues.style.top = '2px'; // Reduced spacing
            yAxisValues.style.bottom = '8px';
            yAxisValues.style.width = '85px'; // Reduced from 100px
            yAxisValues.style.display = 'flex';
            yAxisValues.style.flexDirection = 'column';
            yAxisValues.style.justifyContent = 'space-between';
            yAxisValues.style.alignItems = 'flex-end';
            yAxisValues.style.fontSize = '10px'; // Reduced font size
            yAxisValues.style.color = '#666';
            yAxisValues.style.maxHeight = '128px';
            yAxisValues.style.marginTop = '5px';
            yAxisValues.style.zIndex = '100';
            yAxisValues.style.pointerEvents = 'none';

            // Calculate min/max from data for initial display
            const allValues = chartData.flatMap(d => [d.avg, d.min, d.max]).filter(v => v != null);
            const dataMin = Math.min(...allValues);
            const dataMax = Math.max(...allValues);
            const dataRange = dataMax - dataMin;
            const step = dataRange / 4;

            // Create 5 value indicators with smaller styling
            for (let i = 0; i < 2; i++) {
                const value = dataMax - (step * i);
                const valueDiv = document.createElement('div');
                valueDiv.className = `y-tick y-tick-${i}`;
                valueDiv.style.textAlign = 'right';
                valueDiv.style.paddingRight = '4px'; // Reduced padding
                valueDiv.style.fontWeight = 'normal';
                valueDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                valueDiv.style.padding = '1px 3px'; // Reduced padding
                valueDiv.style.borderRadius = '2px';
                valueDiv.style.marginBottom = '1px';
                valueDiv.textContent = Math.round(value).toLocaleString();
                yAxisValues.appendChild(valueDiv);
            }

            // chartContainer.appendChild(yAxisValues);

            // Add chart title - positioned more efficiently
            const chartTitle = document.createElement('div');
            chartTitle.className = 'analog-chart-title';
            chartTitle.style.position = 'absolute';
            // chartTitle.style.right = '0px'; // Reduced from 125px
            chartTitle.style.top = '4px'; // Reduced from 6px
            chartTitle.style.fontSize = '11px'; // Reduced font size
            chartTitle.style.fontWeight = 'bold';
            chartTitle.style.color = colors.borderColor;
            chartTitle.style.zIndex = '100';
            chartTitle.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            chartTitle.style.padding = '2px 4px'; // Reduced padding
            chartTitle.style.borderRadius = '3px';
            // chartTitle.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            chartTitle.style.paddingLeft = '103px';
            chartTitle.textContent = chartName;

            chartContainer.appendChild(chartTitle);

            // Add container to document
            analogChartsContainer.appendChild(chartContainer);

            // Create chart options with EXACT same padding as digital chart
            const analogChartOptions = {
                ...commonOptions,
                maintainAspectRatio: false,
                responsive: true,
                // onHover: (event, elements, chart) => {
                //     handleAnalogChartHover(event, chart, chartName, chartData);
                // },
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        enabled: false
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                            onPanComplete: syncZoom
                        },
                        zoom: {
                            wheel: {
                                enabled: false,
                            },
                            pinch: {
                                enabled: false
                            },
                            mode: 'x',
                            onZoomComplete: syncZoom
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: window.allTimes?.[0],
                        max: window.allTimes?.[window.allTimes.length - 1],
                        ticks: {
                            source: 'auto',
                            autoSkip: true,
                            maxTicksLimit: 8,
                            callback: (value) => {
                                return new Date(value).toLocaleTimeString('en-US', {
                                    hour12: false,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                });
                            },
                            font: { size: 10 }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.08)',
                            lineWidth: 1
                        }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            display: true
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.08)',
                            lineWidth: 1
                        },
                        border: {
                            display: false
                        }
                    }
                },
                layout: {
                    padding: {
                        left: 75,  // EXACT same as digital chart
                        right: 50,  // EXACT same as digital chart
                        top: 5,
                        bottom: 5
                    }
                }
            };

            // Create chart with minimal padding
            const chart = createChart(canvas, {
                datasets: [
                    {
                        label: 'Average',
                        data: chartData.map(d => ({
                            x: new Date(d.time).getTime(),
                            y: d.avg
                        })),
                        borderColor: colors.borderColor,
                        borderWidth: 2,
                        tension: 0.4,
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 3
                    },
                    {
                        label: 'Min',
                        data: chartData.map(d => ({
                            x: new Date(d.time).getTime(),
                            y: d.min
                        })),
                        borderColor: 'rgba(0,0,0,0)',
                        backgroundColor: colors.backgroundColor,
                        fill: '+1',
                        pointRadius: 0,
                        tension: 0.4
                    },
                    {
                        label: 'Max',
                        data: chartData.map(d => ({
                            x: new Date(d.time).getTime(),
                            y: d.max
                        })),
                        borderColor: 'rgba(0,0,0,0)',
                        backgroundColor: colors.backgroundColor,
                        fill: '+2',
                        pointRadius: 0,
                        tension: 0.4
                    }
                ]

            }, analogChartOptions, 'line');
            analogList.push(chart);

            // Resize chart to use the available height
            setTimeout(() => {
                chart.resize(canvas.offsetWidth, 160);
            }, 100);

            // Initialize value display with first data point
            if (chartData.length > 0) {
                const firstData = chartData[0];
                updateAnalogValueDisplay(signalId, firstData.avg, firstData.min, firstData.max);
            }
        }
    }
    window.analogCharts = analogList;
}

// SYNCHRONIZED HOVER FUNCTIONS

// function handleDigitalChartHover(event, chart) {
//     if (isUpdatingFromHover) return; // Prevent infinite loops

//     const canvasPosition = Chart.helpers.getRelativePosition(event, chart);
//     const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);

//     if (!dataX) return;

//     globalHoverTime = dataX;
//     isUpdatingFromHover = true;

//     // Update all charts with this hover time
//     syncAllChartsToTime(dataX);

//     isUpdatingFromHover = false;
// }

// function handleAnalogChartHover(event, chart, chartName, chartData) {
//     if (isUpdatingFromHover) return; // Prevent infinite loops

//     const canvasPosition = Chart.helpers.getRelativePosition(event, chart);
//     const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);

//     if (!dataX) return;

//     globalHoverTime = dataX;
//     isUpdatingFromHover = true;

//     // Update all charts with this hover time
//     syncAllChartsToTime(dataX);

//     isUpdatingFromHover = false;
// }

// function syncAllChartsToTime(hoverTime) {
//     // Update time display first
//     updateTimeDisplay(hoverTime);

//     // Update all digital displays
//     updateAllDigitalDisplays(hoverTime);

//     // Update all analog displays
//     updateAllAnalogDisplays(hoverTime);
// }

// ✅ Timeline → Charts sync entry point
window.updateChartsAtTime = function (timeMs) {
    if (!timeMs) return;
    window.currentTimeValue = Number(timeMs);

    charts.forEach(c => {
        if (!c?.options?.scales?.x) return;
        c.options.showVerticalLine = true;
        c.options.verticalLineX = window.currentTimeValue;
        c.update('none');
    });

    updateTimeDisplay(window.currentTimeValue);
    updateAllDigitalDisplays(window.currentTimeValue);
    updateAllAnalogDisplays(window.currentTimeValue);

    if (typeof window.createOrUpdateRedlineLabel === 'function') {
        window.createOrUpdateRedlineLabel(window.currentTimeValue);
    }
};


export function updateAllDigitalDisplays(hoverTime) {
    const digitalChart = charts.find(chart => chart.canvas.id === 'signalChart');
    if (!digitalChart) return;

    const labels = window.allTimes || [];
    const closestIndex = findClosestTimeIndex(labels, hoverTime);

    const timeDisplay = document.getElementById('digitalTimeDisplay');
    if (timeDisplay && labels[closestIndex] != null) {
        const time = new Date(Number(labels[closestIndex]));
        timeDisplay.textContent = `Time: ${time.toLocaleTimeString('en-US', {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
        })}`;
    }

    digitalChart.data.datasets.forEach((dataset, index) => {
        const originalValue = dataset.originalData ? dataset.originalData[closestIndex] : 0;
        const status = originalValue === 1 ? 'ON' : 'OFF';

        const signalMatch = dataset.label.match(/\(([AD]\d+)\)/);
        const signalId = signalMatch ? signalMatch[1] : `D${index + 1}`;

        const valueDisplay = document.getElementById(`digitalValue-${signalId}`);
        if (valueDisplay) {
            const statusElement = valueDisplay.querySelector('.status');
            if (statusElement) {
                statusElement.textContent = status;
                statusElement.style.color = '#374151';
                statusElement.style.fontWeight = 'bold';
            }
        }
    });
}


function updateAllAnalogDisplays(hoverTime) {
    // Update all analog charts using stored data
    for (const chartName in globalAnalogData) {
        const chartData = globalAnalogData[chartName];

        if (chartData && chartData.length > 0) {
            // Find closest data point
            const closestIndex = findClosestTimeIndex(chartData.map(d => d.time), hoverTime);
            const dataPoint = chartData[closestIndex];

            if (dataPoint) {
                const avgValue = dataPoint.avg || 0;
                const minValue = dataPoint.min || 0;
                const maxValue = dataPoint.max || 0;

                // Extract signal identifier
                const signalMatch = chartName.match(/\(([AD]\d+)\)/);
                const signalId = signalMatch ? signalMatch[1] : '';

                // Update value display
                updateAnalogValueDisplay(signalId, avgValue, minValue, maxValue);

                // Find the chart and update Y-axis values
                // const chart = charts.find(c => c.canvas.id.includes(chartName.replace(/\s+/g, '-').toLowerCase()));
                // if (chart) {
                //     updateYAxisValues(signalId, chart);
                // }
            }
        }
    }
}

function findClosestTimeIndex(timeArray, targetTime) {
    if (!timeArray || timeArray.length === 0) return 0;

    let closestIndex = 0;
    let minDiff = Math.abs(new Date(timeArray[0]) - new Date(targetTime));

    for (let i = 1; i < timeArray.length; i++) {
        const diff = Math.abs(new Date(timeArray[i]) - new Date(targetTime));
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }

    return closestIndex;
}

// function initializeChartSync() {
//     addMouseLeaveHandlers();

//     // Global mouse move listener to clear sync when leaving chart areas
//     document.addEventListener('mousemove', (event) => {
//         if (!globalHoverTime) return;

//         // Check if mouse is over any chart
//         const chartElements = document.querySelectorAll('canvas');
//         let isOverChart = false;

//         chartElements.forEach(canvas => {
//             const rect = canvas.getBoundingClientRect();
//             if (event.clientX >= rect.left && event.clientX <= rect.right &&
//                 event.clientY >= rect.top && event.clientY <= rect.bottom) {
//                 isOverChart = true;
//             }
//         });

//         if (!isOverChart) {
//             globalHoverTime = null;
//         }
//     });
// }

// function addMouseLeaveHandlers() {
//     // Add to digital chart
//     const digitalCanvas = document.getElementById('signalChart');
//     if (digitalCanvas) {
//         digitalCanvas.addEventListener('mouseleave', () => {
//             globalHoverTime = null;
//         });
//     }

//     // Add to all analog charts
//     charts.forEach(chart => {
//         if (chart.canvas.id.startsWith('chart-')) {
//             chart.canvas.addEventListener('mouseleave', () => {
//                 globalHoverTime = null;
//             });
//         }
//     });
// }

// UTILITY FUNCTIONS

function updateYAxisValues(signalId, chart) {
    const yAxisValues = document.getElementById(`yValues-${signalId}`);
    if (!yAxisValues || !chart.scales.y) return;

    const yScale = chart.scales.y;
    const min = yScale.min;
    const max = yScale.max;
    const range = max - min;
    const step = range / 4;

    // Update the 5 tick values based on current chart scale
    for (let i = 0; i < 5; i++) {
        const tickElement = yAxisValues.querySelector(`.y-tick-${i}`);
        if (tickElement) {
            const value = max - (step * i);
            // Format large numbers nicely
            if (Math.abs(value) >= 1000000) {
                tickElement.textContent = (value / 1000000).toFixed(1) + 'M';
            } else if (Math.abs(value) >= 1000) {
                tickElement.textContent = (value / 1000).toFixed(1) + 'K';
            } else {
                tickElement.textContent = Math.round(value).toLocaleString();
            }
        }
    }
}

function positionDigitalValueDisplays(chart, digitalChartNames) {
    if (!chart || !chart.chartArea) return;

    const chartArea = chart.chartArea;
    const canvas = chart.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const container = canvas.parentElement;

    digitalChartNames.forEach((name, index) => {
        const meta = chart.getDatasetMeta(index);
        if (meta.hidden || meta.data.length === 0) return;

        // Extract signal identifier (like D1, D6, etc.)
        const signalMatch = name.match(/\(([AD]\d+)\)/);
        const signalId = signalMatch ? signalMatch[1] : `D${index + 1}`;

        const valueDisplay = document.getElementById(`digitalValue-${signalId}`);
        if (!valueDisplay) return;

        // Get Y position from the first visible data point
        const yPos = meta.data[0].y;

        // Calculate position relative to container
        const topOffset = yPos - (valueDisplay.offsetHeight / 2);

        valueDisplay.style.position = 'absolute';
        valueDisplay.style.top = `${topOffset}px`;
        valueDisplay.style.right = '10px';
        valueDisplay.style.zIndex = '100';
    });
}

function updateAnalogValueDisplay(signalId, avgValue, minValue, maxValue) {
    const valueDisplay = document.getElementById(`analogValue-${signalId}`);
    if (valueDisplay) {
        const avgElement = valueDisplay.querySelector('.avg');
        const minElement = valueDisplay.querySelector('.min');
        const maxElement = valueDisplay.querySelector('.max');

        if (avgElement) avgElement.textContent = Math.round(avgValue);
        if (minElement) minElement.textContent = Math.round(minValue);
        if (maxElement) maxElement.textContent = Math.round(maxValue);
    }
}

function updateTimeDisplay(timeValue) {
    // Update time display at top right
    const timeDisplay = document.getElementById('timeDisplay');
    if (timeDisplay) {
        const time = new Date(timeValue);
        timeDisplay.textContent = `Time: ${time.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    }
}

function getCommonChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        transitions: {
            active: {
                animation: {
                    duration: 0
                }
            }
        },
        elements: {
            point: {
                radius: 0,
                hoverRadius: 2
            },
            line: {
                borderWidth: 2,
                tension: 0
            }
        },
        // STANDARDIZED layout padding across ALL charts
        layout: {
            padding: {
                left: 100,  // Consistent across all charts
                right: 50,  // Consistent across all charts
                top: 5,
                bottom: 5
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                ...getEnhancedTooltipOptions(),
                animation: false
            },
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x',
                    modifierKey: 'shift',
                    onPanComplete: function (context) {
                        throttledSyncZoom(context);
                    }
                },
                zoom: {
                    wheel: {
                        enabled: true,
                        speed: 0.1,
                        modifierKey: null
                    },
                    pinch: {
                        enabled: true
                    },
                    drag: {
                        enabled: false
                    },
                    mode: 'x',
                    onZoomComplete: function (context) {
                        throttledSyncZoom(context);
                        if (window.updateScrubberFromChart) {
                            window.updateScrubberFromChart(context.chart);
                        }
                    }
                }
            },
            verticalLinePlugin: {
                lineColor: 'rgba(255, 0, 0, 0.7)',
                lineWidth: 1
            }
        },
        // interaction: {
        //     intersect: false,
        //     mode: 'index'
        // },
        scales: {
            x: {
                type: 'time',
                time: {
                    parser: 'yyyy-MM-dd HH:mm:ss',
                    tooltipFormat: 'yyyy-MM-dd HH:mm',
                    unit: 'hour',
                    stepSize: 1,
                    displayFormats: {
                        hour: 'HH:mm',
                        minute: 'HH:mm',
                        day: 'MMM d'
                    }
                },
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                ticks: {
                    source: 'data',
                    autoSkip: false,
                    maxRotation: 45,
                    maxTicksLimit: 24,
                    font: {
                        size: 10
                    }
                },
                position: 'bottom'
            },
            y: {
                ticks: {
                    display: false
                },
                grid: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                border: {
                    display: false
                }
            },
        },
        showVerticalLine: false
    };
}

function getEnhancedTooltipOptions() {
    return {
        enabled: true,
        mode: 'index',
        intersect: false,
        animation: false,
        callbacks: {
            title: function (tooltipItems) {
                // Always show the current cursor time, not the data point time
                if (window.currentTimeValue) {
                    return new Date(window.currentTimeValue).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false // This ensures 24-hour format
                    });
                }
                return tooltipItems[0] ? new Date(tooltipItems[0].label).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }) : '';
            },
            label: function (context) {
                // Show the actual data value, but we know it's for the cursor time
                const dataset = context.dataset;
                const value = context.raw;

                if (dataset.label === 'Average' || dataset.label.includes('Average')) {
                    return `Average: ${value?.toFixed(2) || 'No data'}`;
                } else if (dataset.label === 'Min') {
                    return `Min: ${value?.toFixed(2) || 'No data'}`;
                } else if (dataset.label === 'Max') {
                    return `Max: ${value?.toFixed(2) || 'No data'}`;
                } else if (dataset.originalData) {
                    // Digital signal
                    const originalValue = dataset.originalData[context.dataIndex];
                    return `${dataset.label}: ${originalValue === 1 ? 'ON' : 'OFF'}`;
                }

                return `${dataset.label}: ${value ?? 'No data'}`;
            }
        }
    };
}

function createChart(ctx, data, options, type) {
    const chart = new Chart(ctx, { type, data, options });
    charts.push(chart);
    return chart;
}

function syncZoom({ chart }) {
    const { min, max } = chart.scales.x;
    charts.forEach((targetChart) => {
        if (targetChart !== chart && targetChart.scales && targetChart.scales.x) {
            targetChart.options.scales.x.min = min;
            targetChart.options.scales.x.max = max;
            targetChart.update('none');
        }
    });
}

// Create throttled sync zoom function
const throttledSyncZoom = throttle(syncZoom, 16);

function createInlineDigitalLabels(digitalChart) {
    const overlay = document.getElementById('digitalLabelsOverlay');
    if (!overlay || !digitalChart) return;

    overlay.innerHTML = ''; // Clear any existing labels

    // Wait for chart to be rendered
    setTimeout(() => {
        if (!digitalChart || !digitalChart.chartArea) return;

        const chartArea = digitalChart.chartArea;
        const datasets = digitalChart.data.datasets;

        // For each digital signal, create a label at the appropriate y position
        datasets.forEach((dataset, index) => {
            const meta = digitalChart.getDatasetMeta(index);
            if (meta.hidden || meta.data.length === 0) return;

            // Get Y position from the first visible data point
            const yPos = meta.data[0].y;

            const label = document.createElement('div');
            label.className = 'digital-label';
            label.textContent = dataset.label;
            label.style.top = `${yPos}px`;
            label.style.borderLeft = `3px solid ${dataset.borderColor}`;
            label.style.color = dataset.borderColor;

            overlay.appendChild(label);
        });
    }, 100);
}

function getChartColors(chartName, index) {
    const fallbackColorMap = {
        "On-Track Status (D1)": {
            borderColor: "#FD7341",
            backgroundColor: "#E3EDD0",
            strokeColor: "#43CB59"
        },
        "Jib Chain Fault (D2)": {
            borderColor: "#08C417",
            backgroundColor: "#C9E8F8",
            strokeColor: "#C2CE5A"
        },
        "Hydraulic Oil Level Low (D3)": {
            borderColor: "#4C51C4",
            backgroundColor: "#DFD4CB",
            strokeColor: "#180EA0"
        },
        "Vigilance Active (D4)": {
            borderColor: "#FB2369",
            backgroundColor: "#E5DCF0",
            strokeColor: "#627046"
        },
        "Horn  Active (D5)": {
            borderColor: "#6A720F",
            backgroundColor: "#FBC8CB",
            strokeColor: "#ED8001"
        },
        "Park Brake Output (D6)": {
            borderColor: "#A42083",
            backgroundColor: "#F6EEC9",
            strokeColor: "#C0E81B"
        },
        "Service Brake Output (D7)": {
            borderColor: "#520352",
            backgroundColor: "#D2CBDA",
            strokeColor: "#DEC213"
        },
        "Headlight Status (D8)": {
            borderColor: "#3D9977",
            backgroundColor: "#E3F8DF",
            strokeColor: "#702CE2"
        },
        "Beacon Status (D9)": {
            borderColor: "#C7818D",
            backgroundColor: "#F8EFCB",
            strokeColor: "#2C4355"
        },
        "Vigilance Acknowledge (D10)": {
            borderColor: "#DD63D5",
            backgroundColor: "#C9EEF3",
            strokeColor: "#4C5BEC"
        },
        "Front Rail Gear Down\r\n (D11)": {
            borderColor: "#87677C",
            backgroundColor: "#E9F7E0",
            strokeColor: "#DE9FE1"
        },
        "Front Rail Gear Up\r\n (D12)": {
            borderColor: "#52A397",
            backgroundColor: "#EEF8E8",
            strokeColor: "#024676"
        },
        "Rear Rail Gear Down\r\n (D13)": {
            borderColor: "#F82610",
            backgroundColor: "#DCD9E5",
            strokeColor: "#0DD387"
        },
        "Rear Rail Gear Up\r\n (D14)": {
            borderColor: "#27A0A7",
            backgroundColor: "#DEF9F1",
            strokeColor: "#6808D8"
        },
        "Basket Overweight\r\n (D15)": {
            borderColor: "#DE4604",
            backgroundColor: "#CCFAFA",
            strokeColor: "#24B19B"
        },
        "EWP Overload (D16)": {
            borderColor: "#0A8014",
            backgroundColor: "#F8F8DE",
            strokeColor: "#A8D79B"
        },
        "Rail Reverse Active\r\n (D17)": {
            borderColor: "#D78D72",
            backgroundColor: "#DCEBCD",
            strokeColor: "#4BA208"
        },
        "Drive Pump Active\r\n (D18)": {
            borderColor: "#B587CC",
            backgroundColor: "#F6FBDB",
            strokeColor: "#7DFE18"
        },
        "PTO Engaged\r\n (D19)": {
            borderColor: "#3E1668",
            backgroundColor: "#FEE2C9",
            strokeColor: "#7D8EA7"
        },
        "Vehicle Overspeed\r\n (D20)": {
            borderColor: "#E2F5D0",
            backgroundColor: "#CCECD3",
            strokeColor: "#5AE308"
        },
        "Rail Gear Up\r\n (D21)": {
            borderColor: "#A64E2A",
            backgroundColor: "#EACCD9",
            strokeColor: "#6D254F"
        },
        "Rail Gear Down\r\n (D22)": {
            borderColor: "#B5FE2B",
            backgroundColor: "#F2DCE4",
            strokeColor: "#414D53"
        },
        "Vigilance Enabled\r\n (D23)": {
            borderColor: "#913439",
            backgroundColor: "#CAE5E7",
            strokeColor: "#68AE4A"
        },
        "Vigilance Cutout\n (D24)": {
            borderColor: "#840E98",
            backgroundColor: "#F3E9E3",
            strokeColor: "#08DAD3"
        },
        "Rail Forward Active\n (D25)": {
            borderColor: "#729C46",
            backgroundColor: "#DADEF8",
            strokeColor: "#2B2579"
        },
        "Emergency Controls Active (D26)": {
            borderColor: "#0FEC32",
            backgroundColor: "#DCD1F8",
            strokeColor: "#86FDFF"
        },
        "EWP Stowed\r\n (D27)": {
            borderColor: "#C6DB4A",
            backgroundColor: "#CFF0EE",
            strokeColor: "#0DD8BB"
        },
        "Emergency Stop Active\r\n (D28)": {
            borderColor: "#50E521",
            backgroundColor: "#FAE0F4",
            strokeColor: "#9545A1"
        },
        "Anti-Entrapment Active\n (D29)": {
            borderColor: "#41E068",
            backgroundColor: "#D1F7F8",
            strokeColor: "#96801C"
        },
        "EWP Foot Pedal\n (D30)": {
            borderColor: "#D37D61",
            backgroundColor: "#FAE2F7",
            strokeColor: "#6C35EA"
        },
        "Accelerator Pedal Position (A1)": {
            borderColor: "#6C38B6",
            backgroundColor: "#CFDCDB",
            strokeColor: "#EBBB5E"
        },
        "Rail Speed (A2)": {
            borderColor: "#E9BEC1",
            backgroundColor: "#F1ECFB",
            strokeColor: "#A642A0"
        },
        "Wheel Based Speed (A3)": {
            borderColor: "#2C7A71",
            backgroundColor: "#CDCCFC",
            strokeColor: "#A25B74"
        },
        "Hydraulic Oil Temperature (A4)": {
            borderColor: "#FC6586",
            backgroundColor: "#CDE4DD",
            strokeColor: "#018D34"
        },
        "Primary Air Pressure (A5)": {
            borderColor: "#64A568",
            backgroundColor: "#CCF1E1",
            strokeColor: "#7B298B"
        },
        "Secondary Air Pressure (A6)": {
            borderColor: "#D3AA5C",
            backgroundColor: "#E6D0CE",
            strokeColor: "#669A70"
        },
        "EWP Tele Position (A9)": {
            borderColor: "#CFC94C",
            backgroundColor: "#F7EAFB",
            strokeColor: "#C6B3C0"
        },
        "EWP Boom Angle (A10)": {
            borderColor: "#A2736C",
            backgroundColor: "#DED1E7",
            strokeColor: "#1873C8"
        },
        "EWP Jib Tilt Angle (A11)": {
            borderColor: "#341D45",
            backgroundColor: "#DCE8DF",
            strokeColor: "#E3B63E"
        },
        "EWP Slew Angle (A12)": {
            borderColor: "#024C5B",
            backgroundColor: "#E9D3E0",
            strokeColor: "#08FC8D"
        },
        "Park Brake Pressure (A13)": {
            borderColor: "#3F7064",
            backgroundColor: "#FBDED2",
            strokeColor: "#B2702B"
        },
        "Service Brake Pressure (A14)": {
            borderColor: "#7B8495",
            backgroundColor: "#D9EEDF",
            strokeColor: "#6F82C1"
        },
        "Chassis Angle (A15)": {
            borderColor: "#57CF9A",
            backgroundColor: "#D7EAD9",
            strokeColor: "#D0AC0E"
        },
        "Engine Speed (A16)": {
            borderColor: "#516451",
            backgroundColor: "#D7E0F1",
            strokeColor: "#ACE7AE"
        },
        "Hydraulic Brake Pressures (A17)": {
            borderColor: "#d11d4d",
            backgroundColor: "#cbf2d5",
            strokeColor: "#2e4297"
        },
        "Rail Chock Pressure (A18)": {
            borderColor: "#A3839A",
            backgroundColor: "#FEF0D0",
            strokeColor: "#A501BB"
        },
        "LH Road Chock Pressure (A19)": {
            borderColor: "#773FBA",
            backgroundColor: "#E1D3FE",
            strokeColor: "#3968CB"
        },
        "RH Road Chock Pressure (A20)": {
            borderColor: "#F5F2F9",
            backgroundColor: "#FDE2D2",
            strokeColor: "#AEE225"
        },
        "Rail Travel Distance (A25)": {
            borderColor: "#5464DB",
            backgroundColor: "#E4D1F8",
            strokeColor: "#FDA772"
        },
        "Rail Hours Travelled (A26)": {
            borderColor: "#80de01",
            backgroundColor: "#ebd0d0",
            strokeColor: "#c5df64"
        },
        "PTO Hours (A27)": {
            borderColor: "#7C6DC0",
            backgroundColor: "#F4E4F8",
            strokeColor: "#C78A12"
        },
        "Analogue 28 (A28)": {
            borderColor: "#d9dfe1",
            backgroundColor: "#2d829a",
            strokeColor: "#537274"
        }

    };

    // Return color from map if found, otherwise return default color
    return fallbackColorMap[chartName] || {
        borderColor: '#1e88e5',
        backgroundColor: 'rgba(30, 136, 229, 0.2)'
    };
}

// Add throttle function if not already present
function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Export functions for external use
export { charts, chartContainers, syncZoom, createInlineDigitalLabels };

