import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import styles from './FilterControls.module.css';
import { formatDateForDisplay, formatDateForAPI } from '../utils';

// Helper function to convert container (including SVG and overlays) to canvas
const containerToCanvas = (container: HTMLElement): Promise<HTMLCanvasElement> => {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Find SVG element in container first to get its actual dimensions
      const svg = container.querySelector('svg');
      const svgRect: DOMRect | null = svg ? svg.getBoundingClientRect() : null;
      
      // Also check for Recharts wrapper which contains the full chart including Y-axis
      const rechartsWrapper = container.querySelector('.recharts-wrapper') as HTMLElement;
      const wrapperRect: DOMRect | null = rechartsWrapper ? rechartsWrapper.getBoundingClientRect() : null;
      
      // Get container dimensions
      const containerRect = container.getBoundingClientRect();
      
      // Check for chart header to include in height calculation
      const chartHeader = container.querySelector('[class*="chartHeader"]') as HTMLElement;
      const headerHeight = chartHeader ? chartHeader.getBoundingClientRect().height : 0;
      
      // Use the largest width to ensure Y-axis labels are included
      // Recharts wrapper typically includes the full width with Y-axis labels
      const width = Math.max(
        wrapperRect?.width || 0,
        svgRect?.width || 0,
        containerRect.width || container.clientWidth || 800
      );
      // Include header height in total height
      const height = (svgRect ? svgRect.height : (containerRect.height || container.clientHeight || 400)) + headerHeight;
      
      // Calculate offset if SVG is positioned differently from container
      const offsetX = svgRect ? svgRect.left - containerRect.left : 0;
      const offsetY = svgRect ? svgRect.top - containerRect.top : 0;

      // Set canvas dimensions to match container (to include overlays)
      canvas.width = containerRect.width || container.clientWidth || width;
      canvas.height = containerRect.height || container.clientHeight || height;
      
      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (svg && svgRect) {
        // First, find Y-axis text elements in the original SVG to get their positions
        const originalTextElements = svg.querySelectorAll('text');
        let minYAxisX = Infinity;
        let hasYAxisLabels = false;
        
        originalTextElements.forEach((textEl) => {
          const xPos = parseFloat(textEl.getAttribute('x') || '0');
          // Y-axis labels are typically positioned with x < 150 (Y-axis width is 140)
          if (xPos < 150 && xPos >= 0) {
            hasYAxisLabels = true;
            minYAxisX = Math.min(minYAxisX, xPos);
            // Try to get bounding box from original SVG
            try {
              const bbox = (textEl as SVGTextElement).getBBox();
              if (bbox.width > 0) {
                minYAxisX = Math.min(minYAxisX, bbox.x);
              }
            } catch (e) {
              // getBBox might fail, use x position instead
            }
          }
        });
        
        // Clone the SVG to avoid modifying the original
        const clonedSvg = svg.cloneNode(true) as SVGElement;
        
        // Find all text elements in cloned SVG
        const allTextElements = clonedSvg.querySelectorAll('text');
        
        // Make sure all text elements in the cloned SVG are visible
        allTextElements.forEach((textEl) => {
          // Get current fill or use a dark color
          const currentFill = textEl.getAttribute('fill');
          
          // Use darker color for Y-axis labels to ensure visibility
          // For all text elements, ensure they have a visible fill color
          const fillColor = (currentFill && currentFill !== 'none' && currentFill !== 'transparent' && currentFill !== 'rgba(0,0,0,0)')
            ? currentFill 
            : '#1f2937'; // Default dark color for all text
          
          // Explicitly set fill, opacity, and visibility for all text elements
          textEl.setAttribute('fill', fillColor);
          textEl.setAttribute('opacity', '1');
          textEl.setAttribute('visibility', 'visible');
          
          // Remove any display:none or visibility:hidden styles
          const style = textEl.getAttribute('style') || '';
          let newStyle = style
            .replace(/display\s*:\s*none/gi, '')
            .replace(/visibility\s*:\s*hidden/gi, '')
            .replace(/opacity\s*:\s*0/gi, '')
            .replace(/fill\s*:\s*[^;]+/gi, ''); // Remove existing fill from style
          
          // Ensure fill is set in style as well (some browsers need this)
          newStyle = `fill: ${fillColor} !important; ${newStyle}`.trim();
          
          textEl.setAttribute('style', newStyle);
          
          // Also ensure parent groups are visible (Y-axis labels are often in groups)
          let parent: Element | null = textEl.parentElement;
          while (parent && parent !== (clonedSvg as unknown as Element)) {
            if (parent.tagName === 'g') {
              parent.setAttribute('opacity', '1');
              parent.setAttribute('visibility', 'visible');
              const parentStyle = parent.getAttribute('style') || '';
              const newParentStyle = parentStyle
                .replace(/display\s*:\s*none/gi, '')
                .replace(/visibility\s*:\s*hidden/gi, '')
                .replace(/opacity\s*:\s*0/gi, '');
              parent.setAttribute('style', newParentStyle);
            }
            parent = parent.parentElement;
          }
        });
        
        // Get the actual SVG dimensions from the rendered element
        // Use the larger of SVG width or container width to ensure Y-axis labels are included
        const actualSvgWidth = Math.max(
          svgRect.width || parseFloat(svg.getAttribute('width') || '0') || width,
          containerRect.width || width,
          wrapperRect?.width || 0
        );
        const actualSvgHeight = svgRect.height || parseFloat(svg.getAttribute('height') || '0') || height;
        
        // Get the viewBox from the original SVG if it exists
        const viewBox = svg.getAttribute('viewBox');
        
        // Ensure SVG has explicit dimensions
        clonedSvg.setAttribute('width', String(actualSvgWidth));
        clonedSvg.setAttribute('height', String(actualSvgHeight));
        
        // Adjust viewBox to include all elements, especially Y-axis labels
        // Y-axis labels are positioned on the left, so we need to expand viewBox to the left
        if (viewBox) {
          const viewBoxParts = viewBox.split(/\s+/).map(Number);
          if (viewBoxParts.length === 4) {
            // Expand viewBox to the left to include Y-axis labels (typically at x < 150)
            // Add extra padding to ensure Y-axis labels are fully visible
            const yAxisPadding = hasYAxisLabels && !isNaN(minYAxisX) && minYAxisX < viewBoxParts[0] 
              ? Math.abs(minYAxisX) + 20  // Add padding for Y-axis labels
              : 20; // Default padding
            
            const expandedMinX = Math.min(viewBoxParts[0], -yAxisPadding);
            const expandedWidth = viewBoxParts[2] + (viewBoxParts[0] - expandedMinX);
            clonedSvg.setAttribute('viewBox', `${expandedMinX} ${viewBoxParts[1]} ${expandedWidth} ${viewBoxParts[3]}`);
          } else {
            clonedSvg.setAttribute('viewBox', viewBox);
          }
        } else {
          // If no viewBox, create one that includes Y-axis area
          const yAxisPadding = hasYAxisLabels ? 160 : 0; // Account for Y-axis width (140) + padding
          clonedSvg.setAttribute('viewBox', `${-yAxisPadding} 0 ${actualSvgWidth + yAxisPadding} ${actualSvgHeight}`);
        }
        
        // Ensure the SVG itself is visible
        clonedSvg.setAttribute('style', 'display: block; visibility: visible; opacity: 1;');

        const svgData = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          // Calculate the viewBox offset if we expanded it to include Y-axis labels
          const finalViewBox = clonedSvg.getAttribute('viewBox');
          let viewBoxOffsetX = 0;
          if (finalViewBox && viewBox) {
            const originalParts = viewBox.split(/\s+/).map(Number);
            const finalParts = finalViewBox.split(/\s+/).map(Number);
            if (originalParts.length === 4 && finalParts.length === 4) {
              // Calculate how much we expanded to the left
              const leftExpansion = originalParts[0] - finalParts[0];
              if (leftExpansion > 0) {
                // Scale the offset based on the width ratio
                const widthRatio = actualSvgWidth / finalParts[2];
                viewBoxOffsetX = leftExpansion * widthRatio;
              }
            }
          }
          
          // Draw SVG at its actual position, accounting for viewBox expansion
          // If viewBox was expanded to the left, we need to shift the drawing position
          // Adjust Y position to account for header
          const chartHeader = container.querySelector('[class*="chartHeader"]') as HTMLElement;
          const headerHeight = chartHeader ? chartHeader.getBoundingClientRect().height : 0;
          ctx.drawImage(img, offsetX - viewBoxOffsetX, offsetY + headerHeight, actualSvgWidth, actualSvgHeight);
          URL.revokeObjectURL(url);
          
          // Now draw overlay elements (ON/OFF labels, time labels, chart headers, etc.)
          drawOverlaysToCanvas(ctx, container, canvas.width, canvas.height);
          
          resolve(canvas);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load SVG image'));
        };
        img.src = url;
      } else {
        // No SVG found, just draw overlays
        drawOverlaysToCanvas(ctx, container, canvas.width, canvas.height);
        resolve(canvas);
      }
    } catch (error) {
      reject(error);
    }
  });
};

// Helper function to draw HTML overlay elements onto canvas
const drawOverlaysToCanvas = (ctx: CanvasRenderingContext2D, container: HTMLElement, canvasWidth: number, canvasHeight: number) => {
  const containerRect = container.getBoundingClientRect();
  
  // Find all overlay elements and their children (ON/OFF status, time labels, etc.)
  // First find overlay containers, then find individual label elements
  const overlayContainers = container.querySelectorAll('.overlay');
  const directLabels = container.querySelectorAll('[class*="rowStatus"], [class*="timeLabel"], [class*="fixedTimeLabel"], [class*="stickyTimeLabel"]');
  
  // Find chart header - draw it as a special case with proper layout
  const chartHeader = container.querySelector('[class*="chartHeader"]') as HTMLElement;
  
  // Combine overlay children and direct labels
  const allLabels: HTMLElement[] = [];
  
  overlayContainers.forEach(overlay => {
    const labels = overlay.querySelectorAll('[class*="rowStatus"], [class*="timeLabel"]');
    labels.forEach(label => allLabels.push(label as HTMLElement));
  });
  
  directLabels.forEach(label => {
    if (!allLabels.includes(label as HTMLElement)) {
      allLabels.push(label as HTMLElement);
    }
  });
  
  // Draw chart header separately with proper layout
  if (chartHeader) {
    const headerRect = chartHeader.getBoundingClientRect();
    const headerX = headerRect.left - containerRect.left;
    const headerY = headerRect.top - containerRect.top;
    
    // Draw chart title on the left
    const chartTitle = chartHeader.querySelector('[class*="chartTitle"]') as HTMLElement;
    if (chartTitle) {
      const titleText = chartTitle.textContent || '';
      const titleStyles = window.getComputedStyle(chartTitle);
      ctx.fillStyle = titleStyles.color || '#1f2937';
      ctx.font = `${titleStyles.fontWeight} ${titleStyles.fontSize} ${titleStyles.fontFamily || 'Arial'}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(titleText, headerX, headerY);
    }
    
    // Draw chart summary on the right with proper spacing
    const chartSummary = chartHeader.querySelector('[class*="chartSummary"]') as HTMLElement;
    if (chartSummary) {
      const summaryItems = chartSummary.querySelectorAll('[class*="summaryItem"]');
      const summaryGap = 10; // Gap between summary items (from CSS)
      const summaryRect = chartSummary.getBoundingClientRect();
      // Start from the right edge of the summary container
      let currentX = headerX + (summaryRect.left - containerRect.left);
      
      summaryItems.forEach((item, index) => {
        const itemEl = item as HTMLElement;
        const label = itemEl.querySelector('[class*="summaryLabel"]') as HTMLElement;
        const value = itemEl.querySelector('[class*="summaryValue"]') as HTMLElement;
        
        if (label && value) {
          const labelText = label.textContent || '';
          const valueText = value.textContent || '';
          const labelStyles = window.getComputedStyle(label);
          const valueStyles = window.getComputedStyle(value);
          const itemGap = 4; // Gap between label and value (from CSS)
          
          // Draw label
          ctx.fillStyle = labelStyles.color || '#6b7280';
          ctx.font = `${labelStyles.fontWeight} ${labelStyles.fontSize} ${labelStyles.fontFamily || 'Arial'}`;
          ctx.textBaseline = 'top';
          ctx.textAlign = 'left';
          ctx.fillText(labelText, currentX, headerY);
          
          // Draw value below label
          ctx.fillStyle = valueStyles.color || '#1f2937';
          ctx.font = `${valueStyles.fontWeight} ${valueStyles.fontSize} ${valueStyles.fontFamily || 'Arial'}`;
          const valueY = headerY + parseFloat(labelStyles.fontSize || '9px') + itemGap;
          ctx.fillText(valueText, currentX, valueY);
          
          // Move to next item position
          const itemRect = itemEl.getBoundingClientRect();
          currentX += itemRect.width + summaryGap;
        }
      });
    }
  }
  
  // Draw other overlay elements
  allLabels.forEach((overlay) => {
    const element = overlay as HTMLElement;
    const elementRect = element.getBoundingClientRect();
    
    // Calculate position relative to container
    const x = elementRect.left - containerRect.left;
    const y = elementRect.top - containerRect.top;
    const width = elementRect.width;
    const height = elementRect.height;
    
    // Skip if element is outside canvas bounds
    if (x < 0 || y < 0 || x > canvasWidth || y > canvasHeight) return;
    
    // Get computed styles
    const styles = window.getComputedStyle(element);
    const bgColor = styles.backgroundColor;
    const color = styles.color;
    const fontSize = styles.fontSize;
    const fontWeight = styles.fontWeight;
    const padding = parseFloat(styles.padding) || 0;
    const borderRadius = parseFloat(styles.borderRadius) || 0;
    const border = styles.border;
    const text = element.textContent || '';
    
    // Helper function to draw rounded rectangle
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };
    
    // Draw background if it has one
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      if (borderRadius > 0) {
        drawRoundedRect(x, y, width, height, borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, width, height);
      }
    }
    
    // Draw border if it has one
    if (border && border !== 'none' && border !== '0px') {
      ctx.strokeStyle = styles.borderColor || '#000000';
      ctx.lineWidth = parseFloat(styles.borderWidth) || 1;
      if (borderRadius > 0) {
        drawRoundedRect(x, y, width, height, borderRadius);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, width, height);
      }
    }
    
    // Skip chart header elements as they're drawn separately above
    const isChartHeaderElement = element.classList.toString().includes('chartHeader') ||
                                 element.classList.toString().includes('chartTitle') ||
                                 element.classList.toString().includes('chartSummary') ||
                                 element.classList.toString().includes('summaryItem') ||
                                 element.classList.toString().includes('summaryLabel') ||
                                 element.classList.toString().includes('summaryValue');
    
    if (isChartHeaderElement) {
      return; // Skip, already drawn above
    }
    
    // Draw text
    if (text) {
      ctx.fillStyle = color || '#000000';
      ctx.font = `${fontWeight} ${fontSize} ${styles.fontFamily || 'Arial'}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      
      // Calculate text position (centered in element)
      const textX = x + padding;
      const textY = y + height / 2;
      
      ctx.fillText(text, textX, textY);
    }
  });
};

// Print chart function - captures charts with all labels and overlays
const printChart = () => {
  const digitalContainer = document.getElementById('digitalSignalContainer');
  const analogContainer = document.getElementById('analogChartsContainer');

  // Collect all canvas elements from both containers
  const canvases: HTMLCanvasElement[] = [];
  if (digitalContainer) {
    canvases.push(...Array.from(digitalContainer.querySelectorAll('canvas')));
  }
  if (analogContainer) {
    canvases.push(...Array.from(analogContainer.querySelectorAll('canvas')));
  }

  // If no canvas elements found, convert containers (including SVG and overlays) to canvas
  if (canvases.length === 0) {
    const containersToConvert: HTMLElement[] = [];
    
    // Find chart containers that include both SVG and overlays
    if (digitalContainer) {
      // For digital chart: find the container that includes both chartWrapper and overlay
      // The structure is: container > chartRow > chartArea > (chartWrapper + overlay)
      const chartArea = digitalContainer.querySelector('.chartArea') as HTMLElement;
      if (chartArea) {
        containersToConvert.push(chartArea);
      } else {
        // Fallback: find container that has both SVG and overlay
        const container = digitalContainer.querySelector('[class*="container"]') as HTMLElement;
        if (container) {
          containersToConvert.push(container);
        } else {
          containersToConvert.push(digitalContainer);
        }
      }
    }
    
    if (analogContainer) {
      // For analog charts: each chart has its own container with chartHeader and chartWrapper
      // Find all direct child containers (top-level only, not nested)
      // Use a more specific selector to avoid nested containers
      const allContainers = Array.from(analogContainer.children) as HTMLElement[];
      const uniqueContainers = new Set<HTMLElement>();
      
      allContainers.forEach(container => {
        // Check if this is a chart container (has SVG and chartHeader)
        const hasSvg = container.querySelector('svg');
        const hasHeader = container.querySelector('[class*="chartHeader"]');
        
        // Only include top-level containers that have both SVG and header
        if (hasSvg && hasHeader) {
          // Make sure we're not adding a nested container
          // Check if this container is a child of another container we've already added
          let isNested = false;
          const existingContainers = Array.from(uniqueContainers);
          for (const existing of existingContainers) {
            if (existing.contains(container) && existing !== container) {
              isNested = true;
              break;
            }
          }
          
          if (!isNested) {
            uniqueContainers.add(container);
          }
        }
      });
      
      if (uniqueContainers.size > 0) {
        containersToConvert.push(...Array.from(uniqueContainers));
      } else {
        // Fallback: try finding containers with class name pattern
        const chartContainers = analogContainer.querySelectorAll('[class*="container"]:not([class*="chartWrapper"])');
        const foundContainers = new Set<HTMLElement>();
        
        chartContainers.forEach(container => {
          const containerEl = container as HTMLElement;
          const hasSvg = containerEl.querySelector('svg');
          const hasHeader = containerEl.querySelector('[class*="chartHeader"]');
          
          if (hasSvg && hasHeader) {
            // Check if it's a direct child or top-level
            const isDirectChild = Array.from(analogContainer.children).includes(containerEl);
            if (isDirectChild) {
              foundContainers.add(containerEl);
            }
          }
        });
        
        if (foundContainers.size > 0) {
          containersToConvert.push(...Array.from(foundContainers));
        } else {
          // Last fallback: use the analog container itself
          containersToConvert.push(analogContainer);
        }
      }
    }

    if (containersToConvert.length === 0) {
      alert("No charts found to print!");
      return;
    }

    // Convert all containers (including SVG and overlays) to canvas
    Promise.all(containersToConvert.map(container => containerToCanvas(container)))
      .then(convertedCanvases => {
        printWithCanvases(convertedCanvases);
      })
      .catch(error => {
        console.error('Error converting containers to canvas:', error);
        alert("Error preparing charts for printing!");
      });
    return;
  }

  printWithCanvases(canvases);
};

// Helper function to print with canvas elements
const printWithCanvases = (canvases: HTMLCanvasElement[]) => {
  if (canvases.length === 0) {
    alert("No charts found to print!");
    return;
  }

  // Convert each canvas to an image dataURL
  const images = canvases.map(canvas => canvas.toDataURL('image/png'));

  // Build HTML for printing with all images
  let htmlContent = `
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          margin: 0;
        }
        img {
          max-width: 1200px;
          width: 100%;
          height: auto;
          display: block;
          margin-bottom: 30px;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
  `;

  images.forEach(src => {
    htmlContent += `<img src="${src}" alt="Chart Image" />`;
  });

  htmlContent += `
      <script>
        window.onload = function () {
          setTimeout(() => {
            window.print();
            window.close();
          }, 500);
        };
      <\/script>
    </body>
    </html>
  `;

  // Open new print window and write content
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};

// Make printChart available globally (like in PHP app)
if (typeof window !== 'undefined') {
  (window as any).printChart = printChart;
}

const FilterControls: React.FC = () => {
  type Vehicle = { id: string; name: string; rego: string };
  const [searchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [hourRanges, setHourRanges] = useState<Array<{ start: string; end: string; label: string }>>([]);
  const [selectedHourRange, setSelectedHourRange] = useState<string>('');

  // Read URL parameters on mount to auto-select device and date
  useEffect(() => {
    const urlDeviceId = searchParams.get('device_id') || searchParams.get('vehicle');
    const urlDate = searchParams.get('date');
    
    if (urlDeviceId && urlDate) {
      console.log('📋 FilterControls: Auto-selecting from URL params - deviceId:', urlDeviceId, 'date:', urlDate);
      setSelectedVehicleId(String(urlDeviceId));
      setSelectedDate(urlDate);
      // Dispatch event so other components know about the selection
      window.dispatchEvent(new CustomEvent('filters:apply', {
        detail: {
          device_id: Number(urlDeviceId),
          date: urlDate
        }
      }));
    }
  }, [searchParams]);

  // Listen to asset selection from AssetSelectionModal to initialize state
  useEffect(() => {
    const onAssetSelected = (e: any) => {
      const deviceId = String(e?.detail?.device_id || '');
      const date = String(e?.detail?.date || '');
      if (deviceId) {
        console.log('📋 FilterControls: Received asset selection:', { deviceId, date });
        setSelectedVehicleId(deviceId);
        // Always set the date from the modal if provided
        if (date) {
          setSelectedDate(date);
          console.log('📋 FilterControls: Set date from asset selection:', date);
        }
      }
    };

    // Also listen to filters:apply event (in case it's dispatched from elsewhere)
    const onFiltersApply = (e: any) => {
      const deviceId = String(e?.detail?.device_id || '');
      const date = String(e?.detail?.date || '');
      if (deviceId) {
        if (!selectedVehicleId || selectedVehicleId !== deviceId) {
          console.log('📋 FilterControls: Received filters:apply, updating vehicle:', { deviceId });
          setSelectedVehicleId(deviceId);
        }
        // If date is provided, use it; otherwise it will auto-select when dates load
        if (date && (!selectedDate || selectedDate !== date)) {
          setSelectedDate(date);
        }
      }
    };

    window.addEventListener('asset:selected', onAssetSelected as any);
    window.addEventListener('filters:apply', onFiltersApply as any);
    
    return () => {
      window.removeEventListener('asset:selected', onAssetSelected as any);
      window.removeEventListener('filters:apply', onFiltersApply as any);
    };
  }, [selectedVehicleId, selectedDate]);

  // Load vehicles from API with local fallback
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        // Fetch from reet_python vehicles API (via proxy)
        const apiRes = await fetch('/reet_python/get_vehicles.php', { headers: { 'Accept': 'application/json' }, cache: 'no-store', mode: 'cors' });
        if (!apiRes.ok) {
          const errorText = await apiRes.text().catch(() => 'Unable to read error response');
          console.error('❌ FilterControls Vehicles API Error:', errorText.substring(0, 500));
          throw new Error(`HTTP ${apiRes.status}: ${apiRes.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await apiRes.text();
        const contentType = apiRes.headers.get('content-type');
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        try {
          json = JSON.parse(text);
          console.log('✅ FilterControls: Successfully parsed vehicles JSON (Content-Type was:', contentType, ')');
        } catch (parseError) {
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('❌ FilterControls: Vehicles API returned HTML. Content-Type:', contentType);
            console.error('❌ Response body (first 500 chars):', text.substring(0, 500));
            throw new Error(`API returned HTML instead of JSON`);
          } else {
            console.error('❌ FilterControls: Vehicles API invalid JSON. Content-Type:', contentType);
            throw new Error(`API returned invalid JSON`);
          }
        }
        // Map response: [{ devices_serial_no: "6363299", name: "Vehicle Name" }, ...]
        const arr: Vehicle[] = Array.isArray(json)
          ? json.map((v: any) => {
              const serial = String(v?.devices_serial_no || '');
              const name = String(v?.name || serial); // Use name field from API, fallback to serial
              return { id: serial, name, rego: serial };
            })
              .filter((v: Vehicle) => v.id.length > 0)
          : [];
        if (aborted) return;
        setVehicles(arr);
        // Don't auto-select - user must select from AssetSelectionModal first
      } catch {
        // Minimal hardcoded fallback if API fails
        const fallback: Vehicle[] = [];
        if (!aborted) {
          setVehicles(fallback);
        }
      }
    };
    load();
    return () => { aborted = true; };
  }, [selectedVehicleId]);

  // Fetch dates when vehicle changes and auto-select the first (most recent) date
  useEffect(() => {
    let aborted = false;
    const loadDates = async () => {
      if (!selectedVehicleId) { setDates([]); setSelectedDate(''); return; }
      try {
        // Fetch from reet_python dates API using devices_serial_no (via proxy)
        const url = `/reet_python/get_vehicle_dates.php?devices_serial_no=${selectedVehicleId}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store', mode: 'cors' });
        if (!res.ok) {
          const errorText = await res.text().catch(() => 'Unable to read error response');
          console.error('❌ FilterControls Dates API Error:', errorText.substring(0, 500));
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        // Get response as text first to check if it's actually JSON
        const text = await res.text();
        const contentType = res.headers.get('content-type');
        
        // Check if response is actually JSON (even if Content-Type is wrong)
        let json: any;
        try {
          json = JSON.parse(text);
          console.log('✅ FilterControls: Successfully parsed dates JSON (Content-Type was:', contentType, ')');
        } catch (parseError) {
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('❌ FilterControls: Dates API returned HTML. Content-Type:', contentType);
            console.error('❌ Response body (first 500 chars):', text.substring(0, 500));
            throw new Error(`API returned HTML instead of JSON`);
          } else {
            console.error('❌ FilterControls: Dates API invalid JSON. Content-Type:', contentType);
            throw new Error(`API returned invalid JSON`);
          }
        }
        // Map response: [{ date: "YYYY-MM-DD" }, ...]
        let arr: string[] = Array.isArray(json) ? json.map((o: any) => String(o?.date || '')) : [];
        arr = arr.filter((d: string) => d.length > 0);
        arr.sort((a, b) => b.localeCompare(a)); // Sort descending (most recent first)
        if (aborted) return;
        setDates(arr);
        // Auto-select the first (most recent) date if available
        // Only auto-select if no date is currently selected, or if the current date is not in the list
        if (arr.length > 0) {
          // Use functional update to check current selectedDate without causing dependency issues
          setSelectedDate((currentDate) => {
            // If date is already set (e.g., from URL params), keep it if it's in the list
            if (currentDate && arr.includes(currentDate)) {
              console.log('📅 FilterControls: Keeping existing date from URL/selection:', currentDate);
              return currentDate;
            }
            // If no date is selected, or current date is not in the available dates list, auto-select most recent
            console.log('📅 FilterControls: Auto-selected most recent date:', arr[0]);
            return arr[0];
          });
        }
      } catch (e) {
        if (!aborted) { setDates([]); setSelectedDate(''); }
      }
    };
    loadDates();
    return () => { aborted = true; };
  }, [selectedVehicleId]);

  // Load available hour ranges from JSON file
  useEffect(() => {
    const loadHourRanges = async () => {
      try {
        const response = await fetch('/data/dummy-per-second-1hour.json', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });
        
        if (!response.ok) return;
        
        const json = await response.json();
        const timestamps = json.timestamps || [];
        
        if (timestamps.length === 0) return;
        
        // Extract unique hours from timestamps
        const hourSet = new Set<number>();
        timestamps.forEach((ts: any) => {
          const [hh] = ts.time.split(':').map(Number);
          hourSet.add(hh);
        });
        
        // Create hour ranges (each hour to next hour)
        const ranges: Array<{ start: string; end: string; label: string }> = [];
        const sortedHours = Array.from(hourSet).sort((a, b) => a - b);
        
        sortedHours.forEach((hour) => {
          const nextHour = hour + 1;
          const startTime = `${String(hour).padStart(2, '0')}:00:00`;
          const endTime = `${String(nextHour).padStart(2, '0')}:00:00`;
          
          // Format for display: "10:00 AM to 11:00 AM"
          const formatHour = (h: number) => {
            if (h === 0) return '12:00 AM';
            if (h < 12) return `${h}:00 AM`;
            if (h === 12) return '12:00 PM';
            return `${h - 12}:00 PM`;
          };
          
          const label = `${formatHour(hour)} to ${formatHour(nextHour)}`;
          ranges.push({ start: startTime, end: endTime, label });
        });
        
        setHourRanges(ranges);
      } catch (error) {
        console.error('Error loading hour ranges:', error);
      }
    };
    
    loadHourRanges();
  }, []);
  
  // Dispatch event when hour range is selected
  useEffect(() => {
    if (selectedHourRange) {
      const range = hourRanges.find(r => r.label === selectedHourRange);
      if (range) {
        window.dispatchEvent(new CustomEvent('hour-range:selected', {
          detail: {
            start: range.start,
            end: range.end,
            label: range.label
          }
        }));
      }
    } else {
      // Clear hour range filter
      window.dispatchEvent(new CustomEvent('hour-range:cleared'));
    }
  }, [selectedHourRange, hourRanges]);
  
  // Dispatch event when vehicle or date changes to trigger chart reload
  useEffect(() => {
    if (selectedVehicleId && selectedDate) {
      // Dispatch filters:apply event to notify VehicleDashboard to reload charts
      window.dispatchEvent(new CustomEvent('filters:apply', {
        detail: {
          device_id: Number(selectedVehicleId),
          date: selectedDate
        }
      }));
    }
  }, [selectedVehicleId, selectedDate]);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendar]);

  // Convert dates array to Date objects for DayPicker
  const availableDates = useMemo(() => {
    return dates.map(dateStr => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    });
  }, [dates]);

  // Check if a date is available (not disabled)
  const isDateDisabled = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return !dates.includes(dateStr);
  };

  // Handle date selection from calendar
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (dates.includes(dateStr)) {
        setSelectedDate(dateStr);
        setShowCalendar(false);
      }
    }
  };

  // Get selected date as Date object for DayPicker
  const selectedDateObj = useMemo(() => {
    if (!selectedDate) return undefined;
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);

  return (
    <div className={styles.filterControls}>
      <div className={styles.container}>
        <div className={styles.leftControls}>
          <h1 className={styles.title}>Charts</h1>
          
          <select 
            className={styles.select}
            value={selectedVehicleId}
            onChange={(e) => {
              setSelectedVehicleId(e.target.value);
              // Clear date when vehicle changes so it can auto-select the most recent date
              setSelectedDate('');
            }}
          >
            <option value="">Select Vehicle</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          
          <div className={styles.datePickerWrapper} ref={calendarRef}>
            <button
              type="button"
              className={styles.datePickerButton}
              onClick={() => setShowCalendar(!showCalendar)}
              disabled={!selectedVehicleId || dates.length === 0}
            >
              {selectedDate ? formatDateForDisplay(selectedDate) : 'Select Date'}
            </button>
            {showCalendar && selectedVehicleId && dates.length > 0 && (
              <div className={styles.calendarDropdown}>
                <DayPicker
                  mode="single"
                  selected={selectedDateObj}
                  onSelect={handleDateSelect}
                  disabled={isDateDisabled}
                  modifiers={{
                    available: availableDates
                  }}
                  modifiersClassNames={{
                    available: styles.availableDate
                  }}
                  className={styles.calendar}
                />
              </div>
            )}
          </div>
          
          <select 
            className={styles.select}
            value={selectedHourRange}
            onChange={(e) => setSelectedHourRange(e.target.value)}
            disabled={hourRanges.length === 0}
          >
            <option value="">View In Seconds </option>
            {hourRanges.map((range, idx) => (
              <option key={idx} value={range.label}>{range.label}</option>
            ))}
          </select>
          
          <button className={styles.filterButton} onClick={() => window.dispatchEvent(new CustomEvent('filters:open'))}>Additional Filters</button>
        </div>
        
      
        
        <div className={styles.rightControls}>
          <div className={styles.actionButtons}>
            <button 
              className={styles.actionBtn}
              onClick={() => {
                if (selectedVehicleId && selectedDate) {
                  // Redirect to external Smart Data Link table report with exact current selection
                  // selectedDate is kept in API format (YYYY-MM-DD)
                  const externalUrl = `https://www.smartdatalink.com.au/table_report.php?reading_date=${encodeURIComponent(selectedDate)}&devices_serial_no=${encodeURIComponent(String(selectedVehicleId))}`;
                  window.location.href = externalUrl;
                } else {
                  alert('Please select a vehicle and date first');
                }
              }}
            >
              Table
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => {
                printChart();
              }}
            >
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterControls;
