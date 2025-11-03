import React, { useEffect, useMemo, useState } from 'react';
import styles from './FilterControls.module.css';

const FilterControls: React.FC = () => {
  type Vehicle = { id: string; rego: string };
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('2025-10-27');

  // Initialize from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deviceId = params.get('device_id');
    const date = params.get('date');
    if (deviceId) setSelectedVehicleId(deviceId);
    if (date) setSelectedDate(date);
  }, []);

  // Load vehicles from API with local fallback
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const apiRes = await fetch('https://www.no-reply.com.au/smart_data_link/get-vehicles', { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
        if (!apiRes.ok) throw new Error('bad');
        const json = await apiRes.json();
        const payload: any = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
        const arr: Vehicle[] = Array.isArray(payload) ? payload.map((v: any) => ({ id: String(v.id), rego: String(v.rego ?? v.name ?? v.id) })) : [];
        if (aborted) return;
        setVehicles(arr);
        if (!selectedVehicleId && arr.length) setSelectedVehicleId(arr[0].id);
      } catch {
        // Minimal hardcoded fallback if API fails
        const fallback: Vehicle[] = [];
        if (!aborted) {
          setVehicles(fallback);
        }
      }
    };
    load();
    return () => { aborted = true; };
  }, [selectedVehicleId]);

  const onShow = () => {
    const params = new URLSearchParams(window.location.search);
    if (selectedVehicleId) params.set('device_id', selectedVehicleId);
    if (selectedDate) params.set('date', selectedDate);
    // preserve existing params like manual_reading_ids
    window.location.search = params.toString();
  };

  return (
    <div className={styles.filterControls}>
      <div className={styles.container}>
        <div className={styles.leftControls}>
          <h1 className={styles.title}>Charts</h1>
          
          <select 
            className={styles.select}
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
          >
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.rego}</option>
            ))}
          </select>
          
          <input 
            type="date" 
            className={styles.dateInput}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          
          <button className={styles.showButton} onClick={onShow}>Show</button>
          <button className={styles.filterButton}>Additional Filters</button>
          <span className={styles.clearFilter}>Clear filter</span>
        </div>
        
      
        
        <div className={styles.rightControls}>
          <div className={styles.actionButtons}>
            <button className={styles.actionBtn}>Table</button>
            <button className={styles.actionBtn}>Print</button>
          </div>
          
        
        </div>
      </div>
    </div>
  );
};

export default FilterControls;
