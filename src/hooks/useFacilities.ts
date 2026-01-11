import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface HealthFacility {
  id: string;
  name: string;
  facility_type: 'hospital' | 'clinic' | 'pharmacy' | 'health_center';
  address: string;
  city: string;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  phone_number: string | null;
  email: string | null;
  services: string[] | null;
  operating_hours: Record<string, string> | null;
  is_24_hours: boolean;
  has_ambulance: boolean;
  is_verified: boolean;
}

interface UseFacilitiesOptions {
  type?: 'hospital' | 'clinic' | 'pharmacy' | 'health_center';
  limit?: number;
}

export function useFacilities(options: UseFacilitiesOptions = {}) {
  const { type, limit = 50 } = options;
  const [facilities, setFacilities] = useState<HealthFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        let query = supabase
          .from('health_facilities')
          .select('*')
          .eq('is_verified', true)
          .limit(limit);

        if (type) {
          query = query.eq('facility_type', type);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setFacilities(data as HealthFacility[]);
      } catch (err) {
        console.error('Error fetching facilities:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch facilities');
      } finally {
        setLoading(false);
      }
    };

    fetchFacilities();
  }, [type, limit]);

  const getNearbyFacilities = (
    userLat: number,
    userLng: number,
    maxDistance: number = 50 // km
  ): HealthFacility[] => {
    return facilities
      .filter(f => f.latitude && f.longitude)
      .map(facility => ({
        ...facility,
        distance: calculateDistance(
          userLat,
          userLng,
          facility.latitude!,
          facility.longitude!
        ),
      }))
      .filter(f => f.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  };

  return { facilities, loading, error, getNearbyFacilities };
}

// Haversine formula to calculate distance between two points
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
