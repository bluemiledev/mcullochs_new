import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
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

// Custom vehicle marker icon - red teardrop like Google Maps destination pin
const vehicleIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16C0 24.837 16 40 16 40C16 40 32 24.837 32 16C32 7.163 24.837 0 16 0Z" fill="#EA4335"/>
      <circle cx="16" cy="16" r="8" fill="#FFFFFF"/>
      <circle cx="16" cy="16" r="5" fill="#EA4335"/>
    </svg>
  `)}`,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
});

type GpsPoint = { time: number; lat: number; lng: number };

const MapComponent: React.FC = () => {
  // Australia (Brisbane area)
  const center: [number, number] = [-27.4698, 153.0251];
  const { selectedTime } = useTimeContext();
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showFullRoute, setShowFullRoute] = useState<boolean>(false);
  const [loadingGps, setLoadingGps] = useState<boolean>(false);
  const [gpsLoadComplete, setGpsLoadComplete] = useState<boolean>(false);
  const resetZoomRef = React.useRef<(() => void) | null>(null);

  // Listen to filters:apply event to get vehicle and date selection
  // Also listen for gps:data event to receive GPS data directly from VehicleDashboard
  useEffect(() => {
    const onApply = (e: any) => {
      console.log('🗺️ MapComponent received filters:apply event:', e?.detail);
      const deviceId = String(e?.detail?.device_id || '');
      const date = String(e?.detail?.date || '');
      console.log('🗺️ Extracted device_id:', deviceId, 'date:', date);
      if (deviceId && date) {
        console.log('🗺️ Setting GPS data loading for:', { deviceId, date });
        setSelectedVehicleId(deviceId);
        setSelectedDate(date);
      } else {
        console.warn('🗺️ Missing device_id or date in event:', { deviceId, date });
      }
    };
    
    const onGpsData = (e: any) => {
      console.log('🗺️ MapComponent received gps:data event:', e?.detail);
      const gpsData = e?.detail?.gpsData;
      if (Array.isArray(gpsData) && gpsData.length > 0) {
        console.log('🗺️ Received GPS data directly from VehicleDashboard:', gpsData.length, 'points');
        console.log('🗺️ First GPS point from event:', gpsData[0]);
        setLoadingGps(true);
        setGpsLoadComplete(false);
        // Process the GPS data directly
        const processedPoints: GpsPoint[] = gpsData.map((p: any) => {
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
            if (p.lat !== undefined && p.lat !== null) {
              const n = toNumber(p.lat);
              if (Number.isFinite(n) && Math.abs(n) <= 90) return n;
            }
            const v = p.latitude ?? p.Lat ?? p.LAT;
            if (v !== undefined && v !== null) {
              const n = toNumber(v);
              if (Number.isFinite(n) && Math.abs(n) <= 90) return n;
            }
            return NaN;
          };
          
          const getLng = (p: any): number => {
            if (p.lng !== undefined && p.lng !== null) {
              const n = toNumber(p.lng);
              if (Number.isFinite(n) && Math.abs(n) <= 180) return n;
            }
            const v = p.longitude ?? p.lon ?? p.Lng ?? p.LNG;
            if (v !== undefined && v !== null) {
              const n = toNumber(v);
              if (Number.isFinite(n) && Math.abs(n) <= 180) return n;
            }
            return NaN;
          };
          
          const lat = getLat(p);
          const lng = getLng(p);
          
          // Handle time - can be number (timestamp) or string (HH:mm:ss format)
          let timeNum: number;
          if (typeof p.time === 'number') {
            timeNum = p.time;
          } else if (typeof p.time === 'string') {
            // Check if it's HH:mm:ss format
            if (p.time.match(/^\d{2}:\d{2}:\d{2}$/)) {
              // Parse HH:mm:ss format - need base date from context
              const baseDate = new Date();
              baseDate.setHours(0, 0, 0, 0);
              const [hh, mm, ss] = p.time.split(':').map(Number);
              timeNum = baseDate.getTime() + (hh || 0) * 3600000 + (mm || 0) * 60000 + (ss || 0) * 1000;
            } else {
              // Try to parse as ISO string or other format
              timeNum = Date.parse(p.time) || Date.now();
            }
          } else {
            // Fallback to timestamp or current time
            timeNum = p.timestamp || p.timeStamp || Date.now();
          }
          
          return { time: timeNum, lat, lng };
        }).filter((p: GpsPoint) => 
          Number.isFinite(p.lat) && Number.isFinite(p.lng) && 
          Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
        );
        
        if (processedPoints.length > 0) {
          processedPoints.sort((a, b) => a.time - b.time);
          console.log('🗺️ Processed GPS points from event:', processedPoints.length);
          console.log('🗺️ Sample processed points:', processedPoints.slice(0, 3));
          setGpsPoints(processedPoints);
          setGpsLoadComplete(true);
          console.log('✅ GPS points set from event, map should update');
        } else {
          console.warn('⚠️ GPS data from event processed but no valid points found');
          console.warn('⚠️ Sample raw GPS data:', gpsData.slice(0, 3));
          setGpsLoadComplete(true);
        }
        setLoadingGps(false);
      } else {
        console.log('🗺️ GPS data event received but data is empty or not an array');
      }
    };
    
    window.addEventListener('filters:apply', onApply as any);
    window.addEventListener('gps:data', onGpsData as any);
    console.log('🗺️ MapComponent listening for filters:apply and gps:data events');
    return () => {
      window.removeEventListener('filters:apply', onApply as any);
      window.removeEventListener('gps:data', onGpsData as any);
    };
  }, []);

  useEffect(() => {
    if (!selectedVehicleId || !selectedDate) {
      setGpsPoints([]);
      setLoadingGps(false);
      setGpsLoadComplete(false);
      return;
    }

    const loadGps = async () => {
      try {
        setLoadingGps(true);
        setGpsLoadComplete(false);
        // Use the same endpoint as VehicleDashboard: create_json.php (via proxy)
        // Use relative URL so proxy can handle it
        const apiUrl = `/reet_python/create_json.php?reading_date=${encodeURIComponent(selectedDate)}&devices_serial_no=${encodeURIComponent(selectedVehicleId)}`;
        
        console.log('📍 Fetching GPS data from:', apiUrl);
        
        const apiRes = await fetch(apiUrl, { 
          headers: { 'Accept': 'application/json' }, 
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });
        if (!apiRes.ok) {
          const errorText = await apiRes.text().catch(() => 'Unable to read error response');
          console.error('❌ MapComponent API Error:', errorText.substring(0, 500));
          throw new Error(`API failed with status ${apiRes.status}: ${apiRes.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await apiRes.text();
        const contentType = apiRes.headers.get('content-type');
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        try {
          json = JSON.parse(text);
          console.log('✅ MapComponent: Successfully parsed JSON (Content-Type was:', contentType, ')');
        } catch (parseError) {
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('❌ MapComponent: API returned HTML. Content-Type:', contentType);
            console.error('❌ Response body (first 1000 chars):', text.substring(0, 1000));
            throw new Error(`API returned HTML instead of JSON`);
          } else {
            console.error('❌ MapComponent: API invalid JSON. Content-Type:', contentType);
            throw new Error(`API returned invalid JSON`);
          }
        }
        // The create_json.php API returns data directly (not wrapped in {status, message, data})
        const payload: any = json;
        
        console.log('📍 Full API Response keys:', Object.keys(payload || {}));
        console.log('📍 Full API Response (first 2000 chars):', JSON.stringify(payload).substring(0, 2000));
        console.log('📍 gpsPerSecond from API:', payload?.gpsPerSecond);
        console.log('📍 gpsPerSecond type:', typeof payload?.gpsPerSecond);
        console.log('📍 gpsPerSecond isArray:', Array.isArray(payload?.gpsPerSecond));
        if (Array.isArray(payload?.gpsPerSecond) && payload.gpsPerSecond.length > 0) {
          console.log('📍 First gpsPerSecond point:', payload.gpsPerSecond[0]);
          console.log('📍 First 3 gpsPerSecond points:', payload.gpsPerSecond.slice(0, 3));
        }
        
        // Get timestamps array for date reference
        const timestamps = Array.isArray(payload?.timestamps) ? payload.timestamps : [];
        console.log('📍 Timestamps array:', timestamps);
        console.log('📍 Timestamps length:', timestamps.length);
        if (timestamps.length > 0) {
          console.log('📍 First timestamp:', timestamps[0]);
          console.log('📍 First timestamp type:', typeof timestamps[0]);
        }
        
        let baseDate: Date;
        if (timestamps.length > 0 && timestamps[0]) {
          const firstTimestamp = timestamps[0];
          // Handle different timestamp formats
          if (typeof firstTimestamp === 'string') {
            // Check if it's a Unix timestamp (numeric string)
            const numTimestamp = Number(firstTimestamp);
            if (Number.isFinite(numTimestamp) && numTimestamp > 0) {
              // Unix timestamp - convert to milliseconds if needed
              const ts = numTimestamp < 1e12 ? numTimestamp * 1000 : numTimestamp;
              baseDate = new Date(ts);
            } else {
              // String format: "2025-11-04T20:03:00" or "2025-11-04"
              baseDate = new Date(firstTimestamp.split('T')[0]);
            }
          } else if (typeof firstTimestamp === 'number') {
            // Unix timestamp - convert to milliseconds if needed
            const ts = firstTimestamp < 1e12 ? firstTimestamp * 1000 : firstTimestamp;
            baseDate = new Date(ts);
          } else if (firstTimestamp.timestamp && typeof firstTimestamp.timestamp === 'string') {
            // Object format: { timestamp: "2025-11-04T20:03:00" }
            baseDate = new Date(firstTimestamp.timestamp.split('T')[0]);
          } else if (firstTimestamp.date && typeof firstTimestamp.date === 'string') {
            // Object format: { date: "2025-11-04" }
            baseDate = new Date(firstTimestamp.date);
          } else {
            // Fallback to selectedDate
            baseDate = new Date(selectedDate);
          }
        } else {
          baseDate = new Date(selectedDate);
        }
        
        // Validate baseDate is valid
        if (!Number.isFinite(baseDate.getTime())) {
          console.warn('📍 Invalid baseDate, using selectedDate:', selectedDate);
          baseDate = new Date(selectedDate);
          if (!Number.isFinite(baseDate.getTime())) {
            // Last resort: use today's date
            baseDate = new Date();
            baseDate.setHours(0, 0, 0, 0);
            console.warn('📍 Using today as fallback baseDate');
          }
        }
        
        baseDate.setHours(0, 0, 0, 0);
        const baseDateStr = Number.isFinite(baseDate.getTime()) ? baseDate.toISOString() : 'invalid';
        console.log('📍 Base date for parsing:', baseDateStr);
        
        const parseHMS = (hms: string) => {
          const [hh, mm, ss] = String(hms).split(':').map((n: string) => Number(n));
          return baseDate.getTime() + (hh || 0) * 3600000 + (mm || 0) * 60000 + (ss || 0) * 1000;
        };
        
        // Get GPS data from various possible field names
        // The API might return GPS data in different structures
        let arr: any[] = [];
        
        // Try different possible field names
        if (Array.isArray(payload?.gpsPerSecond) && payload.gpsPerSecond.length > 0) {
          arr = payload.gpsPerSecond;
          console.log('📍 Found GPS data in gpsPerSecond');
        } else if (Array.isArray(payload?.gps_per_second) && payload.gps_per_second.length > 0) {
          arr = payload.gps_per_second;
          console.log('📍 Found GPS data in gps_per_second');
        } else if (Array.isArray(payload?.gps) && payload.gps.length > 0) {
          arr = payload.gps;
          console.log('📍 Found GPS data in gps');
        } else if (Array.isArray(payload?.locations) && payload.locations.length > 0) {
          arr = payload.locations;
          console.log('📍 Found GPS data in locations');
        } else if (Array.isArray(payload?.gpsPoints) && payload.gpsPoints.length > 0) {
          arr = payload.gpsPoints;
          console.log('📍 Found GPS data in gpsPoints');
        } else if (Array.isArray(payload?.track) && payload.track.length > 0) {
          arr = payload.track;
          console.log('📍 Found GPS data in track');
        } else if (Array.isArray(payload?.route) && payload.route.length > 0) {
          arr = payload.route;
          console.log('📍 Found GPS data in route');
        } else if (Array.isArray(payload) && payload.length > 0) {
          // Check if payload itself is an array of GPS points
          const firstItem = payload[0];
          if (firstItem && (firstItem.lat !== undefined || firstItem.latitude !== undefined || 
              firstItem.lng !== undefined || firstItem.longitude !== undefined ||
              (Array.isArray(firstItem.coordinates) && firstItem.coordinates.length >= 2))) {
            arr = payload;
            console.log('📍 Found GPS data as direct array in payload');
          }
        }
        
        console.log('📍 GPS Data Structure:', {
          hasGpsPerSecond: !!payload?.gpsPerSecond,
          isArray: Array.isArray(payload?.gpsPerSecond),
          length: arr.length,
          firstPoint: arr.length > 0 ? arr[0] : null,
          payloadKeys: Object.keys(payload || {}),
          payloadType: Array.isArray(payload) ? 'array' : typeof payload,
          samplePayload: JSON.stringify(payload).substring(0, 500)
        });
        
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
          // Direct access to lat field first (most common)
          if (p.lat !== undefined && p.lat !== null) {
            const n = toNumber(p.lat);
            console.log(`📍 getLat: raw value = ${p.lat}, toNumber = ${n}, isFinite = ${Number.isFinite(n)}`);
            if (Number.isFinite(n)) {
              // If already in decimal degrees (between -90 and 90), use as-is
              if (Math.abs(n) <= 90) {
                console.log(`📍 getLat: Already in decimal degrees, returning ${n}`);
                return n;
              }
              // Handle DDDMM.MMMM format (e.g., 3754.56246 = 37°54.56246')
              // Check if it's in DDDMM.MMMM format (between 1000 and 10000)
              if (Math.abs(n) >= 1000 && Math.abs(n) < 10000) {
                // Extract degrees (first 2 digits) and minutes (rest including decimal)
                // Example: 3754.56246 → degrees = 37, minutes = 54.56246
                const absValue = Math.abs(n);
                const degrees = Math.floor(absValue / 100);
                const minutes = absValue % 100; // This correctly gets 54.56246 from 3754.56246
                let result = degrees + minutes / 60;
                // For Australia (southern hemisphere), latitude should be negative
                // If degrees > 20 (Australia is around 37°S), make it negative
                if (degrees > 20 && n > 0) {
                  result = -result;
                } else if (n < 0) {
                  result = -result;
                }
                console.log(`📍 Lat conversion: ${n} → ${degrees}°${minutes.toFixed(5)}' → ${result.toFixed(6)}°`);
                return result;
              } else {
                console.warn(`📍 getLat: Value ${n} doesn't match DDDMM.MMMM format (expected 1000-10000)`);
              }
            } else {
              console.warn(`📍 getLat: Value ${p.lat} is not a valid number`);
            }
          } else {
            console.warn(`📍 getLat: p.lat is undefined or null`);
          }
          // Fallback to other field names
          const v = p.Lat ?? p.LAT ?? p.latitude ?? p.Latitude ?? p.gpsLat ?? p.lat_val ?? p.latE7;
          if (v === undefined || v === null) return NaN;
          let n = toNumber(v);
          if (!Number.isFinite(n) && Array.isArray(p.coordinates)) n = toNumber(p.coordinates[1]);
          if (!Number.isFinite(n) && Array.isArray(p.coord)) n = toNumber(p.coord[1]);
          if (Number.isFinite(n) && Math.abs(n) <= 90) return n;
          if (Number.isFinite(n) && Math.abs(n) >= 1000 && Math.abs(n) < 10000) {
            const wholePart = Math.floor(Math.abs(n));
            const degrees = Math.floor(wholePart / 100);
            const minutes = wholePart % 100 + (Math.abs(n) - wholePart);
            let result = degrees + minutes / 60;
            if (degrees > 20 && n > 0) result = -result;
            else if (n < 0) result = -result;
            return result;
          }
          return n;
        };
        
        const getLng = (p: any): number => {
          // Direct access to lng field first (most common)
          if (p.lng !== undefined && p.lng !== null) {
            const n = toNumber(p.lng);
            if (Number.isFinite(n)) {
              // If already in decimal degrees (between -180 and 180), use as-is
              if (Math.abs(n) <= 180) return n;
              // Handle DDDMM.MMMM format (e.g., 14509.45524 = 145°09.45524')
              // Check if it's in DDDMM.MMMM format (between 10000 and 100000)
              if (Math.abs(n) >= 10000 && Math.abs(n) < 100000) {
                // Extract degrees (first 3 digits) and minutes (rest including decimal)
                // Example: 14509.45524 → degrees = 145, minutes = 9.45524
                const absValue = Math.abs(n);
                const degrees = Math.floor(absValue / 100);
                const minutes = absValue % 100; // This correctly gets 9.45524 from 14509.45524
                let result = degrees + minutes / 60;
                // Longitude: positive for eastern hemisphere (Australia), negative for western
                if (n < 0) {
                  result = -result;
                }
                console.log(`📍 Lng conversion: ${n} → ${degrees}°${minutes.toFixed(5)}' → ${result.toFixed(6)}°`);
                return result;
              }
            }
          }
          // Fallback to other field names
          const v = p.Lng ?? p.LNG ?? p.lon ?? p.long ?? p.Long ?? p.longitude ?? p.Longitude ?? p.gpsLng ?? p.lng_val ?? p.lngE7;
          if (v === undefined || v === null) return NaN;
          let n = toNumber(v);
          if (!Number.isFinite(n) && Array.isArray(p.coordinates)) n = toNumber(p.coordinates[0]);
          if (!Number.isFinite(n) && Array.isArray(p.coord)) n = toNumber(p.coord[0]);
          if (Number.isFinite(n) && Math.abs(n) <= 180) return n;
          if (Number.isFinite(n) && Math.abs(n) >= 10000 && Math.abs(n) < 100000) {
            const wholePart = Math.floor(Math.abs(n));
            const degrees = Math.floor(wholePart / 100);
            const minutes = wholePart % 100 + (Math.abs(n) - wholePart);
            let result = degrees + minutes / 60;
            if (n < 0) result = -result;
            return result;
          }
          return n;
        };
        
        console.log('📍 Processing GPS array, length:', arr.length);
        const pts: GpsPoint[] = arr.map((p: any, idx: number) => {
          const rawLat = p.lat;
          const rawLng = p.lng;
          const lat = getLat(p);
          const lng = getLng(p);
          
          // Debug all points (not just first 5)
          console.log(`📍 GPS point ${idx}:`, { 
            raw: { lat: rawLat, lng: rawLng },
            converted: { lat, lng },
            isValid: Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180,
            fullPoint: p
          });
          
          // If lat/lng are invalid, try to extract from nested structure
          let finalLat = lat;
          let finalLng = lng;
          
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            console.warn(`📍 Point ${idx} has invalid coordinates, trying alternatives...`);
            // Try alternative structures
            if (p.coordinates && Array.isArray(p.coordinates) && p.coordinates.length >= 2) {
              // GeoJSON format: [lng, lat]
              finalLng = toNumber(p.coordinates[0]);
              finalLat = toNumber(p.coordinates[1]);
              console.log(`📍 Using coordinates array:`, { lat: finalLat, lng: finalLng });
            } else if (p.position && typeof p.position === 'object') {
              finalLat = toNumber(p.position.lat ?? p.position.latitude);
              finalLng = toNumber(p.position.lng ?? p.position.longitude);
              console.log(`📍 Using position object:`, { lat: finalLat, lng: finalLng });
            } else if (p.location && typeof p.location === 'object') {
              finalLat = toNumber(p.location.lat ?? p.location.latitude);
              finalLng = toNumber(p.location.lng ?? p.location.longitude);
              console.log(`📍 Using location object:`, { lat: finalLat, lng: finalLng });
            } else if (p.geo && typeof p.geo === 'object') {
              finalLat = toNumber(p.geo.lat ?? p.geo.latitude);
              finalLng = toNumber(p.geo.lng ?? p.geo.longitude);
              console.log(`📍 Using geo object:`, { lat: finalLat, lng: finalLng });
            } else if (p.gps && typeof p.gps === 'object') {
              finalLat = toNumber(p.gps.lat ?? p.gps.latitude);
              finalLng = toNumber(p.gps.lng ?? p.gps.longitude);
              console.log(`📍 Using gps object:`, { lat: finalLat, lng: finalLng });
            } else if (typeof p === 'object' && p !== null) {
              // Try all possible field name variations
              const allKeys = Object.keys(p);
              console.log(`📍 Available keys in point:`, allKeys);
              for (const key of allKeys) {
                const lowerKey = key.toLowerCase();
                if ((lowerKey.includes('lat') || lowerKey.includes('latitude')) && finalLat === lat) {
                  const val = toNumber(p[key]);
                  if (Number.isFinite(val) && Math.abs(val) <= 90) {
                    finalLat = val;
                    console.log(`📍 Found latitude in key "${key}":`, finalLat);
                  }
                }
                if ((lowerKey.includes('lng') || lowerKey.includes('lon') || lowerKey.includes('longitude')) && finalLng === lng) {
                  const val = toNumber(p[key]);
                  if (Number.isFinite(val) && Math.abs(val) <= 180) {
                    finalLng = val;
                    console.log(`📍 Found longitude in key "${key}":`, finalLng);
                  }
                }
              }
            }
          }
          
          return {
          time: (() => {
              // Try timestamp field first (ISO format: "2025-11-04T20:03:00")
            const ts = p.timestamp ?? p.timeStamp ?? p.ts ?? p.epoch ?? null;
            if (ts != null) {
                if (typeof ts === 'string') {
                  const parsed = Date.parse(ts);
                  if (Number.isFinite(parsed)) return parsed;
                } else {
              const n = Number(ts);
              if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
            }
              }
              // Fallback to time field (HH:mm:ss format)
              const timeStr = String(p.time ?? p.Time ?? p.TIME ?? p.hms ?? '00:00:00');
              const parsedTime = parseHMS(timeStr);
              return parsedTime;
          })(),
            lat: finalLat,
            lng: finalLng
          };
        });
        
        console.log('📍 Points before filtering:', pts.length);
        console.log('📍 Sample points before filter:', pts.slice(0, 3));
        
        const filteredPts = pts.filter(p => {
            const valid = Number.isFinite(p.lat) && Number.isFinite(p.lng) && 
                         Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
            if (!valid) {
              console.warn('📍 Filtered invalid GPS point:', { lat: p.lat, lng: p.lng, time: p.time });
            }
            return valid;
          });
        
        console.log('📍 Points after filtering:', filteredPts.length);
        filteredPts.sort((a, b) => a.time - b.time);
        console.log('📍 GPS Points loaded:', filteredPts.length, 'points');
        console.log('📍 Total GPS data from API:', arr.length, 'points');
        if (filteredPts.length > 0) {
          const firstTime = Number.isFinite(filteredPts[0].time) ? new Date(filteredPts[0].time).toISOString() : 'invalid';
          const lastTime = Number.isFinite(filteredPts[filteredPts.length - 1].time) ? new Date(filteredPts[filteredPts.length - 1].time).toISOString() : 'invalid';
          console.log('📍 First GPS point:', { lat: filteredPts[0].lat, lng: filteredPts[0].lng, time: firstTime });
          console.log('📍 Last GPS point:', { lat: filteredPts[filteredPts.length - 1].lat, lng: filteredPts[filteredPts.length - 1].lng, time: lastTime });
          console.log('📍 Sample GPS points (first 5):', filteredPts.slice(0, 5).map(p => ({ lat: p.lat, lng: p.lng })));
          console.log('📍 Map will center on:', [filteredPts[0].lat, filteredPts[0].lng]);
        } else if (arr.length > 0) {
          console.error('⚠️ GPS data received but all points were filtered out!');
          console.error('⚠️ Sample raw points:', arr.slice(0, 5));
          console.error('⚠️ Check if lat/lng values are valid numbers');
        } else {
          console.error('⚠️ No GPS data found in API response');
          console.error('⚠️ Payload keys:', Object.keys(payload || {}));
          console.error('⚠️ Full payload (first 1000 chars):', JSON.stringify(payload).substring(0, 1000));
        }
        setGpsPoints(filteredPts);
        setGpsLoadComplete(true);
        
        // Force map update
        if (filteredPts.length > 0) {
          console.log('✅ GPS points set successfully, map should update');
        } else {
          console.error('❌ No valid GPS points to display');
        }
      } catch (e) {
        console.error('❌ Error loading GPS data:', e);
        setGpsPoints([]);
        setGpsLoadComplete(true);
      } finally {
        setLoadingGps(false);
      }
    };
    loadGps();
  }, [selectedVehicleId, selectedDate]);

  const currentPosition = useMemo<[number, number] | null>(() => {
    if (gpsPoints.length === 0) return null;
    
    // Calculate target time with validation
    let t: number;
    if (selectedTime) {
      t = selectedTime.getTime();
      if (!Number.isFinite(t)) {
        console.warn('🗺️ Invalid selectedTime, using midpoint');
        t = Math.floor((gpsPoints[0].time + gpsPoints[gpsPoints.length - 1].time) / 2);
      }
    } else {
      const firstTime = gpsPoints[0].time;
      const lastTime = gpsPoints[gpsPoints.length - 1].time;
      if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
        // Fallback to first valid point's time
        const firstValid = gpsPoints.find(p => Number.isFinite(p.time));
        if (firstValid) {
          t = firstValid.time;
        } else {
          console.warn('🗺️ No valid GPS point times found');
          return null;
        }
      } else {
        t = Math.floor((firstTime + lastTime) / 2);
      }
    }
    
    // Validate t is finite
    if (!Number.isFinite(t)) {
      console.warn('🗺️ Invalid time value, using first point');
      const firstValid = gpsPoints.find(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (firstValid) return [firstValid.lat, firstValid.lng];
      return null;
    }
    
    let lo = 0, hi = gpsPoints.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (gpsPoints[mid].time < t) lo = mid + 1; else hi = mid;
    }
    const idx = lo;
    const prev = gpsPoints[Math.max(0, idx - 1)];
    const next = gpsPoints[Math.min(gpsPoints.length - 1, idx)];
    const pick = Math.abs((prev?.time ?? Infinity) - t) <= Math.abs((next?.time ?? Infinity) - t) ? prev : next;
    if (!pick || !Number.isFinite(pick.lat) || !Number.isFinite(pick.lng)) {
      // Fallback to first valid point
      const firstValid = gpsPoints.find(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (firstValid) return [firstValid.lat, firstValid.lng];
      return null;
    }
    const position: [number, number] = [pick.lat, pick.lng];
    
    // Safe date formatting - only call toISOString if date is valid
    const timeStr = Number.isFinite(t) ? new Date(t).toISOString() : 'invalid';
    console.log('🗺️ MapComponent: currentPosition updated for time', timeStr, 'position:', position);
    return position;
  }, [selectedTime, gpsPoints]);

  const pathPositions = useMemo<[number, number][]>(() => {
    return gpsPoints
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
      .map(p => [p.lat, p.lng] as [number, number]);
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

  // Fit map to show wide area with road names visible (like second image)
  const FitBounds: React.FC<{ positions: [number, number][], shouldFit: boolean }> = ({ positions, shouldFit }) => {
    const map = useMap();
    const hasFittedRef = React.useRef(false);
    React.useEffect(() => {
      if (positions.length > 0 && shouldFit && !hasFittedRef.current) {
        // Use fitBounds to show entire route with wide area, but keep road names visible
        try {
          const bounds = L.latLngBounds(positions);
          // Fit bounds with padding to show wide area, but limit maxZoom so road names are visible
          map.fitBounds(bounds, {
            padding: [80, 80], // Padding to show wider area
            maxZoom: 9, // Limit zoom so it stays zoomed out but road names are visible
            animate: true
          });
          hasFittedRef.current = true;
          console.log('🗺️ Initial zoom to show wide area with road names visible');
        } catch (e) {
          // Fallback to center view - zoom level 9 shows wide area with road names
          const midIdx = Math.floor(positions.length / 2);
          const centerPos = positions[midIdx];
          if (centerPos) {
            map.setView(centerPos, 9, {
              animate: true,
              duration: 0.5
            });
            hasFittedRef.current = true;
            console.log('🗺️ Initial zoom to show wide area (level 9)');
          }
        }
      }
    }, [positions, map, shouldFit]);
    return null;
  };

  // Component to reset zoom to show only pointer (very zoomed out view)
  const ResetZoom: React.FC<{ 
    positions: [number, number][], 
    currentPosition: [number, number] | null,
    onReset: () => void, 
    resetRef: React.MutableRefObject<(() => void) | null> 
  }> = ({ positions, currentPosition, onReset, resetRef }) => {
    const map = useMap();
    const handleReset = () => {
      // Get center position - prefer current position, otherwise use center of route
      let centerPos: [number, number] | null = null;
      
      if (currentPosition && Number.isFinite(currentPosition[0]) && Number.isFinite(currentPosition[1])) {
        centerPos = currentPosition;
      } else if (positions.length > 0) {
        // Use center of route
        const midIdx = Math.floor(positions.length / 2);
        centerPos = positions[midIdx];
      }
      
      if (centerPos) {
        // Zoom out to show wide area with road names visible (like second image)
        if (positions.length > 0) {
          try {
            const bounds = L.latLngBounds(positions);
            map.fitBounds(bounds, {
              padding: [120, 120], // Large padding to show wider area
              maxZoom: 9, // Keep zoomed out but road names visible
              animate: true
            });
          } catch (e) {
            // Fallback to center view - level 9 shows wide area with road names
            map.setView(centerPos, 9, {
              animate: true,
              duration: 0.5
            });
          }
        } else {
          // Set to level 9 - wide view with road names visible
          map.setView(centerPos, 9, {
            animate: true,
            duration: 0.5
          });
        }
        onReset();
        console.log('🗺️ Reset zoom to show wide area with road names visible');
      }
    };
    
    // Expose reset function via ref
    React.useEffect(() => {
      resetRef.current = handleReset;
      return () => {
        resetRef.current = null;
      };
    }, [map, positions, currentPosition, onReset, resetRef]);
    
    return null;
  };

  // Component to zoom and follow the vehicle pointer as it moves with scrubber time
  const VehicleMarker: React.FC<{ position: [number, number] | null, showFullRoute: boolean, onZoomChange: () => void }> = ({ position, showFullRoute, onZoomChange }) => {
    const map = useMap();
    React.useEffect(() => {
      // If showFullRoute is true, don't zoom to vehicle - let ResetZoom handle it
      if (showFullRoute) {
        // Reset the flag after a short delay so it can be used again
        const timer = setTimeout(() => {
          onZoomChange();
        }, 1000);
        return () => clearTimeout(timer);
      }
      
      if (position && Number.isFinite(position[0]) && Number.isFinite(position[1])) {
        // Don't zoom in close - keep current zoom level or use moderate zoom
        // Only center on the vehicle position without zooming in
        const currentZoom = map.getZoom();
        // Keep current zoom if it's reasonable (between 9-15), otherwise use 11
        const targetZoom = (currentZoom >= 9 && currentZoom <= 15) ? currentZoom : 11;
        
        map.setView(position, targetZoom, {
          animate: true,
          duration: 0.5
        });
        console.log('🗺️ Centered on vehicle position:', position, 'zoom:', targetZoom);
      }
    }, [position, map, showFullRoute, onZoomChange]);
    return null;
  };

  // Component that ensures marker position updates when position changes
  const VehiclePositionMarker: React.FC<{ 
    position: [number, number]; 
    icon: L.Icon; 
    selectedTime: Date | null;
  }> = ({ position, icon, selectedTime }) => {
    const markerRef = React.useRef<L.Marker | null>(null);
    const map = useMap();
    
    // Create marker once on mount
    React.useEffect(() => {
      if (!markerRef.current) {
        markerRef.current = L.marker(position, { icon }).addTo(map);
        const timeDisplay = selectedTime && Number.isFinite(selectedTime.getTime()) 
          ? new Date(selectedTime).toLocaleString() 
          : '—';
        const popupContent = `
          <div>
            <h4>Vehicle Location</h4>
            <p><strong>Coordinates:</strong> ${position[0].toFixed(6)}, ${position[1].toFixed(6)}</p>
            <p><strong>Time:</strong> ${timeDisplay}</p>
          </div>
        `;
        markerRef.current.bindPopup(popupContent);
        const timeStr = selectedTime && Number.isFinite(selectedTime.getTime()) 
          ? new Date(selectedTime).toISOString() 
          : 'null';
        console.log('🗺️ Marker created at:', position, 'at time:', timeStr);
      }
      
      return () => {
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
          markerRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]); // Only run on mount/unmount - position/icon/selectedTime handled by update effect
    
    // Update position when it changes
    React.useEffect(() => {
      if (markerRef.current) {
        markerRef.current.setLatLng(position);
        const timeDisplay = selectedTime && Number.isFinite(selectedTime.getTime()) 
          ? new Date(selectedTime).toLocaleString() 
          : '—';
        markerRef.current.setPopupContent(`
          <div>
            <h4>Vehicle Location</h4>
            <p><strong>Coordinates:</strong> ${position[0].toFixed(6)}, ${position[1].toFixed(6)}</p>
            <p><strong>Time:</strong> ${timeDisplay}</p>
          </div>
        `);
        const timeStr = selectedTime && Number.isFinite(selectedTime.getTime()) 
          ? new Date(selectedTime).toISOString() 
          : 'null';
        console.log('🗺️ Marker position updated to:', position, 'at time:', timeStr);
      }
    }, [position, selectedTime]);
    
    return null;
  };

  // Debug: Log when selectedTime changes
  React.useEffect(() => {
    const timeStr = selectedTime && Number.isFinite(selectedTime.getTime()) 
      ? new Date(selectedTime).toISOString() 
      : 'null';
    console.log('🗺️ MapComponent: selectedTime changed to', timeStr);
    // Reset showFullRoute when time changes so it can zoom to vehicle again
    if (selectedTime && showFullRoute) {
      setShowFullRoute(false);
    }
  }, [selectedTime, showFullRoute]);

  // Debug: Log map rendering state
  React.useEffect(() => {
    console.log('🗺️ Map rendering state:', {
      gpsPointsCount: gpsPoints.length,
      hasCurrentPosition: currentPosition !== null,
      currentPosition,
      pathPositionsCount: pathPositions.length,
      arrowMarkersCount: arrowMarkers.length,
      selectedVehicleId,
      selectedDate
    });
  }, [gpsPoints, currentPosition, pathPositions, arrowMarkers, selectedVehicleId, selectedDate]);

  return (
    <div className={styles.mapContainer}>
      {gpsPoints.length === 0 && selectedVehicleId && selectedDate && gpsLoadComplete && !loadingGps && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 193, 7, 0.9)',
          padding: '10px 20px',
          borderRadius: '5px',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#000'
        }}>
          ⚠️ No GPS data available for this vehicle and date
        </div>
      )}
      <MapContainer
        center={currentPosition ?? (pathPositions.length > 0 ? pathPositions[0] : center)}
        zoom={gpsPoints.length > 0 ? 9 : 8}
        minZoom={0}
        maxZoom={19}
        className={styles.map}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        key={`map-${gpsPoints.length}-${selectedVehicleId}-${selectedDate}`}
      >
        {/* Google Maps style tiles using CartoDB Positron (light, clean style similar to Google Maps) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          minZoom={0}
          maxZoom={19}
        />
        {/* Draw the path using full gps track - Google Maps blue route style */}
        {/* Show route in lighter style when zoomed in to pointer */}
        {pathPositions.length >= 2 && (
          <Polyline 
            positions={pathPositions} 
            pathOptions={{ 
              color: '#4285F4', 
              weight: currentPosition ? 3 : 5, // Thinner when following pointer
              opacity: currentPosition ? 0.6 : 0.9, // Lighter when following pointer
              lineCap: 'round',
              lineJoin: 'round'
            }} 
          />
        )}
        {/* Fit map to show entire route initially (only when route first loads) */}
        {pathPositions.length > 0 && !currentPosition && (
          <FitBounds positions={pathPositions} shouldFit={true} />
        )}
        {/* Reset zoom component - exposes reset function */}
        {pathPositions.length > 0 && (
          <ResetZoom 
            positions={pathPositions}
            currentPosition={currentPosition}
            onReset={() => setShowFullRoute(true)}
            resetRef={resetZoomRef}
          />
        )}
        {/* Zoom to and follow vehicle pointer as it moves with scrubber time */}
        {currentPosition && (
          <VehicleMarker 
            position={currentPosition} 
            showFullRoute={showFullRoute}
            onZoomChange={() => setShowFullRoute(false)}
          />
        )}
        {/* Vehicle marker that updates position when time changes */}
        {currentPosition && Number.isFinite(currentPosition[0]) && Number.isFinite(currentPosition[1]) && (
          <>
            <VehiclePositionMarker 
              position={currentPosition} 
              icon={vehicleIcon}
              selectedTime={selectedTime}
              key="vehicle-marker"
            />
            {/* Blue accuracy circle - small radius */}
            <Circle
              center={currentPosition}
              radius={5}
              pathOptions={{
                color: '#4285F4',
                fillColor: '#4285F4',
                fillOpacity: 0.2,
                weight: 1.5,
                opacity: 0.6
              }}
            />
          </>
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
