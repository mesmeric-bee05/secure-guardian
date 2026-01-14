import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage } from '@/lib/offlineStorage';
import { toast } from 'sonner';

interface UseBackgroundSyncOptions {
  language?: 'en' | 'sw';
  onSyncComplete?: (syncedCount: number) => void;
  onSyncError?: (error: Error) => void;
}

export function useBackgroundSync(options: UseBackgroundSyncOptions = {}) {
  const { language = 'en', onSyncComplete, onSyncError } = options;
  const syncInProgress = useRef(false);

  const syncEmergencyAlerts = useCallback(async (): Promise<number> => {
    if (syncInProgress.current) return 0;
    
    syncInProgress.current = true;
    let syncedCount = 0;

    try {
      const unsyncedAlerts = await offlineStorage.getUnsyncedAlerts();
      
      if (unsyncedAlerts.length === 0) {
        return 0;
      }

      console.log(`Syncing ${unsyncedAlerts.length} offline emergency alerts...`);

      for (const alert of unsyncedAlerts) {
        try {
          const { error } = await supabase.functions.invoke('emergency-alert', {
            body: {
              symptoms: alert.symptoms,
              priority: alert.priority,
              latitude: alert.latitude,
              longitude: alert.longitude,
              offlineId: alert.id,
              offlineTimestamp: alert.timestamp,
            },
          });

          if (error) {
            console.error('Failed to sync alert:', alert.id, error);
            continue;
          }

          await offlineStorage.markAlertSynced(alert.id);
          syncedCount++;
        } catch (err) {
          console.error('Error syncing individual alert:', alert.id, err);
        }
      }

      return syncedCount;
    } finally {
      syncInProgress.current = false;
    }
  }, []);

  const handleOnline = useCallback(async () => {
    console.log('Device came online, starting background sync...');
    
    try {
      const syncedCount = await syncEmergencyAlerts();
      
      if (syncedCount > 0) {
        toast.success(
          language === 'en'
            ? `${syncedCount} offline alert${syncedCount > 1 ? 's' : ''} sent successfully`
            : `Tahadhari ${syncedCount} za nje ya mtandao zimetumwa kikamilifu`
        );
        onSyncComplete?.(syncedCount);
      }
    } catch (error) {
      console.error('Background sync failed:', error);
      onSyncError?.(error as Error);
    }
  }, [language, syncEmergencyAlerts, onSyncComplete, onSyncError]);

  // Listen for online events
  useEffect(() => {
    window.addEventListener('online', handleOnline);
    
    // Also try to sync on mount if online
    if (navigator.onLine) {
      syncEmergencyAlerts().then(count => {
        if (count > 0) {
          toast.success(
            language === 'en'
              ? `${count} pending alert${count > 1 ? 's' : ''} synced`
              : `Tahadhari ${count} zilizosubiri zimesawazishwa`
          );
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [handleOnline, syncEmergencyAlerts, language]);

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) {
      toast.error(
        language === 'en'
          ? 'Cannot sync while offline'
          : 'Haiwezi kusawazisha wakati uko nje ya mtandao'
      );
      return 0;
    }
    
    return syncEmergencyAlerts();
  }, [language, syncEmergencyAlerts]);

  return {
    triggerSync,
    isSyncing: syncInProgress.current,
  };
}
