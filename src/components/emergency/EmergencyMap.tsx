import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { HealthFacility } from '@/hooks/useFacilities';

interface EmergencyMapProps {
  facilities: HealthFacility[];
  userLocation: { lat: number; lng: number } | null;
  selectedFacility: HealthFacility | null;
  onFacilitySelect: (facility: HealthFacility) => void;
  onCenterOnUser: () => void;
}

// Custom marker icons
const createIcon = (color: string) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
      <path d="M12 2L12 22M2 12L22 12"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const userIcon = L.divIcon({
  className: 'user-marker',
  html: `<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px #3b82f6, 0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const facilityColors: Record<string, string> = {
  hospital: '#dc2626',
  clinic: '#2563eb',
  pharmacy: '#16a34a',
  health_center: '#9333ea',
};

const EmergencyMap = ({
  facilities,
  userLocation,
  selectedFacility,
  onFacilitySelect,
}: EmergencyMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Default to Nairobi, Kenya
    const defaultCenter: L.LatLngExpression = [-1.2921, 36.8219];
    
    mapInstanceRef.current = L.map(mapRef.current, {
      center: userLocation ? [userLocation.lat, userLocation.lng] : defaultCenter,
      zoom: 13,
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

  // Update user marker
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('You are here');
    }

    mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 14);
  }, [userLocation]);

  // Update facility markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    facilities.forEach((facility) => {
      if (facility.latitude && facility.longitude) {
        const color = facilityColors[facility.facility_type] || '#6b7280';
        const marker = L.marker([facility.latitude, facility.longitude], {
          icon: createIcon(color),
        })
          .addTo(mapInstanceRef.current!)
          .bindPopup(`
            <div style="min-width: 150px;">
              <strong>${facility.name}</strong><br/>
              <span style="color: #6b7280; font-size: 12px;">${facility.facility_type.replace('_', ' ')}</span><br/>
              <span style="font-size: 12px;">${facility.address}</span>
            </div>
          `)
          .on('click', () => onFacilitySelect(facility));

        markersRef.current.push(marker);
      }
    });
  }, [facilities, onFacilitySelect]);

  // Pan to selected facility
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedFacility?.latitude || !selectedFacility?.longitude) return;
    mapInstanceRef.current.setView([selectedFacility.latitude, selectedFacility.longitude], 15);
  }, [selectedFacility]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
};

export default EmergencyMap;
