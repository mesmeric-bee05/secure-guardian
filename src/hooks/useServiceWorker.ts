import { useEffect, useState, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

interface ServiceWorkerState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => Promise<void>;
}

export function useServiceWorker(language: 'en' | 'sw' = 'en'): ServiceWorkerState {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.success(
        language === 'en'
          ? 'App ready for offline use!'
          : 'Programu iko tayari kutumika nje ya mtandao!',
        { duration: 4000 }
      );
    }
  }, [offlineReady, language]);

  useEffect(() => {
    if (needRefresh) {
      toast(
        language === 'en'
          ? 'New version available! Click to update.'
          : 'Toleo jipya linapatikana! Bofya kusasisha.',
        {
          duration: 10000,
          action: {
            label: language === 'en' ? 'Update' : 'Sasisha',
            onClick: () => updateServiceWorker(true),
          },
        }
      );
    }
  }, [needRefresh, language, updateServiceWorker]);

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: () => updateServiceWorker(true),
  };
}
