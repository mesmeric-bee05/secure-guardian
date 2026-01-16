import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { usePushNotifications } from './usePushNotifications';
import { toast } from 'sonner';
import { Language } from '@/lib/translations';

interface EmergencyCase {
  id: string;
  symptoms: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'escalated';
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  notes: string | null;
  resolution_notes: string | null;
  created_at: string;
  resolved_at?: string | null;
  assigned_chw_id?: string | null;
  user_id?: string | null;
}

interface UseRealtimeCasesOptions {
  language?: Language;
  onNewCase?: (caseData: EmergencyCase) => void;
  onCaseAssigned?: (caseData: EmergencyCase) => void;
  onCaseUpdated?: (caseData: EmergencyCase) => void;
}

export function useRealtimeCases(options: UseRealtimeCasesOptions = {}) {
  const { language = 'en', onNewCase, onCaseAssigned, onCaseUpdated } = options;
  const { user, isChw, isAdmin } = useAuth();
  const { showEmergencyAlert, isPermissionGranted, requestPermission } = usePushNotifications(language);
  const [isConnected, setIsConnected] = useState(false);
  const [assignedCases, setAssignedCases] = useState<EmergencyCase[]>([]);

  // Fetch initial assigned cases for CHW
  const fetchAssignedCases = useCallback(async () => {
    if (!user || (!isChw() && !isAdmin())) return;

    try {
      let query = supabase
        .from('emergency_cases')
        .select('*')
        .order('created_at', { ascending: false });

      // CHWs only see their assigned cases
      if (isChw() && !isAdmin()) {
        query = query.eq('assigned_chw_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setAssignedCases((data || []) as EmergencyCase[]);
    } catch (error) {
      console.error('Failed to fetch cases:', error);
    }
  }, [user, isChw, isAdmin]);

  useEffect(() => {
    fetchAssignedCases();
  }, [fetchAssignedCases]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chw-case-assignments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'emergency_cases',
        },
        (payload) => {
          const newCase = payload.new as EmergencyCase;
          console.log('New case received:', newCase.id);
          
          // For admins or if case is assigned to this CHW
          if (isAdmin() || newCase.assigned_chw_id === user.id) {
            setAssignedCases(prev => [newCase, ...prev]);
            onNewCase?.(newCase);
            
            // Show notification for new cases
            if (isPermissionGranted) {
              showEmergencyAlert(newCase.symptoms, newCase.priority, newCase.id);
            }
            
            toast.info(
              language === 'en' 
                ? `New emergency case - Priority: ${newCase.priority.toUpperCase()}`
                : `Kesi mpya ya dharura - Kipaumbele: ${newCase.priority.toUpperCase()}`
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'emergency_cases',
        },
        (payload) => {
          const updatedCase = payload.new as EmergencyCase;
          const oldCase = payload.old as Partial<EmergencyCase>;
          
          console.log('Case updated:', updatedCase.id);
          
          // Check if case was just assigned to this CHW
          const wasAssignedToMe = 
            oldCase.assigned_chw_id !== user.id && 
            updatedCase.assigned_chw_id === user.id;
          
          if (wasAssignedToMe) {
            // CHW was just assigned to this case
            setAssignedCases(prev => {
              const exists = prev.some(c => c.id === updatedCase.id);
              if (exists) {
                return prev.map(c => c.id === updatedCase.id ? updatedCase : c);
              }
              return [updatedCase, ...prev];
            });
            
            onCaseAssigned?.(updatedCase);
            
            // Show prominent notification for assignment
            if (isPermissionGranted) {
              showEmergencyAlert(
                `${language === 'en' ? 'You have been assigned:' : 'Umepewa:'} ${updatedCase.symptoms}`,
                updatedCase.priority,
                updatedCase.id
              );
            }
            
            toast.success(
              language === 'en'
                ? `You've been assigned a new case - ${updatedCase.priority.toUpperCase()} priority`
                : `Umepewa kesi mpya - Kipaumbele ${updatedCase.priority.toUpperCase()}`,
              {
                duration: 10000,
                action: {
                  label: language === 'en' ? 'View' : 'Tazama',
                  onClick: () => window.location.href = '/dashboard',
                },
              }
            );
          } else if (isAdmin() || updatedCase.assigned_chw_id === user.id) {
            // Regular update for cases we're tracking
            setAssignedCases(prev => 
              prev.map(c => c.id === updatedCase.id ? updatedCase : c)
            );
            
            onCaseUpdated?.(updatedCase);
            
            // Notify status changes
            if (oldCase.status !== updatedCase.status) {
              toast.info(
                language === 'en'
                  ? `Case status changed to: ${updatedCase.status}`
                  : `Hali ya kesi imebadilika kuwa: ${updatedCase.status}`
              );
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'emergency_cases',
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setAssignedCases(prev => prev.filter(c => c.id !== deletedId));
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        console.log('Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, isChw, language, isPermissionGranted, showEmergencyAlert, onNewCase, onCaseAssigned, onCaseUpdated]);

  // Request notification permission
  const enableNotifications = useCallback(async () => {
    const granted = await requestPermission();
    if (granted) {
      toast.success(
        language === 'en' 
          ? 'Notifications enabled!' 
          : 'Arifa zimewezeshwa!'
      );
    }
    return granted;
  }, [requestPermission, language]);

  return {
    assignedCases,
    isConnected,
    isNotificationsEnabled: isPermissionGranted,
    enableNotifications,
    refreshCases: fetchAssignedCases,
  };
}
