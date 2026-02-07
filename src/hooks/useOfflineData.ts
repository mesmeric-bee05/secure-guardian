import { useState, useEffect, useCallback } from 'react';
import { offlineStorage } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';
import { HealthFacility } from '@/hooks/useFacilities';

interface UseOfflineDataOptions {
  autoCache?: boolean;
}

export function useOfflineData(options: UseOfflineDataOptions = {}) {
  const { autoCache = true } = options;
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cacheProtocols = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('first_aid_protocols')
        .select('*')
        .order('category', { ascending: true });

      if (data && data.length > 0) {
        await offlineStorage.cacheProtocols(data);
        console.log(`Cached ${data.length} protocols for offline use`);
      }
      return data || [];
    } catch (error) {
      console.error('Error caching protocols:', error);
      return [];
    }
  }, []);

  const cacheFacilities = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('health_facilities')
        .select('*')
        .eq('is_verified', true);

      if (data && data.length > 0) {
        await offlineStorage.cacheFacilities(data);
        console.log(`Cached ${data.length} facilities for offline use`);
      }
      return data || [];
    } catch (error) {
      console.error('Error caching facilities:', error);
      return [];
    }
  }, []);

  const getCachedProtocols = useCallback(async () => {
    return offlineStorage.getCachedProtocols();
  }, []);

  const getCachedFacilities = useCallback(async (): Promise<HealthFacility[]> => {
    return offlineStorage.getCachedFacilities() as Promise<HealthFacility[]>;
  }, []);

  // Auto-cache data when online
  useEffect(() => {
    if (autoCache && !isOffline) {
      cacheProtocols();
      cacheFacilities();
    }
  }, [autoCache, isOffline, cacheProtocols, cacheFacilities]);

  return {
    isOffline,
    cacheProtocols,
    cacheFacilities,
    getCachedProtocols,
    getCachedFacilities,
  };
}
