import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ApiResponse, PaginatedResponse, DashboardStats, ChartData } from '../types';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_URL || '/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized access
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Generic GET request
  async get<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.api.get(url);
    return response.data;
  }

  // Generic POST request
  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.post(url, data);
    return response.data;
  }

  // Generic PUT request
  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const response = await this.api.put(url, data);
    return response.data;
  }

  // Generic DELETE request
  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.api.delete(url);
    return response.data;
  }

  // Dashboard specific methods
  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return this.get<DashboardStats>('/dashboard/stats');
  }

  // Chart specific methods
  async getChartData(chartId: string): Promise<ApiResponse<ChartData>> {
    return this.get<ChartData>(`/charts/${chartId}`);
  }

  async getChartDataByType(type: string): Promise<ApiResponse<ChartData[]>> {
    return this.get<ChartData[]>(`/charts?type=${type}`);
  }

  // User specific methods
  async getUsers(): Promise<PaginatedResponse<any>> {
    const response = await this.get<any>('/users');
    return response.data;
  }

  async getUser(id: string): Promise<ApiResponse<any>> {
    return this.get<any>(`/users/${id}`);
  }

  async updateUser(id: string, data: any): Promise<ApiResponse<any>> {
    return this.put<any>(`/users/${id}`, data);
  }

  async deleteUser(id: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/users/${id}`);
  }

  // Settings methods
  async getSettings(): Promise<ApiResponse<any>> {
    return this.get<any>('/settings');
  }

  async updateSettings(data: any): Promise<ApiResponse<any>> {
    return this.put<any>('/settings', data);
  }
}

export const apiService = new ApiService();
export default apiService;
