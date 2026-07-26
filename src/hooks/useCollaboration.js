import { useEffect, useState, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const NAMES = ['Sparky', 'Pixel', 'Vector', 'Curve', 'Dot', 'Matrix', 'Raster'];
const COLORS = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export function useCollaboration(elements, setElements, pan, zoom) {
  const [roomId, setRoomId] = useState('');
  const [realCollaborators, setRealCollaborators] = useState({});
  
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
    
    // Generate new room ID if none exists or if it resolved to empty
    if (!rId || rId.trim() === '') {
      rId = Math.random().toString(36).substring(2, 8);
    }
    
    // Clean up the URL search bar to show the clean room ID
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${rId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
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
            activeDrawElement: state.user.activeDrawElement,
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
    
    yDocRef.current.transact(() => {
      yElementsRef.current.delete(0, yElementsRef.current.length);
      if (allElements.length > 0) {
        yElementsRef.current.push(allElements);
      }
    });
  };
  
  const sendCursorMove = (coords, currentElement = null) => {
    if (!providerRef.current) return;
    const awareness = providerRef.current.awareness;
    const localState = awareness.getLocalState();
    
    if (localState && localState.user) {
      awareness.setLocalStateField('user', {
        ...localState.user,
        cursor: coords,
        activeDrawElement: currentElement
      });
    }
  };

  const clearActiveDrawElement = () => {
    if (!providerRef.current) return;
    const awareness = providerRef.current.awareness;
    const localState = awareness.getLocalState();
    
    if (localState && localState.user) {
      awareness.setLocalStateField('user', {
        ...localState.user,
        activeDrawElement: null
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
  
  return {
    roomId,
    collaborators: realCollaborators,
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
