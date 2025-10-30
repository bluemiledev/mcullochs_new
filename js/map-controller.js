// This file manages the map functionalities. It exports functions such as initializeMap, addRouteToMap, and showTruckAtPosition, which handle map initialization, route rendering, and displaying the truck marker.

export function initializeMap() {
    // Create map
    const map = L.map('map', {
        zoomControl: true,  // Ensure zoom control is enabled
        scrollWheelZoom: true,  // Enable scroll wheel zoom
        doubleClickZoom: true  // Enable double click zoom
    });

    // Add a street map layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Make sure map events aren't being stopped
    map.getContainer().style.pointerEvents = 'auto';

    return map;
}

export function addRouteToMap(map, coordinates) {
    const markers = [];
    const bounds = L.latLngBounds();
    const polylinePoints = [];
    
    console.log(`Processing ${coordinates.length} GPS points`);

    // Filter and validate coordinates before processing
    const validCoordinates = coordinates.filter((coord, index) => {
        const lat = parseFloat(coord.latitude);
        const lng = parseFloat(coord.longitude);
        
        // Check if coordinates are valid numbers and not zero/empty
        const isValid = !isNaN(lat) && !isNaN(lng) && 
                       lat !== 0 && lng !== 0 && 
                       coord.latitude !== "" && coord.longitude !== "" &&
                       coord.latitude !== null && coord.longitude !== null &&
                       coord.latitude !== undefined && coord.longitude !== undefined;
        
        if (!isValid && index < 10) {
            console.warn(`Filtering out invalid coordinates at index ${index}: lat="${coord.latitude}", lng="${coord.longitude}"`);
        }
        
        return isValid;
    });

    console.log(`Filtered to ${validCoordinates.length} valid GPS points out of ${coordinates.length} total`);

    // Create a marker for each valid coordinate
    validCoordinates.forEach((coord, index) => {
        const lat = parseFloat(coord.latitude);
        const lng = parseFloat(coord.longitude);
        
        // Debug first few points
        if (index < 5) console.log(`Valid point ${index}: ${lat}, ${lng}`);
        
        const latLng = L.latLng(lat, lng);
        
        // Add to bounds for auto-zoom
        bounds.extend(latLng);
        
        // Add to polyline points
        polylinePoints.push(latLng);
        
        // Create marker with sequential numbering
        const marker = L.circleMarker(latLng, {
            radius: 6,
            fillColor: getPointColor(index, validCoordinates.length),
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            dataIndex: index,
            originalIndex: coordinates.indexOf(coord) // Keep track of original index
        }).addTo(map);
        
        // Add popup with date/time and point number
        marker.bindPopup(`
            <strong>Point ${index + 1} of ${validCoordinates.length}</strong><br>
            <strong>Time:</strong> ${coord.date_time || 'No timestamp'}<br>
            <strong>Lat:</strong> ${lat.toFixed(6)}<br>
            <strong>Lng:</strong> ${lng.toFixed(6)}
        `);
        
        markers.push(marker);
    });
    
    // Add start and end markers with special styling if we have valid coordinates
    if (validCoordinates.length > 0) {
        // Start point (green)
        const startCoord = validCoordinates[0];
        const startPoint = [
            parseFloat(startCoord.latitude),
            parseFloat(startCoord.longitude)
        ];

        L.marker(startPoint, {
            icon: createCustomIcon('green', 'S')
        }).addTo(map).bindPopup(`
            <strong>START POINT</strong><br>
            <strong>Time:</strong> ${startCoord.date_time || 'No timestamp'}
        `);

        // End point (red)
        const endCoord = validCoordinates[validCoordinates.length - 1];
        const endPoint = [
            parseFloat(endCoord.latitude),
            parseFloat(endCoord.longitude)
        ];

        L.marker(endPoint, {
            icon: createCustomIcon('red', 'E')
        }).addTo(map).bindPopup(`
            <strong>END POINT</strong><br>
            <strong>Time:</strong> ${endCoord.date_time || 'No timestamp'}
        `);
    }

    // Create a polyline only if we have valid points
    let routeLine = null;
    let arrowDecorator = null;
    
    if (polylinePoints.length > 1) {
        // Create a polyline
        routeLine = L.polyline(polylinePoints, {
            color: '#0066CC',
            weight: 5,
            opacity: 0.8,
            smoothFactor: 1
        });

        // Create direction arrows
        arrowDecorator = L.polylineDecorator(polylinePoints, {
            patterns: [
                {
                    offset: 25,
                    repeat: 100,
                    symbol: L.Symbol.arrowHead({
                        pixelSize: 15,
                        headAngle: 45,
                        pathOptions: {
                            color: '#0066CC',
                            fillColor: '#0066CC',
                            weight: 3
                        }
                    })
                }
            ]
        });

        // Add direction toggle control
        addDirectionToggleControl(map, arrowDecorator);

        // Add route line to the map
        routeLine.addTo(map);
    } else {
        console.warn('Not enough valid coordinates to create route line');
    }

    // Set map view to fit all markers if we have valid bounds
    if (bounds.isValid() && validCoordinates.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    } else if (validCoordinates.length > 0) {
        // Fallback: center on first valid point
        const firstCoord = validCoordinates[0];
        map.setView([parseFloat(firstCoord.latitude), parseFloat(firstCoord.longitude)], 13);
    } else {
        console.warn('No valid coordinates found for map display');
        // Set a default view
        map.setView([-27.4698, 153.0251], 10); // Default to Brisbane area
    }

    return { markers, routeLine, arrowDecorator, validCoordinates };
}

export function addDirectionToggleControl(map, arrowDecorator) {
    // Only add control if arrowDecorator exists
    if (!arrowDecorator) return;
    
    // Create custom control for direction arrows toggle
    const DirectionControl = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control direction-toggle');
            container.innerHTML = `
                <a href="#" title="Toggle Direction Arrows" style="display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:white; text-decoration:none;">
                    <span style="font-size: 16px;">➡️</span>
                </a>
            `;

            // Track toggle state
            container.arrowsVisible = false;

            // Add click event
            container.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();

                if (this.arrowsVisible) {
                    arrowDecorator.removeFrom(map);
                    this.querySelector('span').style.opacity = 0.5;
                    this.title = "Show Direction Arrows";
                } else {
                    arrowDecorator.addTo(map);
                    this.querySelector('span').style.opacity = 1;
                    this.title = "Hide Direction Arrows";
                }

                this.arrowsVisible = !this.arrowsVisible;
                return false;
            };

            return container;
        }
    });

    // Add the control to the map
    map.addControl(new DirectionControl());
}

export function createCustomIcon(color, text) {
    return L.divIcon({
        className: 'custom-marker-icon',
        html: `<div style="background-color: ${color}; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center; font-weight: bold; border: 2px solid white;">${text}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

export function getPointColor(index, total) {
    if (total <= 1) return '#0066CC'; // Single point case
    
    if (index === 0) return '#00CC00'; // First point (green)
    if (index === total - 1) return '#CC0000'; // Last point (red)

    // Create a gradient from blue to purple for the middle points
    const ratio = index / (total - 1);
    return `rgb(${Math.round(50 + ratio * 100)}, ${Math.round(100 - ratio * 50)}, ${Math.round(200 + ratio * 55)})`;
}

export function showTruckAtPosition(map, coord) {
    // Validate coordinate before creating truck marker
    if (!coord || !coord.latitude || !coord.longitude) {
        console.warn('Invalid coordinate provided for truck position');
        return;
    }
    
    const lat = parseFloat(coord.latitude);
    const lng = parseFloat(coord.longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
        console.warn('Invalid latitude/longitude for truck position:', coord);
        return;
    }

    const truckIcon = L.divIcon({
        className: 'truck-icon',
        html: '<div style="font-size: 24px;">🚚</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    // Remove existing truck marker if it exists
    if (map.truckMarker) {
        map.removeLayer(map.truckMarker);
    }

    // Add new truck marker
    map.truckMarker = L.marker([lat, lng], {
        icon: truckIcon,
        zIndexOffset: 1000
    }).addTo(map);
}

export function highlightMapPointByTime(map, markers, gpsCoordinates, targetTime) {
    // Filter valid coordinates first
    const validCoordinates = gpsCoordinates.filter(coord => 
        coord.latitude && coord.longitude && 
        coord.latitude !== "" && coord.longitude !== "" &&
        !isNaN(parseFloat(coord.latitude)) && !isNaN(parseFloat(coord.longitude))
    );
    
    if (validCoordinates.length === 0) {
        console.warn('No valid coordinates available for highlighting');
        return;
    }
    
    // Find the closest GPS point to the target time
    let bestIndex = -1;
    let bestTimeDiff = Infinity;
    
    validCoordinates.forEach((coord, index) => {
        if (coord.date_time) {
            const pointTime = new Date(coord.date_time).getTime();
            const timeDiff = Math.abs(pointTime - targetTime);
            
            if (timeDiff < bestTimeDiff) {
                bestTimeDiff = timeDiff;
                bestIndex = index;
            }
        }
    });
    
    console.log(`Highlighting map point ${bestIndex} for time ${new Date(targetTime).toISOString()}`);
    
    // Highlight the closest marker if found
    if (bestIndex !== -1 && markers[bestIndex]) {
        // Reset all markers first
        markers.forEach((marker, i) => {
            if (marker && marker.setStyle) {
                marker.setStyle({
                    fillColor: getPointColor(i, markers.length),
                    radius: 6,
                    weight: 2
                });
            }
        });
        
        // Highlight the target marker
        if (markers[bestIndex] && markers[bestIndex].setStyle) {
            markers[bestIndex].setStyle({
                fillColor: '#ff4444',
                radius: 10,
                weight: 3
            });
        }
        
        // Add truck marker at this position
        showTruckAtPosition(map, validCoordinates[bestIndex]);
    }
}

export function resetMapHighlights(map, markers, gpsCoordinates) {
    // Reset all markers to original style
    markers.forEach((marker, index) => {
        if (marker && marker.setStyle) {
            marker.setStyle({
                fillColor: getPointColor(index, markers.length),
                radius: 6,
                weight: 2
            });
        }
    });

    // Remove truck marker if it exists
    if (map.truckMarker) {
        map.removeLayer(map.truckMarker);
        map.truckMarker = null;
    }
}

// Make map highlight function global so timeline can use it
window.highlightMapPointByTime = highlightMapPointByTime;
