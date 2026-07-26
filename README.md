# FLAM Collaborative Canvas 🎨

FLAM Canvas is a high-performance, real-time collaborative digital whiteboard canvas built from scratch using **React**, **HTML5 Canvas**, **Node.js/Express**, **Socket.io**, and **SQLite**. 

I built this project to create an ultra-fluid, zero-config collaborative board. It features an infinite zooming/panning viewport, shape tools, text overlays, and a custom multiplayer sync engine secured by JWT connection handshakes. It compiles and deploys as a single unified service (both frontend and backend) on platforms like Render.

---

## 🚀 Key Features

*   **Infinite Viewport Engine**: Drag to pan (Middle-Click or Shift + Drag) and cursor-centric mouse-wheel zoom (from 10% up to 2000%).
*   **Vector Drawing Tools**: Calligraphic freehand pen drawings, straight lines, directional arrows, rectangles, and circles.
*   **Interactive Transformation Bounding Box**: Select any element on the canvas to display resize handles (NW, NE, SE, SW) to scale or translate vectors dynamically.
*   **Figma-style Real-Time Text**: Double-click or select the text tool to spawn a zoom-aware inline editor. Your typing is broadcasted letter-by-letter in real-time as you write.
*   **Socket.io + SQLite Multiplayer Sync**: Synced state updates are stored in a persistent SQLite database. If a user closes the browser or enters a room code later, the canvas automatically re-draws the saved board state.
*   **JWT Handshake Authentication**: Secure JWT signature tokens are generated for each user session on join. WebSocket connections are authenticated against this token during handshake to prevent unauthorized room operations.
*   **Mobile Responsiveness & Touch Support**: Touch Event listeners (`onTouchStart`, `onTouchMove`, `onTouchEnd`) with disabled scroll-nesting allow drawing on tablets/mobile. HUD layout containers stack elegantly, and the styling tray collapses into a sliding drawer on screens $\le 768\text{px}$.
*   **Snapping & Grid Layout**: Toggable 40px grid dots background with snapping enabled for shape drawing and moving.
*   **Undo/Redo History**: Comprehensive state history stack with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`).
*   **Export/Import Engine**: Crop and export designs to PNG, vector SVG, or download/load full projects as JSON files.

---

## 🛠️ Tech Stack & Architecture

### Frontend
- **React 19** + **Vite**: Ultra-fast hot-module reloading and bundle builds.
- **HTML5 Canvas API**: Native high-performance vector rendering.
- **Lucide React**: Premium icon set.
- **Socket.io-Client**: WebSocket client listener bindings.

### Backend (CommonJS)
- **Node.js** + **Express**: HTTP servers and REST APIs.
- **Socket.io**: Real-time websocket rooms management.
- **SQLite3** / **SQLite**: Persistent database engine. Includes a fail-safe in-memory store fallback if target OS binaries fail to link.
- **JSONWebToken (JWT)**: Secure client session tokens.

```
┌─────────────────────────────────────────────────────────────┐
│                       React Frontend                        │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP POST /api/join           │ WebSockets (Socket.io)
               ▼                               │ Sync Elements/Cursors/Emojis
┌──────────────┴───────────────────────────────┴──────────────┐
│                    Express Backend Server                   │
└──────────────┬──────────────────────────────────────────────┘
               │ Queries / Saves
               ▼
┌─────────────────────────────────────────────────────────────┐
│                       SQLite Database                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧠 Engineering & Mathematical Details (R&D Notes)

### 1. Viewport Zoom & Panning Calculations
To make sure zooming tracks the mouse cursor exactly (instead of zooming into the top-left coordinate `0,0`), we perform screen-to-canvas coordinate mapping.
For any screen coordinate $(S_x, S_y)$, the corresponding canvas space coordinate $(C_x, C_y)$ under pan offset $P$ and zoom level $Z$ is calculated as:

$$C_x = \frac{S_x - P_x}{Z}$$

$$C_y = \frac{S_y - P_y}{Z}$$

When the user scrolls the wheel, we calculate the next zoom $Z_{next}$. To keep the point under the cursor stationary, the new pan offset $P_{next}$ is updated:

$$P_{next, x} = S_x - C_x \cdot Z_{next}$$

$$P_{next, y} = S_y - C_y \cdot Z_{next}$$

### 2. Freehand Smoothing (Quadratic Bézier Curves)
To prevent jagged lines during fast mouse sweeps, the pen tool interpolates raw draw points. Rather than drawing simple straight line segments, we compute the midpoint of successive coordinates and draw quadratic curves:

```javascript
ctx.beginPath();
ctx.moveTo(points[0].x, points[0].y);
for (let i = 1; i < points.length - 1; i++) {
  const xc = (points[i].x + points[i + 1].x) / 2;
  const yc = (points[i].y + points[i + 1].y) / 2;
  ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
}
ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
ctx.stroke();
```

### 3. GLIBC Native Binary Rebuilding
Since `sqlite3` compiles native C++ modules, prebuilt binaries sometimes conflict with the host operating system's GNU C Library (GLIBC) versions (especially on Linux clouds like Render). 
To solve this, the build step compiles `sqlite3` from source directly on the host machine using the local compiler toolchain:
```bash
npm rebuild sqlite3 --build-from-source
```

---

## 🚀 Running the Project Locally

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/PrateekPulkit/collaborative_canvas.git
   cd collaborative_canvas
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the React Client**:
   ```bash
   npm run build
   ```

4. **Launch the Server**:
   ```bash
   npm start
   ```

5. **Access the Canvas**: Open **`http://localhost:3001`** in your browser. Open multiple windows or separate tabs to test the multi-user drawing sync!

---

## ☁️ Deploying to Render.com

Because Render is a persistent hosting provider (supporting WebSockets out-of-the-box), we can run the entire full-stack app on its free tier.

1. Create a new **Web Service** on Render and connect this GitHub repository.
2. Configure the following parameters:
   *   **Runtime**: `Node`
   *   **Build Command**: `npm install && npm rebuild sqlite3 --build-from-source && npm run build`
   *   **Start Command**: `npm start`
3. Click **Deploy**. Render will automatically build the Vite app, compile SQLite to match its GLIBC version, start the Socket.io server, and serve everything from a single URL!
