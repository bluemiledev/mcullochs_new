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

  const handleViewClick = (outputName: string, entry: { value: number; max: number; unit: string }) => {
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
    
    // Extract ID from output name - try multiple methods
    let id = '';
    
    // Method 1: Try to extract OM code from name like "ENGINE - TIME (OM001)" or "HYDRAULIC - PUMP 1 OVER PRESSURE (OM101)"
    const omMatch = outputName.match(/\(OM\d+\)/i);
    if (omMatch) {
      id = omMatch[0].replace(/[()]/g, '');
      console.log(`✅ Extracted ID from name: "${outputName}" -> ${id}`);
    } else {
      // Method 2: Map common names to IDs
      const nameToIdMap: Record<string, string> = {
        'ENGINE - TIME': 'OM001',
        'ROTATION - TIME': 'OM002',
        'CHARGE PUMP - TIME': 'OM003',
        'M18 PUMP - TIME': 'OM004',
        'BEAN PUMP - TIME': 'OM005',
        'MAIN WINCH - HOURS': 'OM006',
        'MAIN WINCH - DISTANCE': 'OM007',
        'HEAD TRAVERESE - TIME': 'OM008',
        'HEAD TRAVERSE - TIME': 'OM008',
        'HEAD TRAVERSE - DISTANCE': 'OM009',
      };
      
      const normalizedName = outputName.toUpperCase().trim();
      id = nameToIdMap[normalizedName];
      
      if (!id) {
        // Method 3: Try partial match for names that might have variations
        for (const [key, value] of Object.entries(nameToIdMap)) {
          if (normalizedName.includes(key) || key.includes(normalizedName)) {
            id = value;
            break;
          }
        }
      }
      
      if (!id) {
        console.warn(`⚠️ Could not determine ID for output name: "${outputName}", using fallback`);
        // Fallback: try to find any OM pattern in the name (case-insensitive)
        const anyOmMatch = outputName.match(/OM\d+/i);
        if (anyOmMatch) {
          id = anyOmMatch[0].toUpperCase();
        } else {
          // Last resort: use a default ID (this should not happen in production)
          id = 'OM001';
        }
      }
    }
    
    // Format value as HH:MM:SS if it's in minutes, or use as-is
    const formatValue = (val: number, unit: string): string => {
      if (unit === 'HOURS') {
        const hours = Math.floor(val / 60);
        const mins = Math.floor(val % 60);
        const secs = Math.floor((val % 1) * 60);
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      return String(Math.round(val));
    };
    
    const valueStr = formatValue(entry.value, entry.unit);
    const reading = entry.unit; // HOURS or METERS
    
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
    // Divide all values by 2
    const halvedValue = entry.value / 2;
    
    // Use the halved value, ignore max
    // The value is already in minutes from the API
    let formattedValue: string;
    
    if (unit === 'HOURS') {
      formattedValue = formatMinutesToHours(halvedValue);
    } else if (unit === 'METERS') {
      // For distance, use halved value directly
      formattedValue = `${Math.round(halvedValue)}`;
    } else {
      formattedValue = `${Math.round(halvedValue)}`;
    }
    
    // Add unit in parentheses if showUnit is true
    if (showUnit) {
      return `${formattedValue} (${unit})`;
    }
    
    return formattedValue;
  };

  // Helper function to render a table with two columns
  const renderTwoColumnTable = (
    entries: Array<[string, { value: number; max: number; unit: string }]>,
    searchQuery: string,
    showUnit: boolean = false
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
                    {showUnit 
                      ? getCurrentValue(entry, entry.unit, true)
                      : `${getCurrentValue(entry, entry.unit, false)} (HOURS)`
                    }
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
                    {showUnit 
                      ? getCurrentValue(entry, entry.unit, true)
                      : `${getCurrentValue(entry, entry.unit, false)} (HOURS)`
                    }
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
          searchQuery1,
          true
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
          searchQuery2,
          false
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
          searchQuery3,
          false
        )}
      </div>
    </div>
  );
};

export default MaintenanceTables;

