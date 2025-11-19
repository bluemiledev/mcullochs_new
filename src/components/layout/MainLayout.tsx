import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { TimeProvider } from '../../context/TimeContext';
import MapComponent from '../MapComponent';
import FilterControls from '../FilterControls';
import VehicleDashboard from '../../pages/VehicleDashboard';
import TableReport from '../../pages/TableReport';
import styles from './MainLayout.module.css';

const MainLayout: React.FC = () => {
  return (
    <TimeProvider>
      <Routes>
        <Route path="/table" element={<TableReport />} />
        <Route path="/" element={
          <div className={styles.layout}>
            <FilterControls />
            <div className={styles.main}>
              <MapComponent />
              <div className={styles.content}>
                <VehicleDashboard />
              </div>
            </div>
          </div>
        } />
      </Routes>
    </TimeProvider>
  );
};

export default MainLayout;
