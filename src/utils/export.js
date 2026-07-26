import { getElementBoundingBox } from './hitTest';

/**
 * Computes the bounding box enclosing all elements on the canvas, with padding.
 */
function getCanvasBoundingBox(elements, padding = 40) {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  elements.forEach(el => {
    const bbox = getElementBoundingBox(el);
    minX = Math.min(minX, bbox.x);
    maxX = Math.max(maxX, bbox.x + bbox.width);
    minY = Math.min(minY, bbox.y);
    maxY = Math.max(maxY, bbox.y + bbox.height);
  });
  
  return {
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  };
}

/**
 * Exports drawing to a PNG data URL, cropped to fit the bounding box of all elements.
 */
export function exportToPng(elements, themeBg = '#0d0d12') {
  if (elements.length === 0) return null;
  
  const bbox = getCanvasBoundingBox(elements);
  
  const canvas = document.createElement('canvas');
  canvas.width = bbox.width;
  canvas.height = bbox.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  // Fill background
  ctx.fillStyle = themeBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Render elements offset by the bounding box start
  ctx.save();
  ctx.translate(-bbox.x, -bbox.y);
  
  elements.forEach(element => {
    ctx.save();
    ctx.strokeStyle = element.strokeColor;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (element.dashPattern === 'dashed') ctx.setLineDash([12, 8]);
    else if (element.dashPattern === 'dotted') ctx.setLineDash([2, 6]);
    
    switch (element.type) {
      case 'pen':
        if (element.points && element.points.length > 0) {
          const pts = element.points;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          ctx.stroke();
        }
        break;
        
      case 'line':
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.x + element.width, element.y + element.height);
        ctx.stroke();
        break;
        
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        const endX = element.x + element.width;
        const endY = element.y + element.height;
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        const angle = Math.atan2(element.height, element.width);
        const arrowLength = Math.max(12, element.strokeWidth * 3.5);
        const arrowAngle = Math.PI / 6;
        
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle - arrowAngle),
          endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle + arrowAngle),
          endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.closePath();
        ctx.fillStyle = element.strokeColor;
        ctx.fill();
        break;
        
      case 'rect':
        ctx.beginPath();
        ctx.rect(element.x, element.y, element.width, element.height);
        if (element.fillColor) {
          ctx.fillStyle = element.fillColor;
          ctx.fill();
        }
        ctx.stroke();
        break;
        
      case 'circle':
        ctx.beginPath();
        const rx = Math.abs(element.width / 2);
        const ry = Math.abs(element.height / 2);
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        if (element.fillColor) {
          ctx.fillStyle = element.fillColor;
          ctx.fill();
        }
        ctx.stroke();
        break;
        
      case 'text':
        if (element.text) {
          ctx.fillStyle = element.strokeColor;
          const fontSize = element.strokeWidth * 4 + 12;
          ctx.font = `${fontSize}px Outfit, sans-serif`;
          ctx.textBaseline = 'top';
          const lines = element.text.split('\n');
          lines.forEach((line, idx) => {
            ctx.fillText(line, element.x, element.y + idx * (fontSize * 1.25));
          });
        }
        break;
        
      default:
        break;
    }
    ctx.restore();
  });
  
  ctx.restore();
  return canvas.toDataURL('image/png');
}

/**
 * Generates an SVG XML string representing all elements.
 */
export function exportToSvg(elements, themeBg = '#0d0d12') {
  if (elements.length === 0) return null;
  
  const bbox = getCanvasBoundingBox(elements);
  
  let svgContent = '';
  
  elements.forEach(element => {
    const stroke = element.strokeColor;
    const strokeWidth = element.strokeWidth;
    let fill = 'none';
    let dashStyle = '';
    
    if (element.dashPattern === 'dashed') dashStyle = 'stroke-dasharray="12,8"';
    else if (element.dashPattern === 'dotted') dashStyle = 'stroke-dasharray="2,6"';
    
    if (element.fillColor) {
      fill = element.fillColor;
    }
    
    switch (element.type) {
      case 'pen': {
        const pts = element.points;
        if (pts && pts.length > 0) {
          let d = `M ${pts[0].x} ${pts[0].y}`;
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            d += ` Q ${pts[i].x} ${pts[i].y}, ${xc} ${yc}`;
          }
          if (pts.length > 1) {
            d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
          }
          svgContent += `  <path d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />\n`;
        }
        break;
      }
      
      case 'line': {
        svgContent += `  <line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" ${dashStyle} />\n`;
        break;
      }
      
      case 'arrow': {
        const endX = element.x + element.width;
        const endY = element.y + element.height;
        const angle = Math.atan2(element.height, element.width);
        const arrowLength = Math.max(12, strokeWidth * 3.5);
        const arrowAngle = Math.PI / 6;
        
        const h1X = endX - arrowLength * Math.cos(angle - arrowAngle);
        const h1Y = endY - arrowLength * Math.sin(angle - arrowAngle);
        const h2X = endX - arrowLength * Math.cos(angle + arrowAngle);
        const h2Y = endY - arrowLength * Math.sin(angle + arrowAngle);
        
        svgContent += `  <line x1="${element.x}" y1="${element.y}" x2="${endX}" y2="${endY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" ${dashStyle} />\n`;
        svgContent += `  <polygon points="${endX},${endY} ${h1X},${h1Y} ${h2X},${h2Y}" fill="${stroke}" />\n`;
        break;
      }
      
      case 'rect': {
        // Adjust for negative width/height in SVG
        const rx = element.width < 0 ? element.x + element.width : element.x;
        const ry = element.height < 0 ? element.y + element.height : element.y;
        const rw = Math.abs(element.width);
        const rh = Math.abs(element.height);
        svgContent += `  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round" ${dashStyle} />\n`;
        break;
      }
      
      case 'circle': {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        const rx = Math.abs(element.width / 2);
        const ry = Math.abs(element.height / 2);
        svgContent += `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" ${dashStyle} />\n`;
        break;
      }
      
      case 'text': {
        if (element.text) {
          const fontSize = strokeWidth * 4 + 12;
          const lines = element.text.split('\n');
          lines.forEach((line, idx) => {
            // Escape XML entities
            const escapedLine = line
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            svgContent += `  <text x="${element.x}" y="${element.y + idx * (fontSize * 1.25)}" fill="${stroke}" font-family="Outfit, sans-serif" font-size="${fontSize}px" dominant-baseline="hanging">${escapedLine}</text>\n`;
          });
        }
        break;
      }
      
      default:
        break;
    }
  });
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}" width="${bbox.width}" height="${bbox.height}" style="background: ${themeBg};">\n${svgContent}</svg>`;
}

/**
 * Downloads serialized JSON project data.
 */
export function exportToJson(elements) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(elements, null, 2));
  return dataStr;
}
