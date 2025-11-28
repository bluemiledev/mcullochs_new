// Generate full 720 minutes of data (6 AM to 6 PM)
const fs = require('fs');
const path = require('path');

function generateTimestamps() {
  const timestamps = [];
  const baseDate = new Date('2025-01-15T06:00:00');
  for (let i = 0; i < 720; i++) {
    const date = new Date(baseDate.getTime() + i * 60 * 1000);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    timestamps.push({
      time: `${hours}:${minutes}:00`,
      timestamp: date.getTime()
    });
  }
  return timestamps;
}

// Maintenance data
const maintenanceTimestamps = generateTimestamps();
const maintenanceData = {
  timestamps: maintenanceTimestamps,
  analogPerMinute: [
    {
      id: "A1",
      name: "Engine Temperature",
      unit: "°C",
      color: "#ef4444",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 120 },
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 75 + Math.sin(idx / 100) * 10 + (idx % 10) * 0.5,
        min: 70 + Math.sin(idx / 100) * 8 + (idx % 10) * 0.3,
        max: 80 + Math.sin(idx / 100) * 12 + (idx % 10) * 0.7
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
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 1200 + Math.sin(idx / 50) * 200 + (idx % 20) * 2,
        min: 1100 + Math.sin(idx / 50) * 150 + (idx % 20) * 1.5,
        max: 1300 + Math.sin(idx / 50) * 250 + (idx % 20) * 2.5
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
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 250 + Math.sin(idx / 80) * 50 + (idx % 15) * 0.5,
        min: 240 + Math.sin(idx / 80) * 40 + (idx % 15) * 0.4,
        max: 260 + Math.sin(idx / 80) * 60 + (idx % 15) * 0.6
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
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 100 + Math.sin(idx / 60) * 30 + (idx % 12) * 0.3,
        min: 95 + Math.sin(idx / 60) * 25 + (idx % 12) * 0.25,
        max: 105 + Math.sin(idx / 60) * 35 + (idx % 12) * 0.35
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
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 150 + Math.sin(idx / 70) * 40 + (idx % 18) * 0.4,
        min: 145 + Math.sin(idx / 70) * 35 + (idx % 18) * 0.35,
        max: 155 + Math.sin(idx / 70) * 45 + (idx % 18) * 0.45
      }))
    }
  ],
  digitalPerMinute: [
    {
      id: "D1",
      name: "Engine Running",
      color: "#10b981",
      display: true,
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        value: idx < 600 ? 1 : 0
      }))
    },
    {
      id: "D2",
      name: "Rotation Active",
      color: "#3b82f6",
      display: true,
      points: maintenanceTimestamps.map((ts, idx) => ({
        time: ts.time,
        value: idx >= 100 && idx < 500 ? 1 : 0
      }))
    }
  ],
  tableData: {
    "ENGINE - TIME": { value: 600, max: 720 },
    "ROTATION - TIME": { value: 400, max: 720 },
    "CHARGE PUMP - TIME": { value: 550, max: 720 },
    "M18 PUMP - TIME": { value: 480, max: 720 },
    "BEAN PUMP - TIME": { value: 520, max: 720 },
    "MAIN WINCH - HOURS": { value: 300, max: 720 },
    "MAIN WINCH - DISTANCE": { value: 450, max: 1000 },
    "HEAD TRAVERSE - TIME": { value: 200, max: 720 },
    "HEAD TRAVERSE - DISTANCE": { value: 350, max: 1000 }
  }
};

// Drilling data
const drillingTimestamps = generateTimestamps();
const drillingData = {
  timestamps: drillingTimestamps,
  analogPerMinute: [
    {
      id: "A1",
      name: "Drill Bit Temperature",
      unit: "°C",
      color: "#ef4444",
      display: true,
      resolution: 1,
      offset: 0,
      yAxisRange: { min: 0, max: 200 },
      points: drillingTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 120 + Math.sin(idx / 90) * 30 + (idx % 11) * 0.8,
        min: 115 + Math.sin(idx / 90) * 25 + (idx % 11) * 0.7,
        max: 125 + Math.sin(idx / 90) * 35 + (idx % 11) * 0.9
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
      points: drillingTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 2500 + Math.sin(idx / 60) * 500 + (idx % 25) * 3,
        min: 2400 + Math.sin(idx / 60) * 400 + (idx % 25) * 2.5,
        max: 2600 + Math.sin(idx / 60) * 600 + (idx % 25) * 3.5
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
      points: drillingTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 300 + Math.sin(idx / 70) * 80 + (idx % 14) * 1,
        min: 290 + Math.sin(idx / 70) * 70 + (idx % 14) * 0.9,
        max: 310 + Math.sin(idx / 70) * 90 + (idx % 14) * 1.1
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
      points: drillingTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 25 + Math.sin(idx / 100) * 10 + (idx % 8) * 0.2,
        min: 23 + Math.sin(idx / 100) * 8 + (idx % 8) * 0.15,
        max: 27 + Math.sin(idx / 100) * 12 + (idx % 8) * 0.25
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
      points: drillingTimestamps.map((ts, idx) => ({
        time: ts.time,
        avg: 200 + Math.sin(idx / 85) * 60 + (idx % 16) * 0.7,
        min: 195 + Math.sin(idx / 85) * 55 + (idx % 16) * 0.65,
        max: 205 + Math.sin(idx / 85) * 65 + (idx % 16) * 0.75
      }))
    }
  ],
  digitalPerMinute: [],
  tableData: {
    "DRILLING TIME": { value: 450, max: 720 },
    "CIRCULATING/SURVEY TIME": { value: 380, max: 720 },
    "ROD TRIPPING TIME": { value: 320, max: 720 },
    "IDLE TIME 1": { value: 150, max: 720 },
    "IDLE TIME 2": { value: 100, max: 720 },
    "AIRLIFTING": { value: 280, max: 720 }
  }
};

// Write files
const publicDataDir = path.join(__dirname, '..', 'public', 'data');
if (!fs.existsSync(publicDataDir)) {
  fs.mkdirSync(publicDataDir, { recursive: true });
}

const maintenancePath = path.join(publicDataDir, 'maintenance-data.json');
const drillingPath = path.join(publicDataDir, 'drilling-data.json');

console.log('Generating maintenance-data.json...');
fs.writeFileSync(maintenancePath, JSON.stringify(maintenanceData, null, 2));
console.log(`✅ Created ${maintenancePath}`);
console.log(`   Timestamps: ${maintenanceData.timestamps.length}`);
console.log(`   First: ${maintenanceData.timestamps[0].time}, Last: ${maintenanceData.timestamps[maintenanceData.timestamps.length - 1].time}`);
console.log(`   Analog series: ${maintenanceData.analogPerMinute.length}, Points per series: ${maintenanceData.analogPerMinute[0].points.length}`);

console.log('\nGenerating drilling-data.json...');
fs.writeFileSync(drillingPath, JSON.stringify(drillingData, null, 2));
console.log(`✅ Created ${drillingPath}`);
console.log(`   Timestamps: ${drillingData.timestamps.length}`);
console.log(`   First: ${drillingData.timestamps[0].time}, Last: ${drillingData.timestamps[drillingData.timestamps.length - 1].time}`);
console.log(`   Analog series: ${drillingData.analogPerMinute.length}, Points per series: ${drillingData.analogPerMinute[0].points.length}`);
console.log(`   Chart names: ${drillingData.analogPerMinute.map(s => s.name).join(', ')}`);

