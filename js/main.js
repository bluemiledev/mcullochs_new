import { loadGpsData, loadSignalData } from './data-loader.js';
import { initializeMap, addRouteToMap, showTruckAtPosition, highlightMapPointByTime, resetMapHighlights } from './map-controller.js';
import { initializeCharts, charts, updateAllDigitalDisplays  } from './chart-controller.js';
import { setupSynchronizedCursors, setupMapChartSync } from './interaction-handler.js';
import { initializeTimelineScrubber } from './timeline-scrubber.js';

// This file serves as the entry point for the JavaScript functionalities. It initializes the application, sets up event listeners, and coordinates the loading of data and rendering of charts and maps.

(async () => {
  // ====================
  // SHARED STATE & VARIABLES
  // ====================
  let gpsCoordinates = [];
  let signalData = [];
  let map, markers, routeLine, arrowDecorator;
  let digitalChart;

  // Performance optimization variables
  let lastUpdateTime = 0;
  let animationFrameId = null;
  let isUpdating = false;

  // Pre-computed time indices for faster lookups
  let timeIndexMap = new Map();
  let sortedTimes = [];

  // Make variables available globally for interaction handlers
  window.currentTimeValue = null;
  window.gpsCoordinates = [];
window.currentSelectedTime = null;

  // ====================
  // INITIALIZATION
  // ====================
  document.addEventListener('DOMContentLoaded', async () => {
    console.log("Starting application...");

    // Load all data and store the results
    gpsCoordinates = await loadGpsData();
    signalData = await loadSignalData();

    // Make GPS coordinates globally available
    window.gpsCoordinates = gpsCoordinates;

    // Pre-compute time indices for performance
    computeTimeIndices();

    console.log(`Loaded ${gpsCoordinates.length} GPS coordinates`);
    console.log(`Processed ${signalData.length} signal data points`);

    // Initialize map and add route
    map = initializeMap();
    const routeData = addRouteToMap(map, gpsCoordinates);
    markers = routeData.markers;
    routeLine = routeData.routeLine;
    arrowDecorator = routeData.arrowDecorator;
    console.log("Map initialized");
    window.map = map;            // ✅ Make map global
window.markers = markers;    // ✅ Make markers global
window.gpsCoordinates = gpsCoordinates; // ✅ Ensure tracking data is global too


    // Initialize charts
    digitalChart = await initializeCharts(signalData, gpsCoordinates);
    requestAnimationFrame(alignScrubberToChart);

window.updateAllDigitalDisplays = updateAllDigitalDisplays;

console.log("Charts initialized with", charts.length, "total charts");

// ✅ Now timeline will have access to window.allTimes
initializeTimelineScrubber(signalData, gpsCoordinates);
requestAnimationFrame(alignScrubberToChart);

console.log("Timeline scrubber initialized");
// Optional: realign after Chart.js resizes
if (window.charts?.length) {
  const mainChart = window.charts.find(c => c.canvas.id === 'signalChart');
  if (mainChart) {
    // Hook chart resize
    mainChart.$scrubberAlign = mainChart.$scrubberAlign || (() => alignScrubberToChart());
    mainChart.onResize = mainChart.$scrubberAlign; // Chart.js v4-friendly
  }
}
    // Setup interactions with optimized handlers
    const highlightMapPoint = throttle((timeValue) => {
      highlightMapPointByTime(map, markers, gpsCoordinates, timeValue);
    }, 16); // ~60fps

    const resetMapHighlight = debounce(() => {
      resetMapHighlights(map, markers, gpsCoordinates);
    }, 200);

    const updateChartsAtTime = (timeValue) => {
      // Cancel previous animation frame
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // Prevent overlapping updates
      if (isUpdating) return;

      animationFrameId = requestAnimationFrame(() => {
        updateChartsOptimized(timeValue);
      });
     
    };
// ✅ MAKE FUNCTIONS ACCESSIBLE TO TIMELINE & INDICATORS
window.updateChartsAtTime = updateChartsAtTime;
window.highlightMapPointByTime = highlightMapPointByTime;
window.resetMapHighlightGlobal = resetMapHighlight;
window.map = map;
window.markers = markers;
window.gpsCoordinates = gpsCoordinates;

    // Setup synchronized interactions with optimized handlers
    setupSynchronizedCursors(charts, markers, highlightMapPoint, resetMapHighlight);
    setupMapChartSync(markers, updateChartsAtTime);

    // Add controls
    const resetZoomBtn = document.getElementById('resetChartZoom');
    if (resetZoomBtn) {
      resetZoomBtn.addEventListener('click', resetAllZoom);
    }

    console.log("Initialization complete");
  });

  // ====================
  // PERFORMANCE OPTIMIZED FUNCTIONS
  // ====================
  function computeTimeIndices() {
    // Pre-compute time lookups for faster searching
    const timeSet = new Set();

    // Collect all unique times from GPS and signal data
    gpsCoordinates.forEach(coord => {
      if (coord.date_time) {
        timeSet.add(coord.date_time);
      }
    });

    signalData.forEach(signal => {
      if (signal.time) {
        timeSet.add(signal.time);
      }
    });

    // Sort times and create index map
    sortedTimes = Array.from(timeSet).sort();
    sortedTimes.forEach((time, index) => {
      timeIndexMap.set(time, index);
    });

    console.log(`Pre-computed ${sortedTimes.length} unique time indices`);
  }

  function updateChartsOptimized(timeValue) {
    if (isUpdating) return;
    isUpdating = true;

    try {
      window.currentTimeValue = timeValue;

      // Batch DOM updates
      const timeString = new Date(timeValue).toLocaleString();

      // Update all charts in a single pass
      const updates = [];

      charts.forEach((chart, chartIndex) => {
        // Skip update if chart is not visible
        if (!chart.canvas.offsetParent) {
          return;
        }

        chart.options.showVerticalLine = true;
        chart.options.verticalLineX = timeValue;

        // Use binary search for faster data point lookup
        const activeElements = findActiveElementsOptimized(chart, timeValue);

        updates.push(() => {
          chart.tooltip.setActiveElements(activeElements, {
            x: chart.scales.x.getPixelForValue(timeValue),
            y: chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2
          });
          chart.update('none');
        });
      });

      // Execute all chart updates
      updates.forEach(update => update());

      // Batch update time displays
      updateTimeDisplays(timeString);
     
      if (window.updateTimelineCursor) {
    window.updateTimelineCursor(timeValue);
}

    } finally {
      isUpdating = false;
    }
  }

  function findActiveElementsOptimized(chart, targetTime) {
    const activeElements = [];
    const targetTimeMs = new Date(targetTime).getTime();

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      // Binary search for closest time
      let bestIndex = binarySearchClosestTime(chart.data.labels, targetTimeMs);

      if (bestIndex !== -1) {
        activeElements.push({
          datasetIndex,
          index: bestIndex
        });
      }
    });

    return activeElements;
  }

  function binarySearchClosestTime(labels, targetTime) {
    if (!labels || labels.length === 0) return -1;

    let left = 0;
    let right = labels.length - 1;
    let bestIndex = -1;
    let bestDiff = Infinity;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTime = new Date(labels[mid]).getTime();
      const diff = Math.abs(midTime - targetTime);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = mid;
      }

      if (midTime < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return bestIndex;
  }

  function updateTimeDisplays(timeString) {
    // Update time displays in all containers with the SAME time
    document.querySelectorAll('.cursor-time').forEach(time => {
      time.style.display = 'block';
      time.style.right = `${10}px`;
      time.style.top = '5px';
      time.textContent = timeString; // Same time for all
    });
  }

  // ====================
  // UTILITY FUNCTIONS FOR PERFORMANCE
  // ====================
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

  // ====================
  // CONTROLS
  // ====================
  function resetAllZoom() {
    // Batch zoom reset for better performance
    const resetPromises = charts.map(chart => {
      return new Promise(resolve => {
        chart.resetZoom();
        resolve();
      });
    });

    Promise.all(resetPromises).then(() => {
      console.log("Zoom reset for all charts");
    });
  }
})();
// Align scrubber timeline to the main chart's plot area (indicators)
function alignScrubberToChart() {
  try {
    // Your main indicators chart (the one with the vertical red line)
const mainChart = (window.charts || []).find(c => c.config?.type === 'bar' || c.config?.type === 'line');
// const mainChart = window.charts[0];
    if (!mainChart || !mainChart.chartArea) return;

    const track = document.querySelector('.scrubber-track');
    if (!track) return;

    // Rects
    const canvasRect = mainChart.canvas.getBoundingClientRect();
    const parentRect = track.parentElement.getBoundingClientRect();

    // Plot (chartArea) edges in *page* coords
    const plotLeftPx  = canvasRect.left + mainChart.chartArea.left;
    const plotRightPx = canvasRect.left + mainChart.chartArea.right;

    // Convert to coords relative to the track's parent
    const leftInParent  = Math.round(plotLeftPx  - parentRect.left);
    const widthInParent = Math.round(plotRightPx - plotLeftPx);

    track.style.left  = leftInParent + 'px';
    track.style.width = widthInParent + 'px';
  } catch (e) {
    console.warn('alignScrubberToChart failed:', e);
  }


// window.updateTimelineCursor = function (timeValue) {
//   const cursor = document.getElementById('timelineCursor');
//   const track  = document.querySelector('.scrubber-track');
//   const tr     = window.timeRange;
//   if (!cursor || !track || !tr) return;

//   const rect  = track.getBoundingClientRect();
//   const start = tr.start.getTime();
//   const end   = tr.end.getTime();
//   const p     = Math.max(0, Math.min(1, (timeValue - start) / (end - start)));

//   cursor.style.left = `${p * rect.width}px`;
//   cursor.style.opacity = 1;
// };


}

// Keep it aligned on layout changes
window.addEventListener('resize', () => requestAnimationFrame(alignScrubberToChart));

