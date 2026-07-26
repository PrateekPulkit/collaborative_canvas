import { useEffect, useState, useRef } from 'react';

// Generates a random name for the local user if not specified
const NAMES = ['Sparky', 'Pixel', 'Vector', 'Curve', 'Dot', 'Matrix', 'Raster'];
const COLORS = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export function useCollaboration(elements, setElements, pan, zoom) {
  const [collaborators, setCollaborators] = useState({});
  const [simulationActive, setSimulationActive] = useState(true);
  
  // Local user details
  const myUsername = useRef(NAMES[Math.floor(Math.random() * NAMES.length)] + '-' + Math.floor(Math.random() * 100));
  const myColor = useRef(COLORS[Math.floor(Math.random() * COLORS.length)]);
  
  // Reference for BroadcastChannel
  const channelRef = useRef(null);
  
  // Keep track of elements via ref to avoid stale closure in Broadcast listener
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  
  // 1. Set up BroadcastChannel for local cross-tab sync
  useEffect(() => {
    const channel = new BroadcastChannel('flam-canvas-collab');
    channelRef.current = channel;
    
    // Request state from other tabs on load
    channel.postMessage({ type: 'sync-request', from: myUsername.current });
    
    const handleMessage = (e) => {
      const { type, from, data } = e.data;
      if (from === myUsername.current) return; // Ignore own messages
      
      switch (type) {
        case 'sync-request':
          // Send current state to the requesting tab
          channel.postMessage({
            type: 'elements-sync',
            from: myUsername.current,
            data: { elements: elementsRef.current }
          });
          break;
          
        case 'elements-sync':
          if (data && data.elements) {
            setElements(data.elements);
          }
          break;
          
        case 'element-added':
          if (data && data.element) {
            setElements(prev => {
              if (prev.some(el => el.id === data.element.id)) return prev;
              return [...prev, data.element];
            });
          }
          break;
          
        case 'element-updated':
          if (data && data.id && data.updates) {
            setElements(prev => prev.map(el => el.id === data.id ? { ...el, ...data.updates } : el));
          }
          break;
          
        case 'element-deleted':
          if (data && data.id) {
            setElements(prev => prev.filter(el => el.id !== data.id));
          }
          break;
          
        case 'cursor-move':
          if (data && data.coords) {
            setCollaborators(prev => ({
              ...prev,
              [from]: {
                ...prev[from],
                name: from,
                color: data.color || '#fff',
                cursor: data.coords,
                lastActive: Date.now(),
                isSimulated: false
              }
            }));
          }
          break;
          
        case 'emoji-reaction':
          if (data && data.emoji) {
            triggerFloatingEmoji(from, data.emoji);
          }
          break;
          
        default:
          break;
      }
    };
    
    channel.addEventListener('message', handleMessage);
    
    // Clean up inactive tabs periodically
    const interval = setInterval(() => {
      setCollaborators(prev => {
        const next = { ...prev };
        let changed = false;
        const now = Date.now();
        
        Object.keys(next).forEach(key => {
          // If a collaborator has been inactive for more than 8 seconds, remove them
          if (!next[key].isSimulated && now - next[key].lastActive > 8000) {
            delete next[key];
            changed = true;
          }
        });
        
        return changed ? next : prev;
      });
    }, 4000);
    
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      clearInterval(interval);
    };
  }, [setElements]);
  
  // 2. Local API for broadcasting changes
  const sendElementAdded = (element) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'element-added',
        from: myUsername.current,
        data: { element }
      });
    }
  };
  
  const sendElementUpdated = (id, updates) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'element-updated',
        from: myUsername.current,
        data: { id, updates }
      });
    }
  };
  
  const sendElementDeleted = (id) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'element-deleted',
        from: myUsername.current,
        data: { id }
      });
    }
  };
  
  const sendCursorMove = (coords) => {
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'cursor-move',
        from: myUsername.current,
        data: { coords, color: myColor.current }
      });
    }
  };
  
  const sendEmojiReaction = (emoji) => {
    triggerFloatingEmoji(myUsername.current, emoji);
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'emoji-reaction',
        from: myUsername.current,
        data: { emoji }
      });
    }
  };
  
  // 3. Helper to show temporary emoji reactions floating from cursor
  const triggerFloatingEmoji = (username, emoji) => {
    setCollaborators(prev => {
      if (!prev[username]) return prev;
      return {
        ...prev,
        [username]: {
          ...prev[username],
          emoji: emoji,
          emojiTime: Date.now()
        }
      };
    });
    
    // Clear emoji after 2 seconds
    setTimeout(() => {
      setCollaborators(prev => {
        if (!prev[username] || prev[username].emoji !== emoji) return prev;
        return {
          ...prev,
          [username]: {
            ...prev[username],
            emoji: null
          }
        };
      });
    }, 2000);
  };
  
  // 4. Simulated Multiplayer Engine
  useEffect(() => {
    if (!simulationActive) {
      // Remove simulated users if turned off
      setCollaborators(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(k => {
          if (next[k].isSimulated) {
            delete next[k];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      return;
    }
    
    // Initialize mock collaborators
    const mockUsers = [
      { name: 'Alice (R&D)', color: '#ec4899', x0: 200, y0: 300, phase: 0, speed: 0.02 },
      { name: 'Bob (Core)', color: '#eab308', x0: 600, y0: 250, phase: Math.PI / 2, speed: 0.015 },
      { name: 'Charlie (UX)', color: '#3b82f6', x0: 400, y0: 500, phase: Math.PI, speed: 0.01 }
    ];
    
    // Create cursors in collaborators state
    setCollaborators(prev => {
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
    
    // Interval to animate simulated user cursor movements
    const cursorInterval = setInterval(() => {
      t += 0.05;
      setCollaborators(prev => {
        const next = { ...prev };
        let changed = false;
        
        mockUsers.forEach(u => {
          if (next[u.name]) {
            // Infinite figure-8 movement (Lissajous curves)
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
    
    // Interval to simulate drawings & emoji reactions by mock users
    const actionInterval = setInterval(() => {
      const picker = Math.random();
      const user = mockUsers[Math.floor(Math.random() * mockUsers.length)];
      
      if (picker < 0.35) {
        // Trigger a simulated emoji reaction
        const emojis = ['🔥', '🎉', '👍', '❤️', '💡', '✨'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        
        setCollaborators(prev => {
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
          setCollaborators(prev => {
            if (!prev[user.name] || prev[user.name].emoji !== emoji) return prev;
            return {
              ...prev,
              [user.name]: { ...prev[user.name], emoji: null }
            };
          });
        }, 2000);
        
      } else if (picker < 0.65) {
        // Alice or Bob draws a shape!
        // We get the current simulated cursor position
        setCollaborators(prev => {
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
          
          // Add shape to elements list
          setElements(prevElements => [...prevElements, newShape]);
          
          // Animate drawing: expand the shape over 600ms
          let frame = 0;
          const totalFrames = 15;
          const targetW = (Math.random() * 80 + 40) * (Math.random() > 0.5 ? 1 : -1);
          const targetH = (Math.random() * 80 + 40) * (Math.random() > 0.5 ? 1 : -1);
          
          const drawInterval = setInterval(() => {
            frame++;
            const width = (targetW / totalFrames) * frame;
            const height = (targetH / totalFrames) * frame;
            
            setElements(prevEls => prevEls.map(el => el.id === shapeId ? { ...el, width, height } : el));
            
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
  }, [simulationActive, setElements]);
  
  return {
    collaborators,
    myUsername: myUsername.current,
    myColor: myColor.current,
    simulationActive,
    setSimulationActive,
    sendElementAdded,
    sendElementUpdated,
    sendElementDeleted,
    sendCursorMove,
    sendEmojiReaction
  };
}
