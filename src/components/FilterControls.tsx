import React, { useState } from 'react';
import styles from './FilterControls.module.css';

const FilterControls: React.FC = () => {
  const [selectedVehicle, setSelectedVehicle] = useState('6363298 (2131DQW12)');
  const [selectedDate, setSelectedDate] = useState('2025-10-27');

  const vehicles = [
    '6363298 (2131DQW12)',
    '6363299 (2131DQW13)',
    '6363300 (2131DQW14)',
  ];

  return (
    <div className={styles.filterControls}>
      <div className={styles.container}>
        <div className={styles.leftControls}>
          <h1 className={styles.title}>Charts</h1>
          
          <select 
            className={styles.select}
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
          >
            {vehicles.map(vehicle => (
              <option key={vehicle} value={vehicle}>{vehicle}</option>
            ))}
          </select>
          
          <input 
            type="date" 
            className={styles.dateInput}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          
          <button className={styles.showButton}>Show</button>
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
