// Script to generate full minute-by-minute data from 6 AM to 6 PM (720 minutes)
const fs = require('fs');
const path = require('path');

// Generate timestamps from 6 AM to 6 PM (720 minutes)
function generateTimestamps() {
  const timestamps = [];
  const baseDate = new Date('2025-01-15T06:00:00');
  
  for (let i = 0; i < 720; i++) {
    const date = new Date(baseDate.getTime() + i * 60 * 1000);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:00`;
    timestamps.push({
      time: timeStr,
      timestamp: date.getTime()
    });
  }
  
  return timestamps;
}

// Generate maintenance data
function generateMaintenanceData() {
  const timestamps = generateTimestamps();
  
  // Generate analog data with realistic variations
  const analogPerMinute = [
    {
      id: "A1",
      name: "Engine Temperature",
      unit: "°C",
      color: "#ef4444",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 120 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 75 + Math.sin(idx / 100) * 10 + Math.random() * 5,
        min: 70 + Math.sin(idx / 100) * 8 + Math.random() * 3,
        max: 80 + Math.sin(idx / 100) * 12 + Math.random() * 5
      }))
    },
    {
      id: "A2",
      name: "Rotation Speed",
      unit: "RPM",
      color: "#3b82f6",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 3000 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 1200 + Math.sin(idx / 50) * 200 + Math.random() * 50,
        min: 1100 + Math.sin(idx / 50) * 150 + Math.random() * 30,
        max: 1300 + Math.sin(idx / 50) * 250 + Math.random() * 70
      }))
    },
    {
      id: "A3",
      name: "Charge Pump Pressure",
      unit: "PSI",
      color: "#10b981",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 500 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 250 + Math.sin(idx / 80) * 50 + Math.random() * 10,
        min: 240 + Math.sin(idx / 80) * 40 + Math.random() * 8,
        max: 260 + Math.sin(idx / 80) * 60 + Math.random() * 12
      }))
    },
    {
      id: "A4",
      name: "M18 Pump Flow",
      unit: "L/min",
      color: "#f59e0b",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 200 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 100 + Math.sin(idx / 60) * 30 + Math.random() * 5,
        min: 95 + Math.sin(idx / 60) * 25 + Math.random() * 4,
        max: 105 + Math.sin(idx / 60) * 35 + Math.random() * 6
      }))
    },
    {
      id: "A5",
      name: "Bean Pump Pressure",
      unit: "PSI",
      color: "#8b5cf6",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 300 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 150 + Math.sin(idx / 70) * 40 + Math.random() * 8,
        min: 145 + Math.sin(idx / 70) * 35 + Math.random() * 6,
        max: 155 + Math.sin(idx / 70) * 45 + Math.random() * 10
      }))
    }
  ];
  
  // Generate digital data
  const digitalPerMinute = [
    {
      id: "D1",
      name: "Engine Running",
      color: "#10b981",
      display: true,
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        value: idx < 600 ? 1 : 0 // Engine off after 10 hours
      }))
    },
    {
      id: "D2",
      name: "Rotation Active",
      color: "#3b82f6",
      display: true,
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        value: idx >= 100 && idx < 500 ? 1 : 0 // Active between certain times
      }))
    }
  ];
  
  // Table data - values will be calculated based on time range
  const tableData = {
    "ENGINE - TIME": { value: 600, max: 720 },
    "ROTATION - TIME": { value: 400, max: 720 },
    "CHARGE PUMP - TIME": { value: 550, max: 720 },
    "M18 PUMP - TIME": { value: 480, max: 720 },
    "BEAN PUMP - TIME": { value: 520, max: 720 },
    "MAIN WINCH - HOURS": { value: 300, max: 720 },
    "MAIN WINCH - DISTANCE": { value: 450, max: 1000 },
    "HEAD TRAVERSE - TIME": { value: 200, max: 720 },
    "HEAD TRAVERSE - DISTANCE": { value: 350, max: 1000 }
  };
  
  return {
    timestamps,
    analogPerMinute,
    digitalPerMinute,
    tableData
  };
}

// Generate drilling data
function generateDrillingData() {
  const timestamps = generateTimestamps();
  
  const analogPerMinute = [
    {
      id: "A1",
      name: "Drill Bit Temperature",
      unit: "°C",
      color: "#ef4444",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 200 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 120 + Math.sin(idx / 90) * 30 + Math.random() * 10,
        min: 115 + Math.sin(idx / 90) * 25 + Math.random() * 8,
        max: 125 + Math.sin(idx / 90) * 35 + Math.random() * 12
      }))
    },
    {
      id: "A2",
      name: "Drill Pressure",
      unit: "PSI",
      color: "#3b82f6",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 5000 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 2500 + Math.sin(idx / 60) * 500 + Math.random() * 100,
        min: 2400 + Math.sin(idx / 60) * 400 + Math.random() * 80,
        max: 2600 + Math.sin(idx / 60) * 600 + Math.random() * 120
      }))
    },
    {
      id: "A3",
      name: "Circulation Flow Rate",
      unit: "L/min",
      color: "#10b981",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 500 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 300 + Math.sin(idx / 70) * 80 + Math.random() * 15,
        min: 290 + Math.sin(idx / 70) * 70 + Math.random() * 12,
        max: 310 + Math.sin(idx / 70) * 90 + Math.random() * 18
      }))
    },
    {
      id: "A4",
      name: "Rod Tripping Speed",
      unit: "m/min",
      color: "#f59e0b",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 50 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 25 + Math.sin(idx / 100) * 10 + Math.random() * 2,
        min: 23 + Math.sin(idx / 100) * 8 + Math.random() * 1.5,
        max: 27 + Math.sin(idx / 100) * 12 + Math.random() * 2.5
      }))
    },
    {
      id: "A5",
      name: "Airlifting Pressure",
      unit: "PSI",
      color: "#8b5cf6",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 400 },
      points: timestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 200 + Math.sin(idx / 85) * 60 + Math.random() * 12,
        min: 195 + Math.sin(idx / 85) * 55 + Math.random() * 10,
        max: 205 + Math.sin(idx / 85) * 65 + Math.random() * 14
      }))
    }
  ];
  
  // No digital data for drilling
  const digitalPerMinute = [];
  
  // Table data
  const tableData = {
    "DRILLING TIME": { value: 450, max: 720 },
    "CIRCULATING/SURVEY TIME": { value: 380, max: 720 },
    "ROD TRIPPING TIME": { value: 320, max: 720 },
    "IDLE TIME 1": { value: 150, max: 720 },
    "IDLE TIME 2": { value: 100, max: 720 },
    "AIRLIFTING": { value: 280, max: 720 }
  };
  
  return {
    timestamps,
    analogPerMinute,
    digitalPerMinute,
    tableData
  };
}

// Write files
const maintenanceData = generateMaintenanceData();
const drillingData = generateDrillingData();

const publicDataDir = path.join(__dirname, '..', 'public', 'data');

if (!fs.existsSync(publicDataDir)) {
  fs.mkdirSync(publicDataDir, { recursive: true });
}

const maintenancePath = path.join(publicDataDir, 'maintenance-data.json');
const drillingPath = path.join(publicDataDir, 'drilling-data.json');

console.log('Generating maintenance-data.json...');
fs.writeFileSync(
  maintenancePath,
  JSON.stringify(maintenanceData, null, 2)
);

console.log('Generating drilling-data.json...');
fs.writeFileSync(
  drillingPath,
  JSON.stringify(drillingData, null, 2)
);

console.log('✅ Generated maintenance-data.json with', maintenanceData.timestamps.length, 'minutes of data');
console.log('   - Analog charts:', maintenanceData.analogPerMinute.length);
console.log('   - Digital charts:', maintenanceData.digitalPerMinute.length);
console.log('   - Table fields:', Object.keys(maintenanceData.tableData).length);

console.log('✅ Generated drilling-data.json with', drillingData.timestamps.length, 'minutes of data');
console.log('   - Analog charts:', drillingData.analogPerMinute.length);
console.log('   - Digital charts:', drillingData.digitalPerMinute.length);
console.log('   - Table fields:', Object.keys(drillingData.tableData).length);

console.log('\nFiles written to:');
console.log('  -', maintenancePath);
console.log('  -', drillingPath);
