import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './MapComponent.module.css';

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

const MapComponent: React.FC = () => {
  // Brisbane coordinates (center of Australia's east coast)
  const center: [number, number] = [-27.4698, 153.0251];
  
  // Vehicle locations around Brisbane area
  const vehicleLocations = [
    {
      id: '6363298',
      name: '6363298 (2131DQW12)',
      position: [-27.4698, 153.0251] as [number, number],
      status: 'active'
    },
    {
      id: '6363299',
      name: '6363299 (2131DQW13)',
      position: [-27.3804, 153.0314] as [number, number],
      status: 'active'
    },
    {
      id: '6363300',
      name: '6363300 (2131DQW14)',
      position: [-27.5592, 153.0188] as [number, number],
      status: 'maintenance'
    }
  ];

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
        
        {vehicleLocations.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={vehicle.position}
            icon={vehicleIcon}
          >
            <Popup>
              <div className={styles.popupContent}>
                <h4>{vehicle.name}</h4>
                <p>Status: <span className={vehicle.status === 'active' ? styles.activeStatus : styles.maintenanceStatus}>
                  {vehicle.status}
                </span></p>
                <p>Location: Brisbane Area</p>
                <p>Last Update: {new Date().toLocaleTimeString()}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
