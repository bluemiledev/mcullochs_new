import React from 'react';
import { TimeProvider } from '../../context/TimeContext';
import MapComponent from '../MapComponent';
import FilterControls from '../FilterControls';
import VehicleDashboard from '../../pages/VehicleDashboard';
import styles from './MainLayout.module.css';

const MainLayout: React.FC = () => {
  return (
    <TimeProvider>
      <div className={styles.layout}>
        <FilterControls />
        <div className={styles.main}>
          <MapComponent />
          <div className={styles.content}>
            <VehicleDashboard />
          </div>
        </div>
      </div>
    </TimeProvider>
  );
};

export default MainLayout;
