import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PushNotificationState {
  isSupported: boolean;
  isPermissionGranted: boolean;
  isSubscribed: boolean;
}

export function usePushNotifications(language: 'en' | 'sw' = 'en') {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isPermissionGranted: false,
    isSubscribed: false,
  });

  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = 'Notification' in window && 'serviceWorker' in navigator;
      const isPermissionGranted = Notification.permission === 'granted';
      
      setState(prev => ({
        ...prev,
        isSupported,
        isPermissionGranted,
      }));
    };

    checkSupport();
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      
      setState(prev => ({
        ...prev,
        isPermissionGranted: granted,
      }));

      return granted;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, []);

  const showNotification = useCallback(async (
    title: string,
    options?: NotificationOptions
  ) => {
    if (!state.isPermissionGranted) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    // Use the service worker for notifications if available
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        ...options,
      });
    } else {
      // Fallback to regular notification
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        ...options,
      });
    }
  }, [state.isPermissionGranted, requestPermission]);

  const showEmergencyAlert = useCallback(async (
    symptoms: string,
    priority: string,
    caseId: string
  ) => {
    const priorityLabels = {
      critical: language === 'en' ? '🚨 CRITICAL' : '🚨 DHARURA',
      high: language === 'en' ? '⚠️ HIGH' : '⚠️ YA JUU',
      medium: language === 'en' ? 'MEDIUM' : 'YA KATI',
      low: language === 'en' ? 'LOW' : 'YA CHINI',
    };

    const title = language === 'en' 
      ? `Emergency Alert - ${priorityLabels[priority as keyof typeof priorityLabels] || priority}`
      : `Tahadhari ya Dharura - ${priorityLabels[priority as keyof typeof priorityLabels] || priority}`;

    const body = language === 'en'
      ? `New case reported: ${symptoms.substring(0, 100)}${symptoms.length > 100 ? '...' : ''}`
      : `Kesi mpya imeripotiwa: ${symptoms.substring(0, 100)}${symptoms.length > 100 ? '...' : ''}`;

    await showNotification(title, {
      body,
      tag: `emergency-${caseId}`,
      requireInteraction: priority === 'critical' || priority === 'high',
      data: {
        caseId,
        url: '/dashboard',
      },
    });
  }, [language, showNotification]);

  return {
    ...state,
    requestPermission,
    showNotification,
    showEmergencyAlert,
  };
}
