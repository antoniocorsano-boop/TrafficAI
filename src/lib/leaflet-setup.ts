import * as L from "leaflet";

// Ensure Leaflet is available globally for plugins like GoogleMutant
if (typeof window !== 'undefined') {
  (window as any).L = L;
}

export default L;
