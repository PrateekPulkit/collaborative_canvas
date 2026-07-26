/**
 * Calculates the distance from point P to line segment AB.
 */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Gets the bounding box of an element.
 */
export function getElementBoundingBox(element) {
  if (element.type === 'pen') {
    const pts = element.points;
    if (!pts || pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    
    let minX = pts[0].x;
    let maxX = pts[0].x;
    let minY = pts[0].y;
    let maxY = pts[0].y;
    
    for (let i = 1; i < pts.length; i++) {
      minX = Math.min(minX, pts[i].x);
      maxX = Math.max(maxX, pts[i].x);
      minY = Math.min(minY, pts[i].y);
      maxY = Math.max(maxY, pts[i].y);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
  
  if (element.type === 'text') {
    const fontSize = element.strokeWidth * 4 + 12;
    const lines = (element.text || '').split('\n');
    const maxLineLength = Math.max(...lines.map(l => l.length), 1);
    return {
      x: element.x,
      y: element.y,
      width: maxLineLength * (fontSize * 0.55),
      height: lines.length * (fontSize * 1.25)
    };
  }

  // For rect, circle, line, arrow
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height
  };
}

/**
 * Checks if a canvas-space coordinate (x, y) hit the given element.
 * Returns true if the coordinate is within selection range.
 */
export function isPointOnElement(x, y, element) {
  const threshold = Math.max(6, element.strokeWidth + 4);
  const bbox = getElementBoundingBox(element);
  
  // Quick bounding box check with threshold padding
  if (
    x < bbox.x - threshold ||
    x > bbox.x + bbox.width + threshold ||
    y < bbox.y - threshold ||
    y > bbox.y + bbox.height + threshold
  ) {
    return false;
  }
  
  switch (element.type) {
    case 'rect': {
      // Check if point is near the boundary or inside (if filled)
      const nearLeft = Math.abs(x - element.x) <= threshold;
      const nearRight = Math.abs(x - (element.x + element.width)) <= threshold;
      const nearTop = Math.abs(y - element.y) <= threshold;
      const nearBottom = Math.abs(y - (element.y + element.height)) <= threshold;
      
      const onBorder = (nearLeft || nearRight) && y >= Math.min(element.y, element.y + element.height) && y <= Math.max(element.y, element.y + element.height) ||
                       (nearTop || nearBottom) && x >= Math.min(element.x, element.x + element.width) && x <= Math.max(element.x, element.x + element.width);
      
      if (element.fillColor) {
        // Inside check
        const insideX = x >= Math.min(element.x, element.x + element.width) && x <= Math.max(element.x, element.x + element.width);
        const insideY = y >= Math.min(element.y, element.y + element.height) && y <= Math.max(element.y, element.y + element.height);
        return insideX && insideY;
      }
      
      return onBorder;
    }
    
    case 'circle': {
      const rx = Math.abs(element.width / 2);
      const ry = Math.abs(element.height / 2);
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      
      if (rx === 0 || ry === 0) return false;
      
      // Normalized distance from center
      const dx = x - cx;
      const dy = y - cy;
      const val = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      
      if (element.fillColor) {
        return val <= 1.0;
      } else {
        // Check boundary ring
        const outerVal = (dx * dx) / ((rx + threshold) * (rx + threshold)) + (dy * dy) / ((ry + threshold) * (ry + threshold));
        const innerVal = (dx * dx) / (Math.max(0.1, rx - threshold) * Math.max(0.1, rx - threshold)) + (dy * dy) / (Math.max(0.1, ry - threshold) * Math.max(0.1, ry - threshold));
        return outerVal <= 1.0 && innerVal >= 1.0;
      }
    }
    
    case 'line':
    case 'arrow': {
      const a = { x: element.x, y: element.y };
      const b = { x: element.x + element.width, y: element.y + element.height };
      const dist = distanceToSegment({ x, y }, a, b);
      return dist <= threshold;
    }
    
    case 'pen': {
      const pts = element.points;
      if (!pts || pts.length === 0) return false;
      
      for (let i = 0; i < pts.length - 1; i++) {
        const dist = distanceToSegment({ x, y }, pts[i], pts[i + 1]);
        if (dist <= threshold) return true;
      }
      return false;
    }
    
    case 'text': {
      // Bounding box hit check is sufficient
      return true;
    }
    
    default:
      return false;
  }
}

/**
 * Checks if the click point (x, y) hit a resize handle of a selected element.
 * Returns the handle name ('nw', 'ne', 'se', 'sw') or null.
 */
export function getHitResizeHandle(x, y, element, zoom) {
  const bbox = getElementBoundingBox(element);
  const handleSize = 8 / zoom; // Adjust handle hit size for zoom level
  const halfSize = handleSize / 2;
  
  const handles = {
    nw: { x: bbox.x, y: bbox.y },
    ne: { x: bbox.x + bbox.width, y: bbox.y },
    se: { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    sw: { x: bbox.x, y: bbox.y + bbox.height }
  };
  
  for (const [key, pos] of Object.entries(handles)) {
    if (
      x >= pos.x - halfSize - 4 &&
      x <= pos.x + halfSize + 4 &&
      y >= pos.y - halfSize - 4 &&
      y <= pos.y + halfSize + 4
    ) {
      return key;
    }
  }
  
  return null;
}
