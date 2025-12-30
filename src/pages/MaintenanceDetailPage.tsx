import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FilterControls from '../components/FilterControls';
import TimeScrubber from '../components/TimeScrubber';
import { getMockInstances } from '../utils/mockMaintenanceData';
import styles from './MaintenanceDetailPage.module.css';

interface Instance {
  time: string;
  value: number;
}

const ITEMS_PER_PAGE = 10;

const MaintenanceDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  
  // Get output name from URL params
  const outputName = searchParams.get('outputName') || '';
  const [instances, setInstances] = useState<Instance[]>([]);
  
  // Active filter state for summary boxes
  const [activeFilter, setActiveFilter] = useState<'all' | 'meets' | 'falls'>('meets');
  
  // Time selection state
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  
  // Use refs to track throttling for smooth scrubber performance
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 16; // ~60fps

  // Initialize default time range (6 AM to 6 PM for today)
  useEffect(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(6, 0, 0, 0);
    const end = new Date(today);
    end.setHours(18, 0, 0, 0);
    setSelectionStart(start);
    setSelectionEnd(end);
    setSelectedTime(new Date((start.getTime() + end.getTime()) / 2));
  }, []);

  // Load instances when output name changes
  useEffect(() => {
    if (outputName) {
      // TODO: Replace with API call
      const mockData = getMockInstances(outputName);
      setInstances(mockData);
      setCurrentPage(1); // Reset to first page
    }
  }, [outputName]);

  // Listen to screen mode changes - navigate back to main page if mode changes
  useEffect(() => {
    const handleScreenModeChange = (e: any) => {
      const mode = e?.detail?.mode;
      if (mode === 'Drilling' || mode === 'Maintenance') {
        // Get current URL params to preserve vehicle/date
        const deviceId = searchParams.get('device_id') || searchParams.get('vehicle');
        const date = searchParams.get('date');
        
        // Navigate back to main page with preserved params
        const params = new URLSearchParams();
        if (deviceId) {
          params.set('device_id', deviceId);
        }
        if (date) {
          params.set('date', date);
        }
        
        const backUrl = params.toString() ? `/?${params.toString()}` : '/';
        navigate(backUrl);
      }
    };
    
    window.addEventListener('screen-mode:changed', handleScreenModeChange as any);
    return () => {
      window.removeEventListener('screen-mode:changed', handleScreenModeChange as any);
    };
  }, [navigate, searchParams]);

  // Prepare scrubber data - per-second in second view mode, per-minute otherwise
  const scrubberData = useMemo(() => {
    // Always use minute-based timestamps (second view mode removed)
    
    // Default: per-minute resolution
    // Prefer explicit selection range when available
    const candidateStarts: number[] = [];
    const candidateEnds: number[] = [];

    if (selectionStart) candidateStarts.push(selectionStart.getTime());
    if (selectionEnd) candidateEnds.push(selectionEnd.getTime());

    if (candidateStarts.length === 0 || candidateEnds.length === 0) return [];

    const startTs = Math.min(...candidateStarts);
    const endTs = Math.max(...candidateEnds);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) return [];

    const data: Array<{ time: number }> = [];
    const step = 60 * 1000; // 1 minute resolution
    for (let t = startTs; t <= endTs; t += step) {
      data.push({ time: t });
    }
    if (data.length === 0 || data[data.length - 1].time !== endTs) data.push({ time: endTs });
    return data;
  }, [selectionStart, selectionEnd]);

  // Handle time change from scrubber with throttling for smooth performance
  const handleTimeChange = useCallback((timestamp: number) => {
    const now = Date.now();
    
    // Cancel any pending animation frame
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    
    // In second view mode, use smaller throttle to allow second-by-second updates
    // In minute view mode, use normal throttle
    const throttleMs = THROTTLE_MS; // Always use standard throttle (minute view)
    
    // Throttle updates to prevent excessive re-renders
    if (now - lastUpdateRef.current >= throttleMs) {
      setSelectedTime(new Date(timestamp));
      lastUpdateRef.current = now;
      rafRef.current = null;
    } else {
      // Schedule deferred update
      rafRef.current = requestAnimationFrame(() => {
        setSelectedTime(new Date(timestamp));
        lastUpdateRef.current = Date.now();
        rafRef.current = null;
      });
    }
  }, []); // Always use minute view settings

  // Handle selection range change from scrubber
  const handleSelectionChange = useCallback((startTimestamp: number, endTimestamp: number) => {
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    
    // In second view mode: enforce MIN 10 minutes range
    // In minute view mode: enforce MIN 1 hour range
    const minRangeMs = 60 * 60 * 1000; // Always 1 hour (minute view)
    const rangeMs = endTimestamp - startTimestamp;
    const newStart = start;
    let newEnd = end;
    if (rangeMs < minRangeMs) {
      newEnd = new Date(startTimestamp + minRangeMs);
    }
    setSelectionStart(newStart);
    setSelectionEnd(newEnd);
    
    // Preserve the selected time when dragging range bars
    // Only clamp it if it goes outside the new range
    setSelectedTime(prev => {
      if (!prev) {
        // If no previous time, set to center
        return new Date((newStart.getTime() + newEnd.getTime()) / 2);
      }
      const prevTime = prev.getTime();
      const newStartTime = newStart.getTime();
      const newEndTime = newEnd.getTime();
      
      // Only update if the previous time is outside the new range
      if (prevTime < newStartTime) {
        return newStart;
      } else if (prevTime > newEndTime) {
        return newEnd;
      }
      // Keep the exact same time if it's still within range
      return prev;
    });
  }, []); // Always use minute view settings

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // Intentionally no-op: keep pointer/red-line fixed unless knob is dragged
  }, []);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = instances.length;
    // Criteria: value > 380 means "Meets Criteria", <= 380 means "Falls Criteria"
    // This threshold can be customized based on actual criteria or API response
    const meetsCriteria = instances.filter(inst => inst.value > 380).length;
    const fallsCriteria = total - meetsCriteria;
    
    return { total, meetsCriteria, fallsCriteria };
  }, [instances]);
  
  // Filter instances based on active filter
  const filteredInstances = useMemo(() => {
    if (activeFilter === 'all') {
      return instances;
    } else if (activeFilter === 'meets') {
      return instances.filter(inst => inst.value > 380);
    } else {
      return instances.filter(inst => inst.value <= 380);
    }
  }, [instances, activeFilter]);

  // Pagination - reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);
  
  const totalPages = Math.ceil(filteredInstances.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedInstances = filteredInstances.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleBack = () => {
    // Get vehicle and date from current URL to preserve them when navigating back
    const deviceId = searchParams.get('device_id') || searchParams.get('vehicle');
    const date = searchParams.get('date');
    
    // Build the navigation URL with preserved parameters
    const params = new URLSearchParams();
    if (deviceId) {
      params.set('device_id', deviceId);
    }
    if (date) {
      params.set('date', date);
    }
    
    // Navigate to maintenance page with preserved vehicle/date parameters
    // This prevents the asset selection modal from showing
    const backUrl = params.toString() ? `/?${params.toString()}` : '/';
    navigate(backUrl);
  };

  if (!outputName) {
    return (
      <div className={styles.container}>
        <FilterControls />
        <div className={styles.content}>
          <div className={styles.error}>No output name specified</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <FilterControls />
      
      <div className={styles.content}>
        {scrubberData.length > 0 && (
          <TimeScrubber
            data={scrubberData}
            selectedTime={selectedTime?.getTime() || null}
            selectionStart={selectionStart?.getTime() || null}
            selectionEnd={selectionEnd?.getTime() || null}
            onTimeChange={handleTimeChange}
            onSelectionChange={handleSelectionChange}
            onHover={handleHover}
            isSecondViewMode={false}
          />
        )}

        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={handleBack}>
            Back
          </button>
          <h1 className={styles.title}>{outputName}</h1>
        </div>

        {/* Summary Boxes */}
        <div className={styles.summaryContainer}>
          <button 
            className={`${styles.summaryBox} ${activeFilter === 'all' ? styles.summaryBoxActive : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            <div className={styles.summaryLabel}>Total Record Count</div>
            <div className={styles.summaryValue}>{stats.total}</div>
          </button>
          <button 
            className={`${styles.summaryBox} ${activeFilter === 'meets' ? styles.summaryBoxActive : ''}`}
            onClick={() => setActiveFilter('meets')}
          >
            <div className={styles.summaryLabel}>Meets Criteria</div>
            <div className={styles.summaryValue}>{stats.meetsCriteria}</div>
          </button>
          <button 
            className={`${styles.summaryBox} ${activeFilter === 'falls' ? styles.summaryBoxActive : ''}`}
            onClick={() => setActiveFilter('falls')}
          >
            <div className={styles.summaryLabel}>Falls Criteria</div>
            <div className={styles.summaryValue}>{stats.fallsCriteria}</div>
          </button>
        </div>

        {/* Table */}
        <div className={styles.tableContainer}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th className={styles.timeHeader}>Time of Instance</th>
                <th className={styles.valueHeader}>Value of Instance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInstances.length > 0 ? (
                paginatedInstances.map((instance, index) => (
                  <tr key={index}>
                    <td className={styles.timeCell}>{instance.time}</td>
                    <td className={styles.valueCell}>{instance.value}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className={styles.noData}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.paginationButton}
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={`${styles.paginationButton} ${styles.paginationNumber} ${
                  currentPage === page ? styles.paginationActive : ''
                }`}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </button>
            ))}
            <button
              className={styles.paginationButton}
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceDetailPage;

