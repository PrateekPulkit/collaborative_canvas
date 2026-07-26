const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'flam-canvas-secret-key-129847';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize SQLite database with fail-safe in-memory fallback
let db;
let isInMemoryDb = false;
let memoryStore = {}; // Fallback in-memory database structure { [roomId]: { [elementId]: element } }

async function initDatabase() {
  try {
    const { open } = require('sqlite');
    const sqlite3 = require('sqlite3').verbose();
    
    // Create server data folder if it doesn't exist
    const dbDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dbDir)){
      fs.mkdirSync(dbDir);
    }
    
    db = await open({
      filename: path.join(dbDir, 'database.db'),
      driver: sqlite3.Database
    });
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS elements (
        id TEXT PRIMARY KEY,
        room_id TEXT,
        type TEXT,
        data TEXT
      )
    `);
    
    console.log('Successfully connected to SQLite database');
  } catch (error) {
    console.warn('SQLite failed to initialize, falling back to in-memory store:', error.message);
    isInMemoryDb = true;
  }
}

// REST API for user join and signing JWT
app.post('/api/join', (req, res) => {
  const { roomId, username } = req.body;
  if (!roomId || !username) {
    return res.status(400).json({ error: 'Room ID and Username are required' });
  }
  
  // Clean room ID (remove protocol/hosts if pasted as full link)
  let cleanRoomId = roomId.trim();
  try {
    const parsed = new URL(cleanRoomId);
    const nested = parsed.searchParams.get('room');
    if (nested) cleanRoomId = nested;
  } catch (e) {
    const match = cleanRoomId.match(/[?&]room=([^&]+)/);
    if (match) cleanRoomId = match[1];
  }
  
  const token = jwt.sign(
    { roomId: cleanRoomId, username: username.trim() },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({ token, roomId: cleanRoomId, username: username.trim() });
});

// Database helper functions
async function getRoomElements(roomId) {
  if (isInMemoryDb) {
    if (!memoryStore[roomId]) return [];
    return Object.values(memoryStore[roomId]);
  }
  
  try {
    const rows = await db.all('SELECT data FROM elements WHERE room_id = ?', roomId);
    return rows.map(r => JSON.parse(r.data));
  } catch (err) {
    console.error('Error reading elements:', err);
    return [];
  }
}

async function addElement(roomId, element) {
  if (isInMemoryDb) {
    if (!memoryStore[roomId]) memoryStore[roomId] = {};
    memoryStore[roomId][element.id] = element;
    return;
  }
  
  try {
    await db.run(
      'INSERT OR REPLACE INTO elements (id, room_id, type, data) VALUES (?, ?, ?, ?)',
      element.id,
      roomId,
      element.type,
      JSON.stringify(element)
    );
  } catch (err) {
    console.error('Error adding element:', err);
  }
}

async function updateElement(elementId, updates) {
  if (isInMemoryDb) {
    for (const roomId in memoryStore) {
      if (memoryStore[roomId][elementId]) {
        memoryStore[roomId][elementId] = {
          ...memoryStore[roomId][elementId],
          ...updates
        };
        break;
      }
    }
    return;
  }
  
  try {
    const row = await db.get('SELECT data, room_id, type FROM elements WHERE id = ?', elementId);
    if (row) {
      const currentData = JSON.parse(row.data);
      const merged = { ...currentData, ...updates };
      await db.run(
        'UPDATE elements SET data = ? WHERE id = ?',
        JSON.stringify(merged),
        elementId
      );
    }
  } catch (err) {
    console.error('Error updating element:', err);
  }
}

async function deleteElement(roomId, elementId) {
  if (isInMemoryDb) {
    if (memoryStore[roomId] && memoryStore[roomId][elementId]) {
      delete memoryStore[roomId][elementId];
    }
    return;
  }
  
  try {
    await db.run('DELETE FROM elements WHERE id = ?', elementId);
  } catch (err) {
    console.error('Error deleting element:', err);
  }
}

async function syncRoomBoard(roomId, allElements) {
  if (isInMemoryDb) {
    memoryStore[roomId] = {};
    allElements.forEach(el => {
      memoryStore[roomId][el.id] = el;
    });
    return;
  }
  
  try {
    await db.run('DELETE FROM elements WHERE room_id = ?', roomId);
    for (const el of allElements) {
      await db.run(
        'INSERT INTO elements (id, room_id, type, data) VALUES (?, ?, ?, ?)',
        el.id,
        roomId,
        el.type,
        JSON.stringify(el)
      );
    }
  } catch (err) {
    console.error('Error syncing room board:', err);
  }
}

// Serve production Vite build statically
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log('Serving static files from', distPath);
  
  // SPA routing: redirect unmatched API/WebSocket GET calls to index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = http.createServer(app);

// Initialize Socket.io with CORS settings
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware: Authenticate WebSocket connections using JWT
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication failed: Token is missing'));
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication failed: Invalid token'));
    }
    socket.decoded = decoded; // Store roomId and username on connection
    next();
  });
});

io.on('connection', (socket) => {
  const { roomId, username } = socket.decoded;
  socket.join(roomId);
  console.log(`User ${username} connected to room ${roomId}`);
  
  // On join: send initial elements array from SQLite
  getRoomElements(roomId).then(elements => {
    socket.emit('init-state', elements);
  });
  
  // Synchronize dynamic updates across participants
  socket.on('element-added', (element) => {
    addElement(roomId, element).then(() => {
      socket.to(roomId).emit('element-added', element);
    });
  });
  
  socket.on('element-updated', ({ id, updates }) => {
    updateElement(id, updates).then(() => {
      socket.to(roomId).emit('element-updated', { id, updates });
    });
  });
  
  socket.on('element-deleted', (id) => {
    deleteElement(roomId, id).then(() => {
      socket.to(roomId).emit('element-deleted', id);
    });
  });
  
  socket.on('board-sync', (allElements) => {
    syncRoomBoard(roomId, allElements).then(() => {
      socket.to(roomId).emit('board-sync', allElements);
    });
  });
  
  // Real-time awareness: broadcast cursors and emojis directly without SQLite saves
  socket.on('cursor-move', (coords) => {
    socket.to(roomId).emit('cursor-move', {
      name: username,
      cursor: coords
    });
  });

  socket.on('active-draw-move', (activeDrawElement) => {
    socket.to(roomId).emit('active-draw-move', {
      name: username,
      activeDrawElement
    });
  });
  
  socket.on('emoji-reaction', (emoji) => {
    socket.to(roomId).emit('emoji-reaction', {
      name: username,
      emoji,
      emojiTime: Date.now()
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`User ${username} left room ${roomId}`);
    socket.to(roomId).emit('user-left', username);
  });
});

// Start DB first, then HTTP server
initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log('Full-stack server is running');
  });
});
