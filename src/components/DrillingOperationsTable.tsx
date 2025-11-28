import React, { useMemo } from 'react';
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
}

const DrillingOperationsTable: React.FC<DrillingOperationsTableProps> = ({ 
  mode = 'Maintenance',
  tableData,
  selectionStart,
  selectionEnd
}) => {
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

  const drillingOperations: Array<{ outputName: string; maxValue: number }> = [
    { outputName: 'DRILLING TIME', maxValue: 720 },
    { outputName: 'CIRCULATING/SURVEY TIME', maxValue: 720 },
    { outputName: 'ROD TRIPPING TIME', maxValue: 720 },
    { outputName: 'IDLE TIME 1', maxValue: 720 },
    { outputName: 'IDLE TIME 2', maxValue: 720 },
    { outputName: 'AIRLIFTING', maxValue: 720 },
  ];

  const operations = mode === 'Drilling' ? drillingOperations : maintenanceOperations;

  // Calculate values based on time range
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
      let currentValue = 0;
      
      if (dataEntry) {
        // Calculate value based on selected time range
        // The dataEntry.value represents the value for the full day (720 minutes)
        // Scale it proportionally based on the selected range
        if (rangeMinutes >= fullDayMinutes) {
          // Full range selected, use full value
          currentValue = dataEntry.value;
        } else {
          // Partial range selected, calculate proportionally
          // Formula: (fullValue / fullDayMinutes) * rangeMinutes
          currentValue = Math.round((dataEntry.value / fullDayMinutes) * rangeMinutes);
        }
      } else {
        // Fallback: calculate based on time range
        // For TIME/HOURS fields, value = minutes in range
        if (op.outputName.includes('TIME') || op.outputName.includes('HOURS')) {
          currentValue = rangeMinutes;
        } else {
          // For DISTANCE fields, calculate proportionally
          const proportion = rangeMinutes / fullDayMinutes;
          currentValue = Math.round(op.maxValue * proportion);
        }
      }
      
      // Ensure value doesn't exceed max
      currentValue = Math.min(currentValue, op.maxValue);
      
      return {
        ...op,
        valueRange: String(currentValue), // Show single value (0-720)
        currentValue
      };
    });
  }, [operations, tableData, selectionStart, selectionEnd]);

  const tableTitle = mode === 'Drilling' 
    ? 'DRILLING - RIG OPERATIONS REPORTING OUTPUTS'
    : 'MAINTENANCE - REPORTING OUTPUTS';

  return (
    <div className={styles.tableContainer}>
      <h2 className={styles.tableTitle}>{tableTitle}</h2>
      <table className={styles.operationsTable}>
        <thead>
          <tr>
            <th className={styles.outputNameHeader}>Output Name</th>
            <th className={styles.valueRangeHeader}>Value Range</th>
            <th className={styles.outputNameHeader}>Output Name</th>
            <th className={styles.valueRangeHeader}>Value Range</th>
          </tr>
        </thead>
        <tbody>
          {operationsWithValues.map((operation, index) => {
            // Create pairs for two-column layout
            if (index % 2 === 0) {
              const leftOp = operationsWithValues[index];
              const rightOp = operationsWithValues[index + 1] || null;
              return (
                <tr key={index}>
                  <td className={styles.outputName}>{leftOp.outputName}</td>
                  <td className={styles.valueRange}>{leftOp.valueRange}</td>
                  {rightOp ? (
                    <>
                      <td className={styles.outputName}>{rightOp.outputName}</td>
                      <td className={styles.valueRange}>{rightOp.valueRange}</td>
                    </>
                  ) : (
                    <>
                      <td className={styles.outputName}></td>
                      <td className={styles.valueRange}></td>
                    </>
                  )}
                </tr>
              );
            }
            return null;
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DrillingOperationsTable;


