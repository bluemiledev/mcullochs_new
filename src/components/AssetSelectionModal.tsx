import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import styles from './AssetSelectionModal.module.css';
import { formatDateForDisplay, formatDateForAPI } from '../utils';

interface Vehicle {
  id: number;
  name: string;
  rego?: string;
}

interface AssetSelectionModalProps {
  onShowGraph: (vehicleId: number, date: string) => void;
}

const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({ onShowGraph }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loadingVehicles, setLoadingVehicles] = useState<boolean>(true);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Fetch vehicles on mount
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoadingVehicles(true);
        setError(''); // Clear previous errors
        
        // Vehicles endpoint (use reet_python API via proxy)
        const apiUrl = '/reet_python/get_vehicles.php';
        console.log('🔗 Fetching vehicles from:', apiUrl);
        
        const response = await fetch(apiUrl, {
          headers: { 
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          cache: 'no-store',
          mode: 'cors'
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          console.error('❌ API Error Response:', errorText.substring(0, 500));
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await response.text();
        const contentType = response.headers.get('content-type');
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        try {
          // Try to parse as JSON
          json = JSON.parse(text);
          console.log('✅ Successfully parsed JSON response (Content-Type was:', contentType, ')');
        } catch (parseError) {
          // If parsing fails, check if it's HTML
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('❌ Received HTML page instead of JSON. Content-Type:', contentType);
            console.error('❌ Response URL:', response.url);
            console.error('❌ Response status:', response.status);
            console.error('❌ Response body (first 1000 chars):', text.substring(0, 1000));
            console.error('❌ This usually means:');
            console.error('   1. The proxy is not working (check terminal for proxy logs)');
            console.error('   2. The API endpoint does not exist');
            console.error('   3. The server returned an error page');
            throw new Error(`API returned HTML page instead of JSON. Content-Type: ${contentType}. Check console for details.`);
          } else {
            // Not HTML, but also not valid JSON
            console.error('❌ Response is not valid JSON. Content-Type:', contentType);
            console.error('❌ Response body (first 1000 chars):', text.substring(0, 1000));
            throw new Error(`API returned invalid JSON. Content-Type: ${contentType}. Check console for details.`);
          }
        }
        console.log('✅ Vehicles API response:', json);
        
        // Map reet_python response: [{ devices_serial_no: "6363299", name: "Vehicle Name" }, ...]
        const vehiclesData: Vehicle[] = (Array.isArray(json) ? json : [])
          .map((v: any) => {
            const serial = String(v?.devices_serial_no || '');
            const name = String(v?.name || serial); // Use name field from API, fallback to serial
            return { id: Number(serial), name, rego: serial };
          })
          .filter((v: Vehicle) => v.id > 0);
        
        console.log('📋 Processed vehicles:', vehiclesData);
        
        if (vehiclesData.length === 0) {
          throw new Error('No vehicles found in API response');
        }
        
        setVehicles(vehiclesData);
        // Don't auto-select vehicle - user must select manually
      } catch (err: any) {
        const errorMsg = err.message || 'Failed to load vehicles. Please check the API endpoint.';
        setError(errorMsg);
        console.error('❌ Error fetching vehicles:', err);
        console.error('Error details:', {
          message: err.message,
          stack: err.stack
        });
        setVehicles([]);
      } finally {
        setLoadingVehicles(false);
      }
    };
    fetchVehicles();
  }, []);

  // Fetch dates when vehicle is selected
  useEffect(() => {
    if (selectedVehicleId) {
      const fetchDates = async () => {
        try {
          setLoadingDates(true);
          setSelectedDate(''); // Reset date when vehicle changes
          setError(''); // Clear previous errors
          
          // Use the reet_python endpoint with devices_serial_no parameter (via proxy)
          const apiUrl = `/reet_python/get_vehicle_dates.php?devices_serial_no=${selectedVehicleId}`;
          console.log('🔗 Fetching dates from:', apiUrl);
          
          const response = await fetch(apiUrl, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
            mode: 'cors'
          });
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            console.error('❌ Dates API Error Response:', errorText.substring(0, 500));
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Get response as text first to check if it's actually JSON
          const text = await response.text();
          const contentType = response.headers.get('content-type');
          
          // Check if response is actually JSON (even if Content-Type is wrong)
          let json: any;
          try {
            // Try to parse as JSON
            json = JSON.parse(text);
            console.log('✅ Successfully parsed dates JSON response (Content-Type was:', contentType, ')');
          } catch (parseError) {
            // If parsing fails, check if it's HTML
            if (text.includes('<!doctype') || text.includes('<html')) {
              console.error('❌ Dates API Response is HTML. Content-Type:', contentType);
              console.error('❌ Response body (first 1000 chars):', text.substring(0, 1000));
              throw new Error(`API returned HTML page instead of JSON. Content-Type: ${contentType}. Check console for details.`);
            } else {
              // Not HTML, but also not valid JSON
              console.error('❌ Dates API Response is not valid JSON. Content-Type:', contentType);
              console.error('❌ Response body (first 1000 chars):', text.substring(0, 1000));
              throw new Error(`API returned invalid JSON. Content-Type: ${contentType}. Check console for details.`);
            }
          }
          console.log('✅ Dates API response:', json);
          
          // Map reet_python response: [{ date: "YYYY-MM-DD" }, ...]
          let datesData: string[] = (Array.isArray(json) ? json : [])
            .map((o: any) => String(o?.date || ''))
            .filter((d: string) => d.length > 0);
          
          // Ensure dates are strings and sort them (newest first)
          // Keep dates in YYYY-MM-DD format for internal use, but display in DD-MM-YYYY
          datesData = datesData
            .map((d: any) => String(d))
            .filter((d: string) => d.length > 0)
            .sort((a: string, b: string) => b.localeCompare(a)); // Sort descending (newest first)
          
          console.log('📅 Processed dates:', datesData);
          
          // Don't show error if no dates found, just set empty array
          setDates(datesData);
          setError(''); // Clear any previous errors on successful fetch
        } catch (err: any) {
          // Only show error for actual API failures, not for empty responses
          const errorMsg = err.message || 'Failed to load dates. Please check the API endpoint.';
          // Don't show error for "No dates found" - just log it
          if (!errorMsg.includes('No dates found')) {
            setError(errorMsg);
          } else {
            setError('');
          }
          console.error('❌ Error fetching dates:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            vehicleId: selectedVehicleId
          });
          setDates([]);
        } finally {
          setLoadingDates(false);
        }
      };
      fetchDates();
    } else {
      setDates([]);
      setSelectedDate('');
    }
  }, [selectedVehicleId]);

  const handleShowGraph = () => {
    if (selectedVehicleId && selectedDate) {
      // Convert display format (DD-MM-YYYY) back to API format (YYYY-MM-DD) if needed
      const apiDate = formatDateForAPI(selectedDate);
      // Dispatch event so FilterControls can initialize with selected values
      window.dispatchEvent(new CustomEvent('asset:selected', {
        detail: {
          device_id: selectedVehicleId,
          date: apiDate
        }
      }));
      onShowGraph(selectedVehicleId, apiDate);
    }
  };

  const isFormValid = selectedVehicleId !== null && selectedDate !== '';

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendar]);

  // Convert dates array to Date objects for DayPicker
  const availableDates = useMemo(() => {
    return dates.map(dateStr => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    });
  }, [dates]);

  // Check if a date is available (not disabled)
  const isDateDisabled = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return !dates.includes(dateStr);
  };

  // Handle date selection from calendar
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (dates.includes(dateStr)) {
        setSelectedDate(dateStr);
        setShowCalendar(false);
      }
    }
  };

  // Get selected date as Date object for DayPicker
  const selectedDateObj = useMemo(() => {
    if (!selectedDate) return undefined;
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>Asset Chart</h2>
        <p className={styles.modalInstruction}>
          Kindly select the asset and date you'd like to proceed with.
        </p>

        {error && (
          <div className={styles.errorMessage}>{error}</div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>Select Asset</label>
          <select
            className={styles.select}
            value={selectedVehicleId || ''}
            onChange={(e) => {
              setSelectedVehicleId(Number(e.target.value));
              setError(''); // Clear error when vehicle changes
            }}
            disabled={loadingVehicles}
          >
            <option value="">Select Asset</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Select Date</label>
          <div className={styles.datePickerWrapper} ref={calendarRef}>
            <button
              type="button"
              className={styles.datePickerButton}
              onClick={() => setShowCalendar(!showCalendar)}
              disabled={loadingDates || !selectedVehicleId || dates.length === 0}
            >
              {selectedDate ? formatDateForDisplay(selectedDate) : 'Select Date'}
            </button>
            {showCalendar && selectedVehicleId && dates.length > 0 && !loadingDates && (
              <div className={styles.calendarDropdown}>
                <DayPicker
                  mode="single"
                  selected={selectedDateObj}
                  onSelect={handleDateSelect}
                  disabled={isDateDisabled}
                  modifiers={{
                    available: availableDates
                  }}
                  modifiersClassNames={{
                    available: styles.availableDate
                  }}
                  className={styles.calendar}
                />
              </div>
            )}
          </div>
          {loadingDates && selectedVehicleId && (
            <div className={styles.loadingText}>Loading dates...</div>
          )}
        </div>

        <button
          className={styles.showButton}
          onClick={handleShowGraph}
          disabled={!isFormValid || loadingVehicles || loadingDates}
        >
          Show Graph
        </button>
      </div>
    </div>
  );
};

export default AssetSelectionModal;

