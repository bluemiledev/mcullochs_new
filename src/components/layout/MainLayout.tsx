import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { TimeProvider } from '../../context/TimeContext';
import FilterControls from '../FilterControls';
import VehicleDashboard from '../../pages/VehicleDashboard';
import TableReport from '../../pages/TableReport';
import MaintenanceDetailPage from '../../pages/MaintenanceDetailPage';
import styles from './MainLayout.module.css';

const DashboardContent: React.FC = () => (
  <div className={styles.layout}>
    <FilterControls />
    <div className={styles.main}>
      <div className={styles.content}>
        <VehicleDashboard />
      </div>
    </div>
  </div>
);

const MainLayout: React.FC = () => {
  return (
    <TimeProvider>
      <Routes>
        <Route path="/table" element={<TableReport />} />
        <Route path="/maintenance-detail" element={<MaintenanceDetailPage />} />
        <Route path="/charts" element={<DashboardContent />} />
        <Route path="/charts/" element={<DashboardContent />} />
        <Route path="/" element={<DashboardContent />} />
        <Route path="*" element={<DashboardContent />} />
      </Routes>
    </TimeProvider>
  );
};

export default MainLayout;
