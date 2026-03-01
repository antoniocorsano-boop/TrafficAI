import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("traffic.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS roads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    geometry TEXT NOT NULL, -- GeoJSON LineString
    capacity INTEGER NOT NULL, -- vehicles per hour
    length_km REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traffic_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    road_id INTEGER NOT NULL,
    timestamp DATETIME NOT NULL,
    count INTEGER NOT NULL,
    FOREIGN KEY (road_id) REFERENCES roads(id)
  );
`);

// Seed data if empty
const roadCount = db.prepare("SELECT COUNT(*) as count FROM roads").get() as { count: number };
if (roadCount.count === 0) {
  const roads = [
    // Ariano Irpino Roads
    {
      name: "Via Cardito",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.075, 41.145],
          [15.085, 41.150],
          [15.095, 41.155]
        ]
      }),
      capacity: 1200,
      length_km: 2.5
    },
    {
      name: "Corso Vittorio Emanuele",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.088, 41.152],
          [15.090, 41.153],
          [15.092, 41.154]
        ]
      }),
      capacity: 800,
      length_km: 0.8
    },
    {
      name: "Via XXV Aprile",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.080, 41.158],
          [15.085, 41.155],
          [15.090, 41.152]
        ]
      }),
      capacity: 1000,
      length_km: 1.5
    },
    {
      name: "SS90 delle Puglie",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.050, 41.140],
          [15.100, 41.160],
          [15.150, 41.180]
        ]
      }),
      capacity: 2000,
      length_km: 12.0
    },
    {
      name: "Via Roma",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.085, 41.153],
          [15.087, 41.154]
        ]
      }),
      capacity: 600,
      length_km: 0.4
    },
    {
      name: "Via Fontananuova",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.082, 41.151],
          [15.084, 41.149]
        ]
      }),
      capacity: 700,
      length_km: 0.6
    },
    {
      name: "Via Nazionale",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.070, 41.142],
          [15.075, 41.145]
        ]
      }),
      capacity: 1500,
      length_km: 1.2
    },
    {
      name: "Via Camporeale",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.100, 41.160],
          [15.110, 41.165],
          [15.120, 41.170]
        ]
      }),
      capacity: 1000,
      length_km: 3.5
    },
    {
      name: "Via Maddalena",
      city: "ARIANO",
      geometry: JSON.stringify({
        type: "LineString",
        coordinates: [
          [15.088, 41.152],
          [15.086, 41.151],
          [15.084, 41.150]
        ]
      }),
      capacity: 500,
      length_km: 0.5
    }
  ];

  const insertRoad = db.prepare("INSERT INTO roads (name, city, geometry, capacity, length_km) VALUES (?, ?, ?, ?, ?)");
  const insertCount = db.prepare("INSERT INTO traffic_counts (road_id, timestamp, count) VALUES (?, ?, ?)");

  roads.forEach((road) => {
    const result = insertRoad.run(road.name, road.city, road.geometry, road.capacity, road.length_km);
    const roadId = result.lastInsertRowid;

    // Generate 24 hours of data
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      // Simulate traffic pattern: low at night, high at commute hours
      const hour = timestamp.getHours();
      let baseCount = 200;
      if (hour >= 7 && hour <= 9) baseCount = 2000; // Morning peak
      if (hour >= 17 && hour <= 19) baseCount = 2200; // Evening peak
      if (hour >= 10 && hour <= 16) baseCount = 1200; // Daytime
      
      const randomFactor = 0.8 + Math.random() * 0.4;
      const count = Math.floor(baseCount * randomFactor * (road.capacity / 3000));
      insertCount.run(roadId, timestamp.toISOString(), count);
    }
  });
}

// Live Traffic Simulation Task
// Every 30 seconds, add a new traffic count for each road
const insertCount = db.prepare("INSERT INTO traffic_counts (road_id, timestamp, count) VALUES (?, ?, ?)");
const cleanupOldData = db.prepare("DELETE FROM traffic_counts WHERE timestamp < datetime('now', '-48 hours')");

setInterval(() => {
  const roads = db.prepare("SELECT * FROM roads").all() as any[];
  const now = new Date();
  const hour = now.getHours();

  roads.forEach(road => {
    let baseCount = 200;
    if (hour >= 7 && hour <= 9) baseCount = 2000; // Morning peak
    if (hour >= 17 && hour <= 19) baseCount = 2200; // Evening peak
    if (hour >= 10 && hour <= 16) baseCount = 1200; // Daytime
    
    const randomFactor = 0.8 + Math.random() * 0.4;
    const count = Math.floor(baseCount * randomFactor * (road.capacity / 3000));
    
    insertCount.run(road.id, now.toISOString(), count);
  });
  
  // Cleanup data older than 48 hours to keep DB small
  cleanupOldData.run();
  console.log(`[Simulation] Added live traffic data at ${now.toLocaleTimeString()}`);
}, 30000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/roads", (req, res) => {
    const roads = db.prepare("SELECT * FROM roads").all();
    res.json(roads.map((r: any) => ({
      ...r,
      geometry: JSON.parse(r.geometry)
    })));
  });

  app.get("/api/roads/:id/traffic", (req, res) => {
    const counts = db.prepare("SELECT * FROM traffic_counts WHERE road_id = ? ORDER BY timestamp ASC").all(req.params.id);
    res.json(counts);
  });

  app.get("/api/stats", (req, res) => {
    const stats = db.prepare(`
      SELECT 
        r.name, 
        AVG(tc.count) as avg_traffic,
        MAX(tc.count) as peak_traffic,
        r.capacity
      FROM roads r
      JOIN traffic_counts tc ON r.id = tc.road_id
      GROUP BY r.id
    `).all();
    res.json(stats);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
