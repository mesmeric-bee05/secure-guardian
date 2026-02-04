import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface CHWLocation {
  id: string;
  chw_user_id: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean | null;
  region: string;
  city: string | null;
  coverage_radius_km: number | null;
  last_location_update: string | null;
}

interface UseRealtimeCHWLocationsOptions {
  enabled?: boolean;
}

export function useRealtimeCHWLocations(options: UseRealtimeCHWLocationsOptions = {}) {
  const { enabled = true } = options;
  const [locations, setLocations] = useState<CHWLocation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch initial locations
  const fetchLocations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chw_assignments')
        .select('id, chw_user_id, latitude, longitude, is_active, region, city, coverage_radius_km, last_location_update')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error) throw error;
      
      setLocations(data || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching CHW locations:', error);
    }
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!enabled) return;

    fetchLocations();

    let channel: RealtimeChannel | null = null;

    const setupRealtimeSubscription = () => {
      channel = supabase
        .channel('chw_locations_realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chw_assignments',
          },
          (payload) => {
            console.log('CHW location update received:', payload);
            
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const newLocation = payload.new as CHWLocation;
              
              setLocations(prev => {
                const existing = prev.findIndex(l => l.id === newLocation.id);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = newLocation;
                  return updated;
                }
                return [...prev, newLocation];
              });
              
              setLastUpdate(new Date());
            } else if (payload.eventType === 'DELETE') {
              setLocations(prev => prev.filter(l => l.id !== payload.old.id));
            }
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');
          console.log('Realtime subscription status:', status);
        });
    };

    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [enabled, fetchLocations]);

  // Check if a location was recently updated (within last 5 minutes)
  const isRecentlyUpdated = useCallback((lastUpdate: string | null): boolean => {
    if (!lastUpdate) return false;
    const updateTime = new Date(lastUpdate).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return updateTime > fiveMinutesAgo;
  }, []);

  return {
    locations,
    isConnected,
    lastUpdate,
    isRecentlyUpdated,
    refetch: fetchLocations,
  };
}
