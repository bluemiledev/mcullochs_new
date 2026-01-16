import React, { useState, useEffect } from 'react';
import styles from './TimeRangeModal.module.css';

interface TimeRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (startTime: string, endTime: string) => void;
  currentStartTime?: Date | null;
  currentEndTime?: Date | null;
  shift?: string; // Shift string like "6 AM to 6 PM" or "18:00:00to06:00:00"
}

const TimeRangeModal: React.FC<TimeRangeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentStartTime,
  currentEndTime,
  shift
}) => {
  const [startTime, setStartTime] = useState<string>('06:00:00');
  const [endTime, setEndTime] = useState<string>('18:00:00');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Initialize with current times when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(''); // Clear error when modal opens
      if (currentStartTime) {
        const hours = String(currentStartTime.getUTCHours()).padStart(2, '0');
        const minutes = String(currentStartTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(currentStartTime.getUTCSeconds()).padStart(2, '0');
        setStartTime(`${hours}:${minutes}:${seconds}`);
      } else {
        setStartTime('06:00:00');
      }

      if (currentEndTime) {
        const hours = String(currentEndTime.getUTCHours()).padStart(2, '0');
        const minutes = String(currentEndTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(currentEndTime.getUTCSeconds()).padStart(2, '0');
        setEndTime(`${hours}:${minutes}:${seconds}`);
      } else {
        setEndTime('18:00:00');
      }
    }
  }, [isOpen, currentStartTime, currentEndTime]);

  // Parse shift to get start and end times in seconds
  const parseShiftToSeconds = (shiftStr: string | undefined): { startSec: number; endSec: number } => {
    if (!shiftStr) {
      return { startSec: 6 * 3600, endSec: 18 * 3600 }; // Default 6 AM to 6 PM
    }

    // Check if already in API format (HH:MM:SStoHH:MM:SS)
    const apiMatch = shiftStr.match(/^(\d{2}):(\d{2}):(\d{2})to(\d{2}):(\d{2}):(\d{2})$/i);
    if (apiMatch) {
      const toSec = (h: string, m: string, s: string) => {
        const hh = Number(h);
        const mm = Number(m);
        const ss = Number(s);
        return (hh * 3600) + (mm * 60) + ss;
      };
      const start = toSec(apiMatch[1], apiMatch[2], apiMatch[3]);
      let end = toSec(apiMatch[4], apiMatch[5], apiMatch[6]);
      if (end <= start) end += 24 * 3600; // handle shift crossing midnight
      return { startSec: start, endSec: end };
    }

    // Parse UI format: "6 AM to 6 PM"
    const uiMatch = shiftStr.match(/(\d+)\s*(AM|PM)\s+to\s+(\d+)\s*(AM|PM)/i);
    if (uiMatch) {
      let startHour = parseInt(uiMatch[1], 10);
      const startPeriod = uiMatch[2].toUpperCase();
      let endHour = parseInt(uiMatch[3], 10);
      const endPeriod = uiMatch[4].toUpperCase();

      // Convert to 24-hour format
      if (startPeriod === 'PM' && startHour !== 12) startHour += 12;
      if (startPeriod === 'AM' && startHour === 12) startHour = 0;
      if (endPeriod === 'PM' && endHour !== 12) endHour += 12;
      if (endPeriod === 'AM' && endHour === 12) endHour = 0;

      const startSec = startHour * 3600;
      let endSec = endHour * 3600;
      if (endSec <= startSec) endSec += 24 * 3600; // handle shift crossing midnight
      return { startSec, endSec };
    }

    // Default fallback
    return { startSec: 6 * 3600, endSec: 18 * 3600 };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(''); // Clear previous errors
    
    // Validate time format (HH:MM:SS)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      setErrorMessage('Please enter valid time in HH:MM:SS format');
      return;
    }

    // Parse selected times
    const [startH, startM, startS] = startTime.split(':').map(Number);
    const [endH, endM, endS] = endTime.split(':').map(Number);
    
    const startSeconds = startH * 3600 + startM * 60 + startS;
    const endSeconds = endH * 3600 + endM * 60 + endS;

    // Validate against shift range
    if (shift) {
      const { startSec: shiftStartSec, endSec: shiftEndSec } = parseShiftToSeconds(shift);
      
      // Check if shift crosses midnight
      const crossesMidnight = shiftEndSec > 24 * 3600;
      
      if (crossesMidnight) {
        // Overnight shift: shift spans from shiftStartSec to shiftEndSec (which is > 24*3600)
        // For overnight shifts, end time can appear "earlier" than start time (e.g., 20:00:00 to 02:00:00)
        const normalizedEndSec = shiftEndSec - 24 * 3600;
        
        // Check if start time is in valid range
        const isStartInFirstPart = startSeconds >= shiftStartSec && startSeconds < 24 * 3600;
        const isStartInSecondPart = startSeconds >= 0 && startSeconds <= normalizedEndSec;
        
        // Check if end time is in valid range
        // For overnight, end can be in first part (if start is also in first part) or second part
        const isEndInFirstPart = endSeconds > shiftStartSec && endSeconds <= 24 * 3600;
        const isEndInSecondPart = endSeconds >= 0 && endSeconds <= normalizedEndSec;
        
        // Valid combinations:
        // 1. Both in first part (e.g., 20:00:00 to 23:00:00) - start < end
        // 2. Both in second part (e.g., 01:00:00 to 05:00:00) - start < end
        // 3. Start in first part, end in second part (e.g., 20:00:00 to 02:00:00) - end can be < start
        const isValidRange = 
          (isStartInFirstPart && isEndInFirstPart && startSeconds < endSeconds) ||
          (isStartInSecondPart && isEndInSecondPart && startSeconds < endSeconds) ||
          (isStartInFirstPart && isEndInSecondPart);
        
        if (!isValidRange) {
          const shiftStartStr = formatSecondsToTime(shiftStartSec);
          const shiftEndStr = formatSecondsToTime(normalizedEndSec);
          setErrorMessage(`Selected time must be within shift range: ${shiftStartStr} to ${shiftEndStr} (overnight shift)`);
          return;
        }
      } else {
        // Normal shift: times must be within shiftStartSec to shiftEndSec
        // Validate that start time is before end time
        if (startSeconds >= endSeconds) {
          setErrorMessage('Start time must be before end time');
          return;
        }
        
        if (startSeconds < shiftStartSec || startSeconds >= shiftEndSec) {
          const shiftStartStr = formatSecondsToTime(shiftStartSec);
          const shiftEndStr = formatSecondsToTime(shiftEndSec);
          setErrorMessage(`Start time must be within shift range: ${shiftStartStr} to ${shiftEndStr}`);
          return;
        }
        if (endSeconds <= shiftStartSec || endSeconds > shiftEndSec) {
          const shiftStartStr = formatSecondsToTime(shiftStartSec);
          const shiftEndStr = formatSecondsToTime(shiftEndSec);
          setErrorMessage(`End time must be within shift range: ${shiftStartStr} to ${shiftEndStr}`);
          return;
        }
      }
    } else {
      // No shift restriction, just validate that start time is before end time
      if (startSeconds >= endSeconds) {
        setErrorMessage('Start time must be before end time');
        return;
      }
    }

    onSubmit(startTime, endTime);
  };

  // Helper to format seconds to HH:MM:SS
  const formatSecondsToTime = (seconds: number): string => {
    const normalizedSec = seconds % (24 * 3600);
    const hours = Math.floor(normalizedSec / 3600);
    const minutes = Math.floor((normalizedSec % 3600) / 60);
    const secs = normalizedSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Select Time Range</h3>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label htmlFor="startTime" className={styles.label}>
              Start Time
            </label>
            <input
              type="text"
              id="startTime"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                setErrorMessage(''); // Clear error when user types
              }}
              placeholder="HH:MM:SS"
              className={styles.timeInput}
              pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="endTime" className={styles.label}>
              End Time
            </label>
            <input
              type="text"
              id="endTime"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setErrorMessage(''); // Clear error when user types
              }}
              placeholder="HH:MM:SS"
              className={styles.timeInput}
              pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$"
            />
          </div>
          {errorMessage && (
            <div className={styles.errorMessage}>
              {errorMessage}
            </div>
          )}
          <div className={styles.modalActions}>
            <button type="button" onClick={handleCancel} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" className={styles.submitButton}>
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TimeRangeModal;
