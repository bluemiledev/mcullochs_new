// This file handles the interactions between charts and maps, including cursor synchronization and highlighting.

import { charts } from './chart-controller.js';

let isHovering = false;
let currentTimeValue = null;
let lastMouseTime = 0;
let rafId = null;
window.isUpdatingTimelineFromChart = false;

export function setupSynchronizedCursors(allCharts, markers, highlightMapPointByTime, resetMapHighlights) {
    // Add optimized mouse tracking to all chart canvases
    allCharts.forEach((chart, chartIndex) => {
        const canvas = chart.canvas;

        // canvas.addEventListener('mousemove', throttledMouseMove((event) => {
        //     // Indicate we're hovering over a chart
        //     isHovering = true;

        //     // Calculate position relative to the canvas itself
        //     const rect = canvas.getBoundingClientRect();
        //     const xPos = event.clientX - rect.left;

        //     // Get time value from x position
        //     const targetTimeValue = chart.scales.x.getValueForPixel(xPos);

        //     // Avoid unnecessary updates for same time
        //     if (Math.abs(targetTimeValue - (currentTimeValue || 0)) < 1000) { // 1 second threshold
        //         return;
        //     }

        //     currentTimeValue = targetTimeValue;
        //     window.currentTimeValue = targetTimeValue;

        //     // Cancel previous animation frame
        //     if (rafId) {
        //         cancelAnimationFrame(rafId);
        //     }

        //     // Schedule update for next frame
        //     rafId = requestAnimationFrame(() => {
        //         updateAllChartsOptimized(allCharts, targetTimeValue);
        //         highlightMapPointByTime(targetTimeValue);
        //     });
        // }, 16)); // ~60fps limit

        canvas.addEventListener('mouseleave', debounce(() => {
            isHovering = false;
            currentTimeValue = null;
            window.currentTimeValue = null;

            // Clear with animation frame for smoothness
            requestAnimationFrame(() => {
                clearAllHighlights(allCharts);
                resetMapHighlights();
            });
        }, 100));
    });

    // Optimized document leave handler
    document.addEventListener('mouseleave', () => {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        isHovering = false;
        currentTimeValue = null;
        window.currentTimeValue = null;

        clearAllHighlights(allCharts);
        resetMapHighlights();
    });
}

function updateAllChartsOptimized(allCharts, targetTimeValue) {
    const targetTimeString = new Date(targetTimeValue).toLocaleString();

    // ✅ Create or reuse floating label for redline time
    let redlineLabel = document.getElementById('redlineTimeLabel');
    if (!redlineLabel) {
        redlineLabel = document.createElement('div');
        redlineLabel.id = 'redlineTimeLabel';
        redlineLabel.style.position = 'absolute';
        redlineLabel.style.background = 'rgba(0,0,0,0.8)';
        redlineLabel.style.color = '#fff';
        redlineLabel.style.fontSize = '11px';
        redlineLabel.style.padding = '2px 5px';
        redlineLabel.style.borderRadius = '3px';
        redlineLabel.style.whiteSpace = 'nowrap';
        redlineLabel.style.pointerEvents = 'none';
        redlineLabel.style.zIndex = '9999';
        redlineLabel.style.display = 'none';
        document.body.appendChild(redlineLabel);
    }

    // Batch all chart updates
    const chartUpdates = [];

    allCharts.forEach((chart) => {
        // Skip if chart is not visible or not properly initialized
        if (!chart.canvas.offsetParent || !chart.scales || !chart.scales.x || !chart.chartArea) return;

        chart.options.showVerticalLine = true;
        chart.options.verticalLineX = targetTimeValue;

        // Find active elements using optimized search
        const activeElements = findActiveElementsFast(chart, targetTimeValue);

        chartUpdates.push(() => {
            try {
                const pixelX = chart.scales.x.getPixelForValue(targetTimeValue);
                if (activeElements.length > 0 && !isNaN(pixelX)) {
                    const validElements = activeElements.filter(el => {
                        const dataset = chart.data.datasets[el.datasetIndex];
                        return dataset && dataset.data && el.index < dataset.data.length;
                    });

                    if (validElements.length > 0) {
                        chart.tooltip.setActiveElements(validElements, {
                            x: pixelX,
                            y: chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2
                        });
                    } else {
                        chart.tooltip.setActiveElements([]);
                    }
                } else {
                    chart.tooltip.setActiveElements([]);
                }
            } catch (error) {
                console.warn('Error setting tooltip:', error);
                chart.tooltip.setActiveElements([]);
            }
            chart.update('none');
        });
    });

    // Execute all updates
    chartUpdates.forEach(update => update());

    // ✅ Update floating label position and time text
    try {
        const firstVisibleChart = allCharts.find(c => c.canvas && c.chartArea);
        if (firstVisibleChart) {
            const rect = firstVisibleChart.canvas.getBoundingClientRect();
            const xPixel = firstVisibleChart.scales.x.getPixelForValue(targetTimeValue);

            if (!isNaN(xPixel)) {
                const labelText = new Date(targetTimeValue).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                redlineLabel.textContent = labelText;

                const labelWidth = redlineLabel.offsetWidth || 50;
                const leftPos = rect.left + xPixel - labelWidth / 2;

                redlineLabel.style.left = `${Math.max(5, Math.min(leftPos, rect.right - labelWidth - 5))}px`;
                redlineLabel.style.top = `${rect.top - 20}px`;
                redlineLabel.style.display = 'block';
            }
        }
    } catch (err) {
        console.warn('Failed to update redline label:', err);
    }

 
    // ✅ 🔥 Add this entire sync block right here
    if (!window.isUpdatingFromTimeline) {
        // 🔴 Sync yellow timeline redline
        if (window.updateTimelineCursor) {
            window.isUpdatingTimelineFromChart = true;
            window.updateTimelineCursor(targetTimeValue);
            window.isUpdatingTimelineFromChart = false;
        }

        // 🚛 Sync truck marker on map
        if (window.highlightMapPointByTime && window.map && window.markers && window.gpsCoordinates) {
            window.highlightMapPointByTime(window.map, window.markers, window.gpsCoordinates, targetTimeValue);
        }
    }

    // ✅ Update time displays efficiently (existing function)
    updateTimeDisplaysBatch(targetTimeString);

}


function findActiveElementsFast(chart, targetTimeValue) {
    const activeElements = [];

    // Validate chart data structure
    if (!chart.data || !chart.data.datasets || !chart.data.labels) {
        return activeElements;
    }

    const targetTimeMs = targetTimeValue;

    // Use cached time indices if available
    chart.data.datasets.forEach((dataset, datasetIndex) => {
        // Ensure dataset has data
        if (!dataset.data || dataset.data.length === 0) return;

        const bestIndex = binarySearchTime(chart.data.labels, targetTimeMs);

        // Validate the index is within bounds
        if (bestIndex !== -1 && bestIndex < dataset.data.length) {
            activeElements.push({
                datasetIndex,
                index: bestIndex
            });
        }
    });

    return activeElements;
}

function binarySearchTime(labels, targetTime) {
    if (!labels || labels.length === 0) return -1;

    let left = 0;
    let right = labels.length - 1;
    let bestIndex = 0;
    let bestDiff = Infinity;

    // Quick check for exact match or very close match
    const targetMs = new Date(targetTime).getTime();

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midMs = new Date(labels[mid]).getTime();
        const diff = Math.abs(midMs - targetMs);

        if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = mid;
        }

        // Early exit if very close match
        if (diff < 500) { // 0.5 seconds
            break;
        }

        if (midMs < targetMs) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    return bestIndex;
}

function updateTimeDisplaysBatch(timeString) {
    // Use requestAnimationFrame for smooth DOM updates
    const timeElements = document.querySelectorAll('.cursor-time');

    // Batch style updates
    timeElements.forEach(timeElement => {
        timeElement.style.cssText = 'display: block; right: 10px; top: 5px;';
        timeElement.textContent = timeString;
    });
}

function clearAllHighlights(allCharts) {
    // Batch clear operations
    const clearOperations = allCharts.map(chart => () => {
        chart.options.showVerticalLine = false;
        chart.options.verticalLineX = undefined;
        chart.tooltip.setActiveElements([]);
        chart.update('none');
    });

    // Execute all clears
    clearOperations.forEach(op => op());

    // Hide time displays
    document.querySelectorAll('.cursor-time').forEach(time => {
        time.style.display = 'none';
    });

    const label = document.getElementById('redlineTimeLabel');
    if (label) label.style.display = 'none';
}

export function setupMapChartSync(markers, updateChartsAtTime) {
    console.log(`Setting up optimized hover events for ${markers.length} markers`);

    // Use event delegation for better performance with many markers
    markers.forEach((marker, index) => {
        marker.on('mouseover', throttle(function (e) {
            // Highlight the marker
            this.setStyle({
                fillColor: '#ff4444',
                radius: 10,
                weight: 3
            });

            // Get time of this GPS point
            if (window.gpsCoordinates && window.gpsCoordinates[index]) {
                const pointTime = new Date(window.gpsCoordinates[index].date_time).getTime();
                updateChartsAtTime(pointTime);
            }
        }, 50)); // Throttle to 20fps for map interactions

        marker.on('mouseout', debounce(function () {
            // Reset marker style
            this.setStyle({
                fillColor: getPointColor(index, markers.length),
                radius: 6,
                weight: 2
            });

            // Clear chart highlights
            requestAnimationFrame(() => {
                charts.forEach(chart => {
                    chart.options.showVerticalLine = false;
                    chart.options.verticalLineX = undefined;
                    chart.tooltip.setActiveElements([]);
                    chart.update('none');
                });

                document.querySelectorAll('.cursor-time').forEach(time => {
                    time.style.display = 'none';
                });

                window.currentTimeValue = null;
            });
        }, 150));

        // Optimized click handler
        marker.on('click', throttle(function () {
            if (window.gpsCoordinates && window.gpsCoordinates[index]) {
                const pointTime = new Date(window.gpsCoordinates[index].date_time).getTime();
                updateChartsAtTime(pointTime);
            }
        }, 200));
    });
}

// Utility functions for performance optimization
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

function throttledMouseMove(func, limit) {
    let lastFunc;
    let lastRan;
    return function () {
        const context = this;
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function () {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getPointColor(index, total) {
    if (total <= 1) return '#0066CC';
    if (index === 0) return '#00CC00';
    if (index === total - 1) return '#CC0000';

    const ratio = index / (total - 1);
    return `rgb(${Math.round(50 + ratio * 100)}, ${Math.round(100 - ratio * 50)}, ${Math.round(200 + ratio * 55)})`;
}

window.updateChartsAtTime = function (timeValue) {
    if (!window.charts || window.charts.length === 0) return;
    updateAllChartsOptimized(window.charts, timeValue);
};