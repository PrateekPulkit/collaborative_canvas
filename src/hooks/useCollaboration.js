import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const NAMES = ['Sparky', 'Pixel', 'Vector', 'Curve', 'Dot', 'Matrix', 'Raster'];
const COLORS = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : window.location.origin; // In production, Node server serves frontend statically from same origin

export function useCollaboration(elements, setElements, pan, zoom) {
  const [roomId, setRoomId] = useState('');
  const [collaborators, setCollaborators] = useState({});
  
  // Local user profile details
  const myUsername = useRef(NAMES[Math.floor(Math.random() * NAMES.length)] + '-' + Math.floor(Math.random() * 100));
  const myColor = useRef(COLORS[Math.floor(Math.random() * COLORS.length)]);
  
  // Keep socket instance in refs
  const socketRef = useRef(null);
  
  // Internal flag to avoid echo loops
  const isSyncingFromSocket = useRef(false);
  
  useEffect(() => {
    // Read or generate room code
    const params = new URLSearchParams(window.location.search);
    let rId = params.get('room');
    
    // Sanitize Room ID if it was pasted/loaded as a full URL
    if (rId) {
      try {
        const parsedUrl = new URL(rId);
        const nestedRoom = parsedUrl.searchParams.get('room');
        if (nestedRoom) rId = nestedRoom;
      } catch (e) {
        // Fallback match if it's not a complete URL but contains '?room='
        const match = rId.match(/[?&]room=([^&]+)/);
        if (match) rId = match[1];
      }
    }
    
    // Generate new room ID if none exists
    if (!rId || rId.trim() === '') {
      rId = Math.random().toString(36).substring(2, 8);
    }
    
    // Clean up the URL search bar to show the clean room ID
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${rId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
    setRoomId(rId);
    
    let isMounted = true;
    let socket = null;
    
    // Connect to Backend and handshake via JWT
    async function connectSocket() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            roomId: rId,
            username: myUsername.current
          })
        });
        
        if (!response.ok) {
          throw new Error('REST API failed to sign handshake token');
        }
        
        const { token } = await response.json();
        
        if (!isMounted) return;
        
        // Connect Socket.io with JWT auth token
        socket = io(BACKEND_URL, {
          auth: { token },
          transports: ['websocket', 'polling'] // fallback transport methods
        });
        socketRef.current = socket;
        
        // 1. Initial State load from SQLite
        socket.on('init-state', (elementsArr) => {
          isSyncingFromSocket.current = true;
          setElements(elementsArr);
          isSyncingFromSocket.current = false;
        });
        
        // 2. Real-time draw sync events
        socket.on('element-added', (element) => {
          isSyncingFromSocket.current = true;
          setElements(prev => [...prev, element]);
          isSyncingFromSocket.current = false;
        });
        
        socket.on('element-updated', ({ id, updates }) => {
          isSyncingFromSocket.current = true;
          setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
          isSyncingFromSocket.current = false;
        });
        
        socket.on('element-deleted', (id) => {
          isSyncingFromSocket.current = true;
          setElements(prev => prev.filter(el => el.id !== id));
          isSyncingFromSocket.current = false;
        });
        
        socket.on('board-sync', (allElements) => {
          isSyncingFromSocket.current = true;
          setElements(allElements);
          isSyncingFromSocket.current = false;
        });
        
        // 3. Real-time Awareness sync (cursors and reactions)
        socket.on('cursor-move', ({ name, cursor }) => {
          setCollaborators(prev => ({
            ...prev,
            [name]: {
              ...prev[name],
              name,
              cursor,
              // Keep color constant if remote user is active, fallback generate
              color: prev[name]?.color || COLORS[Math.floor(Math.random() * COLORS.length)]
            }
          }));
        });

        socket.on('active-draw-move', ({ name, activeDrawElement }) => {
          setCollaborators(prev => ({
            ...prev,
            [name]: {
              ...prev[name],
              name,
              activeDrawElement,
              color: prev[name]?.color || COLORS[Math.floor(Math.random() * COLORS.length)]
            }
          }));
        });
        
        socket.on('emoji-reaction', ({ name, emoji, emojiTime }) => {
          setCollaborators(prev => ({
            ...prev,
            [name]: {
              ...prev[name],
              name,
              emoji,
              emojiTime,
              color: prev[name]?.color || COLORS[Math.floor(Math.random() * COLORS.length)]
            }
          }));
          
          // Clear emoji local presence bubble after 2 seconds
          setTimeout(() => {
            if (isMounted) {
              setCollaborators(prev => {
                if (prev[name] && prev[name].emoji === emoji) {
                  return {
                    ...prev,
                    [name]: { ...prev[name], emoji: null }
                  };
                }
                return prev;
              });
            }
          }, 2000);
        });
        
        socket.on('user-left', (username) => {
          setCollaborators(prev => {
            const copy = { ...prev };
            delete copy[username];
            return copy;
          });
        });
        
      } catch (err) {
        console.error('Socket.io connection failed:', err.message);
      }
    }
    
    connectSocket();
    
    return () => {
      isMounted = false;
      if (socket) {
        socket.disconnect();
      }
    };
  }, [setElements]);
  
  // 4. API helpers called from the Drawing Canvas
  
  const sendElementAdded = (element) => {
    if (isSyncingFromSocket.current || !socketRef.current) return;
    socketRef.current.emit('element-added', element);
  };
  
  const sendElementUpdated = (id, updates) => {
    if (isSyncingFromSocket.current || !socketRef.current) return;
    socketRef.current.emit('element-updated', { id, updates });
  };
  
  const sendElementDeleted = (id) => {
    if (isSyncingFromSocket.current || !socketRef.current) return;
    socketRef.current.emit('element-deleted', id);
  };
  
  const sendBoardSync = (allElements) => {
    if (isSyncingFromSocket.current || !socketRef.current) return;
    socketRef.current.emit('board-sync', allElements);
  };
  
  const sendCursorMove = (coords, currentElement = null) => {
    if (!socketRef.current) return;
    socketRef.current.emit('cursor-move', coords);
    if (currentElement) {
      socketRef.current.emit('active-draw-move', currentElement);
    }
  };

  const clearActiveDrawElement = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('active-draw-move', null);
  };
  
  const sendEmojiReaction = (emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit('emoji-reaction', emoji);
  };
  
  return {
    roomId,
    collaborators,
    myUsername: myUsername.current,
    myColor: myColor.current,
    sendElementAdded,
    sendElementUpdated,
    sendElementDeleted,
    sendCursorMove,
    sendEmojiReaction,
    sendBoardSync,
    clearActiveDrawElement
  };
}
