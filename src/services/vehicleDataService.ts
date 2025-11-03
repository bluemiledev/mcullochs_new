import { VehicleMetric, TimeRange } from '../types';

export interface VehicleDataService {
  getVehicleMetrics(vehicleId: string, date: string, timeRange: TimeRange): Promise<VehicleMetric[]>;
  getAvailableVehicles(): Promise<Array<{ id: string; name: string }>>;
  getVehicleStatus(vehicleId: string): Promise<any>;
}

class MockVehicleDataService implements VehicleDataService {
  private vehicles = [
    { id: '6363298', name: '6363298 (2131DQW12)' },
    { id: '6363299', name: '6363299 (2131DQW13)' },
    { id: '6363300', name: '6363300 (2131DQW14)' },
  ];

  async getAvailableVehicles() {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    return this.vehicles;
  }

  async getVehicleMetrics(vehicleId: string, date: string, timeRange: TimeRange): Promise<VehicleMetric[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // This would normally fetch from API
    // For now, return mock data
    return this.generateMockMetrics(vehicleId, date, timeRange);
  }

  async getVehicleStatus(vehicleId: string) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      vehicleId,
      status: 'active',
      lastUpdate: new Date().toISOString(),
      location: { lat: -27.4698, lng: 153.0251 }, // Brisbane coordinates
    };
  }

  private generateMockMetrics(vehicleId: string, date: string, timeRange: TimeRange): VehicleMetric[] {
    // This method generates realistic mock data
    // In production, this would be replaced with actual API calls
    
    const baseDate = new Date(date);
    const startTime = new Date(baseDate);
    startTime.setHours(1, 0, 0, 0);
    
    const metrics: VehicleMetric[] = [
      {
        id: 'D1',
        name: 'On-Track Status',
        unit: '',
        color: '#ff6b35',
        data: [],
        currentValue: 1,
        avg: 0.85,
        min: 0,
        max: 1,
        yAxisRange: { min: -0.5, max: 1.5 }
      },
      // ... other metrics would be generated here
    ];

    // Generate time series data
    metrics.forEach(metric => {
      const dataPoints = [];
      const currentTime = new Date(startTime);
      
      for (let i = 0; i < 24; i++) {
        let value = 0;
        
        if (metric.id === 'D1') {
          if (i >= 8 && i <= 13) {
            value = Math.random() > 0.3 ? 1 : 0;
          } else {
            value = 1;
          }
        }
        
        dataPoints.push({
          time: new Date(currentTime),
          value: value
        });
        
        currentTime.setHours(currentTime.getHours() + 1);
      }
      
      metric.data = dataPoints;
      
      const values = dataPoints.map(d => d.value);
      metric.avg = values.reduce((a, b) => a + b, 0) / values.length;
      metric.min = Math.min(...values);
      metric.max = Math.max(...values);
      metric.currentValue = values[values.length - 1];
    });

    return metrics;
  }
}

// Export singleton instance
export const vehicleDataService = new MockVehicleDataService();

// Future API service implementation
class ApiVehicleDataService implements VehicleDataService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getAvailableVehicles() {
    const response = await fetch(`${this.baseUrl}/vehicles`);
    if (!response.ok) {
      throw new Error('Failed to fetch vehicles');
    }
    return response.json();
  }

  async getVehicleMetrics(vehicleId: string, date: string, timeRange: TimeRange): Promise<VehicleMetric[]> {
    const params = new URLSearchParams({
      vehicleId,
      date,
      startTime: timeRange.start,
      endTime: timeRange.end,
    });

    const response = await fetch(`${this.baseUrl}/vehicles/${vehicleId}/metrics?${params}`);
    if (!response.ok) {
      throw new Error('Failed to fetch vehicle metrics');
    }
    return response.json();
  }

  async getVehicleStatus(vehicleId: string) {
    const response = await fetch(`${this.baseUrl}/vehicles/${vehicleId}/status`);
    if (!response.ok) {
      throw new Error('Failed to fetch vehicle status');
    }
    return response.json();
  }
}

// Factory function to create API service
export const createApiVehicleDataService = (baseUrl: string): VehicleDataService => {
  return new ApiVehicleDataService(baseUrl);
};









