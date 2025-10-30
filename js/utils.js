// This file contains utility functions that are used throughout the application.

export function createCustomIcon(color, text) {
    return L.divIcon({
        className: 'custom-marker-icon',
        html: `<div style="background-color: ${color}; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center; font-weight: bold; border: 2px solid white;">${text}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

export function getPointColor(index, total) {
    if (index === 0) return '#00CC00'; // First point (green)
    if (index === total - 1) return '#CC0000'; // Last point (red)

    // Create a gradient from blue to purple for the middle points
    const ratio = index / (total - 1);
    return `rgb(${Math.round(50 + ratio * 100)}, ${Math.round(100 - ratio * 50)}, ${Math.round(200 + ratio * 55)})`;
}