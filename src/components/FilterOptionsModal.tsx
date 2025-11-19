import React, { useEffect, useState } from 'react';
import styles from './AssetSelectionModal.module.css';

export interface ReadingItem {
  id: string;
  name: string;
}

interface FilterOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedDigital: Record<string, boolean>, selectedAnalog: Record<string, boolean>) => void;
  initialDigital: Record<string, boolean>;
  initialAnalog: Record<string, boolean>;
}

const FilterOptionsModal: React.FC<FilterOptionsModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialDigital,
  initialAnalog,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [digitalReadings, setDigitalReadings] = useState<ReadingItem[]>([]);
  const [analogReadings, setAnalogReadings] = useState<ReadingItem[]>([]);
  const [selectedDigital, setSelectedDigital] = useState<Record<string, boolean>>(initialDigital || {});
  const [selectedAnalog, setSelectedAnalog] = useState<Record<string, boolean>>(initialAnalog || {});

  useEffect(() => {
    setSelectedDigital(initialDigital || {});
    setSelectedAnalog(initialAnalog || {});
  }, [initialDigital, initialAnalog]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchReadings = async () => {
      try {
        setLoading(true);
        setError('');
        // Fetch from reet_python manual_readings API (via proxy)
        const res = await fetch('/reet_python/manual_readings.php', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
          mode: 'cors',
        });
        if (!res.ok) {
          const errorText = await res.text().catch(() => 'Unable to read error response');
          console.error('❌ FilterOptionsModal API Error:', errorText.substring(0, 500));
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await res.text();
        const contentType = res.headers.get('content-type');
        
        console.log('📡 FilterOptionsModal: Response Content-Type:', contentType);
        console.log('📡 FilterOptionsModal: Response text (first 1000 chars):', text.substring(0, 1000));
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        let cleanedText = text.trim();
        
        // Try to extract JSON from HTML if it's embedded (look for <pre> tags or script tags)
        if (text.includes('<!doctype') || text.includes('<html') || text.includes('<body')) {
          console.warn('⚠️ FilterOptionsModal: Response appears to be HTML, attempting to extract JSON...');
          
          // Try to find JSON in <pre> tags
          const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
          if (preMatch) {
            cleanedText = preMatch[1].trim();
            console.log('📡 FilterOptionsModal: Extracted JSON from <pre> tag:', cleanedText.substring(0, 200));
          } else {
            // Try to find JSON object in script tags
            const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            if (scriptMatch) {
              cleanedText = scriptMatch[1].trim();
              console.log('📡 FilterOptionsModal: Extracted JSON from <script> tag:', cleanedText.substring(0, 200));
            } else {
              // Try to find JSON object directly in the text (look for { or [)
              const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
              if (jsonMatch) {
                cleanedText = jsonMatch[1].trim();
                console.log('📡 FilterOptionsModal: Extracted JSON from text:', cleanedText.substring(0, 200));
              }
            }
          }
        }
        
        try {
          json = JSON.parse(cleanedText);
          console.log('✅ FilterOptionsModal: Successfully parsed manual_readings JSON (Content-Type was:', contentType, ')');
        } catch (parseError: any) {
          console.error('❌ FilterOptionsModal: Failed to parse JSON. Parse error:', parseError.message);
          console.error('❌ FilterOptionsModal: Attempted to parse:', cleanedText.substring(0, 500));
          
          // If it's HTML, try to show a more helpful error
          if (text.includes('<!doctype') || text.includes('<html')) {
            // Try to extract error message from HTML
            const errorMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i) || 
                             text.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                             text.match(/<p[^>]*>([^<]+)<\/p>/i);
            const errorMsg = errorMatch ? errorMatch[1] : 'Unknown error';
            throw new Error(`API returned HTML instead of JSON. Server message: ${errorMsg}`);
          } else {
            throw new Error(`API returned invalid JSON: ${parseError.message}`);
          }
        }
        
        // API returns digital_readings and analog_readings directly
        console.log('📊 FilterOptionsModal: Raw JSON response:', json);
        console.log('📊 FilterOptionsModal: digital_readings:', json?.digital_readings);
        console.log('📊 FilterOptionsModal: analog_readings:', json?.analog_readings);
        
        const digital = (json?.digital_readings || []).map((r: any) => ({ 
          id: String(r.id || '').trim(), 
          name: String(r.name || '').trim() 
        })).filter((r: ReadingItem) => r.id && r.name); // Filter out empty entries
        
        const analog = (json?.analog_readings || []).map((r: any) => ({ 
          id: String(r.id || '').trim(), 
          name: String(r.name || '').trim() 
        })).filter((r: ReadingItem) => r.id && r.name); // Filter out empty entries
        
        console.log('📊 FilterOptionsModal: Processed digital readings:', digital.length, digital);
        console.log('📊 FilterOptionsModal: Processed analog readings:', analog.length, analog);
        
        setDigitalReadings(digital);
        setAnalogReadings(analog);
        
        // Initialize selections to true if not set, otherwise use initial values
        setSelectedDigital(prev => {
          if (Object.keys(prev || {}).length === 0 && Object.keys(initialDigital || {}).length === 0) {
            const map: Record<string, boolean> = {};
            digital.forEach((d: ReadingItem) => { map[d.id] = true; });
            return map;
          }
          return initialDigital || prev;
        });
        
        setSelectedAnalog(prev => {
          if (Object.keys(prev || {}).length === 0 && Object.keys(initialAnalog || {}).length === 0) {
            const map: Record<string, boolean> = {};
            analog.forEach((a: ReadingItem) => { map[a.id] = true; });
            return map;
          }
          return initialAnalog || prev;
        });
      } catch (e: any) {
        console.error('❌ Failed to load manual readings:', e);
        console.error('❌ Error details:', {
          message: e.message,
          stack: e.stack
        });
        const errorMessage = e.message || 'Failed to load filter options. Please check the API endpoint.';
        setError(errorMessage);
        setDigitalReadings([]);
        setAnalogReadings([]);
      } finally {
        setLoading(false);
      }
    };
    fetchReadings();
  }, [isOpen, initialDigital, initialAnalog]);

  if (!isOpen) return null;

  const toggleAll = (type: 'digital' | 'analog', checked: boolean) => {
    if (type === 'digital') {
      const map: Record<string, boolean> = {};
      digitalReadings.forEach(d => (map[d.id] = checked));
      setSelectedDigital(map);
    } else {
      const map: Record<string, boolean> = {};
      analogReadings.forEach(a => (map[a.id] = checked));
      setSelectedAnalog(map);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 className={styles.modalTitle}>Filter Options</h2>
        {loading && <div style={{ padding: '10px', color: '#666' }}>Loading filters...</div>}
        {error && (
          <div style={{ padding: '10px', color: '#d32f2f', backgroundColor: '#ffebee', borderRadius: '4px', marginBottom: '10px' }}>
            <strong>Error:</strong> {error}
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Check the browser console (F12) for more details.
            </div>
          </div>
        )}
        {!loading && !error && digitalReadings.length === 0 && analogReadings.length === 0 && (
          <div style={{ padding: '10px', color: '#d32f2f' }}>
            No filter options available. The API returned no data.
          </div>
        )}

        {digitalReadings.length > 0 && (
          <>
            <div style={{ marginTop: 8, marginBottom: 8, fontWeight: 600, background: '#eee', padding: '6px 8px', borderRadius: 4 }}>Digital Readings</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={digitalReadings.length > 0 && Object.values(selectedDigital).every(Boolean)} 
                  onChange={(e) => toggleAll('digital', e.target.checked)} 
                />{' '}
                Select All
              </label>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
              {digitalReadings.map(item => (
                <div key={item.id} style={{ marginBottom: 6 }}>
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={selectedDigital[item.id] ?? true}
                      onChange={(e) => setSelectedDigital(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    />{' '}
                    {item.name} ({item.id})
                  </label>
                </div>
              ))}
            </div>
          </>
        )}

        {analogReadings.length > 0 && (
          <>
            <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 600, background: '#eee', padding: '6px 8px', borderRadius: 4 }}>Analogue Readings</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={analogReadings.length > 0 && Object.values(selectedAnalog).every(Boolean)} 
                  onChange={(e) => toggleAll('analog', e.target.checked)} 
                />{' '}
                Select All
              </label>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
              {analogReadings.map(item => (
                <div key={item.id} style={{ marginBottom: 6 }}>
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={selectedAnalog[item.id] ?? true}
                      onChange={(e) => setSelectedAnalog(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    />{' '}
                    {item.name} ({item.id})
                  </label>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className={styles.showButton} onClick={() => onApply(selectedDigital, selectedAnalog)}>Apply</button>
          <button className={styles.showButton} onClick={onClose} style={{ backgroundColor: '#6b7280' }}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default FilterOptionsModal;


