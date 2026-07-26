import React, { useState, useRef, useEffect } from 'react';
import { 
  MousePointer, 
  PenTool, 
  Minus, 
  ArrowUpRight, 
  Square, 
  Circle as CircleIcon, 
  Eraser, 
  Undo2, 
  Redo2, 
  Download, 
  Grid, 
  Sparkles,
  Maximize2,
  PaintBucket
} from 'lucide-react';
import { screenToCanvas, calculateZoomPan } from '../utils/canvasMath';

// Helper to convert hex to semi-transparent RGBA for shape fills
function hexToRgba(hex, alpha = 0.15) {
  if (!hex || !hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function DrawingCanvas() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState('pen'); // 'select' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle'
  const [showGrid, setShowGrid] = useState(true);
  
  // Element states
  const [elements, setElements] = useState([]);
  const [currentElement, setCurrentElement] = useState(null);
  
  // Interaction states
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  
  // Custom styles state
  const [strokeColor, setStrokeColor] = useState('#a855f7'); // Neon purple
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fillEnabled, setFillEnabled] = useState(true);
  
  // Handle canvas sizing
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;
      draw();
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call
    
    return () => window.removeEventListener('resize', handleResize);
  }, [elements, currentElement, zoom, pan, showGrid]);
  
  // Redraw canvas whenever elements or viewport state changes
  useEffect(() => {
    draw();
  }, [elements, currentElement, zoom, pan, showGrid]);
  
  // Main draw loop
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw Grid in viewport space
    if (showGrid) {
      drawGridBackground(ctx, canvas.width, canvas.height);
    }
    
    // 2. Draw elements in canvas space
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    // Draw completed elements
    elements.forEach(element => {
      drawElement(ctx, element);
    });
    
    // Draw current active drawing element
    if (currentElement) {
      drawElement(ctx, currentElement);
    }
    
    ctx.restore();
  };
  
  // Render grid dots
  const drawGridBackground = (ctx, width, height) => {
    ctx.save();
    const gridSize = 40;
    const gridColor = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = gridColor;
    
    // Compute visible bounding box in canvas coordinates
    const startX = Math.floor((-pan.x / zoom) / gridSize) * gridSize;
    const endX = Math.ceil(((width - pan.x) / zoom) / gridSize) * gridSize;
    const startY = Math.floor((-pan.y / zoom) / gridSize) * gridSize;
    const endY = Math.ceil(((height - pan.y) / zoom) / gridSize) * gridSize;
    
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        // Dot size scales with zoom to maintain readable thickness
        const dotRadius = Math.max(0.5, 1.2 / zoom);
        ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.restore();
  };
  
  // Render individual canvas element
  const drawElement = (ctx, element) => {
    ctx.save();
    ctx.strokeStyle = element.strokeColor;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Handle dashed/dotted patterns
    if (element.dashPattern === 'dashed') {
      ctx.setLineDash([12, 8]);
    } else if (element.dashPattern === 'dotted') {
      ctx.setLineDash([2, 6]);
    } else {
      ctx.setLineDash([]);
    }

    switch (element.type) {
      case 'pen':
        if (element.points && element.points.length > 0) {
          const pts = element.points;
          if (pts.length < 2) {
            ctx.beginPath();
            ctx.arc(pts[0].x, pts[0].y, element.strokeWidth / 2, 0, 2 * Math.PI);
            ctx.fillStyle = element.strokeColor;
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            // Quadratic curve interpolation for smooth freehand drawing
            for (let i = 1; i < pts.length - 1; i++) {
              const xc = (pts[i].x + pts[i + 1].x) / 2;
              const yc = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.stroke();
          }
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
        
        // Draw Arrowhead
        const angle = Math.atan2(element.height, element.width);
        const arrowLength = Math.max(12, element.strokeWidth * 3.5);
        const arrowAngle = Math.PI / 6; // 30 degrees
        
        // Solid arrowhead drawing (removes dashes for head)
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

      default:
        break;
    }
    
    ctx.restore();
  };
  
  // Mouse / Touch Event Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Check if middle click or Shift key is pressed (for Panning)
    const isMiddleClick = e.button === 1;
    const isSpaceOrShift = e.shiftKey;
    
    if (isMiddleClick || isSpaceOrShift || activeTool === 'select') {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }
    
    const coords = screenToCanvas(e.clientX, e.clientY, canvas, pan, zoom);
    dragStart.current = coords;
    setIsDrawing(true);
    
    if (activeTool === 'pen') {
      setCurrentElement({
        id: `pen-${Date.now()}`,
        type: 'pen',
        points: [coords],
        strokeColor,
        strokeWidth
      });
    } else if (['line', 'arrow', 'rect', 'circle'].includes(activeTool)) {
      setCurrentElement({
        id: `${activeTool}-${Date.now()}`,
        type: activeTool,
        x: coords.x,
        y: coords.y,
        width: 0,
        height: 0,
        strokeColor,
        strokeWidth,
        fillColor: fillEnabled ? hexToRgba(strokeColor, 0.15) : null,
        dashPattern: 'solid'
      });
    }
  };
  
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      });
      return;
    }
    
    if (!isDrawing || !currentElement) return;
    
    const coords = screenToCanvas(e.clientX, e.clientY, canvas, pan, zoom);
    
    if (activeTool === 'pen') {
      setCurrentElement(prev => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...prev.points, coords]
        };
      });
    } else if (['line', 'arrow', 'rect', 'circle'].includes(activeTool)) {
      const width = coords.x - dragStart.current.x;
      const height = coords.y - dragStart.current.y;
      
      setCurrentElement(prev => {
        if (!prev) return null;
        return {
          ...prev,
          width,
          height
        };
      });
    }
  };
  
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    
    if (isDrawing && currentElement) {
      setIsDrawing(false);
      setElements(prev => [...prev, currentElement]);
      setCurrentElement(null);
    }
  };
  
  // Zoom on wheel (centered at mouse)
  const handleWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const zoomIntensity = 0.05;
    const scaleFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const nextZoom = Math.min(Math.max(0.1, zoom * scaleFactor), 20);
    
    const nextPan = calculateZoomPan(e.clientX, e.clientY, canvas, pan, zoom, nextZoom);
    
    setZoom(nextZoom);
    setPan(nextPan);
  };
  
  // Prevent browser context menu on canvas (allows right-click gestures)
  const handleContextMenu = (e) => {
    e.preventDefault();
  };
  
  return (
    <div 
      className="canvas-container" 
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#0d0d12', // Premium deep space dark theme
        userSelect: 'none'
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{
          display: 'block',
          cursor: isPanning ? 'grabbing' : activeTool === 'pen' ? 'crosshair' : ['line', 'arrow', 'rect', 'circle'].includes(activeTool) ? 'crosshair' : 'default'
        }}
      />
      
      {/* Dynamic HUD Control Overlay */}
      <div className="hud-layer" style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}>
        
        {/* Top Header - App Title and Collab Stats */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          right: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'auto'
        }}>
          <div className="glass-panel" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 18px',
            borderRadius: '12px',
          }}>
            <Sparkles size={20} color="#a855f7" className="pulse-animation" />
            <div>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
                FLAM <span style={{ color: '#a855f7' }}>Canvas</span>
              </h1>
              <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>R&D Prototype</span>
            </div>
          </div>
          
          <div className="glass-panel" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '12px'
          }}>
            <span className="online-indicator"></span>
            <span style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>Live Session</span>
          </div>
        </div>

        {/* Center-Bottom Floating Toolbar */}
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          pointerEvents: 'auto'
        }}>
          <div className="glass-panel toolbar" style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px',
            borderRadius: '16px',
            gap: '4px'
          }}>
            <button 
              className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
              onClick={() => setActiveTool('select')}
              title="Selection Tool"
            >
              <MousePointer size={18} />
            </button>
            <button 
              className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
              onClick={() => setActiveTool('pen')}
              title="Pen Drawing"
            >
              <PenTool size={18} />
            </button>
            <button 
              className={`tool-btn ${activeTool === 'line' ? 'active' : ''}`}
              onClick={() => setActiveTool('line')}
              title="Straight Line"
            >
              <Minus size={18} />
            </button>
            <button 
              className={`tool-btn ${activeTool === 'arrow' ? 'active' : ''}`}
              onClick={() => setActiveTool('arrow')}
              title="Arrow"
            >
              <ArrowUpRight size={18} />
            </button>
            <button 
              className={`tool-btn ${activeTool === 'rect' ? 'active' : ''}`}
              onClick={() => setActiveTool('rect')}
              title="Rectangle"
            >
              <Square size={18} />
            </button>
            <button 
              className={`tool-btn ${activeTool === 'circle' ? 'active' : ''}`}
              onClick={() => setActiveTool('circle')}
              title="Circle / Ellipse"
            >
              <CircleIcon size={18} />
            </button>
            <button 
              className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
              onClick={() => setActiveTool('eraser')}
              title="Eraser (Soon)"
              disabled
            >
              <Eraser size={18} />
            </button>
            
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />
            
            {/* Color circles */}
            {['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ffffff'].map(color => (
              <button 
                key={color}
                onClick={() => setStrokeColor(color)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: strokeColor === color ? '2px solid #fff' : '2px solid transparent',
                  padding: 0,
                  cursor: 'pointer',
                  transform: strokeColor === color ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.2s, border-color 0.2s'
                }}
              />
            ))}
          </div>

          {/* Quick Config / View Panel */}
          <div className="glass-panel" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px',
            borderRadius: '16px'
          }}>
            <button 
              className={`tool-btn ${showGrid ? 'active' : ''}`}
              onClick={() => setShowGrid(!showGrid)}
              title="Toggle Grid"
            >
              <Grid size={18} />
            </button>
            
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 500,
              minWidth: '45px',
              justifyContent: 'center'
            }}>
              {Math.round(zoom * 100)}%
            </div>
            
            <button 
              className="tool-btn"
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              title="Reset Viewport"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Sidebar Controls - Brush and Style settings */}
        <div style={{
          position: 'absolute',
          left: '20px',
          top: '90px',
          pointerEvents: 'auto'
        }}>
          <div className="glass-panel" style={{
            padding: '16px',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            width: '180px'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Element Styling</span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>Thickness: {strokeWidth}px</span>
              <input 
                type="range" 
                min="1" 
                max="20" 
                value={strokeWidth} 
                onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#a855f7',
                  cursor: 'pointer'
                }}
              />
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PaintBucket size={14} color="#a855f7" /> Fill Shape
              </span>
              <input 
                type="checkbox" 
                checked={fillEnabled} 
                onChange={(e) => setFillEnabled(e.target.checked)}
                style={{
                  accentColor: '#a855f7',
                  width: '16px',
                  height: '16px',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
