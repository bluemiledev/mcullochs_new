import React, { useMemo, useEffect, useState } from 'react';
import styles from './DrillingOperationsTable.module.css';

interface DrillingOperation {
  outputName: string;
  valueRange: string;
  id?: string;
}

interface DrillingOperationsTableProps {
  mode?: 'Maintenance' | 'Drilling';
  tableData?: Record<string, { valueStr: string; reading: string; id: string }>;
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

  // Get operations from API data (for drilling mode)
  // Display value string from API with reading
  const getDisplayValue = (entry: { valueStr: string; reading: string }): string => {
    // Return value string with reading in parentheses
    return `${entry.valueStr} (${entry.reading})`;
  };

  // Convert tableData to operations array for display
  const operationsWithValues = useMemo(() => {
    if (!tableData || Object.keys(tableData).length === 0) {
      return [];
    }
    
    // For drilling mode, use data directly from API
    if (mode === 'Drilling') {
      return Object.entries(tableData).map(([outputName, entry]) => ({
        outputName,
        valueRange: getDisplayValue(entry),
        id: entry.id
      }));
    }
    
    // For maintenance mode (legacy support), return empty or handle differently
    return [];
  }, [tableData, mode]);

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
    if (mode === 'Drilling' && 'id' in operation) {
      const id = (operation as any).id;
      // If no filters are applied (empty object), show all rows
      if (Object.keys(visibleRows).length === 0) {
        return true;
      }
      // If filters are applied, check visibility by ID
      // Items set to true = visible, false/undefined = hidden
      const isVisible = visibleRows[id];
      if (isVisible === undefined) {
        // Also try matching by output name as fallback
        return visibleRows[operation.outputName] === true;
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


