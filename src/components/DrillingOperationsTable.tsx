import React, { useMemo, useEffect, useState } from 'react';
import styles from './DrillingOperationsTable.module.css';

interface DrillingOperation {
  outputName: string;
  valueRange: string;
  maxValue: number;
}

interface DrillingOperationsTableProps {
  mode?: 'Maintenance' | 'Drilling';
  tableData?: Record<string, { value: number; max: number }>;
  selectionStart?: Date | null;
  selectionEnd?: Date | null;
  visibleRows?: Record<string, boolean>;
}

const DrillingOperationsTable: React.FC<DrillingOperationsTableProps> = ({ 
  mode = 'Maintenance',
  tableData,
  selectionStart,
  selectionEnd,
  visibleRows = {}
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Debug: Log visibleRows when it changes
  useEffect(() => {
    if (mode === 'Drilling') {
      console.log('🔍 DrillingOperationsTable visibleRows:', visibleRows, 'Keys:', Object.keys(visibleRows));
    }
  }, [visibleRows, mode]);
  
  // Helper function to filter by search query
  const matchesSearch = (outputName: string, query: string): boolean => {
    if (!query.trim()) return true;
    return outputName.toLowerCase().includes(query.toLowerCase());
  };

  // Static output names - same for both modes
  const maintenanceOperations: Array<{ outputName: string; maxValue: number }> = [
    { outputName: 'ENGINE - TIME', maxValue: 720 },
    { outputName: 'ROTATION - TIME', maxValue: 720 },
    { outputName: 'CHARGE PUMP - TIME', maxValue: 720 },
    { outputName: 'M18 PUMP - TIME', maxValue: 720 },
    { outputName: 'BEAN PUMP - TIME', maxValue: 720 },
    { outputName: 'MAIN WINCH - HOURS', maxValue: 720 },
    { outputName: 'MAIN WINCH - DISTANCE', maxValue: 1000 },
    { outputName: 'HEAD TRAVERSE - TIME', maxValue: 720 },
    { outputName: 'HEAD TRAVERSE - DISTANCE', maxValue: 1000 },
  ];

  const drillingOperations: Array<{ outputName: string; maxValue: number; code: string }> = [
    { outputName: 'DRILLING TIME (OD101)', maxValue: 720, code: 'OD101' },
    { outputName: 'CIRCULATING/SURVEY TIME (OD102)', maxValue: 720, code: 'OD102' },
    { outputName: 'ROD TRIPPING TIME (OD103)', maxValue: 720, code: 'OD103' },
    { outputName: 'IDLE TIME 1 (OD104)', maxValue: 720, code: 'OD104' },
    { outputName: 'IDLE TIME 2 (OD105)', maxValue: 720, code: 'OD105' },
    { outputName: 'AIRLIFTING (OD106)', maxValue: 720, code: 'OD106' },
  ];

  const operations = mode === 'Drilling' ? drillingOperations : maintenanceOperations;

  // Calculate values based on time range
  // Helper function to convert minutes to HH:MM:SS format
  const formatMinutesToHours = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const operationsWithValues = useMemo(() => {
    // Calculate minutes in selected range
    // Default to full day (6 AM to 6 PM = 720 minutes) if no selection
    let rangeMinutes = 720;
    
    if (selectionStart && selectionEnd) {
      const startTime = selectionStart.getTime();
      const endTime = selectionEnd.getTime();
      rangeMinutes = Math.round((endTime - startTime) / (60 * 1000));
      // Clamp to 0-720 range (6 AM to 6 PM)
      rangeMinutes = Math.max(0, Math.min(720, rangeMinutes));
    }
    
    // Full day range (6 AM to 6 PM = 720 minutes)
    const fullDayMinutes = 720;
    
    return operations.map(op => {
      const dataEntry = tableData?.[op.outputName];
      let currentValueMinutes = 0;
      
      if (dataEntry && typeof dataEntry.value === 'number' && !isNaN(dataEntry.value) && dataEntry.value !== null && dataEntry.value !== undefined) {
        // Use the value directly from API, ignore max
        // The dataEntry.value is already in minutes from the API
        currentValueMinutes = dataEntry.value;
        if (mode === 'Drilling') {
          console.log(`✅ Using API value for "${op.outputName}": ${currentValueMinutes} minutes (${formatMinutesToHours(currentValueMinutes)})`);
        }
      } else {
        if (mode === 'Drilling') {
          console.warn(`⚠️ No valid API data for "${op.outputName}"`, {
            hasDataEntry: !!dataEntry,
            value: dataEntry?.value,
            valueType: typeof dataEntry?.value,
            availableKeys: tableData ? Object.keys(tableData) : []
          });
        }
        // Fallback: calculate based on time range if no API data
        // For TIME/HOURS fields, value = minutes in range
        if (op.outputName.includes('TIME') || op.outputName.includes('HOURS')) {
          currentValueMinutes = rangeMinutes;
        } else {
          // For DISTANCE fields, calculate proportionally
          const proportion = rangeMinutes / fullDayMinutes;
          currentValueMinutes = op.maxValue * proportion;
        }
      }
      
      // Divide all values by 2
      const halvedValueMinutes = currentValueMinutes / 2;
      
      // Format output based on mode
      let outputValue: string;
      if (mode === 'Drilling') {
        // For drilling, format as HH:MM:SS (HOURS)
        outputValue = `${formatMinutesToHours(halvedValueMinutes)} (HOURS)`;
      } else {
        // For maintenance, show as single value
        outputValue = String(Math.round(halvedValueMinutes));
      }
      
      return {
        ...op,
        valueRange: outputValue,
        currentValue: halvedValueMinutes
      };
    });
  }, [operations, tableData, selectionStart, selectionEnd, mode]);

  const tableTitle = mode === 'Drilling' 
    ? 'DRILLING - RIG OPERATIONS REPORTING OUTPUTS'
    : 'MAINTENANCE - REPORTING OUTPUTS';

  // Filter operations based on search and visibility
  const filteredOperations = operationsWithValues.filter((operation) => {
    // Search filter
    if (!matchesSearch(operation.outputName, searchQuery)) {
      return false;
    }
    
    // Visibility filter (for drilling mode)
    if (mode === 'Drilling' && 'code' in operation) {
      const code = (operation as any).code;
      // If no filters are applied (empty object), show all rows
      if (Object.keys(visibleRows).length === 0) {
        return true;
      }
      // If filters are applied, check visibility
      // Items set to true = visible, false/undefined = hidden
      const isVisible = visibleRows[code];
      if (isVisible === undefined) {
        console.warn(`⚠️ Row code ${code} not found in visibleRows. Keys:`, Object.keys(visibleRows));
      }
      return isVisible === true;
    }
    return true;
  });

  // Split operations into two halves
  const midpoint = Math.ceil(filteredOperations.length / 2);
  const leftHalf = filteredOperations.slice(0, midpoint);
  const rightHalf = filteredOperations.slice(midpoint);

  return (
    <div id="drillingOperationsTable" className={styles.tableContainer}>
      <div className={styles.tableHeader}>
        <h2 className={styles.tableTitle}>{tableTitle}</h2>
      
      </div>
      <div className={styles.twoColumnLayout}>
        {/* Left Column */}
        <div className={styles.column}>
          <table className={styles.operationsTable}>
            <thead>
              <tr>
                <th className={styles.outputNameHeader}>Output Name</th>
                <th className={styles.valueRangeHeader}>Output</th>
              </tr>
            </thead>
            <tbody>
              {leftHalf.map((operation, index) => (
                <tr key={index}>
                  <td className={styles.outputName}>{operation.outputName}</td>
                  <td className={styles.valueRange}>{operation.valueRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Right Column */}
        <div className={styles.column}>
          <table className={styles.operationsTable}>
            <thead>
              <tr>
                <th className={styles.outputNameHeader}>Output Name</th>
                <th className={styles.valueRangeHeader}>Output</th>
              </tr>
            </thead>
            <tbody>
              {rightHalf.map((operation, index) => (
                <tr key={`right-${index}`}>
                  <td className={styles.outputName}>{operation.outputName}</td>
                  <td className={styles.valueRange}>{operation.valueRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DrillingOperationsTable;


