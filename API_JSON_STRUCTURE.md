# Complete API JSON Structure Documentation

---

## 1. DRILLING API

```json
{
  "success": true,
  "data": {
    "timestamps": [
      {
        "time": "06:00:00",
        "timestamp": 1736881200000
      },
      {
        "time": "06:01:00",
        "timestamp": 1736881260000
      }
    ],
    "analogPerMinute": [
      {
        "id": "A1",
        "name": "Drill Bit Temperature",
        "unit": "°C",
        "color": "#ef4444",
        "display": true,
        "resolution": 1,
        "offset": 0,
        "yAxisRange": {
          "min": 0,
          "max": 200
        },
        "points": [
          {
            "time": "06:00:00",
            "avg": 120.5,
            "min": 115.2,
            "max": 125.8
          },
          {
            "time": "06:01:00",
            "avg": 121.3,
            "min": 116.0,
            "max": 126.6
          }
        ]
      }
    ],
    "tableData": {
      "DRILLING TIME (OD101)": {
        "value": 450,
        "max": 720
      },
      "CIRCULATING/SURVEY TIME (OD102)": {
        "value": 380,
        "max": 720
      },
      "ROD TRIPPING TIME (OD103)": {
        "value": 320,
        "max": 720
      },
      "IDLE TIME 1 (OD104)": {
        "value": 150,
        "max": 720
      },
      "IDLE TIME 2 (OD105)": {
        "value": 100,
        "max": 720
      },
      "AIRLIFTING (OD106)": {
        "value": 280,
        "max": 720
      }
    }
  }
}
```

---

## 2. MAINTENANCE API



```json
{
  "success": true,
  "data": {
    "reportingOutputs": {
      "ENGINE - TIME (OM001)": {
        "value": 383,
        "max": 720,
        "unit": "HOURS"
      },
      "ROTATION - TIME (OM002)": {
        "value": 400,
        "max": 720,
        "unit": "HOURS"
      },
      "CHARGE PUMP - TIME (OM003)": {
        "value": 445,
        "max": 720,
        "unit": "HOURS"
      },
      "M18 PUMP - TIME (OM004)": {
        "value": 479,
        "max": 720,
        "unit": "HOURS"
      },
      "BEAN PUMP - TIME (OM005)": {
        "value": 514,
        "max": 720,
        "unit": "HOURS"
      },
      "MAIN WINCH - HOURS (OM006)": {
        "value": 576,
        "max": 720,
        "unit": "HOURS"
      },
      "MAIN WINCH - DISTANCE (OM007)": {
        "value": 400,
        "max": 1000,
        "unit": "METERS"
      },
      "HEAD TRAVERSE - TIME (OM008)": {
        "value": 514,
        "max": 720,
        "unit": "HOURS"
      },
      "HEAD TRAVERSE - DISTANCE (OM009)": {
        "value": 400,
        "max": 1000,
        "unit": "METERS"
      }
    },
    "faultReportingAnalog": {
      "HYDRAULIC - PUMP 1 OVER PRESSURE (OM101)": {
        "value": 245,
        "max": 720,
        "unit": "HOURS"
      },
      "HYDRAULIC - PUMP 2 OVER PRESSURE (OM102)": {
        "value": 180,
        "max": 720,
        "unit": "HOURS"
      },
      "ENGINE - OIL PRESSURE LOW (OM103)": {
        "value": 120,
        "max": 720,
        "unit": "HOURS"
      }
    },
    "faultReportingDigital": {
      "ENGINE - OVERHEAT (OM201)": {
        "value": 45,
        "max": 720,
        "unit": "HOURS"
      },
      "HYDRAULIC - SYSTEM FAULT (OM202)": {
        "value": 30,
        "max": 720,
        "unit": "HOURS"
      },
      "ROTATION - EMERGENCY STOP (OM203)": {
        "value": 15,
        "max": 720,
        "unit": "HOURS"
      }
    }
  }
}
```


---

## 3. MAINTENANCE DETAIL VIEW API



```json
{
  "success": true,
  "data": {
    "outputName": "HYDRAULIC - PUMP 1 OVER PRESSURE (OM101)",
    "totalRecords": 24,
    "meetsCriteria": 10,
    "fallsCriteria": 14,
    "criteriaThreshold": 380,
    "instances": [
      {
        "time": "06:17:12",
        "value": 330
      },
      {
        "time": "07:42:10",
        "value": 400
      },
      {
        "time": "08:05:27",
        "value": 347
      },
      {
        "time": "08:59:30",
        "value": 431
      },
      {
        "time": "09:15:45",
        "value": 380
      },
      {
        "time": "09:32:18",
        "value": 412
      },
      {
        "time": "10:08:55",
        "value": 365
      },
      {
        "time": "10:25:33",
        "value": 398
      },
      {
        "time": "11:12:07",
        "value": 345
      },
      {
        "time": "11:48:22",
        "value": 425
      },
      {
        "time": "12:05:14",
        "value": 372
      },
      {
        "time": "12:33:49",
        "value": 408
      },
      {
        "time": "13:18:26",
        "value": 355
      },
      {
        "time": "13:45:11",
        "value": 390
      },
      {
        "time": "14:22:58",
        "value": 318
      },
      {
        "time": "14:56:37",
        "value": 362
      },
      {
        "time": "15:14:23",
        "value": 405
      },
      {
        "time": "15:41:09",
        "value": 375
      },
      {
        "time": "16:08:52",
        "value": 428
      },
      {
        "time": "16:35:16",
        "value": 340
      },
      {
        "time": "17:02:44",
        "value": 395
      },
      {
        "time": "17:28:31",
        "value": 310
      },
      {
        "time": "17:55:19",
        "value": 358
      },
      {
        "time": "18:12:06",
        "value": 422
      }
    ]
  }
}
```



`

