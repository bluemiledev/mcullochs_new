import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FilterControls from '../components/FilterControls';
import TimeScrubber from '../components/TimeScrubber';
import { formatShiftForAPI } from '../utils';
import styles from './MaintenanceDetailPage.module.css';

interface Instance {
  time: string;
  value: number;
  matched?: boolean;
}

const ITEMS_PER_PAGE = 10;

const MaintenanceDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  
  // Get output name from URL params
  const outputName = searchParams.get('outputName') || '';   
  const [instances, setInstances] = useState<Instance[]>([]);
  
  // Debug: Log when component mounts
  useEffect(() => {
    console.log('📄 MaintenanceDetailPage mounted');
    console.log('📄 Current URL:', window.location.href);
    console.log('📄 outputName:', outputName);
    console.log('📄 Current URL params:', Object.fromEntries(searchParams.entries()));
    
    // If no outputName, we should still render the page (just show error message)
    // Don't redirect - let the user see the error
  }, [outputName, searchParams]);
  
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

  const rangeChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Params from URL
  const deviceId = searchParams.get('device_id') || searchParams.get('vehicle');
  const date = searchParams.get('date');
  const shift = searchParams.get('shift') || '6 AM to 6 PM';
  const id = searchParams.get('id');
  const name = searchParams.get('name') || outputName;
  const value = searchParams.get('value');
  const reading = searchParams.get('reading') || 'Hours';

  // Scrubber domain should stay fixed for the full shift (like VehicleDashboard's rawTimestamps),
  // while the user-selected range (selectionStart/End) can move within it.
  const shiftDomain = useMemo(() => {
    const parseShiftToTimes = (shiftStr: string): {
      startH: number; startM: number; startS: number;
      endH: number; endM: number; endS: number;
    } => {
      if (!shiftStr || typeof shiftStr !== 'string') {
        return { startH: 6, startM: 0, startS: 0, endH: 18, endM: 0, endS: 0 };
      }

      // API format: "HH:mm:sstoHH:mm:ss" (optionally with spaces around "to")
      const apiMatch = shiftStr.match(/(\d{2}):(\d{2}):(\d{2})\s*to\s*(\d{2}):(\d{2}):(\d{2})/i);
      if (apiMatch) {
        return {
          startH: parseInt(apiMatch[1], 10),
          startM: parseInt(apiMatch[2], 10),
          startS: parseInt(apiMatch[3], 10),
          endH: parseInt(apiMatch[4], 10),
          endM: parseInt(apiMatch[5], 10),
          endS: parseInt(apiMatch[6], 10),
        };
      }

      // UI format: "6 AM to 6 PM"
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

        return { startH: startHour, startM: 0, startS: 0, endH: endHour, endM: 0, endS: 0 };
      }

      return { startH: 6, startM: 0, startS: 0, endH: 18, endM: 0, endS: 0 };
    };

    const { startH, startM, startS, endH, endM, endS } = parseShiftToTimes(shift);

    // Use the selected date if available; otherwise use today. Always set times in UTC to match TimeScrubber tick formatting and API payload.
    let base = date ? new Date(`${date}T00:00:00Z`) : new Date();
    if (!date) {
      base = new Date();
      base.setUTCHours(0, 0, 0, 0);
    }
    if (!Number.isFinite(base.getTime())) {
      base = new Date();
      base.setUTCHours(0, 0, 0, 0);
    }

    const start = new Date(base);
    start.setUTCHours(startH, startM, startS, 0);
    const end = new Date(base);
    end.setUTCHours(endH, endM, endS, 0);

    // Handle shifts that cross midnight (e.g. 6 PM to 6 AM)
    if (end.getTime() <= start.getTime()) {
      end.setUTCDate(end.getUTCDate() + 1);
    }

    return { startMs: start.getTime(), endMs: end.getTime() };
  }, [date, shift]);

  // Initialize/reset selection to full shift when shift or date changes (but NOT when user drags the range)
  useEffect(() => {
    if (!Number.isFinite(shiftDomain.startMs) || !Number.isFinite(shiftDomain.endMs) || shiftDomain.startMs >= shiftDomain.endMs) {
      return;
    }
    if (rangeChangeTimeoutRef.current) {
      clearTimeout(rangeChangeTimeoutRef.current);
      rangeChangeTimeoutRef.current = null;
    }

    const start = new Date(shiftDomain.startMs);
    const end = new Date(shiftDomain.endMs);
    setSelectionStart(start);
    setSelectionEnd(end);
    setSelectedTime(new Date((shiftDomain.startMs + shiftDomain.endMs) / 2));
  }, [shiftDomain.startMs, shiftDomain.endMs]);

  const loadDataForRange = useCallback(async (rangeStart: Date, rangeEnd: Date) => {
    if (!outputName) return;

    if (!deviceId || !date || !id || !name || !value) {
      console.warn('⚠️ Missing required parameters for API call:', { deviceId, date, id, name, value });
      setInstances([]);
      setCurrentPage(1);
      return;
    }

    try {
      const startMs = Math.min(rangeStart.getTime(), rangeEnd.getTime());
      const endMs = Math.max(rangeStart.getTime(), rangeEnd.getTime());
      const start = new Date(startMs);
      const end = new Date(endMs);

      // Format start and end times for API (UTC format HH:mm:ss)
      const formatTimeForAPI = (d: Date): string => {
        const hours = String(d.getUTCHours()).padStart(2, '0');
        const minutes = String(d.getUTCMinutes()).padStart(2, '0');
        const seconds = String(d.getUTCSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
      };

      const shiftParam = formatShiftForAPI(shift);
      const startTimeStr = formatTimeForAPI(start);
      const endTimeStr = formatTimeForAPI(end);

      // Build API URL
      const apiUrl = `/reet_python/mccullochs/apis/get_data.php?` +
        `devices_serial_no=${encodeURIComponent(deviceId)}&` +
        `date=${encodeURIComponent(date)}&` +
        `shift=${encodeURIComponent(shiftParam)}&` +
        `start_time=${encodeURIComponent(startTimeStr)}&` +
        `end_time=${encodeURIComponent(endTimeStr)}&` +
        `id=${encodeURIComponent(id)}&` +
        `name=${encodeURIComponent(name)}&` +
        `value=${encodeURIComponent(value)}&` +
        `reading=${encodeURIComponent(reading)}`;

      console.log('📊 Fetching maintenance detail data from API:', apiUrl);

      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      let json: any;

      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse response as JSON:', parseError);
        throw new Error('Invalid JSON response from API');
      }

      // Handle API response structure: { data: [...] } or { success: true, data: [...] }
      let dataArray: any[] = [];

      // Check for success wrapper first
      if (json.success !== undefined) {
        if (json.success && json.data) {
          // Handle { success: true, data: [...] } or { success: true, data: { data: [...] } }
          if (Array.isArray(json.data)) {
            dataArray = json.data;
            console.log('✅ Found array in json.data (success wrapper)');
          } else if (json.data.data && Array.isArray(json.data.data)) {
            dataArray = json.data.data;
            console.log('✅ Found paginated data structure:', {
              total_pages: json.data.total_pages,
              per_page: json.data.per_page,
              items: dataArray.length
            });
          }
        } else {
          console.warn('⚠️ API response indicates failure:', json);
          setInstances([]);
          return;
        }
      } else if (Array.isArray(json.data)) {
        // Handle { data: [...] } format directly
        dataArray = json.data;
        console.log('✅ Found array in json.data');
      } else if (Array.isArray(json)) {
        // Handle direct array format
        dataArray = json;
        console.log('✅ Found direct array');
      } else {
        console.warn('⚠️ API response format unexpected:', json);
        console.warn('⚠️ Expected array in json.data, json.data.data, or json itself');
        setInstances([]);
        return;
      }

      // Map API data directly - use time and value as-is from API
      const apiInstances: Instance[] = dataArray.map((item: any) => ({
        time: String(item.time || ''),
        value: Number(item.value || 0),
        matched: item.matched !== undefined ? Boolean(item.matched) : undefined
      }));

      setInstances(apiInstances);
      setCurrentPage(1); // Reset to first page
      console.log('✅ Loaded', apiInstances.length, 'instances from API');
    } catch (error: any) {
      console.error('❌ Error loading maintenance detail data:', error);
      // Show empty state instead of mock data
      setInstances([]);
      setCurrentPage(1);
    }
  }, [outputName, deviceId, date, shift, id, name, value, reading]);

  // Initial load + reload when URL filter params change (device/date/shift/etc). Selection dragging fetches via debounce in handleSelectionChange.
  useEffect(() => {
    if (!Number.isFinite(shiftDomain.startMs) || !Number.isFinite(shiftDomain.endMs) || shiftDomain.startMs >= shiftDomain.endMs) {
      return;
    }
    loadDataForRange(new Date(shiftDomain.startMs), new Date(shiftDomain.endMs));
  }, [shiftDomain.startMs, shiftDomain.endMs, loadDataForRange]);

  // REMOVED: screen-mode:changed listener that was causing redirects
  // We don't want to navigate away from the detail page when mode changes
  // The user can use the back button or change mode from the main page

  // Prepare scrubber data - per-second in second view mode, per-minute otherwise
  const scrubberData = useMemo(() => {
    // Always use minute-based timestamps (second view mode removed)
    // IMPORTANT: Keep the scrubber domain fixed to the full shift range.
    // SelectionStart/End should NOT affect the domain; otherwise the timeline "shrinks" while dragging.
    const startTs = shiftDomain.startMs;
    const endTs = shiftDomain.endMs;
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) return [];

    const data: Array<{ time: number }> = [];
    const step = 60 * 1000; // 1 minute resolution
    for (let t = startTs; t <= endTs; t += step) {
      data.push({ time: t });
    }
    if (data.length === 0 || data[data.length - 1].time !== endTs) data.push({ time: endTs });
    return data;
  }, [shiftDomain.startMs, shiftDomain.endMs]);

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
    // Clamp and normalize timestamps
    let startMs = Math.min(startTimestamp, endTimestamp);
    let endMs = Math.max(startTimestamp, endTimestamp);

    // Clamp to full-shift domain
    const domainStart = shiftDomain.startMs;    
    const domainEnd = shiftDomain.endMs;
    if (Number.isFinite(domainStart) && Number.isFinite(domainEnd) && domainStart < domainEnd) {
      startMs = Math.max(domainStart, startMs);
      endMs = Math.min(domainEnd, endMs);
    }

    // Enforce minimum range (1 hour in minute view mode)
    const minRangeMs = 60 * 60 * 1000;
    if (endMs - startMs < minRangeMs) {
      endMs = startMs + minRangeMs;
      if (Number.isFinite(domainEnd) && endMs > domainEnd) {
        endMs = domainEnd;
        startMs = Math.max(Number.isFinite(domainStart) ? domainStart : startMs, endMs - minRangeMs);
      }
    }

    const newStart = new Date(startMs);
    const newEnd = new Date(endMs);
    setSelectionStart(newStart);
    setSelectionEnd(newEnd);
    setCurrentPage(1);

    // Match main Maintenance behavior: keep selected time centered within the selected range
    setSelectedTime(new Date((startMs + endMs) / 2));

    // Debounce API call to avoid too many requests while dragging
    if (rangeChangeTimeoutRef.current) {
      clearTimeout(rangeChangeTimeoutRef.current);
    }
    rangeChangeTimeoutRef.current = setTimeout(() => {
      loadDataForRange(newStart, newEnd);
    }, 500);
  }, [shiftDomain.startMs, shiftDomain.endMs, loadDataForRange]); // Always use minute view settings

  // Handle hover from scrubber
  const handleHover = useCallback((_timestamp: number | null) => {
    // Intentionally no-op: keep pointer/red-line fixed unless knob is dragged
  }, []);

  // Calculate statistics based on matched field from API
  const stats = useMemo(() => {
    const total = instances.length;
    // Use matched field from API: true = "Meets Criteria", false = "Falls Criteria"
    const meetsCriteria = instances.filter(inst => inst.matched === true).length;
    const fallsCriteria = instances.filter(inst => inst.matched === false).length;
    
    return { total, meetsCriteria, fallsCriteria };
  }, [instances]);
  
  // Filter instances based on active filter using matched field
  const filteredInstances = useMemo(() => {
    if (activeFilter === 'all') {
      return instances;
    } else if (activeFilter === 'meets') {
      return instances.filter(inst => inst.matched === true);
    } else {
      return instances.filter(inst => inst.matched === false);
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
            onSelectionCommit={handleSelectionChange}
            onHover={handleHover}
            isSecondViewMode={false}
            showVehiclePointer={false}
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
        <div id="maintenanceDetailTableContainer" className={styles.tableContainer}>
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

