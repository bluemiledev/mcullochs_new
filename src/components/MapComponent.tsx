import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './MapComponent.module.css';
import { useEffect, useMemo, useState } from 'react';
import { useTimeContext } from '../context/TimeContext';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as unknown as { _getIconUrl: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom vehicle marker icon
const vehicleIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#ff6b35" stroke="#ffffff" stroke-width="2"/>
      <path d="M8 12h8M12 8v8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `)}`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

type GpsPoint = { time: number; lat: number; lng: number };

const MapComponent: React.FC = () => {
  // Australia (Brisbane area)
  const center: [number, number] = [-27.4698, 153.0251];
  const { selectedTime } = useTimeContext();
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);

  useEffect(() => {
    const loadGps = async () => {
      try {
        const res = await fetch(`/data/telemetry.json`, { headers: { 'Accept': 'application/json' }, cache: 'no-cache' });
        const json = await res.json();
        const times: number[] = Array.isArray(json?.times) ? json.times : [];
        const base = new Date(times?.[0] ?? Date.now());
        base.setHours(0, 0, 0, 0);
        const parseHMS = (hms: string) => {
          const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
          return base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
        };
        const pts: GpsPoint[] = Array.isArray(json?.gpsPerSecond)
          ? json.gpsPerSecond.map((p: any) => ({ time: parseHMS(p.time), lat: Number(p.lat), lng: Number(p.lng) }))
          : [];
        pts.sort((a, b) => a.time - b.time);
        setGpsPoints(pts);
      } catch (e) {
        setGpsPoints([]);
      }
    };
    loadGps();
  }, []);

  const currentPosition = useMemo<[number, number] | null>(() => {
    if (!selectedTime || gpsPoints.length === 0) return null;
    const t = selectedTime.getTime();
    // binary search nearest
    let lo = 0, hi = gpsPoints.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (gpsPoints[mid].time < t) lo = mid + 1; else hi = mid;
    }
    const idx = lo;
    const prev = gpsPoints[Math.max(0, idx - 1)];
    const next = gpsPoints[Math.min(gpsPoints.length - 1, idx)];
    const pick = Math.abs((prev?.time ?? Infinity) - t) <= Math.abs((next?.time ?? Infinity) - t) ? prev : next;
    if (!pick) return null;
    return [pick.lat, pick.lng];
  }, [selectedTime, gpsPoints]);

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapHeader}>
        <h3 className={styles.mapTitle}>Vehicle Locations</h3>
        <div className={styles.mapControls}>
          <span className={styles.activeIndicator}>● Active</span>
          <span className={styles.maintenanceIndicator}>● Maintenance</span>
        </div>
      </div>
      
      <MapContainer
        center={center}
        zoom={10}
        className={styles.map}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {currentPosition && (
          <Marker position={currentPosition} icon={vehicleIcon}>
            <Popup>
              <div className={styles.popupContent}>
                <h4>Vehicle</h4>
                <p>Location: Australia (Brisbane area)</p>
                <p>Time: {selectedTime ? new Date(selectedTime).toLocaleTimeString() : '—'}</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
