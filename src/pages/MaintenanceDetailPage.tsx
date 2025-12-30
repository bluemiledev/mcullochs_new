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
  
  // Time selection state
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  
  // Refs for throttling
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 16;

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

  // Prepare scrubber data from instances
  const scrubberData = useMemo(() => {
    if (instances.length === 0 || !selectionStart || !selectionEnd) {
      // Generate default data for 6 AM to 6 PM
      const start = selectionStart?.getTime() || new Date().setHours(6, 0, 0, 0);
      const end = selectionEnd?.getTime() || new Date().setHours(18, 0, 0, 0);
      const data: Array<{ time: number }> = [];
      const step = 60 * 1000; // 1 minute resolution
      for (let t = start; t <= end; t += step) {
        data.push({ time: t });
      }
      return data;
    }

    // Convert instance times to timestamps
    const start = selectionStart.getTime();
    const end = selectionEnd.getTime();
    const data: Array<{ time: number }> = [];
    const step = 60 * 1000; // 1 minute resolution
    for (let t = start; t <= end; t += step) {
      data.push({ time: t });
    }
    return data;
  }, [instances, selectionStart, selectionEnd]);

  // Handle time change from scrubber
  const handleTimeChange = useCallback((timestamp: number) => {
    const now = Date.now();
    
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    
    if (now - lastUpdateRef.current >= THROTTLE_MS) {
      setSelectedTime(new Date(timestamp));
      lastUpdateRef.current = now;
      rafRef.current = null;
    } else {
      rafRef.current = requestAnimationFrame(() => {
        setSelectedTime(new Date(timestamp));
        lastUpdateRef.current = Date.now();
        rafRef.current = null;
      });
    }
  }, []);

  // Handle selection range change from scrubber
  const handleSelectionChange = useCallback((startTimestamp: number, endTimestamp: number) => {
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    const minRangeMs = 60 * 60 * 1000; // 1 hour minimum
    const rangeMs = endTimestamp - startTimestamp;
    let newEnd = end;
    if (rangeMs < minRangeMs) {
      newEnd = new Date(startTimestamp + minRangeMs);
    }
    setSelectionStart(start);
    setSelectionEnd(newEnd);
    const centerTime = new Date((start.getTime() + newEnd.getTime()) / 2);
    setSelectedTime(centerTime);
  }, []);

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // No-op: keep pointer fixed unless dragged
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

  // Pagination
  const totalPages = Math.ceil(instances.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedInstances = instances.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleBack = () => {
    navigate(-1); // Go back to previous page
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
        {/* Time Scrubber */}
        {scrubberData.length > 0 && selectionStart && selectionEnd && (
          <div className={styles.scrubberContainer}>
            <TimeScrubber
              data={scrubberData}
              selectedTime={selectedTime?.getTime() || null}
              selectionStart={selectionStart.getTime()}
              selectionEnd={selectionEnd.getTime()}
              onTimeChange={handleTimeChange}
              onSelectionChange={handleSelectionChange}
              onHover={handleHover}
              isSecondViewMode={false}
            />
          </div>
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
          <div className={styles.summaryBox}>
            <div className={styles.summaryLabel}>Total Record Count</div>
            <div className={styles.summaryValue}>{stats.total}</div>
          </div>
          <div className={`${styles.summaryBox} ${styles.summaryBoxHighlight}`}>
            <div className={styles.summaryLabel}>Meets Criteria</div>
            <div className={styles.summaryValue}>{stats.meetsCriteria}</div>
          </div>
          <div className={styles.summaryBox}>
            <div className={styles.summaryLabel}>Falls Criteria</div>
            <div className={styles.summaryValue}>{stats.fallsCriteria}</div>
          </div>
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

