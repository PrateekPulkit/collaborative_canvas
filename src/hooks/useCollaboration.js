import { useEffect, useState, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const NAMES = ['Sparky', 'Pixel', 'Vector', 'Curve', 'Dot', 'Matrix', 'Raster'];
const COLORS = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

// Helper to convert hex to semi-transparent RGBA for shape fills
function hexToRgba(hex, alpha = 0.15) {
  if (!hex || !hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function useCollaboration(elements, setElements, pan, zoom) {
  const [roomId, setRoomId] = useState('');
  const [realCollaborators, setRealCollaborators] = useState({});
  const [simCollaborators, setSimCollaborators] = useState({});
  const [simulationActive, setSimulationActive] = useState(true);
  
  // Local user profile details
  const myUsername = useRef(NAMES[Math.floor(Math.random() * NAMES.length)] + '-' + Math.floor(Math.random() * 100));
  const myColor = useRef(COLORS[Math.floor(Math.random() * COLORS.length)]);
  
  // Keep Yjs instances in refs
  const yDocRef = useRef(null);
  const providerRef = useRef(null);
  const yElementsRef = useRef(null);
  
  // Internal flag to avoid update loops
  const isSyncingFromYjs = useRef(false);
  
  // 1. Initialize Room ID, Yjs Document, and WebSocket connection
  useEffect(() => {
    // Read or generate room code
    const params = new URLSearchParams(window.location.search);
    let rId = params.get('room');
    if (!rId) {
      rId = Math.random().toString(36).substring(2, 8);
      // Update URL silently without full reload
      const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${rId}`;
      window.history.replaceState({ path: newUrl }, '', newUrl);
    }
    setRoomId(rId);
    
    // Create Yjs doc and connect to public WebSocket relay
    const doc = new Y.Doc();
    yDocRef.current = doc;
    
    const provider = new WebsocketProvider('wss://demos.yjs.dev', `flam-canvas-room-${rId}`, doc);
    providerRef.current = provider;
    
    const yElements = doc.getArray('elements');
    yElementsRef.current = yElements;
    
    // Set local presence in Yjs awareness
    const awareness = provider.awareness;
    awareness.setLocalStateField('user', {
      name: myUsername.current,
      color: myColor.current,
      cursor: null,
      emoji: null,
      emojiTime: null
    });
    
    // Listen to shared array updates
    yElements.observe(() => {
      isSyncingFromYjs.current = true;
      setElements(yElements.toArray());
      isSyncingFromYjs.current = false;
    });
    
    // Listen to network awareness changes (cursors, emoji reactions)
    awareness.on('change', () => {
      const states = awareness.getStates();
      const updatedCollabs = {};
      
      states.forEach((state, clientID) => {
        if (state.user && state.user.name !== myUsername.current) {
          updatedCollabs[state.user.name] = {
            name: state.user.name,
            color: state.user.color,
            cursor: state.user.cursor,
            emoji: state.user.emoji,
            emojiTime: state.user.emojiTime,
            isSimulated: false
          };
        }
      });
      
      setRealCollaborators(updatedCollabs);
    });
    
    return () => {
      provider.disconnect();
      doc.destroy();
    };
  }, [setElements]);
  
  // 2. Local APIs mapped to modify Yjs Shared Data (synced instantly across users)
  
  const sendElementAdded = (element) => {
    if (isSyncingFromYjs.current || !yElementsRef.current) return;
    yElementsRef.current.push([element]);
  };
  
  const sendElementUpdated = (id, updates) => {
    if (isSyncingFromYjs.current || !yElementsRef.current) return;
    
    const elementsArr = yElementsRef.current.toArray();
    const index = elementsArr.findIndex(el => el.id === id);
    if (index !== -1) {
      const currentVal = elementsArr[index];
      // Atomic transaction update
      yDocRef.current.transact(() => {
        yElementsRef.current.delete(index, 1);
        yElementsRef.current.insert(index, [{ ...currentVal, ...updates }]);
      });
    }
  };
  
  const sendElementDeleted = (id) => {
    if (isSyncingFromYjs.current || !yElementsRef.current) return;
    
    const elementsArr = yElementsRef.current.toArray();
    const index = elementsArr.findIndex(el => el.id === id);
    if (index !== -1) {
      yElementsRef.current.delete(index, 1);
    }
  };
  
  const sendBoardSync = (allElements) => {
    if (isSyncingFromYjs.current || !yElementsRef.current) return;
    
    // Clear and push elements atomically
    yDocRef.current.transact(() => {
      yElementsRef.current.delete(0, yElementsRef.current.length);
      if (allElements.length > 0) {
        yElementsRef.current.push(allElements);
      }
    });
  };
  
  const sendCursorMove = (coords) => {
    if (!providerRef.current) return;
    const awareness = providerRef.current.awareness;
    const localState = awareness.getLocalState();
    
    if (localState && localState.user) {
      awareness.setLocalStateField('user', {
        ...localState.user,
        cursor: coords
      });
    }
  };
  
  const sendEmojiReaction = (emoji) => {
    if (!providerRef.current) return;
    const awareness = providerRef.current.awareness;
    const localState = awareness.getLocalState();
    
    if (localState && localState.user) {
      awareness.setLocalStateField('user', {
        ...localState.user,
        emoji: emoji,
        emojiTime: Date.now()
      });
      
      // Clear reaction local presence state after 2 seconds
      setTimeout(() => {
        const currentState = awareness.getLocalState();
        if (currentState && currentState.user && currentState.user.emoji === emoji) {
          awareness.setLocalStateField('user', {
            ...currentState.user,
            emoji: null
          });
        }
      }, 2000);
    }
  };
  
  // 3. Simulated Mock Users Loop (unchanged, runs side-by-side with socket users)
  useEffect(() => {
    if (!simulationActive) {
      setSimCollaborators({});
      return;
    }
    
    const mockUsers = [
      { name: 'Alice (R&D)', color: '#ec4899', x0: 200, y0: 300, phase: 0, speed: 0.02 },
      { name: 'Bob (Core)', color: '#eab308', x0: 600, y0: 250, phase: Math.PI / 2, speed: 0.015 },
      { name: 'Charlie (UX)', color: '#3b82f6', x0: 400, y0: 500, phase: Math.PI, speed: 0.01 }
    ];
    
    setSimCollaborators(prev => {
      const next = { ...prev };
      mockUsers.forEach(u => {
        next[u.name] = {
          name: u.name,
          color: u.color,
          cursor: { x: u.x0, y: u.y0 },
          isSimulated: true,
          emoji: null
        };
      });
      return next;
    });
    
    let t = 0;
    
    const cursorInterval = setInterval(() => {
      t += 0.05;
      setSimCollaborators(prev => {
        const next = { ...prev };
        let changed = false;
        
        mockUsers.forEach(u => {
          if (next[u.name]) {
            const dx = 180 * Math.sin(t * u.speed * 20 + u.phase);
            const dy = 90 * Math.sin(t * u.speed * 40 + u.phase * 2);
            
            next[u.name] = {
              ...next[u.name],
              cursor: {
                x: u.x0 + dx,
                y: u.y0 + dy
              }
            };
            changed = true;
          }
        });
        
        return changed ? next : prev;
      });
    }, 50);
    
    const actionInterval = setInterval(() => {
      const picker = Math.random();
      const user = mockUsers[Math.floor(Math.random() * mockUsers.length)];
      
      if (picker < 0.35) {
        const emojis = ['🔥', '🎉', '👍', '❤️', '💡', '✨'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        
        setSimCollaborators(prev => {
          if (!prev[user.name]) return prev;
          return {
            ...prev,
            [user.name]: {
              ...prev[user.name],
              emoji,
              emojiTime: Date.now()
            }
          };
        });
        
        setTimeout(() => {
          setSimCollaborators(prev => {
            if (!prev[user.name] || prev[user.name].emoji !== emoji) return prev;
            return {
              ...prev,
              [user.name]: { ...prev[user.name], emoji: null }
            };
          });
        }, 2000);
        
      } else if (picker < 0.65) {
        setSimCollaborators(prev => {
          const currentCursor = prev[user.name]?.cursor;
          if (!currentCursor) return prev;
          
          const shapeType = Math.random() > 0.5 ? 'rect' : 'circle';
          const shapeId = `sim-${Date.now()}`;
          const newShape = {
            id: shapeId,
            type: shapeType,
            x: currentCursor.x,
            y: currentCursor.y,
            width: 0,
            height: 0,
            strokeColor: user.color,
            strokeWidth: 3,
            fillColor: hexToRgba(user.color, 0.12),
            dashPattern: 'solid'
          };
          
          // Adding to local elements triggers addition to Yjs array
          sendElementAdded(newShape);
          
          let frame = 0;
          const totalFrames = 15;
          const targetW = (Math.random() * 80 + 40) * (Math.random() > 0.5 ? 1 : -1);
          const targetH = (Math.random() * 80 + 40) * (Math.random() > 0.5 ? 1 : -1);
          
          const drawInterval = setInterval(() => {
            frame++;
            const width = (targetW / totalFrames) * frame;
            const height = (targetH / totalFrames) * frame;
            
            sendElementUpdated(shapeId, { width, height });
            
            if (frame >= totalFrames) {
              clearInterval(drawInterval);
            }
          }, 40);
          
          return prev;
        });
      }
    }, 6000);
    
    return () => {
      clearInterval(cursorInterval);
      clearInterval(actionInterval);
    };
  }, [simulationActive]);
  
  // Merge network users with local mock animated cursors
  const mergedCollaborators = { ...realCollaborators, ...simCollaborators };
  
  return {
    roomId,
    collaborators: mergedCollaborators,
    myUsername: myUsername.current,
    myColor: myColor.current,
    simulationActive,
    setSimulationActive,
    sendElementAdded,
    sendElementUpdated,
    sendElementDeleted,
    sendCursorMove,
    sendEmojiReaction,
    sendBoardSync
  };
}
