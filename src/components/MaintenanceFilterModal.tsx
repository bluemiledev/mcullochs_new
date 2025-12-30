import React, { useState, useEffect } from 'react';
import styles from './AssetSelectionModal.module.css';

interface MaintenanceFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedRows: Record<string, boolean>) => void;
  initialRows?: Record<string, boolean>;
  availableTableRows?: Array<{ name: string; section: string }>;
}

const MaintenanceFilterModal: React.FC<MaintenanceFilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialRows = {},
  availableTableRows = [],
}) => {
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>(initialRows);

  useEffect(() => {
    // Update state when modal opens or initial values change
    if (isOpen) {
      console.log(`🔍 MaintenanceFilterModal opened, initialRows:`, initialRows, 'keys:', Object.keys(initialRows));
      
      // If initial values provided, use them; otherwise default all to visible (true)
      if (Object.keys(initialRows).length > 0) {
        setSelectedRows(initialRows);
      } else {
        const map: Record<string, boolean> = {};
        availableTableRows.forEach(row => { map[row.name] = true; });
        setSelectedRows(map);
        console.log(`🔍 Initial selectedRows (all true):`, map);
      }
    }
  }, [isOpen, initialRows, availableTableRows]);

  if (!isOpen) return null;

  const toggleAll = (checked: boolean) => {
    const map: Record<string, boolean> = {};
    availableTableRows.forEach(row => (map[row.name] = checked));
    setSelectedRows(map);
  };

  const allSelected = availableTableRows.length > 0 && availableTableRows.every(row => selectedRows[row.name] !== false);

  const handleSubmit = () => {
    // Ensure all available items are included in the submitted state
    // Items that are checked = true, unchecked = false
    const completeRows: Record<string, boolean> = {};
    availableTableRows.forEach(row => {
      const isChecked = selectedRows[row.name] === true;
      completeRows[row.name] = isChecked;
      console.log(`🔍 Row ${row.name}: selectedRows[${row.name}]=${selectedRows[row.name]}, isChecked=${isChecked}`);
    });
    
    console.log('🔍 Submitting maintenance filter:', { 
      completeRows, 
      selectedRows,
      availableTableRows: availableTableRows.map(r => ({ name: r.name, section: r.section })),
      completeRowsKeys: Object.keys(completeRows),
      completeRowsValues: Object.values(completeRows)
    });
    
    onApply(completeRows);
  };

  // Group rows by section
  const rowsBySection = availableTableRows.reduce((acc, row) => {
    if (!acc[row.section]) {
      acc[row.section] = [];
    }
    acc[row.section].push(row);
    return acc;
  }, {} as Record<string, Array<{ name: string; section: string }>>);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.scrollable}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Additional Filters</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* Select All */}
          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Select All</span>
            </label>
          </div>

          {/* Grouped by Section */}
          {Object.entries(rowsBySection).map(([section, rows]) => (
            <div key={section} style={{ marginBottom: '24px' }}>
              <div style={{ 
                marginBottom: '12px', 
                fontWeight: 600, 
                fontSize: '14px',
                color: '#1f2937',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {section}
              </div>
              <div style={{ paddingLeft: '20px' }}>
                {rows.map(row => (
                  <div key={row.name} style={{ marginBottom: '8px' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRows[row.name] !== false}
                        onChange={(e) => {
                          console.log(`🔍 Checkbox changed: ${row.name} = ${e.target.checked}, current state:`, selectedRows);
                          setSelectedRows(prev => {
                            const updated = { ...prev, [row.name]: e.target.checked };
                            console.log(`🔍 Updated selectedRows:`, updated);
                            return updated;
                          });
                        }}
                      />
                      <span>{row.name}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.submitButton} onClick={handleSubmit}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceFilterModal;

