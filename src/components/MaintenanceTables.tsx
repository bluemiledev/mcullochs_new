import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './MaintenanceTables.module.css';

interface MaintenanceTablesProps {
  reportingOutputs?: Record<string, { value: number; max: number; unit: string }>;
  faultReportingAnalog?: Record<string, { value: number; max: number; unit: string }>;
  faultReportingDigital?: Record<string, { value: number; max: number; unit: string }>;
  selectionStart?: Date | null;
  selectionEnd?: Date | null;
  visibleRows?: Record<string, boolean>;
}

const MaintenanceTables: React.FC<MaintenanceTablesProps> = ({
  reportingOutputs = {},
  faultReportingAnalog = {},
  faultReportingDigital = {},
  selectionStart,
  selectionEnd,
  visibleRows = {}
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Search state for each table
  const [searchQuery1, setSearchQuery1] = useState<string>('');
  const [searchQuery2, setSearchQuery2] = useState<string>('');
  const [searchQuery3, setSearchQuery3] = useState<string>('');
  
  // Helper function to filter by search query
  const matchesSearch = (outputName: string, searchQuery: string): boolean => {
    if (!searchQuery.trim()) return true;
    return outputName.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const handleViewClick = (outputName: string) => {
    // Get vehicle and date from current URL to preserve them
    const deviceId = searchParams.get('device_id') || searchParams.get('vehicle');
    const date = searchParams.get('date');
    
    // Build navigation URL with outputName and preserved vehicle/date parameters
    const params = new URLSearchParams();
    params.set('outputName', outputName);
    if (deviceId) {
      params.set('device_id', deviceId);
    }
    if (date) {
      params.set('date', date);
    }
    
    navigate(`/maintenance-detail?${params.toString()}`);
  };
  // Format minutes to HH:MM:SS
  const formatMinutesToHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Calculate range in minutes
  let rangeMinutes = 720; // Default to full day (6 AM to 6 PM)
  if (selectionStart && selectionEnd) {
    const startTime = selectionStart.getTime();
    const endTime = selectionEnd.getTime();
    rangeMinutes = Math.round((endTime - startTime) / (60 * 1000));
    rangeMinutes = Math.max(0, Math.min(720, rangeMinutes));
  }

  // Calculate current value based on range
  const getCurrentValue = (entry: { value: number; max: number }, unit: string, showUnit: boolean = false): string => {
    // Use the value directly from API, ignore max
    // The value is already in minutes from the API
    let formattedValue: string;
    
    if (unit === 'HOURS') {
      formattedValue = formatMinutesToHours(entry.value);
    } else if (unit === 'METERS') {
      // For distance, use value directly
      formattedValue = `${Math.round(entry.value)}`;
    } else {
      formattedValue = `${Math.round(entry.value)}`;
    }
    
    // Add unit in parentheses if showUnit is true
    if (showUnit) {
      return `${formattedValue} (${unit})`;
    }
    
    return formattedValue;
  };

  return (
    <div id="maintenanceTablesContainer" className={styles.maintenanceTablesContainer}>
      {/* Section 1: MAINTENANCE - REPORTING OUTPUTS */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>MAINTENANCE - REPORTING OUTPUTS</h3>
          <div className={styles.tableActions}>
            <input 
              type="text" 
              placeholder="Search..." 
              className={styles.searchInput}
              value={searchQuery1}
              onChange={(e) => setSearchQuery1(e.target.value)}
            />
          </div>
        </div>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.outputNameHeader}>Output Name</th>
              <th className={styles.outputHeader}>Output</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(reportingOutputs)
              .filter(([outputName]) => {
                // Search filter
                if (!matchesSearch(outputName, searchQuery1)) {
                  return false;
                }
                // Visibility filter
                // If no filters are applied (empty object), show all rows
                if (Object.keys(visibleRows).length === 0) {
                  return true;
                }
                // If filters are applied, only show rows where visibility is explicitly true
                return visibleRows[outputName] === true;
              })
              .map(([outputName, entry]) => (
                <tr key={outputName}>
                  <td className={styles.outputNameCell}>{outputName}</td>
                  <td className={styles.outputCell}>
                    {getCurrentValue(entry, entry.unit, true)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Section 2: MAINTENANCE - FAULT REPORTING OUTPUTS (ANALOG) */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>MAINTENANCE - FAULT REPORTING OUTPUTS (ANALOG)</h3>
          <div className={styles.tableActions}>
            <input 
              type="text" 
              placeholder="Search..." 
              className={styles.searchInput}
              value={searchQuery2}
              onChange={(e) => setSearchQuery2(e.target.value)}
            />
          </div>
        </div>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.outputNameHeader}>Output Name</th>
              <th className={styles.outputHeader}>Output</th>
              <th className={styles.actionHeader}>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(faultReportingAnalog)
              .filter(([outputName]) => {
                // Search filter
                if (!matchesSearch(outputName, searchQuery2)) {
                  return false;
                }
                // Visibility filter
                // If no filters are applied (empty object), show all rows
                if (Object.keys(visibleRows).length === 0) {
                  return true;
                }
                // If filters are applied, only show rows where visibility is explicitly true
                return visibleRows[outputName] === true;
              })
              .map(([outputName, entry]) => (
                <tr key={outputName}>
                  <td className={styles.outputNameCell}>{outputName}</td>
                  <td className={styles.outputCell}>
                    {(() => {
                      const value = getCurrentValue(entry, entry.unit, false);
                      return `${value} (HOURS)`;
                    })()}
                  </td>
                  <td className={styles.actionCell}>
                    <button 
                      className={styles.viewButton}
                      onClick={() => handleViewClick(outputName)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Section 3: MAINTENANCE - FAULT REPORTING OUTPUTS (DIGITAL) */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>MAINTENANCE - FAULT REPORTING OUTPUTS (DIGITAL)</h3>
          <div className={styles.tableActions}>
            <input 
              type="text" 
              placeholder="Search..." 
              className={styles.searchInput}
              value={searchQuery3}
              onChange={(e) => setSearchQuery3(e.target.value)}
            />
          </div>
        </div>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.outputNameHeader}>Output Name</th>
              <th className={styles.outputHeader}>Output</th>
              <th className={styles.actionHeader}>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(faultReportingDigital)
              .filter(([outputName]) => {
                // Search filter
                if (!matchesSearch(outputName, searchQuery3)) {
                  return false;
                }
                // Visibility filter
                // If no filters are applied (empty object), show all rows
                if (Object.keys(visibleRows).length === 0) {
                  return true;
                }
                // If filters are applied, only show rows where visibility is explicitly true
                return visibleRows[outputName] === true;
              })
              .map(([outputName, entry]) => (
                <tr key={outputName}>
                  <td className={styles.outputNameCell}>{outputName}</td>
                  <td className={styles.outputCell}>
                    {(() => {
                      const value = getCurrentValue(entry, entry.unit, false);
                      return `${value} (HOURS)`;
                    })()}
                  </td>
                  <td className={styles.actionCell}>
                    <button 
                      className={styles.viewButton}
                      onClick={() => handleViewClick(outputName)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MaintenanceTables;

