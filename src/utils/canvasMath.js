/**
 * Converts screen coordinates (from mouse/touch events) to canvas space coordinates,
 * taking the current zoom and pan offsets into account.
 * 
 * @param {number} clientX 
 * @param {number} clientY 
 * @param {HTMLCanvasElement} canvasElement 
 * @param {{x: number, y: number}} pan 
 * @param {number} zoom 
 * @returns {{x: number, y: number}}
 */
export function screenToCanvas(clientX, clientY, canvasElement, pan, zoom) {
  const rect = canvasElement.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  
  return {
    x: (screenX - pan.x) / zoom,
    y: (screenY - pan.y) / zoom,
  };
}

/**
 * Calculates the new pan offset when zooming, ensuring that the zoom is centered
 * on the mouse cursor's current position.
 * 
 * @param {number} clientX 
 * @param {number} clientY 
 * @param {HTMLCanvasElement} canvasElement 
 * @param {{x: number, y: number}} currentPan 
 * @param {number} currentZoom 
 * @param {number} newZoom 
 * @returns {{x: number, y: number}}
 */
export function calculateZoomPan(clientX, clientY, canvasElement, currentPan, currentZoom, newZoom) {
  const rect = canvasElement.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;
  
  // Mouse position in canvas coordinates before zoom change
  const canvasX = (mouseX - currentPan.x) / currentZoom;
  const canvasY = (mouseY - currentPan.y) / currentZoom;
  
  // Calculate new pan to keep mouse centered on same canvas coordinate
  return {
    x: mouseX - canvasX * newZoom,
    y: mouseY - canvasY * newZoom,
  };
}
