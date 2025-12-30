import React, { useState, useEffect } from 'react';
import styles from './AssetSelectionModal.module.css';

interface DrillingFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedDownhole: Record<string, boolean>, selectedRigOps: Record<string, boolean>) => void;
  initialDownhole?: Record<string, boolean>;
  initialRigOps?: Record<string, boolean>;
  availableCharts?: Array<{ name: string; id: string }>;
  availableTableRows?: Array<{ name: string; code: string }>;
}

const DrillingFilterModal: React.FC<DrillingFilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialDownhole = {},
  initialRigOps = {},
  availableCharts = [],
  availableTableRows = [],
}) => {
  const [selectedDownhole, setSelectedDownhole] = useState<Record<string, boolean>>(initialDownhole);
  const [selectedRigOps, setSelectedRigOps] = useState<Record<string, boolean>>(initialRigOps);

  useEffect(() => {
    // Update state when modal opens or initial values change
    if (isOpen) {
      console.log(`🔍 Modal opened, initialRigOps:`, initialRigOps, 'keys:', Object.keys(initialRigOps));
      
      // For charts: if initial values provided, use them; otherwise default all to visible (true)
      if (Object.keys(initialDownhole).length > 0) {
        setSelectedDownhole(initialDownhole);
      } else {
        const map: Record<string, boolean> = {};
        availableCharts.forEach(chart => { map[chart.name] = true; });
        setSelectedDownhole(map);
      }
      
      // For table rows: if initial values provided, use them; otherwise default all to visible (true)
      if (Object.keys(initialRigOps).length > 0) {
        // Map initial values by code
        // initialRigOps might use codes (OD101) or full names, so we need to handle both
        const map: Record<string, boolean> = {};
        availableTableRows.forEach(row => {
          const correctCode = getODCode(row);
          // Try to find by correct code first, then by wrong code, then by name
          const byCorrectCode = initialRigOps[correctCode];
          const byWrongCode = initialRigOps[row.code];
          const byName = initialRigOps[row.name];
          // Use correct code value if exists, otherwise wrong code, otherwise name, otherwise default to true
          map[correctCode] = byCorrectCode !== undefined ? byCorrectCode : 
                            (byWrongCode !== undefined ? byWrongCode : 
                            (byName !== undefined ? byName : true));
          console.log(`🔍 Mapping row: correctCode="${correctCode}", row.code="${row.code}", name="${row.name}", byCorrectCode=${byCorrectCode}, byWrongCode=${byWrongCode}, byName=${byName}, result=${map[correctCode]}`);
        });
        console.log(`🔍 Initial selectedRigOps map (from initialRigOps):`, map);
        setSelectedRigOps(map);
      } else {
        // No initial values - default all to true (visible)
        const map: Record<string, boolean> = {};
        availableTableRows.forEach(row => {
          const correctCode = getODCode(row);
          console.log(`🔍 Initializing row: correctCode="${correctCode}", row.code="${row.code}", name="${row.name}"`);
          map[correctCode] = true; 
        });
        console.log(`🔍 Initial selectedRigOps (all true, no initial values):`, map);
        setSelectedRigOps(map);
      }
    }
  }, [isOpen, initialDownhole, initialRigOps, availableCharts, availableTableRows]);

  if (!isOpen) return null;

  const toggleAllDownhole = (checked: boolean) => {
    const map: Record<string, boolean> = {};
    availableCharts.forEach(chart => (map[chart.name] = checked));
    setSelectedDownhole(map);
  };

  // Helper function to extract OD code
  const getODCode = (row: { name: string; code: string }): string => {
    if (row.code && row.code.startsWith('OD') && !row.code.includes(' ')) {
      return row.code;
    }
    const match = row.name.match(/\(OD\d+\)$/);
    if (match) {
      return match[0].substring(1, match[0].length - 1);
    }
    const nameToCodeMap: Record<string, string> = {
      'DRILLING TIME': 'OD101',
      'CIRCULATING/SURVEY TIME': 'OD102',
      'ROD TRIPPING TIME': 'OD103',
      'IDLE TIME 1': 'OD104',
      'IDLE TIME 2': 'OD105',
      'AIRLIFTING': 'OD106'
    };
    return nameToCodeMap[row.name] || row.code;
  };

  const toggleAllRigOps = (checked: boolean) => {
    const map: Record<string, boolean> = {};
    availableTableRows.forEach(row => {
      const correctCode = getODCode(row);
      map[correctCode] = checked;
    });
    setSelectedRigOps(map);
  };

  const allDownholeSelected = availableCharts.length > 0 && availableCharts.every(chart => selectedDownhole[chart.name] !== false);
  const allRigOpsSelected = availableTableRows.length > 0 && availableTableRows.every(row => {
    const correctCode = getODCode(row);
    return selectedRigOps[correctCode] !== false || selectedRigOps[row.code] !== false || selectedRigOps[row.name] !== false;
  });

  const handleSubmit = () => {
    // Ensure all available items are included in the submitted state
    // Items that are checked = true, unchecked = false
    const completeDownhole: Record<string, boolean> = {};
    availableCharts.forEach(chart => {
      completeDownhole[chart.name] = selectedDownhole[chart.name] === true;
    });
    
    const completeRigOps: Record<string, boolean> = {};
    availableTableRows.forEach(row => {
      // Always extract OD code using the helper function
      const code = getODCode(row);
      
      // Check if the item is explicitly checked (true) or unchecked (false)
      // selectedRigOps might use full name as key, so check code, wrong code, and name
      const isChecked = selectedRigOps[code] === true || selectedRigOps[row.name] === true || selectedRigOps[row.code] === true;
      completeRigOps[code] = isChecked;
      console.log(`🔍 Row ${code} (${row.name}): selectedRigOps[${code}]=${selectedRigOps[code]}, selectedRigOps[${row.name}]=${selectedRigOps[row.name]}, selectedRigOps[${row.code}]=${selectedRigOps[row.code]}, isChecked=${isChecked}`);
    });
    
    console.log('🔍 Submitting filter:', { 
      completeRigOps, 
      selectedRigOps,
      availableTableRows: availableTableRows.map(r => ({ name: r.name, code: r.code })),
      completeRigOpsKeys: Object.keys(completeRigOps),
      completeRigOpsValues: Object.values(completeRigOps)
    });
    onApply(completeDownhole, completeRigOps);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.scrollable}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Additional Filters</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* Section 1: DRILLING - DOWNHOLE DRILLING REPORTING OUTPUTS */}
          <div style={{ marginBottom: '24px' }}>
          <div style={{ 
            marginBottom: '12px', 
            fontWeight: 600, 
            fontSize: '14px',
            color: '#1f2937',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            DRILLING - DOWNHOLE DRILLING REPORTING OUTPUTS
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={allDownholeSelected}
                onChange={(e) => toggleAllDownhole(e.target.checked)}
              />
              <span>Select All</span>
            </label>
          </div>
          <div style={{ paddingLeft: '20px' }}>
            {availableCharts.length > 0 ? (
              availableCharts.map(chart => (
                <div key={chart.id} style={{ marginBottom: '8px' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={selectedDownhole[chart.name] !== false}
                      onChange={(e) => setSelectedDownhole(prev => ({ ...prev, [chart.name]: e.target.checked }))}
                    />
                    <span>{chart.name}</span>
                  </label>
                </div>
              ))
            ) : (
              <div style={{ color: '#666', fontStyle: 'italic' }}>No charts available</div>
            )}
          </div>
          </div>

          {/* Section 2: DRILLING - RIG OPERATIONS REPORTING OUTPUTS */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              marginBottom: '12px', 
              fontWeight: 600, 
              fontSize: '14px',
              color: '#1f2937',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              DRILLING - RIG OPERATIONS REPORTING OUTPUTS
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={allRigOpsSelected}
                  onChange={(e) => toggleAllRigOps(e.target.checked)}
                />
                <span>Select All</span>
              </label>
            </div>
            <div style={{ paddingLeft: '20px' }}>
              {availableTableRows.length > 0 ? (
                availableTableRows.map(row => {
                  const correctCode = getODCode(row);
                  // Check if checked: explicitly true, or undefined/not set (defaults to true when no filters applied)
                  // If selectedRigOps[correctCode] is undefined, it means it hasn't been set yet, so default to true
                  const isChecked = selectedRigOps[correctCode] === true || 
                                   (selectedRigOps[correctCode] === undefined && 
                                    Object.keys(selectedRigOps).length === 0) ||
                                   (selectedRigOps[correctCode] === undefined && 
                                    selectedRigOps[row.code] !== false && 
                                    selectedRigOps[row.name] !== false);
                  return (
                    <div key={correctCode} style={{ marginBottom: '8px' }}>
                      <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            console.log(`🔍 Checkbox changed: ${correctCode} = ${e.target.checked}, current state:`, selectedRigOps);
                            setSelectedRigOps(prev => {
                              const updated = { ...prev, [correctCode]: e.target.checked };
                              console.log(`🔍 Updated selectedRigOps:`, updated);
                              return updated;
                            });
                          }}
                        />
                        <span>{row.name}</span>
                      </label>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: '#666', fontStyle: 'italic' }}>No table rows available</div>
              )}
            </div>
          </div>
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

export default DrillingFilterModal;

