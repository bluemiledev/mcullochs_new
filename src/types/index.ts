// Type definitions for the application

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  updatedAt: Date;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
}

export interface ChartOptions {
  responsive: boolean;
  maintainAspectRatio?: boolean;
  plugins?: {
    legend?: {
      display?: boolean;
      position?: 'top' | 'bottom' | 'left' | 'right';
    };
    title?: {
      display?: boolean;
      text?: string;
    };
  };
  scales?: {
    x?: {
      display?: boolean;
      title?: {
        display?: boolean;
        text?: string;
      };
    };
    y?: {
      display?: boolean;
      title?: {
        display?: boolean;
        text?: string;
      };
    };
  };
}

export interface DashboardStats {
  totalUsers: number;
  revenue: number;
  orders: number;
  conversionRate: number;
  change: {
    totalUsers: string;
    revenue: string;
    orders: string;
    conversionRate: string;
  };
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
  error?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
}

export interface Settings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  defaultChartType: 'line' | 'bar' | 'pie' | 'area';
  autoRefresh: boolean;
  refreshInterval: number;
}

export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'doughnut' | 'scatter';

export interface ChartConfig {
  type: ChartType;
  data: ChartData;
  options: ChartOptions;
}

export interface VehicleMetric {
  id: string;
  name: string;
  unit: string;
  color: string;
  data: Array<{ time: Date; value: number }>;
  currentValue: number;
  avg: number;
  min: number;
  max: number;
  yAxisRange: { min: number; max: number };
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface VehicleInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'maintenance';
  lastUpdate: string;
  location?: {
    lat: number;
    lng: number;
  };
}
