// Mock data generator for maintenance detail view
// This will be replaced with API calls later

export interface Instance {
  time: string;
  value: number;
}

// Generate mock instances for a given output name
export const getMockInstances = (outputName: string): Instance[] => {
  // Generate 24 random instances as shown in the image
  const instances: Instance[] = [];
  const baseHour = 6; // Start from 6 AM
  const baseMinute = 17;
  
  // Sample times and values based on the image pattern
  // Adjusted to match: 10 meets criteria, 14 falls criteria (threshold: >380)
  const sampleData = [
    { time: '06:17:12', value: 330 },  // Falls
    { time: '07:42:10', value: 400 },  // Meets
    { time: '08:05:27', value: 347 },  // Falls
    { time: '08:59:30', value: 431 },  // Meets
    { time: '09:15:45', value: 380 },  // Falls
    { time: '09:32:18', value: 412 },  // Meets
    { time: '10:08:55', value: 365 },  // Falls
    { time: '10:25:33', value: 398 },  // Meets
    { time: '11:12:07', value: 345 },  // Falls
    { time: '11:48:22', value: 425 },  // Meets
    { time: '12:05:14', value: 372 },  // Falls
    { time: '12:33:49', value: 408 },  // Meets
    { time: '13:18:26', value: 355 },  // Falls
    { time: '13:45:11', value: 390 },  // Meets
    { time: '14:22:58', value: 318 },  // Falls
    { time: '14:56:37', value: 362 },  // Falls
    { time: '15:14:23', value: 405 },  // Meets
    { time: '15:41:09', value: 375 },  // Falls
    { time: '16:08:52', value: 428 },  // Meets
    { time: '16:35:16', value: 340 },  // Falls
    { time: '17:02:44', value: 395 },  // Meets
    { time: '17:28:31', value: 310 },  // Falls
    { time: '17:55:19', value: 358 },  // Falls
    { time: '18:12:06', value: 422 },  // Meets
  ];

  // Return the sample data (24 instances as shown in image)
  return sampleData;
};

