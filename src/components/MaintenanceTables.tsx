import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './MaintenanceTables.module.css';

interface MaintenanceTablesProps {
  reportingOutputs?: Record<string, { valueStr: string; reading: string; id: string }>;
  faultReportingAnalog?: Record<string, { valueStr: string; reading: string; id: string }>;
  faultReportingDigital?: Record<string, { valueStr: string; reading: string; id: string }>;
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

  const handleViewClick = (outputName: string, entry: { valueStr: string; reading: string; id: string }) => {
    console.log('🔵 handleViewClick called with:', { outputName, entry });
    
    // Get vehicle and date from current URL to preserve them
    const deviceId = searchParams.get('device_id') || searchParams.get('vehicle');
    const date = searchParams.get('date');
    const shift = searchParams.get('shift') || '6 AM to 6 PM';
    
    console.log('🔵 Current URL params:', { deviceId, date, shift });
    
    if (!deviceId || !date) {
      console.error('❌ Missing deviceId or date, cannot navigate');
      alert('Please select a vehicle and date first');
      return;
    }
    
    // Use the ID from the entry (from API)
    const id = entry.id || '';
    
    // Use the value string and reading directly from API
    const valueStr = entry.valueStr;
    const reading = entry.reading;
    
    // Build navigation URL with all required parameters
    const params = new URLSearchParams();
    params.set('outputName', outputName);
    params.set('id', id);
    params.set('name', outputName); // 'name' parameter for API
    params.set('value', valueStr);
    params.set('reading', reading);
    if (deviceId) {
      params.set('device_id', deviceId);
    }
    if (date) {
      params.set('date', date);
    }
    if (shift) {
      params.set('shift', shift);
    }
    
    const detailUrl = `/maintenance-detail?${params.toString()}`;
    console.log('📋 Navigating to maintenance detail page:', detailUrl);
    console.log('📋 Navigation params:', {
      outputName,
      id,
      nameParam: outputName, // Using outputName for 'name' parameter
      value: valueStr,
      reading,
      deviceId,
      date,
      shift
    });
    
    // Use window.location.href for reliable full-page navigation
    // This ensures the route change happens immediately and the page fully reloads
    console.log('🚀 Navigating to maintenance detail page using window.location:', detailUrl);
    console.log('🚀 Current window.location before navigation:', window.location.href);
    
    // Force immediate navigation - use a small delay to ensure all event handlers complete
    setTimeout(() => {
      try {
        console.log('🚀 Executing navigation now...');
        window.location.href = detailUrl;
      } catch (error) {
        console.error('❌ Error with window.location.href, trying assign:', error);
        try {
          window.location.assign(detailUrl);
        } catch (error2) {
          console.error('❌ Error with window.location.assign:', error2);
          // Last resort: use replace
          window.location.replace(detailUrl);
        }
      }
    }, 10);
  };
  // Display value string from API with reading
  const getDisplayValue = (entry: { valueStr: string; reading: string }): string => {
    // Return value string with reading in parentheses
    return `${entry.valueStr} (${entry.reading})`;
  };

  // Helper function to render a table with two columns
  const renderTwoColumnTable = (
    entries: Array<[string, { valueStr: string; reading: string; id: string }]>,
    searchQuery: string
  ) => {
    // Split entries into two halves
    const midpoint = Math.ceil(entries.length / 2);
    const leftHalf = entries.slice(0, midpoint);
    const rightHalf = entries.slice(midpoint);

    return (
      <div className={styles.twoColumnLayout}>
        {/* Left Column */}
        <div className={styles.column}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th className={styles.outputNameHeader}>Output Name</th>
                <th className={styles.outputHeader}>Output</th>
                <th className={styles.actionHeader}>Action</th>
              </tr>
            </thead>
            <tbody>
              {leftHalf.map(([outputName, entry]) => (
                <tr key={outputName}>
                  <td className={styles.outputNameCell}>{outputName}</td>
                  <td className={styles.outputCell}>
                    {getDisplayValue(entry)}
                  </td>
                  <td className={styles.actionCell}>
                    <button 
                      type="button"
                      className={styles.viewButton}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔘 View button clicked for:', outputName);
                        handleViewClick(outputName, entry);
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Right Column */}
        <div className={styles.column}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th className={styles.outputNameHeader}>Output Name</th>
                <th className={styles.outputHeader}>Output</th>
                <th className={styles.actionHeader}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rightHalf.map(([outputName, entry]) => (
                <tr key={`right-${outputName}`}>
                  <td className={styles.outputNameCell}>{outputName}</td>
                  <td className={styles.outputCell}>
                    {getDisplayValue(entry)}
                  </td>
                  <td className={styles.actionCell}>
                    <button 
                      type="button"
                      className={styles.viewButton}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔘 View button clicked for:', outputName);
                        handleViewClick(outputName, entry);
                      }}
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

  return (
    <div id="maintenanceTablesContainer" className={styles.maintenanceTablesContainer}>
      {/* Section 1: MAINTENANCE - REPORTING OUTPUTS */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>MAINTENANCE - REPORTING OUTPUTS</h3>
        </div>
        {renderTwoColumnTable(
          Object.entries(reportingOutputs).filter(([outputName]) => {
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
          }),
          searchQuery1
        )}
      </div>

      {/* Section 2: MAINTENANCE - FAULT REPORTING OUTPUTS (ANALOG) */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>MAINTENANCE - FAULT REPORTING OUTPUTS (ANALOG)</h3>
        </div>
        {renderTwoColumnTable(
          Object.entries(faultReportingAnalog).filter(([outputName]) => {
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
          }),
          searchQuery2
        )}
      </div>

      {/* Section 3: MAINTENANCE - FAULT REPORTING OUTPUTS (DIGITAL) */}
      <div className={styles.tableSection}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>MAINTENANCE - FAULT REPORTING OUTPUTS (DIGITAL)</h3>
        </div>
        {renderTwoColumnTable(
          Object.entries(faultReportingDigital).filter(([outputName]) => {
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
          }),
          searchQuery3
        )}
      </div>
    </div>
  );
};

export default MaintenanceTables;

