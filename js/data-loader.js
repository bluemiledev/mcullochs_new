// This file contains functions for loading GPS and signal data. 
// It exports functions like loadGpsData and loadSignalData, 
// which fetch data from specified sources and return it for processing.

async function loadGpsData() {
    try {
        // const response = await fetch('./test3.json');
        const urlParams = new URLSearchParams(window.location.search);
        console.log(urlParams.get("device_id"));
        console.log(urlParams.get("date"));
        console.log(urlParams.get("manual_reading_ids"));
        // const response = await fetch('new-coord.json');
        const response = await fetch('https://www.smartdatalink.com.au/create-chart-json?date=' + urlParams.get("date") + '&device_id=' + urlParams.get("device_id") + '&manual_reading_ids=' + urlParams.get("manual_reading_ids"));
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const gpsData = await response.json();
        
        // Filter only records with valid GPS coordinates
        const validGpsData = gpsData.filter(item => {
            // Check if latitude and longitude exist and are not empty
            const hasCoords = item.latitude && item.longitude && 
                            item.latitude !== "" && item.longitude !== "" &&
                            item.latitude !== null && item.longitude !== null;
            
            if (!hasCoords) return false;
            
            // Parse and validate numeric values
            const lat = parseFloat(item.latitude);
            const lng = parseFloat(item.longitude);
            
            // Check if they're valid numbers and not zero
            return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
        });
        
        console.log(`GPS data loaded: ${validGpsData.length} valid coordinates out of ${gpsData.length} total records`);
        console.log(`Filtered out ${gpsData.length - validGpsData.length} invalid coordinate entries`);
        
        return validGpsData;
    } catch (error) {
        console.error('Error loading GPS data:', error);
        return [];
    }
}

async function loadSignalData() {
    try {
        // Load the same data file and process it for chart signals
        // const response = await fetch('./test3.json');
        const urlParams = new URLSearchParams(window.location.search);
        console.log(urlParams.get("device_id"));
        console.log(urlParams.get("date"));
        // const response = await fetch('new-coord.json');
        const response = await fetch('https://www.smartdatalink.com.au/create-chart-json?date=' + urlParams.get("date") + '&device_id=' + urlParams.get("device_id") + '&manual_reading_ids=' + urlParams.get("manual_reading_ids"));
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const rawData = await response.json();
        
        // Process the data to extract chart information
        const signalData = processDataForCharts(rawData);
        console.log('Signal data processed:', signalData);
        return signalData;
    } catch (error) {
        console.error('Error loading signal data:', error);
        return [];
    }
}

function processDataForCharts(rawData) {
    const processedData = [];
    
    rawData.forEach(item => {
        // Use date_time if available, otherwise construct from date and time
        const dateTimeStr = item.date_time || `${item.date || ''} ${item.time || ''}`.trim();
        
        // If the item has chartName and chartType, use it directly
        if (item.chartName && item.chartType) {
            processedData.push({
                time: dateTimeStr,
                chartName: item.chartName,
                chartType: item.chartType,
                value: item.value !== undefined ? item.value : 0,
                avg: item.avg,
                min: item.min,
                max: item.max
            });
        } else {
            // If no chart data is present, create some based on GPS coordinates for demonstration
            // You can modify this logic based on your actual data structure
            
            // Create a GPS status signal
            // processedData.push({
            //     time: dateTimeStr,
            //     chartName: 'GPS Status',
            //     chartType: 'Digital',
            //     value: (item.latitude && item.longitude) ? 1 : 0
            // });
            
            // If there are other numeric fields, create analog charts for them
            // Object.keys(item).forEach(key => {
            //     if (typeof item[key] === 'number' && key !== 'latitude' && key !== 'longitude' && key !== 'value') {
            //         processedData.push({
            //             time: dateTimeStr,
            //             chartName: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
            //             chartType: 'Analogue',
            //             avg: item[key],
            //             min: item[key] * 0.9, // Mock min/max values
            //             max: item[key] * 1.1
            //         });
            //     }
            // });
        }
    });
    
    return processedData;
}

// Add this function to load color configuration
async function loadColorConfig() {
    try {
        // const response = await fetch('./color.json');
        const urlParams = new URLSearchParams(window.location.search);
        console.log(urlParams.get("device_id"));
        const response = await fetch('https://www.smartdatalink.com.au/chart_color_json?device_id=' + urlParams.get("device_id"));
        if (response.ok) {
            window.colorConfig = await response.json();
            console.log('Color configuration loaded:', Object.keys(window.colorConfig).length, 'colors');
        } else {
            console.warn('Could not load color.json, using default colors');
            window.colorConfig = {};
        }
    } catch (error) {
        console.warn('Error loading color.json:', error);
        window.colorConfig = {};
    }
}

// Update the initializeCharts function to load colors first
export async function initializeCharts(signalData, gpsCoordinates) {
    // Load color configuration first
    await loadColorConfig();
    
    // Clear previous charts
    charts = [];
    chartContainers = [];
    
    // Clear existing analog charts
    const analogChartsContainer = document.getElementById('analogChartsContainer');
    if (analogChartsContainer) {
        analogChartsContainer.innerHTML = '';
    }
    
    // Register chart plugins
    registerChartPlugins();

    // Process the actual data from JSON files
    const { grouped, allTimes } = organizeChartData(signalData);
window.allTimes = allTimes.map(t => new Date(t).getTime());

// Expose sync so timeline can call it
window.syncAllChartsToTime = syncAllChartsToTime;
window.highlightMapPointByTime = highlightMapPointByTime;
    console.log('Organized chart data:', grouped);
    console.log('All times:', allTimes.length, 'time points');

    // Create digital chart
    const digitalChart = createDigitalChart(grouped, allTimes);

    // Create analog charts
    createAnalogCharts(grouped, allTimes);

    // Initialize digital label positions
    createInlineDigitalLabels(digitalChart);

    console.log('Total charts created:', charts.length);

    return digitalChart;
}

export { loadGpsData, loadSignalData, loadColorConfig };