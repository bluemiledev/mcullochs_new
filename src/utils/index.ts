// Common utility functions

/**
 * Formats a number with commas
 */
export const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

/**
 * Formats a currency value
 */
export const formatCurrency = (amount: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

/**
 * Formats a percentage value
 */
export const formatPercentage = (value: number, decimals = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * Generates a random ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

/**
 * Debounces a function call
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttles a function call
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Clamps a number between min and max values
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Checks if a value is empty (null, undefined, empty string, empty array, empty object)
 */
export const isEmpty = (value: any): boolean => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * Deep clones an object
 */
export const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
  if (typeof obj === 'object') {
    const clonedObj = {} as any;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
  return obj;
};

/**
 * Converts date from YYYY-MM-DD (API format) to DD-MM-YYYY (display format)
 */
export const formatDateForDisplay = (dateStr: string): string => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  // Check if already in DD-MM-YYYY format
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
  // Also check for old DD/MM/YYYY format and convert it
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return dateStr.replace(/\//g, '-');
  }
  // Convert from YYYY-MM-DD to DD-MM-YYYY
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

/**
 * Converts date from DD-MM-YYYY (display format) to YYYY-MM-DD (API format)
 */
export const formatDateForAPI = (dateStr: string): string => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  // Check if already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // Convert from DD-MM-YYYY to YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  // Also handle old DD/MM/YYYY format
  const partsSlash = dateStr.split('/');
  if (partsSlash.length === 3 && partsSlash[2].length === 4) {
    return `${partsSlash[2]}-${partsSlash[1]}-${partsSlash[0]}`;
  }
  return dateStr;
};

/**
 * Converts shift format from "6 AM to 6 PM" to "06:00:00to18:00:00" for API
 */
export const formatShiftForAPI = (shift: string): string => {
  if (!shift || typeof shift !== 'string') return '06:00:00to18:00:00'; // Default
  
  // Check if already in API format
  if (/^\d{2}:\d{2}:\d{2}to\d{2}:\d{2}:\d{2}$/.test(shift)) {
    return shift;
  }
  
  // Parse "6 AM to 6 PM" format
  const match = shift.match(/(\d+)\s*(AM|PM)\s+to\s+(\d+)\s*(AM|PM)/i);
  if (match) {
    let startHour = parseInt(match[1], 10);
    const startPeriod = match[2].toUpperCase();
    let endHour = parseInt(match[3], 10);
    const endPeriod = match[4].toUpperCase();
    
    // Convert to 24-hour format
    if (startPeriod === 'PM' && startHour !== 12) startHour += 12;
    if (startPeriod === 'AM' && startHour === 12) startHour = 0;
    
    if (endPeriod === 'PM' && endHour !== 12) endHour += 12;
    if (endPeriod === 'AM' && endHour === 12) endHour = 0;
    
    return `${String(startHour).padStart(2, '0')}:00:00to${String(endHour).padStart(2, '0')}:00:00`;
  }
  
  // Default fallback
  return '06:00:00to18:00:00';
};


















