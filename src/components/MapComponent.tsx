import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
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
        // Prefer external API, fall back to local JSON if unavailable
        let json: any;
        try {
          const apiUrl = new URL('https://no-reply.com.au/smart_data_link/get_charts_data_1');
          apiUrl.search = window.location.search; // pass through any query params
          const apiRes = await fetch(apiUrl.toString(), { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
          if (!apiRes.ok) throw new Error('api failed');
          json = await apiRes.json();
        } catch {
          const res = await fetch('/data/telemetry.json', { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
          if (!res.ok) throw new Error('no local');
          json = await res.json();
        }
        const payload: any = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
        const timesRaw: any[] = Array.isArray(payload?.times) ? payload.times : Array.isArray(payload?.timestamps) ? payload.timestamps : [];
        const normalizeTimes = (arr: any[]): number[] => {
          const nums = arr.map((t: any) => typeof t === 'number' ? t : Date.parse(String(t))).filter((n: number) => Number.isFinite(n));
          if (!nums.length) return [];
          const max = Math.max(...nums);
          return max < 1e12 ? nums.map(n => n * 1000) : nums;
        };
        const times = normalizeTimes(timesRaw);
        const base = new Date(times?.[0] ?? Date.now());
        base.setHours(0, 0, 0, 0);
        const parseHMS = (hms: string) => {
          const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
          return base.getTime() + hh * 3600000 + mm * 60000 + ss * 1000;
        };
        const arr: any[] = Array.isArray(payload?.gpsPerSecond)
          ? payload.gpsPerSecond
          : Array.isArray(payload?.gps_per_second)
          ? payload.gps_per_second
          : Array.isArray(payload?.gps)
          ? payload.gps
          : Array.isArray(payload?.locations)
          ? payload.locations
          : [];
        const toNumber = (val: any): number => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const cleaned = val.replace(/[^0-9+\-\.]/g, '').replace('−', '-');
            const n = Number(cleaned);
            if (Number.isFinite(n)) return n;
          }
          return NaN;
        };
        const getLat = (p: any): number => {
          const v = p.lat ?? p.Lat ?? p.LAT ?? p.latitude ?? p.Latitude ?? p.gpsLat ?? p.lat_val ?? p.latE7;
          let n = toNumber(v);
          if (!Number.isFinite(n) && Array.isArray(p.coordinates)) n = toNumber(p.coordinates[1]);
          if (!Number.isFinite(n) && Array.isArray(p.coord)) n = toNumber(p.coord[1]);
          if (Math.abs(n) > 90 && Math.abs(n) > 1000) n = n / 1e7; // latE7
          return n;
        };
        const getLng = (p: any): number => {
          const v = p.lng ?? p.Lng ?? p.LNG ?? p.lon ?? p.long ?? p.Long ?? p.longitude ?? p.Longitude ?? p.gpsLng ?? p.lng_val ?? p.lngE7;
          let n = toNumber(v);
          if (!Number.isFinite(n) && Array.isArray(p.coordinates)) n = toNumber(p.coordinates[0]);
          if (!Number.isFinite(n) && Array.isArray(p.coord)) n = toNumber(p.coord[0]);
          if (Math.abs(n) > 180 && Math.abs(n) > 1000) n = n / 1e7; // lngE7
          return n;
        };
        const pts: GpsPoint[] = arr.map((p: any) => ({
          time: (() => {
            const ts = p.timestamp ?? p.timeStamp ?? p.ts ?? p.epoch ?? null;
            if (ts != null) {
              const n = Number(ts);
              if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
            }
            return parseHMS(String(p.time ?? p.Time ?? p.TIME ?? p.hms ?? '00:00:00'));
          })(),
          lat: getLat(p),
          lng: getLng(p)
        }))
          .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        pts.sort((a, b) => a.time - b.time);
        setGpsPoints(pts);
      } catch (e) {
        setGpsPoints([]);
      }
    };
    loadGps();
  }, []);

  const currentPosition = useMemo<[number, number] | null>(() => {
    if (gpsPoints.length === 0) return null;
    const t = selectedTime ? selectedTime.getTime() : Math.floor((gpsPoints[0].time + gpsPoints[gpsPoints.length - 1].time) / 2);
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

  const pathPositions = useMemo<[number, number][]>(() => {
    return gpsPoints.map(p => [p.lat, p.lng] as [number, number]);
  }, [gpsPoints]);

  // Compute bearing (degrees) between two points
  const bearingDeg = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
    const φ1 = (a.lat * Math.PI) / 180;
    const φ2 = (b.lat * Math.PI) / 180;
    const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (θ * 180) / Math.PI;
  };

  const arrowMarkers = useMemo(() => {
    if (gpsPoints.length < 2) return [] as Array<{ pos: [number, number]; icon: L.DivIcon }>;
    const maxArrows = 20;
    const step = Math.max(1, Math.floor(gpsPoints.length / maxArrows));
    const arr: Array<{ pos: [number, number]; icon: L.DivIcon }> = [];
    for (let i = step; i < gpsPoints.length; i += step) {
      const prev = gpsPoints[i - 1];
      const curr = gpsPoints[i];
      const ang = bearingDeg(prev, curr);
      const icon = L.divIcon({
        className: '',
        html: `<div style="transform: rotate(${ang}deg); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 10px solid #2563eb; opacity: 0.9;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      arr.push({ pos: [curr.lat, curr.lng], icon });
    }
    return arr;
  }, [gpsPoints]);

  const Recenter: React.FC<{ position: [number, number] | null }> = ({ position }) => {
    const map = useMap();
    React.useEffect(() => {
      if (position) {
        map.setView(position);
      }
    }, [position, map]);
    return null;
  };

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
        center={currentPosition ?? center}
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
        {/* Draw the path using full gps track */}
        {pathPositions.length >= 2 && (
          <Polyline positions={pathPositions} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.8 }} />
        )}
        <Recenter position={currentPosition} />
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
        {/* Direction arrows along the route */}
        {arrowMarkers.map((m, idx) => (
          <Marker key={`arr-${idx}`} position={m.pos} icon={m.icon} />
        ))}
        {/* Start and end markers for context */}
        {pathPositions.length >= 2 && (
          <>
            <Marker
              position={pathPositions[0]}
              icon={L.divIcon({
                className: '',
                html: '<div style="width:10px;height:10px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}
            />
            <Marker
              position={pathPositions[pathPositions.length - 1]}
              icon={L.divIcon({
                className: '',
                html: '<div style="width:10px;height:10px;border-radius:50%;background:#ef4444;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
