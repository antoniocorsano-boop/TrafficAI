import React, { useState, useEffect } from "react";
import L from "leaflet";
// @ts-ignore
window.L = L;
import { MapContainer, TileLayer, Polyline, Popup, useMap, LayersControl, Tooltip as LeafletTooltip } from "react-leaflet";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area 
} from "recharts";
import { 
  Activity, 
  BarChart3, 
  Map as MapIcon, 
  TrendingUp, 
  Clock, 
  Info, 
  ChevronRight,
  Layers,
  AlertCircle,
  Search,
  Menu,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Road, TrafficCount, RoadStats } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Map centers
const CITIES = {
  ARIANO: { name: "Ariano Irpino", center: [41.1522, 15.0886] as [number, number] }
};

function FlyTo({ road, cityCenter }: { road: Road | null, cityCenter: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (road) {
      const coords = road.geometry.coordinates;
      const center = coords[Math.floor(coords.length / 2)];
      map.flyTo([center[1], center[0]], 15, { duration: 1.5 });
    } else if (cityCenter) {
      map.flyTo(cityCenter, 14, { duration: 1.5 });
    }
  }, [road, cityCenter, map]);
  return null;
}

function GoogleTrafficLayer() {
  const map = useMap();
  const [isPluginLoaded, setIsPluginLoaded] = useState(false);

  useEffect(() => {
    // Dynamically import the plugin to ensure window.L is set first
    // @ts-ignore
    import("leaflet.gridlayer.googlemutant")
      .then(() => {
        console.log("GoogleMutant plugin loaded successfully");
        setIsPluginLoaded(true);
      })
      .catch(err => {
        console.error("Failed to load GoogleMutant plugin:", err);
      });
  }, []);

  useEffect(() => {
    if (!isPluginLoaded) return;
    if (!(window as any).google || !(window as any).google.maps) {
      console.warn("Google Maps API not yet available for GoogleMutant layer.");
      return;
    }
    
    // @ts-ignore
    const L_any = (window as any).L || (L as any);
    
    // Check for factory or constructor
    const factory = L_any.gridLayer?.googleMutant;
    const Constructor = L_any.GridLayer?.GoogleMutant;
    
    if (typeof factory === 'function' || typeof Constructor === 'function') {
      try {
        const options = {
          type: 'roadmap',
          maxZoom: 21,
        };

        const trafficLayer = typeof factory === 'function' 
          ? factory(options) 
          : new Constructor(options);
        
        trafficLayer.addGoogleLayer('TrafficLayer');
        trafficLayer.addTo(map);
        
        return () => {
          if (map.hasLayer(trafficLayer)) {
            map.removeLayer(trafficLayer);
          }
        };
      } catch (err) {
        console.error("Error creating GoogleMutant layer:", err);
      }
    } else {
      console.error("Neither L.gridLayer.googleMutant nor L.GridLayer.GoogleMutant found. L keys:", Object.keys(L_any));
    }
  }, [map, isPluginLoaded]);
  return null;
}

export default function App() {
  const [roads, setRoads] = useState<Road[]>([]);
  const [selectedRoad, setSelectedRoad] = useState<Road | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficCount[]>([]);
  const [stats, setStats] = useState<RoadStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentCity, setCurrentCity] = useState<keyof typeof CITIES>("ARIANO");
  const [flyToCity, setFlyToCity] = useState<[number, number] | null>(null);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === "YOUR_GOOGLE_MAPS_API_KEY") {
      console.warn("Google Maps API Key not found or using placeholder. Traffic layer may not work.");
      return;
    }

    // Check if script already exists to prevent multiple inclusions
    if (window.google && window.google.maps) {
      setIsGoogleMapsLoaded(true);
      return;
    }

    const existingScript = document.getElementById("google-maps-api-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => setIsGoogleMapsLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-api-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  const filteredRoads = roads.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedRoad) {
      fetchTrafficData(selectedRoad.id);
      const interval = setInterval(() => fetchTrafficData(selectedRoad.id), 30000);
      return () => clearInterval(interval);
    }
  }, [selectedRoad]);

  const fetchData = async () => {
    try {
      const [roadsRes, statsRes] = await Promise.all([
        fetch("/api/roads"),
        fetch("/api/stats")
      ]);
      const roadsData = await roadsRes.json();
      const statsData = await statsRes.json();
      setRoads(roadsData);
      setStats(statsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrafficData = async (id: number) => {
    try {
      const res = await fetch(`/api/roads/${id}/traffic`);
      const data = await res.json();
      setTrafficData(data);
    } catch (error) {
      console.error("Error fetching traffic data:", error);
    }
  };

  const getCongestionColor = (roadId: number) => {
    const road = roads.find(r => r.id === roadId);
    const roadStats = stats.find(s => s.name === road?.name);
    if (!roadStats) return "#3b82f6"; // Default blue
    
    const ratio = roadStats.avg_traffic / roadStats.capacity;
    if (ratio < 0.3) return "#22c55e"; // Green (Fluido)
    if (ratio < 0.5) return "#84cc16"; // Lime (Scorrevole)
    if (ratio < 0.7) return "#eab308"; // Yellow (Rallentato)
    if (ratio < 0.85) return "#f97316"; // Orange (Intenso)
    return "#ef4444"; // Red (Congesto)
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-full bg-zinc-50 font-sans overflow-hidden relative">
      {/* Mobile Menu Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden absolute top-6 left-6 z-[2000] p-3 bg-white rounded-full shadow-lg text-zinc-600"
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-[1400]"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[1500] w-full sm:w-96 bg-white border-r border-zinc-200 flex flex-col shadow-2xl transition-transform duration-300 lg:relative lg:translate-x-0 lg:shadow-sm",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <header className="p-6 border-b border-zinc-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <Activity size={20} />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Ariano Traffic</h1>
            </div>
            <div className="px-1.5 py-0.5 bg-zinc-100 text-zinc-500 text-[8px] font-bold rounded uppercase tracking-tighter border border-zinc-200">
              Live Simulated
            </div>
          </div>
          
          {/* City Info */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-500 mb-1">Città Monitorata</h2>
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <MapIcon size={16} />
              <span>Ariano Irpino (AV)</span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input 
              type="text"
              placeholder="Cerca strada ad Ariano..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={14} />
              </button>
            )}
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-100 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                {filteredRoads.length > 0 ? (
                  filteredRoads.map(road => (
                    <button
                      key={road.id}
                      onClick={() => {
                        setSelectedRoad(road);
                        setSearchQuery("");
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-zinc-50 flex items-center justify-between group border-b border-zinc-50 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: getCongestionColor(road.id) }}
                        />
                        <span className="font-medium text-zinc-700">{road.name}</span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-300 group-hover:text-emerald-500 transition-colors" />
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-zinc-400">Nessun risultato trovato</div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Global Stats */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp size={14} />
              Panoramica Rete
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                <p className="text-xs text-zinc-500 mb-1">Strade Monitorate</p>
                <p className="text-2xl font-bold">{roads.length}</p>
              </div>
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                <p className="text-xs text-zinc-500 mb-1">Congestione Media</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {stats.length > 0 
                    ? Math.round((stats.reduce((acc, s) => acc + (s.avg_traffic / s.capacity), 0) / stats.length) * 100)
                    : 0}%
                </p>
              </div>
            </div>

            {stats.length > 0 && (
              <div className="h-40 w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" hide />
                    <YAxis fontSize={8} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Bar dataKey="avg_traffic" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-center text-zinc-400 mt-2 uppercase tracking-widest">Traffico Medio per Segmento</p>
              </div>
            )}
          </section>

          {/* Legend */}
          <section className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Legenda Traffico</h3>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px] font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Fluido (&lt;30%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-lime-500" />
                <span>Scorrevole (30-50%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>Rallentato (50-70%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span>Intenso (70-85%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>Congesto (&gt;85%)</span>
              </div>
            </div>
          </section>

          {/* Selected Road Details */}
          <AnimatePresence mode="wait">
            {selectedRoad ? (
              <motion.section
                key={selectedRoad.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Info size={14} />
                    Dettaglio Segmento
                  </h2>
                  <button 
                    onClick={() => setSelectedRoad(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Chiudi
                  </button>
                </div>

                <div className="p-5 bg-zinc-900 text-white rounded-3xl shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-zinc-800 text-zinc-500 text-[8px] font-bold uppercase tracking-tighter">
                    Simulated
                  </div>
                  <h3 className="text-lg font-bold mb-4">{selectedRoad.name}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-zinc-400 text-xs uppercase tracking-tighter">Capacità</p>
                      <p className="font-mono">{selectedRoad.capacity} v/h</p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs uppercase tracking-tighter">Lunghezza</p>
                      <p className="font-mono">{selectedRoad.length_km} km</p>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-zinc-800">
                      <p className="text-zinc-400 text-xs uppercase tracking-tighter">Indice Congestione</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-500",
                              getCongestionColor(selectedRoad.id) === "#22c55e" ? "bg-emerald-500" :
                              getCongestionColor(selectedRoad.id) === "#eab308" ? "bg-yellow-500" : "bg-red-500"
                            )}
                            style={{ width: `${Math.min(100, (stats.find(s => s.name === selectedRoad.name)?.avg_traffic || 0) / selectedRoad.capacity * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono">
                          {Math.round((stats.find(s => s.name === selectedRoad.name)?.avg_traffic || 0) / selectedRoad.capacity * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {trafficData.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      <Clock size={14} />
                      Trend 24 Ore
                    </h3>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trafficData}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="timestamp" 
                            tickFormatter={formatTime} 
                            fontSize={10} 
                            axisLine={false}
                            tickLine={false}
                            interval={4}
                          />
                          <YAxis fontSize={10} axisLine={false} tickLine={false} />
                          <Tooltip 
                            labelFormatter={(label) => formatTime(label)}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="count" 
                            stroke="#10b981" 
                            fillOpacity={1} 
                            fill="url(#colorCount)" 
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </motion.section>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center space-y-4"
              >
                <div className="p-4 bg-zinc-100 text-zinc-400 rounded-full">
                  <MapIcon size={32} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-600">Nessuna strada selezionata</p>
                  <p className="text-xs text-zinc-400">Clicca su un segmento della mappa per analizzare i dati</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="p-6 border-t border-zinc-100 bg-zinc-50/50 space-y-4">
          {!isGoogleMapsLoaded && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 items-start">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <strong>Google Maps API Key:</strong> Inserisci la tua chiave API in <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> per attivare il layer del traffico reale.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <p className="font-medium text-zinc-500">Simulazione in Tempo Reale</p>
            </div>
            <p className="text-[10px] leading-relaxed pl-5">
              I dati vengono aggiornati ogni 30 secondi basandosi su modelli statistici di flusso urbano. La geometria stradale riflette la rete viaria reale di Ariano Irpino.
            </p>
          </div>
        </footer>
      </aside>

      {/* Main Map Area */}
      <main className="flex-1 relative">
        <div className="absolute top-6 right-6 z-[1000] flex flex-col gap-3 items-end">
          <button 
            onClick={() => setShowTrafficOverlay(!showTrafficOverlay)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-xl transition-all border",
              showTrafficOverlay 
                ? "bg-emerald-600 text-white border-emerald-500" 
                : "bg-white text-zinc-600 hover:bg-zinc-50 border-zinc-200"
            )}
          >
            <Layers size={16} />
            {showTrafficOverlay ? "Traffico Attivo" : "Mappa Base"}
          </button>

          {showTrafficOverlay && (
            <div className="bg-white/90 backdrop-blur-md p-3 rounded-xl border border-zinc-200 shadow-xl flex flex-col gap-2 min-w-[120px]">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Congestione</p>
              <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-600">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Fluido</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-600">
                <div className="w-2 h-2 rounded-full bg-lime-500" />
                <span>Scorrevole</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-600">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>Rallentato</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-600">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span>Intenso</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-600">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>Congesto</span>
              </div>
            </div>
          )}
        </div>

        <MapContainer 
          center={CITIES.ARIANO.center} 
          zoom={14} 
          className="h-full w-full"
          zoomControl={false}
        >
          <FlyTo road={selectedRoad} cityCenter={flyToCity} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {isGoogleMapsLoaded && showTrafficOverlay && <GoogleTrafficLayer />}
          
          {roads.map((road) => {
            const roadStat = stats.find(s => s.name === road.name);
            const congestion = roadStat ? Math.round((roadStat.avg_traffic / roadStat.capacity) * 100) : 0;
            
            return (
              <Polyline
                key={road.id}
                positions={road.geometry.coordinates.map(coord => [coord[1], coord[0]]) as [number, number][]}
                pathOptions={{
                  color: showTrafficOverlay ? getCongestionColor(road.id) : "#3b82f6",
                  weight: selectedRoad?.id === road.id ? 10 : 6,
                  opacity: selectedRoad?.id === road.id ? 1 : 0.8,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
                eventHandlers={{
                  click: () => setSelectedRoad(road)
                }}
              >
                <LeafletTooltip sticky direction="top" offset={[0, -10]} opacity={1}>
                  <div className="p-1 min-w-[120px]">
                    <p className="font-bold text-xs mb-0.5">{road.name}</p>
                    <div className="flex items-center gap-1.5">
                      <div 
                        className="w-1.5 h-1.5 rounded-full" 
                        style={{ backgroundColor: getCongestionColor(road.id) }}
                      />
                      <span className="text-[10px] font-semibold">
                        Congestione: {congestion}%
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-0.5">
                      Media: {Math.round(roadStat?.avg_traffic || 0)} veicoli/ora
                    </p>
                  </div>
                </LeafletTooltip>
                <Popup>
                  <div className="p-2 min-w-[150px]">
                    <h4 className="font-bold text-sm mb-1">{road.name}</h4>
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: getCongestionColor(road.id) }}
                      />
                      <span className="text-xs font-semibold">
                        Congestione: {congestion}%
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-tight">
                      Capacità: {road.capacity} veicoli/ora<br/>
                      Media: {Math.round(roadStat?.avg_traffic || 0)} veicoli/ora
                    </p>
                    <div className="mt-2 pt-2 border-t border-zinc-100">
                      <p className="text-[10px] font-bold text-emerald-600">Clicca per analisi dettagliata</p>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}
        </MapContainer>
      </main>
    </div>
  );
}
