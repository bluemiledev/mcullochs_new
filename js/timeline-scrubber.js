// Timeline scrubber controller for navigation and zoom
import { charts } from './chart-controller.js';
window.isUpdatingFromTimeline = false;
window.isUpdatingTimelineFromChart = false;

let scrubberChart = null;
let isDragging = false;
let dragType = null; // 'left', 'right', 'center'
let startX = 0;
let startLeft = 0;
let startWidth = 0;
let timeRange = { start: null, end: null };
let allTimeData = [];
let digitalChart;
let analogCharts = [];
let allTimes = [];
let isUpdatingFromChart = false;


// --- helper: send a time to all charts/map via the same pipeline as hover ---
function setCursorFromScrubber(startTime, endTime) {
    // choose the viewport **center** as the active time
    const center = new Date((startTime.getTime() + endTime.getTime()) / 2).getTime();

    // store for tooltips (your code already reads window.currentTimeValue)
    window.currentTimeValue = center;

    // drive charts (same updater hover uses)
    if (window.updateChartsAtTime) window.updateChartsAtTime(center);

    // drive map highlight (optional)
    if (window.highlightMapPointGlobal) window.highlightMapPointGlobal(center);
}



export function initializeTimelineScrubber(signalData, gpsCoordinates) {
    console.log('Initializing timeline scrubber...');

    // Extract all time data and create overview
    // ✅ Use the EXACT same time axis as charts
    if (window.allTimes && window.allTimes.length > 0) {
        allTimeData = window.allTimes;
        console.log("✅ Timeline using chart time axis:", allTimeData.length, "points");
    } else {
        console.warn("⏳ window.allTimes not ready yet, retrying...");
        setTimeout(() => initializeTimelineScrubber(signalData, gpsCoordinates), 150);
        return;
    }

    console.log("✅ Timeline is now using chart time array:", allTimeData.length);
    if (allTimeData.length === 0) {
        console.warn('No time data available for scrubber');
        return;
    }

    // Set initial time range
    timeRange.start = new Date(Number(allTimeData[0]));
    timeRange.end = new Date(Number(allTimeData[allTimeData.length - 1]));
    window.timeRange = timeRange;
    // ✅ Put in timeline-scrubber.js (global)
   // one clean definition – no nesting, no recursion
window.updateTimelineCursor = function (timeValue) {
    const cursor = document.getElementById('timelineCursor');
    const track = document.querySelector('.scrubber-track');
    const tr = window.timeRange;
    if (!cursor || !track || !tr) return;

    const rect = track.getBoundingClientRect();
    const start = tr.start.getTime();
    const end = tr.end.getTime();
    const p = Math.max(0, Math.min(1, (timeValue - start) / (end - start)));

    cursor.style.left = `${p * rect.width}px`;
    cursor.style.opacity = 1;

    // keep the floating redline label in sync with the same time
    if (typeof window.createOrUpdateRedlineLabel === 'function') {
        window.createOrUpdateRedlineLabel(timeValue);
    }
};


    console.log('Time range:', timeRange.start.toISOString(), 'to', timeRange.end.toISOString());


    // Wait for DOM to be ready
    setTimeout(() => {
        // Create overview chart
        createOverviewChart();

        // Initialize viewport
        initializeViewport();

        // Setup event listeners
        setupScrubberEvents();

        // Update time labels
        updateTimeLabels();

        console.log('Timeline scrubber initialized with', allTimeData.length, 'data points');
    }, 100);

    // Make functions available globally
    window.updateScrubberFromChart = updateScrubberFromChartZoom;
    $("#loader").css({ display: "none" });
}

function extractTimeData(signalData, gpsCoordinates) {
    const timeMap = new Map();

    // Collect times from signal data with activity count
    signalData.forEach(signal => {
        if (signal.time) {
            const time = signal.time;
            if (!timeMap.has(time)) {
                timeMap.set(time, { time, activityCount: 0 });
            }
            timeMap.get(time).activityCount++;
        }
    });

    // Collect times from GPS data
    gpsCoordinates.forEach(coord => {
        if (coord.date_time) {
            const time = coord.date_time;
            if (!timeMap.has(time)) {
                timeMap.set(time, { time, activityCount: 0 });
            }
            timeMap.get(time).activityCount++;
        }
    });

    // Convert to sorted array
    const timeArray = Array.from(timeMap.values()).sort((a, b) =>
        new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    console.log(`Extracted ${timeArray.length} unique time points`);
    return timeArray;
}

function createOverviewChart() {
    const canvas = document.getElementById('overviewChart');
    if (!canvas) {
        console.error('Overview chart canvas not found');
        return;
    }

    // Force canvas size to match its container
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size with proper pixel ratio
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw ruler background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Calculate time intervals
    const startTime = timeRange.start.getTime();
    const endTime = timeRange.end.getTime();
    const totalDuration = endTime - startTime;

    // Determine tick interval based on duration
    let tickInterval;
    let labelFormat;

    if (totalDuration < 6 * 60 * 60 * 1000) { // Less than 6 hours
        tickInterval = 30 * 60 * 1000; // 30 minutes
        labelFormat = 'time';
    } else if (totalDuration < 24 * 60 * 60 * 1000) { // Less than 24 hours
        tickInterval = 60 * 60 * 1000; // 1 hour
        labelFormat = 'time';
    } else { // More than 24 hours
        tickInterval = 2 * 60 * 60 * 1000; // 2 hours
        labelFormat = 'datetime';
    }

    // Draw ruler ticks and labels
    ctx.strokeStyle = '#FF0000';
    ctx.fillStyle = '#FF0000';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Main timeline line (positioned higher to make room for ticks above)
    const timelineY = rect.height - 20;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, timelineY);
    ctx.lineTo(rect.width, timelineY);
    ctx.stroke();

    // Draw ticks and labels
    let firstTickX = null;
    let lastTickX = null;
    let firstTickLabel = '';
    let lastTickLabel = '';

    for (let time = Math.ceil(startTime / tickInterval) * tickInterval; time <= endTime; time += tickInterval) {
        const x = ((time - startTime) / totalDuration) * rect.width;
        const date = new Date(time);

        // Draw tick mark ABOVE the line
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, timelineY);
        ctx.lineTo(x, timelineY - 10);
        ctx.stroke();

        // Draw minor ticks (every 15 minutes for hour intervals, every 30 minutes for 2-hour intervals)
        const minorTickInterval = tickInterval / (tickInterval >= 2 * 60 * 60 * 1000 ? 4 : 2);
        for (let minorTime = time - tickInterval + minorTickInterval; minorTime < time; minorTime += minorTickInterval) {
            if (minorTime > startTime && minorTime < endTime) {
                const minorX = ((minorTime - startTime) / totalDuration) * rect.width;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(minorX, timelineY);
                ctx.lineTo(minorX, timelineY - 5);
                ctx.stroke();
            }
        }

        // Format label
        let label;
        if (labelFormat === 'time') {
            label = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } else {
            label = date.toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit'
            }) + ' ' + date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        }

        // Draw label ABOVE the tick marks
        ctx.fillStyle = '#333';
        ctx.fillText(label, x, timelineY - 12);

        // Save first and last tick positions/labels
        if (firstTickX === null) {
            firstTickX = x;
            firstTickLabel = label;
        }
        lastTickX = x;
        lastTickLabel = label;
    }

    // Draw start and end labels at the top, but offset vertically and only if not overlapping
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const startLabel = labelFormat === 'time' ?
        startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) :
        startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
        startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    ctx.textAlign = 'right';
    const endLabel = labelFormat === 'time' ?
        endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) :
        endDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' +
        endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Only draw start label if it doesn't overlap with first tick label
    ctx.textAlign = 'left';
    if (startLabel !== firstTickLabel || firstTickX > 40) {
        ctx.fillStyle = '#666';
        ctx.fillText(startLabel, 5, timelineY + 2); // Draw below the timeline
    }

    // Only draw end label if it doesn't overlap with last tick label
    ctx.textAlign = 'right';
    if (endLabel !== lastTickLabel || (rect.width - lastTickX) > 40) {
        ctx.fillStyle = '#666';
        ctx.fillText(endLabel, rect.width - 5, timelineY + 2); // Draw below the timeline
    }

    console.log('Ruler timeline created');
}

function createActivityOverview() {
    if (allTimeData.length === 0) {
        return { labels: [], values: [] };
    }

    const startTime = timeRange.start.getTime();
    const endTime = timeRange.end.getTime();
    const totalDuration = endTime - startTime;

    // Create evenly distributed time points
    const numPoints = Math.min(100, allTimeData.length);
    const labels = [];
    const values = [];

    for (let i = 0; i < numPoints; i++) {
        const timePoint = startTime + (totalDuration * i / (numPoints - 1));
        const date = new Date(timePoint);

        labels.push(date.toISOString().replace('T', ' ').substr(0, 19));

        // Create sample activity data - replace with actual activity calculation
        const activity = Math.random() * 0.8 + 0.2;
        values.push(activity);
    }

    return { labels, values };
}

function initializeViewport() {
    const viewport = document.getElementById('scrubberViewport');
    if (!viewport) {
        console.error('Scrubber viewport not found');
        return;
    }

    // Set initial viewport to show full range
    viewport.style.left = '0%';
    viewport.style.width = '100%';

    console.log('Viewport initialized');
}

function setupScrubberEvents() {
    const viewport = document.getElementById('scrubberViewport');
    const leftHandle = document.getElementById('leftHandle');
    const rightHandle = document.getElementById('rightHandle');
    const track = document.querySelector('.scrubber-track');
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const resetZoomBtn = document.getElementById('resetZoom');
    const cursor = document.getElementById('timelineCursor');

    if (!viewport || !leftHandle || !rightHandle || !track) {
        console.error('Scrubber elements not found');
        return;
    }

    // Enhanced mouse down events with proper event handling
    leftHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDrag(e, 'left');
    });

    rightHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDrag(e, 'right');
    });

    viewport.addEventListener('mousedown', (e) => {
        // Only allow center dragging if clicking on the viewport itself, not the handles
        if (e.target === viewport) {
            e.preventDefault();
            e.stopPropagation();
            startDrag(e, 'center');
        }
    });

    track.addEventListener('mousedown', (e) => {
        // Click on track to jump viewport
        if (e.target === track || e.target.id === 'overviewChart') {
            e.preventDefault();
            jumpToPosition(e);
        }
    });

    // Zoom controls (if they exist)
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => zoomViewport(0.8));
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => zoomViewport(1.25));
    }
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', resetScrubberZoom);
    }

    // Global mouse events
    // ✅ Desktop events
    // ✅ Desktop dragging movement
    document.addEventListener('mousemove', (e) => {
        if (isDragging) handleDrag(e);
    }, { passive: false });

    // ✅ Stop drag when mouse released (Desktop)
    document.addEventListener('mouseup', stopDrag, { passive: true });

    // ✅ Mobile dragging movement
    document.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches && e.touches[0]) {
            handleDrag(e.touches[0]);
        }
    }, { passive: false });

    // ✅ Stop drag when mouse released (Mobile)
    document.addEventListener('touchend', stopDrag, { passive: true });
    track.addEventListener('mousemove', updateHoverFromTrack, { passive: true });
    // Ensure cursor stays visible when entering / leaving timeline area
    track.addEventListener("mouseenter", () => {
        if (cursor) cursor.style.opacity = 1;
    });

    track.addEventListener("mouseleave", () => {
        if (cursor) cursor.style.opacity = 1; // keep visible, do NOT hide
    });

    // Touch events for mobile
    leftHandle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrag(e.touches[0], 'left');
    });

    rightHandle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrag(e.touches[0], 'right');
    });

    viewport.addEventListener('touchstart', (e) => {
        if (e.target === viewport) {
            e.preventDefault();
            startDrag(e.touches[0], 'center');
        }
    });




    // Prevent text selection and context menu
    [viewport, leftHandle, rightHandle, track].forEach(element => {
        element.addEventListener('selectstart', (e) => e.preventDefault());
        element.addEventListener('contextmenu', (e) => e.preventDefault());
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';
    });

    console.log('Scrubber events setup complete');
}

function startDrag(e, type) {
    if (!e || !e.clientX) return;
    console.log("start-drag-line-419")
    if (typeof e.preventDefault === "function") {
        e.preventDefault();
    }

    isDragging = true;
    dragType = type;
    startX = e.clientX;

    const viewport = document.getElementById('scrubberViewport');
    const track = document.querySelector('.scrubber-track');

    const viewportRect = viewport.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();

    startLeft = ((viewportRect.left - trackRect.left) / trackRect.width) * 100;
    startWidth = (viewportRect.width / trackRect.width) * 100;
}


function handleDrag(e) {
    // ✅ If the call is coming from chart / programmatic sync:
    if (!e || !e.clientX) return;
    console.log("[handleDrag] DRAGGING", isDragging, dragType, e.clientX);
    // ✅ Make sure event is real
    if (typeof e.preventDefault === "function") {
        e.preventDefault();
    }

    if (!isDragging || !dragType) return;

    const track = document.querySelector('.scrubber-track');
    const viewport = document.getElementById('scrubberViewport');
    if (!track || !viewport) return;

    const trackRect = track.getBoundingClientRect();
    const deltaX = e.clientX - startX;
    const deltaPercent = (deltaX / trackRect.width) * 100;

    let newLeft = startLeft;
    let newWidth = startWidth;

    // Movement logic (unchanged)
    switch (dragType) {
        case 'left':
            const maxLeft = startLeft + startWidth - 5;
            newLeft = Math.max(0, Math.min(startLeft + deltaPercent, maxLeft));
            newWidth = startWidth - (newLeft - startLeft);
            break;

        case 'right':
            const maxWidth = 100 - startLeft;
            newWidth = Math.max(5, Math.min(startWidth + deltaPercent, maxWidth));
            break;

        case 'center':
            const maxLeftForCenter = 100 - startWidth;
            newLeft = Math.max(0, Math.min(startLeft + deltaPercent, maxLeftForCenter));
            break;
    }

    if (newLeft + newWidth > 100) {
        if (dragType === 'center') newLeft = 100 - newWidth;
        else newWidth = 100 - newLeft;
    }

    if (newWidth < 5) newWidth = 5;

    viewport.style.left = newLeft + '%';
    viewport.style.width = newWidth + '%';

    if (!isUpdatingFromChart) {
        updateChartsFromScrubber(newLeft, newWidth);
    }

    updateTimeLabels();
}

function updateHoverFromTrack(e) {
    if (!window.allTimes || window.allTimes.length === 0) return;

    const track = document.querySelector('.scrubber-track');
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const percent = x / rect.width;
    const index = Math.floor(percent * window.allTimes.length);

    const hoverTime = Number(window.allTimes[index]);
    window.globalHoverTime = hoverTime;

    window.currentTimeValue = hoverTime;
if (typeof window.createOrUpdateRedlineLabel === 'function') {
    window.createOrUpdateRedlineLabel(hoverTime);
}

    // ✅ Update time display label in the UI (same as chart hover)
   if (window.updateTimeDisplays) {
    const timeString = new Date(hoverTime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    window.updateTimeDisplays(timeString);
}

    // Debug log
    console.log("Timeline → Hover to:", new Date(hoverTime).toLocaleString());

    // ✅ Update Time Display
    const timeLabel = document.getElementById('cursorTime');
    if (timeLabel) {
        timeLabel.textContent = "Time: " + new Date(hoverTime).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    // ✅ Update CHARTS
  // ✅ Update CHARTS safely without triggering recursive loop
if (!window.isUpdatingTimelineFromChart && window.updateChartsAtTime) {
    window.isUpdatingFromTimeline = true;
    window.updateChartsAtTime(hoverTime);
    window.isUpdatingFromTimeline = false;
}

    // update all digital displays
    if (window.updateAllDigitalDisplays) {
        window.updateAllDigitalDisplays(hoverTime);
    }

    // ✅ Update MAP MARKER
    if (window.highlightMapPointByTime && window.map && window.markers && window.gpsCoordinates) {
        window.highlightMapPointByTime(window.map, window.markers, window.gpsCoordinates, hoverTime);
    }

    if (window.updateTimelineCursor) {
        window.updateTimelineCursor(hoverTime);
    }
}




function stopDrag() {
    if (isDragging) {
        console.log(`Stopping drag: ${dragType}`);

        // Reset cursor
        document.body.style.cursor = '';

        isDragging = false;
        dragType = null;
    }
}

function jumpToPosition(e) {
    const track = document.querySelector('.scrubber-track');
    const viewport = document.getElementById('scrubberViewport');
    const trackRect = track.getBoundingClientRect();

    const clickPercent = ((e.clientX - trackRect.left) / trackRect.width) * 100;
    const currentWidth = parseFloat(viewport.style.width) || 100;

    // Center viewport on click position
    let newLeft = clickPercent - (currentWidth / 2);
    newLeft = Math.max(0, Math.min(100 - currentWidth, newLeft));

    viewport.style.left = newLeft + '%';

    console.log(`Jumped to position: ${newLeft}%`);

    // Update charts
    if (!isUpdatingFromChart) {
        updateChartsFromScrubber(newLeft, currentWidth);
    }
    updateTimeLabels();
}

function zoomViewport(factor) {
    const viewport = document.getElementById('scrubberViewport');
    const currentLeft = parseFloat(viewport.style.left) || 0;
    const currentWidth = parseFloat(viewport.style.width) || 100;

    // Calculate new width
    let newWidth = currentWidth * factor;
    newWidth = Math.max(5, Math.min(100, newWidth));

    // Adjust left position to keep zoom centered
    let newLeft = currentLeft + (currentWidth - newWidth) / 2;
    newLeft = Math.max(0, Math.min(100 - newWidth, newLeft));

    // Update viewport
    viewport.style.left = newLeft + '%';
    viewport.style.width = newWidth + '%';

    // Update charts
    if (!isUpdatingFromChart) {
        updateChartsFromScrubber(newLeft, newWidth);
    }
    updateTimeLabels();
}

function formatTime(timeValue) {
    const date = new Date(timeValue);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateChartsFromScrubber(leftPercent, widthPercent) {
    console.log("✅ updateChartsFromScrubber CALLED:", leftPercent, widthPercent);
    console.log("windowalltimes", window.allTimes, window.allTimes)
    // if (!window.allTimes || window.allTimes.length === 0) return;

    isUpdatingFromChart = true;

    // Convert percentage (0–100) → fraction (0–1)
    const leftFraction = leftPercent / 100;
    const widthFraction = widthPercent / 100;

    // Convert to index range safely
    const startIndex = Math.max(0, Math.floor(leftFraction * window.allTimes.length));
    const endIndex = Math.min(window.allTimes.length - 1, Math.floor((leftFraction + widthFraction) * window.allTimes.length));

    const startTime = Number(window.allTimes[startIndex]);
    const endTime = Number(window.allTimes[endIndex]);

    console.log("⏱ Timeline →", new Date(startTime).toLocaleString(), "→", new Date(endTime).toLocaleString());

    // Update Digital Chart
   // ✅ Apply zoom range to all charts
if (window.digitalChart) {
    window.digitalChart.options.scales.x.min = startTime;
    window.digitalChart.options.scales.x.max = endTime;
    window.digitalChart.update('none');
}

// ✅ Analog charts
if (window.analogCharts) {
    window.analogCharts.forEach(chart => {
        chart.options.scales.x.min = startTime;
        chart.options.scales.x.max = endTime;
        chart.update('none');
    });
}

// ✅ Sync redline within new range
if (window.currentTimeValue) {
    if (window.currentTimeValue < startTime || window.currentTimeValue > endTime) {
        window.currentTimeValue = startTime; // reset inside range
    }
    if (window.updateChartsAtTime) {
        window.updateChartsAtTime(window.currentTimeValue);
    }

    
// ✅ MOVE THE TIMELINE CURSOR ALSO (THIS IS THE NEW CODE)
if (window.updateTimelineCursor) {
    window.updateTimelineCursor(window.currentTimeValue);
}
}

    // UI Time Labels
    document.getElementById('timeStart').innerText = formatTime(startTime);
    document.getElementById('timeEnd').innerText = formatTime(endTime);

    isUpdatingFromChart = false;

    // ✅ Sync cursor to charts (red vertical line + indicator values)
    if (window.syncAllChartsToTime) {
        window.syncAllChartsToTime(startTime);
    }

    // ✅ Sync truck on map
    if (window.highlightMapPointByTime && window.map && window.markers && window.gpsCoordinates) {
        window.highlightMapPointByTime(window.map, window.markers, window.gpsCoordinates, startTime);
    }
}





function updateTimeLabels() {
    const viewport = document.getElementById('scrubberViewport');
    const startLabel = document.getElementById('timeStart');
    const endLabel = document.getElementById('timeEnd');

    if (!viewport || allTimeData.length === 0) return;

    const leftPercent = parseFloat(viewport.style.left) || 0;
    const widthPercent = parseFloat(viewport.style.width) || 100;

    const totalDuration = timeRange.end.getTime() - timeRange.start.getTime();
    const startTime = new Date(timeRange.start.getTime() + (totalDuration * leftPercent / 100));
    const endTime = new Date(timeRange.start.getTime() + (totalDuration * (leftPercent + widthPercent) / 100));

    // Update viewport range labels
    if (startLabel && endLabel) {
        const formatTime = (date) => {
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        };

        startLabel.textContent = formatTime(startTime);
        endLabel.textContent = formatTime(endTime);
    }

    // Update current time display inside time-range-display
    updateCurrentTimeDisplay(startTime, endTime);
}

function updateCurrentTimeDisplay(startTime, endTime) {
    // Find or create current time display inside time-range-display
    const timeRangeDisplay = document.querySelector('.time-range-display');
    let timeDisplay = timeRangeDisplay?.querySelector('.scrubber-current-time');

    if (!timeDisplay && timeRangeDisplay) {
        timeDisplay = document.createElement('div');
        timeDisplay.className = 'scrubber-current-time';
        timeDisplay.style.cssText = `
            margin-left: 8px;
            padding-left: 8px;
            border-left: 1px solid rgba(156, 163, 175, 0.4);
            color: #6b7280;
            font-weight: 500;
            font-size: inherit;
            white-space: nowrap;
        `;
        timeRangeDisplay.appendChild(timeDisplay);
    }

    if (timeDisplay) {
        const duration = endTime.getTime() - startTime.getTime();
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

        let durationText = '';
        if (hours > 0) {
            durationText = `${hours}h ${minutes}m`;
        } else {
            durationText = `${minutes}m`;
        }

        timeDisplay.textContent = `${durationText}`;
    }
}

export function resetScrubberZoom() {
    const viewport = document.getElementById('scrubberViewport');
    if (!viewport) return;

    console.log('Resetting scrubber zoom');

    // Reset to full range
    viewport.style.left = '0%';
    viewport.style.width = '100%';

    // Reset all charts
    charts.forEach(chart => {
        if (chart && chart.resetZoom) {
            chart.resetZoom();
        }
    });

    updateTimeLabels();
}

export function updateScrubberFromChartZoom(chart) {
    if (!chart || !chart.scales || !chart.scales.x || allTimeData.length === 0) return;

    isUpdatingFromChart = true;

    const xScale = chart.scales.x;
    const chartMin = xScale.min;
    const chartMax = xScale.max;

    if (!chartMin || !chartMax) {
        isUpdatingFromChart = false;
        return;
    }

    // Calculate percentages based on chart zoom
    const totalDuration = timeRange.end.getTime() - timeRange.start.getTime();
    const chartMinTime = new Date(chartMin).getTime();
    const chartMaxTime = new Date(chartMax).getTime();

    const leftPercent = Math.max(0, ((chartMinTime - timeRange.start.getTime()) / totalDuration) * 100);
    const rightPercent = Math.min(100, ((chartMaxTime - timeRange.start.getTime()) / totalDuration) * 100);
    const widthPercent = rightPercent - leftPercent;

    // Update viewport
    const viewport = document.getElementById('scrubberViewport');
    if (viewport) {
        viewport.style.left = leftPercent + '%';
        viewport.style.width = Math.max(5, widthPercent) + '%';
        updateTimeLabels();
    }

    console.log(`Updated scrubber from chart zoom: ${leftPercent}% - ${rightPercent}%`);

    setTimeout(() => {
        isUpdatingFromChart = false;
    }, 100);
}

// Export for external use
export { updateTimeLabels, updateChartsFromScrubber };

