import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistanceToNow } from 'date-fns';

interface CHWAssignment {
  id: string;
  chw_user_id: string;
  region: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  coverage_radius_km: number | null;
  is_active: boolean | null;
  assigned_at: string | null;
  full_name?: string;
  phone_number?: string;
  active_cases?: number;
  resolved_cases?: number;
  last_location_update?: string | null;
}

interface CHWLocationMapProps {
  assignments: CHWAssignment[];
  onSelectAssignment?: (assignment: CHWAssignment) => void;
  onLocationPick?: (lat: number, lng: number) => void;
  isPickingLocation?: boolean;
  selectedLocation?: { lat: number; lng: number } | null;
  className?: string;
  showRealtimeIndicators?: boolean;
}

// Check if location was recently updated (within 5 minutes)
const isRecentlyUpdated = (lastUpdate: string | null): boolean => {
  if (!lastUpdate) return false;
  const updateTime = new Date(lastUpdate).getTime();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return updateTime > fiveMinutesAgo;
};

// Custom marker icon for CHW with optional pulse effect
const createCHWIcon = (isActive: boolean, isRecent: boolean = false) => L.divIcon({
  className: 'chw-marker',
  html: `<div style="
    background-color: ${isActive ? (isRecent ? '#10b981' : '#22c55e') : '#6b7280'};
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    ${isRecent ? 'animation: chw-pulse 2s infinite;' : ''}
  ">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  </div>
  <style>
    @keyframes chw-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
    }
  </style>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Picker location marker
const pickerIcon = L.divIcon({
  className: 'picker-marker',
  html: `<div style="
    background-color: #ef4444;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    animation: pulse 1.5s infinite;
  "></div>
  <style>
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
    }
  </style>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function CHWLocationMap({
  assignments,
  onSelectAssignment,
  onLocationPick,
  isPickingLocation = false,
  selectedLocation,
  className = '',
  showRealtimeIndicators = true,
}: CHWLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const circlesRef = useRef<L.Circle[]>([]);
  const pickerMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Default to Kenya center
    const defaultCenter: L.LatLngExpression = [-1.2921, 36.8219];
    
    mapInstanceRef.current = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 7,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstanceRef.current);

    L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle click for location picking
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (isPickingLocation && onLocationPick) {
        onLocationPick(e.latlng.lat, e.latlng.lng);
      }
    };

    if (isPickingLocation) {
      mapInstanceRef.current.on('click', handleClick);
      mapInstanceRef.current.getContainer().style.cursor = 'crosshair';
    } else {
      mapInstanceRef.current.off('click', handleClick);
      mapInstanceRef.current.getContainer().style.cursor = '';
    }

    return () => {
      mapInstanceRef.current?.off('click', handleClick);
    };
  }, [isPickingLocation, onLocationPick]);

  // Update picker marker when selectedLocation changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (pickerMarkerRef.current) {
      pickerMarkerRef.current.remove();
      pickerMarkerRef.current = null;
    }

    if (selectedLocation) {
      pickerMarkerRef.current = L.marker(
        [selectedLocation.lat, selectedLocation.lng],
        { icon: pickerIcon }
      ).addTo(mapInstanceRef.current);

      mapInstanceRef.current.setView([selectedLocation.lat, selectedLocation.lng], 12);
    }
  }, [selectedLocation]);

  // Update CHW markers and circles
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers and circles
    markersRef.current.forEach(marker => marker.remove());
    circlesRef.current.forEach(circle => circle.remove());
    markersRef.current = [];
    circlesRef.current = [];

    // Add markers and circles for each CHW
    assignments.forEach((assignment) => {
      if (assignment.latitude && assignment.longitude) {
        const isActive = assignment.is_active ?? true;
        const isRecent = showRealtimeIndicators && isRecentlyUpdated(assignment.last_location_update || null);
        
        // Add coverage circle
        const circle = L.circle(
          [assignment.latitude, assignment.longitude],
          {
            radius: (assignment.coverage_radius_km || 10) * 1000, // Convert km to meters
            color: isActive ? (isRecent ? '#10b981' : '#22c55e') : '#6b7280',
            fillColor: isActive ? (isRecent ? '#10b981' : '#22c55e') : '#6b7280',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: isActive ? undefined : '5, 10',
          }
        ).addTo(mapInstanceRef.current!);
        circlesRef.current.push(circle);

        // Format last seen time
        const lastSeenText = assignment.last_location_update
          ? `Last seen: ${formatDistanceToNow(new Date(assignment.last_location_update), { addSuffix: true })}`
          : 'No recent location update';

        // Add marker
        const marker = L.marker(
          [assignment.latitude, assignment.longitude],
          { icon: createCHWIcon(isActive, isRecent) }
        )
          .addTo(mapInstanceRef.current!)
          .bindPopup(`
            <div style="min-width: 180px; padding: 4px;">
              <strong style="font-size: 14px;">${assignment.full_name || 'Unknown CHW'}</strong><br/>
              <span style="color: #6b7280; font-size: 12px;">
                ${assignment.region}${assignment.city ? `, ${assignment.city}` : ''}
              </span><br/>
              <div style="margin-top: 8px; display: flex; gap: 8px;">
                <span style="font-size: 11px; padding: 2px 6px; background: #fef3c7; border-radius: 4px; color: #92400e;">
                  ${assignment.active_cases || 0} active
                </span>
                <span style="font-size: 11px; padding: 2px 6px; background: #dcfce7; border-radius: 4px; color: #166534;">
                  ${assignment.resolved_cases || 0} resolved
                </span>
              </div>
              <div style="margin-top: 6px; font-size: 11px; color: #6b7280;">
                Coverage: ${assignment.coverage_radius_km || 10} km radius
              </div>
              ${showRealtimeIndicators ? `
                <div style="margin-top: 6px; font-size: 11px; color: ${isRecent ? '#10b981' : '#6b7280'};">
                  ${isRecent ? '🟢 ' : ''}${lastSeenText}
                </div>
              ` : ''}
            </div>
          `)
          .on('click', () => {
            onSelectAssignment?.(assignment);
          });

        markersRef.current.push(marker);
      }
    });

    // Fit bounds if we have markers
    if (markersRef.current.length > 0) {
      const group = L.featureGroup([...markersRef.current, ...circlesRef.current]);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  }, [assignments, onSelectAssignment, showRealtimeIndicators]);

  return (
    <div className={`relative w-full h-full min-h-[400px] ${className}`}>
      <div ref={mapRef} className="absolute inset-0 rounded-lg" />
      
      {/* Legend */}
      <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm p-3 rounded-lg shadow-md border z-[1000]">
        <p className="text-xs font-medium mb-2">Legend</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs">Active CHW</span>
          </div>
          {showRealtimeIndicators && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs">Recently Updated</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500"></div>
            <span className="text-xs">Inactive CHW</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-3 rounded-sm border-2 border-green-500 bg-green-500/20"></div>
            <span className="text-xs">Coverage Area</span>
          </div>
        </div>
      </div>

      {/* Picking mode indicator */}
      {isPickingLocation && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full shadow-lg z-[1000] text-sm font-medium">
          Click on the map to select location
        </div>
      )}
    </div>
  );
}
