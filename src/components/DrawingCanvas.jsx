import React, { useState, useRef, useEffect } from 'react';
import { 
  MousePointer, 
  PenTool, 
  Minus, 
  ArrowUpRight, 
  Square, 
  Circle as CircleIcon, 
  Type,
  Undo2, 
  Redo2, 
  Download, 
  Grid, 
  Sparkles,
  Maximize2,
  PaintBucket,
  Trash2,
  Users,
  Smile
} from 'lucide-react';
import { screenToCanvas, calculateZoomPan } from '../utils/canvasMath';
import { isPointOnElement, getHitResizeHandle, getElementBoundingBox } from '../utils/hitTest';
import { useCollaboration } from '../hooks/useCollaboration';

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
  const [activeTool, setActiveTool] = useState('pen'); // 'select' | 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'text'
  const [showGrid, setShowGrid] = useState(true);
  
  // Element states
  const [elements, setElements] = useState([]);
  const [currentElement, setCurrentElement] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [editingText, setEditingText] = useState(null); // { id, x, y, text }
  
  // Collaboration Hook
  const {
    collaborators,
    myUsername,
    myColor,
    simulationActive,
    setSimulationActive,
    sendElementAdded,
    sendElementUpdated,
    sendElementDeleted,
    sendCursorMove,
    sendEmojiReaction
  } = useCollaboration(elements, setElements, pan, zoom);

  // Interaction states
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [activeResizeHandle, setActiveResizeHandle] = useState(null);
  
  const panStart = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStartBbox = useRef(null);
  
  // Custom styles state
  const [strokeColor, setStrokeColor] = useState('#a855f7'); // Neon purple
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fillEnabled, setFillEnabled] = useState(true);
  
  // Handle keyboard deletes
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingText) return; // Ignore hotkeys during text editing
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        setElements(prev => prev.filter(el => el.id !== selectedElementId));
        sendElementDeleted(selectedElementId);
        setSelectedElementId(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, editingText]);

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
  }, [elements, currentElement, zoom, pan, showGrid, selectedElementId, editingText, collaborators]);
  
  // Redraw canvas whenever elements, viewport, or collaborators change
  useEffect(() => {
    draw();
  }, [elements, currentElement, zoom, pan, showGrid, selectedElementId, editingText, collaborators]);
  
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
      if (editingText && editingText.id === element.id) return;
      drawElement(ctx, element);
    });
    
    // Draw current active drawing element
    if (currentElement) {
      drawElement(ctx, currentElement);
    }
    
    // Draw selection outline & handles
    if (selectedElementId && !editingText) {
      const selectedEl = elements.find(el => el.id === selectedElementId);
      if (selectedEl) {
        drawSelectedOutline(ctx, selectedEl);
      }
    }
    
    // Draw other users' cursors and avatars
    Object.values(collaborators).forEach(collab => {
      if (collab.name === myUsername) return;
      drawCollaboratorCursor(ctx, collab);
    });
    
    ctx.restore();
  };
  
  // Render grid dots
  const drawGridBackground = (ctx, width, height) => {
    ctx.save();
    const gridSize = 40;
    const gridColor = 'rgba(255, 255, 255, 0.05)';
    ctx.fillStyle = gridColor;
    
    const startX = Math.floor((-pan.x / zoom) / gridSize) * gridSize;
    const endX = Math.ceil(((width - pan.x) / zoom) / gridSize) * gridSize;
    const startY = Math.floor((-pan.y / zoom) / gridSize) * gridSize;
    const endY = Math.ceil(((height - pan.y) / zoom) / gridSize) * gridSize;
    
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
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
  };
  
  // Render Selection outline & handle points
  const drawSelectedOutline = (ctx, element) => {
    const bbox = getElementBoundingBox(element);
    
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    
    ctx.beginPath();
    ctx.rect(bbox.x - 4 / zoom, bbox.y - 4 / zoom, bbox.width + 8 / zoom, bbox.height + 8 / zoom);
    ctx.stroke();
    
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([]);
    
    const handleSize = 7 / zoom;
    const positions = [
      { x: bbox.x, y: bbox.y }, // NW
      { x: bbox.x + bbox.width, y: bbox.y }, // NE
      { x: bbox.x + bbox.width, y: bbox.y + bbox.height }, // SE
      { x: bbox.x, y: bbox.y + bbox.height } // SW
    ];
    
    positions.forEach(pos => {
      ctx.beginPath();
      ctx.rect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
      ctx.fill();
      ctx.stroke();
    });
    
    ctx.restore();
  };

  // Render collaborator cursor arrow and name badge
  const drawCollaboratorCursor = (ctx, collab) => {
    if (!collab.cursor) return;
    const { x, y } = collab.cursor;
    
    ctx.save();
    
    // Draw cursor arrow
    ctx.fillStyle = collab.color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 / zoom, y + 12 / zoom);
    ctx.lineTo(x + 4 / zoom, y + 14 / zoom);
    ctx.closePath();
    ctx.fill();
    
    // Draw name label
    const fontSize = 10 / zoom;
    ctx.font = `bold ${fontSize}px Outfit, sans-serif`;
    const paddingX = 6 / zoom;
    const paddingY = 3 / zoom;
    const textWidth = ctx.measureText(collab.name).width;
    
    const rx = x + 10 / zoom;
    const ry = y + 14 / zoom;
    const rw = textWidth + paddingX * 2;
    const rh = fontSize + paddingY * 2;
    
    ctx.fillStyle = collab.color;
    ctx.beginPath();
    // Using simple round rectangle draw compatibility
    if (ctx.roundRect) {
      ctx.roundRect(rx, ry, rw, rh, 4 / zoom);
    } else {
      ctx.rect(rx, ry, rw, rh);
    }
    ctx.fill();
    
    ctx.fillStyle = '#0d0d12'; // High contrast text color on cursor label
    ctx.fillText(collab.name, rx + paddingX, ry + paddingY);
    
    // Draw floating emoji reaction
    if (collab.emoji) {
      ctx.font = `${22 / zoom}px Outfit, sans-serif`;
      ctx.fillText(collab.emoji, x + 8 / zoom, y - 10 / zoom);
    }
    
    ctx.restore();
  };

  // Mouse / Touch Event Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const isMiddleClick = e.button === 1;
    const isSpaceOrShift = e.shiftKey;
    
    if (isMiddleClick || isSpaceOrShift) {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }
    
    const coords = screenToCanvas(e.clientX, e.clientY, canvas, pan, zoom);
    dragStart.current = coords;
    
    if (activeTool === 'select') {
      if (selectedElementId) {
        const selectedEl = elements.find(el => el.id === selectedElementId);
        if (selectedEl) {
          const handle = getHitResizeHandle(coords.x, coords.y, selectedEl, zoom);
          if (handle) {
            setActiveResizeHandle(handle);
            resizeStartBbox.current = getElementBoundingBox(selectedEl);
            return;
          }
        }
      }
      
      const clickedElement = [...elements]
        .reverse()
        .find(el => isPointOnElement(coords.x, coords.y, el));
        
      if (clickedElement) {
        setSelectedElementId(clickedElement.id);
        setIsMoving(true);
      } else {
        setSelectedElementId(null);
      }
      return;
    }
    
    setIsDrawing(true);
    
    if (activeTool === 'pen') {
      setCurrentElement({
        id: `pen-${Date.now()}`,
        type: 'pen',
        points: [coords],
        strokeColor,
        strokeWidth
      });
    } else if (activeTool === 'text') {
      const textId = `text-${Date.now()}`;
      const newText = {
        id: textId,
        type: 'text',
        x: coords.x,
        y: coords.y,
        text: '',
        strokeColor,
        strokeWidth
      };
      setElements(prev => [...prev, newText]);
      setEditingText(newText);
      setSelectedElementId(textId);
      setIsDrawing(false);
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
    
    const coords = screenToCanvas(e.clientX, e.clientY, canvas, pan, zoom);
    
    // Broadcast local cursor position
    sendCursorMove(coords);
    
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      });
      return;
    }
    
    // Handle resizing element
    if (activeResizeHandle && selectedElementId) {
      const element = elements.find(el => el.id === selectedElementId);
      if (!element) return;
      
      const bbox = resizeStartBbox.current;
      if (!bbox) return;
      
      let newX = element.x;
      let newY = element.y;
      let newWidth = element.width;
      let newHeight = element.height;
      let updatedPoints = null;
      
      if (element.type === 'pen') {
        let scaleX = 1;
        let scaleY = 1;
        
        if (activeResizeHandle === 'se') {
          scaleX = Math.max(0.1, (coords.x - bbox.x) / bbox.width);
          scaleY = Math.max(0.1, (coords.y - bbox.y) / bbox.height);
        } else if (activeResizeHandle === 'nw') {
          const endX = bbox.x + bbox.width;
          const endY = bbox.y + bbox.height;
          scaleX = Math.max(0.1, (endX - coords.x) / bbox.width);
          scaleY = Math.max(0.1, (endY - coords.y) / bbox.height);
        } else if (activeResizeHandle === 'ne') {
          const endY = bbox.y + bbox.height;
          scaleX = Math.max(0.1, (coords.x - bbox.x) / bbox.width);
          scaleY = Math.max(0.1, (endY - coords.y) / bbox.height);
        } else if (activeResizeHandle === 'sw') {
          const endX = bbox.x + bbox.width;
          scaleX = Math.max(0.1, (endX - coords.x) / bbox.width);
          scaleY = Math.max(0.1, (coords.y - bbox.y) / bbox.height);
        }
        
        const anchorX = ['nw', 'sw'].includes(activeResizeHandle) ? bbox.x + bbox.width : bbox.x;
        const anchorY = ['nw', 'ne'].includes(activeResizeHandle) ? bbox.y + bbox.height : bbox.y;
        
        updatedPoints = element.points.map(p => ({
          x: anchorX + (p.x - anchorX) * scaleX,
          y: anchorY + (p.y - anchorY) * scaleY
        }));
        
        updateElement(selectedElementId, { points: updatedPoints });
        sendElementUpdated(selectedElementId, { points: updatedPoints });
        return;
      }

      if (activeResizeHandle === 'se') {
        newWidth = coords.x - bbox.x;
        newHeight = coords.y - bbox.y;
      } else if (activeResizeHandle === 'nw') {
        const endX = bbox.x + bbox.width;
        const endY = bbox.y + bbox.height;
        newX = coords.x;
        newY = coords.y;
        newWidth = endX - coords.x;
        newHeight = endY - coords.y;
      } else if (activeResizeHandle === 'ne') {
        const endY = bbox.y + bbox.height;
        newY = coords.y;
        newWidth = coords.x - bbox.x;
        newHeight = endY - coords.y;
      } else if (activeResizeHandle === 'sw') {
        const endX = bbox.x + bbox.width;
        newX = coords.x;
        newWidth = endX - coords.x;
        newHeight = coords.y - bbox.y;
      }
      
      const updates = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      };
      
      updateElement(selectedElementId, updates);
      sendElementUpdated(selectedElementId, updates);
      return;
    }
    
    // Handle moving element
    if (isMoving && selectedElementId) {
      const element = elements.find(el => el.id === selectedElementId);
      if (!element) return;
      
      const dx = coords.x - dragStart.current.x;
      const dy = coords.y - dragStart.current.y;
      dragStart.current = coords;
      
      let updates = {};
      if (element.type === 'pen') {
        const shiftedPoints = element.points.map(p => ({
          x: p.x + dx,
          y: p.y + dy
        }));
        updates = { points: shiftedPoints };
      } else {
        updates = {
          x: element.x + dx,
          y: element.y + dy
        };
      }
      
      updateElement(selectedElementId, updates);
      sendElementUpdated(selectedElementId, updates);
      return;
    }
    
    if (!isDrawing || !currentElement) return;
    
    // Handle drawing in progress
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
    
    if (activeResizeHandle) {
      setActiveResizeHandle(null);
      resizeStartBbox.current = null;
      return;
    }
    
    if (isMoving) {
      setIsMoving(false);
      return;
    }
    
    if (isDrawing && currentElement) {
      setIsDrawing(false);
      setElements(prev => [...prev, currentElement]);
      sendElementAdded(currentElement); // Sync addition to others
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

  // Delete selected item from button
  const deleteSelectedElement = () => {
    if (selectedElementId) {
      setElements(prev => prev.filter(el => el.id !== selectedElementId));
      sendElementDeleted(selectedElementId);
      setSelectedElementId(null);
    }
  };

  // List of simulated and real collaborators in session
  const activeCollabList = Object.values(collaborators);
  
  return (
    <div 
      className="canvas-container" 
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#0d0d12',
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
          cursor: isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair'
        }}
      />
      
      {/* Multiline overlay textarea for text editing */}
      {editingText && (
        <textarea
          value={editingText.text}
          onChange={(e) => {
            const val = e.target.value;
            setEditingText(prev => ({ ...prev, text: val }));
            updateElement(editingText.id, { text: val });
            sendElementUpdated(editingText.id, { text: val });
          }}
          onBlur={() => {
            if (!editingText.text.trim()) {
              setElements(prev => prev.filter(el => el.id !== editingText.id));
              sendElementDeleted(editingText.id);
              setSelectedElementId(null);
            } else {
              // Final sync on save
              const finalEl = elements.find(el => el.id === editingText.id);
              if (finalEl) {
                sendElementAdded(finalEl);
              }
            }
            setEditingText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
              e.currentTarget.blur();
            }
          }}
          autoFocus
          placeholder="Type here..."
          style={{
            position: 'absolute',
            left: `${editingText.x * zoom + pan.x}px`,
            top: `${editingText.y * zoom + pan.y}px`,
            font: `${(strokeWidth * 4 + 12) * zoom}px Outfit, sans-serif`,
            color: strokeColor,
            background: 'transparent',
            border: '1.5px dashed var(--accent-color)',
            outline: 'none',
            padding: '4px',
            margin: 0,
            lineHeight: 1.25,
            caretColor: strokeColor,
            resize: 'none',
            zIndex: 100,
            whiteSpace: 'pre',
            overflow: 'hidden',
            minWidth: `${120 * zoom}px`,
            minHeight: `${32 * zoom}px`,
            transformOrigin: 'top left'
          }}
        />
      )}
      
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
          
          {/* Active Collaborators Avatars List */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="glass-panel" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              borderRadius: '12px',
              gap: '6px'
            }}>
              <button 
                onClick={() => setSimulationActive(!simulationActive)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  color: simulationActive ? '#a855f7' : 'rgba(255, 255, 255, 0.5)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}
                title={simulationActive ? "Turn Off Simulated Users" : "Turn On Simulated Users"}
              >
                <Users size={14} />
                <span>Sim: {simulationActive ? 'On' : 'Off'}</span>
              </button>
            </div>

            <div className="glass-panel" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              borderRadius: '12px',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginRight: '4px' }}>
                {/* Local user badge */}
                <div 
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: myColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: '#0d0d12',
                    border: '2px solid #fff',
                    boxShadow: `0 0 6px ${myColor}`
                  }}
                  title={`You (${myUsername})`}
                >
                  ME
                </div>
                
                {/* Other collaborators */}
                {activeCollabList.map(c => (
                  <div 
                    key={c.name}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: c.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: '#0d0d12',
                      border: '2px solid #0d0d12',
                      marginLeft: '-8px'
                    }}
                    title={c.name}
                  >
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="online-indicator"></span>
              <span style={{ fontSize: '12px', color: '#fff', fontWeight: 500 }}>
                {activeCollabList.length + 1} Online
              </span>
            </div>
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
              className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTool('text')}
              title="Add Text"
            >
              <Type size={18} />
            </button>
            
            {selectedElementId && (
              <>
                <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />
                <button 
                  className="tool-btn" 
                  onClick={deleteSelectedElement} 
                  title="Delete Selected (Del)"
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
            
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

          {/* Emoji Reactions floating picker */}
          <div className="glass-panel" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px',
            borderRadius: '16px'
          }}>
            {['👍', '🔥', '🎉', '❤️', '💡', '✨'].map(emoji => (
              <button
                key={emoji}
                onClick={() => sendEmojiReaction(emoji)}
                className="tool-btn"
                style={{ width: '32px', height: '32px', fontSize: '16px' }}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
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
