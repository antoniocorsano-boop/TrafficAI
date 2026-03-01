export interface Road {
  id: number;
  name: string;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  capacity: number;
  length_km: number;
}

export interface TrafficCount {
  id: number;
  road_id: number;
  timestamp: string;
  count: number;
}

export interface RoadStats {
  name: string;
  avg_traffic: number;
  peak_traffic: number;
  capacity: number;
}
