import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import styles from './AssetSelectionModal.module.css';
import { formatDateForDisplay, formatDateForAPI } from '../utils';

interface Vehicle {
  devices_serial_no: string;
  name: string;
}

interface AssetSelectionModalProps {
  onShowGraph: (vehicleId: number, date: string, shift: string, reportType: 'Maintenance' | 'Drilling') => void;
}

const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({ onShowGraph }) => {
  const staticShift = '6 AM to 6 PM';
  
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleSerialNo, setSelectedVehicleSerialNo] = useState<string>('');
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>(staticShift);
  const [selectedReportType, setSelectedReportType] = useState<'Maintenance' | 'Drilling'>('Drilling');
  const [error, setError] = useState<string>('');
  const [loadingVehicles, setLoadingVehicles] = useState<boolean>(true);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Fetch vehicles from API on mount
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoadingVehicles(true);
        setError('');
        // Use relative URL so proxy can handle it (avoids CORS issues)
        const response = await fetch('/reet_python/mccullochs/apis/get_vehicles.php', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
          mode: 'cors'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        let json: Vehicle[];
        
        try {
          json = JSON.parse(text);
        } catch (parseError) {
          throw new Error('Invalid JSON response from API');
        }
        
        if (Array.isArray(json) && json.length > 0) {
          setVehicles(json);
          // Auto-select the first vehicle if none is selected
          setSelectedVehicleSerialNo(prev => {
            if (!prev && json[0]?.devices_serial_no) {
              return json[0].devices_serial_no;
            }
            return prev;
          });
        } else {
          setVehicles([]);
          setError('No vehicles found');
        }
      } catch (err: any) {
        console.error('❌ Error fetching vehicles:', err);
        setError(err.message || 'Failed to load vehicles');
        setVehicles([]);
      } finally {
        setLoadingVehicles(false);
      }
    };
    
    fetchVehicles();
  }, []);

  // Fetch dates when vehicle is selected
  useEffect(() => {
    if (!selectedVehicleSerialNo) {
      setDates([]);
      setSelectedDate('');
      return;
    }

    const fetchDates = async () => {
      try {
        setLoadingDates(true);
        setError('');
        // Use relative URL so proxy can handle it (avoids CORS issues)
        const url = `/reet_python/mccullochs/apis/get_vehicle_dates.php?devices_serial_no=${encodeURIComponent(selectedVehicleSerialNo)}`;
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
          mode: 'cors'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        let json: any;
        
        try {
          json = JSON.parse(text);
        } catch (parseError) {
          throw new Error('Invalid JSON response from API');
        }
        
        // API returns array of objects with "date" field: [{ "date": "YYYY-MM-DD" }, ...]
        if (Array.isArray(json) && json.length > 0) {
          const dateStrings = json
            .map((item: any) => item.date)
            .filter((date: string) => date && typeof date === 'string')
            .sort((a: string, b: string) => b.localeCompare(a)); // Sort descending (most recent first)
          
          setDates(dateStrings);
          // Auto-select the first (most recent) date if none is selected
          if (!selectedDate && dateStrings.length > 0) {
            setSelectedDate(dateStrings[0]);
          }
        } else {
          setDates([]);
          setSelectedDate('');
        }
      } catch (err: any) {
        console.error('❌ Error fetching dates:', err);
        setError(err.message || 'Failed to load dates');
        setDates([]);
        setSelectedDate('');
      } finally {
        setLoadingDates(false);
      }
    };
    
    fetchDates();
  }, [selectedVehicleSerialNo]);

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

  const handleShowGraph = () => {
    if (!selectedVehicleSerialNo) {
      setError('Please select an asset');
      return;
    }
    
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }
    
    // Convert devices_serial_no to number for vehicleId (for backward compatibility)
    const vehicleId = Number(selectedVehicleSerialNo);
    // selectedDate is already in YYYY-MM-DD format from API
    const apiDate = formatDateForAPI(selectedDate);
    
    // Dispatch event so FilterControls can initialize with selected values
    // Use devices_serial_no as device_id
    window.dispatchEvent(new CustomEvent('asset:selected', {
      detail: {
        device_id: selectedVehicleSerialNo, // Use devices_serial_no as string
        date: apiDate,
        shift: selectedShift,
        reportType: selectedReportType
      }
    }));
    // Dispatch screen mode change event
    window.dispatchEvent(new CustomEvent('screen-mode:changed', {
      detail: { mode: selectedReportType }
    }));
    onShowGraph(vehicleId, apiDate, selectedShift, selectedReportType);
  };

  const isFormValid = selectedVehicleSerialNo && selectedDate && !loadingVehicles && !loadingDates;


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
            value={selectedVehicleSerialNo}
            onChange={(e) => setSelectedVehicleSerialNo(e.target.value)}
            disabled={loadingVehicles}
          >
            {loadingVehicles ? (
              <option value="">Loading vehicles...</option>
            ) : vehicles.length === 0 ? (
              <option value="">No vehicles available</option>
            ) : (
              <>
                <option value="">-- Select Asset --</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.devices_serial_no} value={vehicle.devices_serial_no}>
                    {vehicle.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Select Date</label>
          <div className={styles.datePickerWrapper} ref={calendarRef}>
            <button
              type="button"
              className={styles.datePickerButton}
              onClick={() => setShowCalendar(!showCalendar)}
              disabled={!selectedVehicleSerialNo || loadingDates || dates.length === 0}
            >
              {loadingDates ? 'Loading dates...' : selectedDate ? formatDateForDisplay(selectedDate) : 'Select Date'}
            </button>
            {showCalendar && selectedVehicleSerialNo && dates.length > 0 && (
              <div className={styles.calendarDropdown}>
                <DayPicker
                  mode="single"
                  selected={selectedDateObj}
                  onSelect={handleDateSelect}
                  disabled={isDateDisabled}
                  className={styles.calendar}
                  modifiers={{
                    available: availableDates
                  }}
                  modifiersClassNames={{
                    available: styles.availableDate
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Shift</label>
          <select
            className={styles.select}
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
          >
            <option value="6 AM to 6 PM">6 AM to 6 PM</option>
            <option value="6 PM to 6 AM">6 PM to 6 AM</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Report Type</label>
          <select
            className={styles.select}
            value={selectedReportType}
            onChange={(e) => setSelectedReportType(e.target.value as 'Maintenance' | 'Drilling')}
          >
            <option value="Drilling">Drilling</option>
            <option value="Maintenance">Maintenance</option>
          </select>
        </div>

        <button
          className={styles.showButton}
          onClick={handleShowGraph}
          disabled={!isFormValid}
        >
          Show Graph
        </button>
      </div>
    </div>
  );
};

export default AssetSelectionModal;


