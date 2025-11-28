import React, { useState } from 'react';
// COMMENTED OUT - No longer using calendar picker
// import { DayPicker } from 'react-day-picker';
// import 'react-day-picker/dist/style.css';
import styles from './AssetSelectionModal.module.css';
import { formatDateForDisplay, formatDateForAPI } from '../utils';

interface Vehicle {
  id: number;
  name: string;
  rego?: string;
}

interface AssetSelectionModalProps {
  onShowGraph: (vehicleId: number, date: string, shift: string, reportType: 'Maintenance' | 'Drilling') => void;
}

const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({ onShowGraph }) => {
  // Static values - no API calls
  const staticVehicle = { id: 6361819, name: 'Rego 6361819 - MEAQ026', rego: '6361819' };
  const staticShift = '6 AM to 6 PM';
  
  const [selectedShift, setSelectedShift] = useState<string>(staticShift);
  const [selectedReportType, setSelectedReportType] = useState<'Maintenance' | 'Drilling'>('Maintenance');
  const [error, setError] = useState<string>('');
  
  // COMMENTED OUT API CALLS - Using static values
  /*
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState<boolean>(true);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  */

  // COMMENTED OUT API CALLS - Using static values
  /*
  // Fetch vehicles on mount
  useEffect(() => {
    const fetchVehicles = async () => {
      // ... API code commented out
    };
    fetchVehicles();
  }, []);

  // Fetch dates when vehicle is selected
  useEffect(() => {
    if (selectedVehicleId) {
      const fetchDates = async () => {
        // ... API code commented out
      };
      fetchDates();
    } else {
      setDates([]);
      setSelectedDate('');
    }
  }, [selectedVehicleId]);
  */

  const handleShowGraph = () => {
    // Use static values
    const vehicleId = staticVehicle.id;
    const dateToUse = '2025-10-21'; // Static date
    // Convert display format (DD-MM-YYYY) back to API format (YYYY-MM-DD) if needed
    const apiDate = formatDateForAPI(dateToUse);
    // Dispatch event so FilterControls can initialize with selected values
    window.dispatchEvent(new CustomEvent('asset:selected', {
      detail: {
        device_id: vehicleId,
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

  const isFormValid = true; // Always valid since we use static values

  // COMMENTED OUT - Using static date, no calendar needed
  /*
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
  */

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
          <input
            type="text"
            className={styles.select}
            value={staticVehicle.name}
            readOnly
            disabled
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Select Date</label>
          <input
            type="text"
            className={styles.select}
            value="21-10-2025"
            readOnly
            disabled
          />
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
            <option value="Maintenance">Maintenance</option>
            <option value="Drilling">Drilling</option>
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

