import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import StatsCards from '@/components/dashboard/StatsCards';
import CasesList from '@/components/dashboard/CasesList';
import CaseDetailModal from '@/components/dashboard/CaseDetailModal';
import CaseTrendsChart from '@/components/dashboard/CaseTrendsChart';
import PriorityDistributionChart from '@/components/dashboard/PriorityDistributionChart';
import ResponseTimeChart from '@/components/dashboard/ResponseTimeChart';
import StatusOverviewChart from '@/components/dashboard/StatusOverviewChart';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { Language } from '@/lib/translations';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  profiles?: {
    full_name: string;
    phone_number: string | null;
    blood_type: string | null;
    allergies: string[] | null;
    medical_conditions: string[] | null;
  } | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile, isChw, isAdmin, loading: authLoading } = useAuth();
  const [language, setLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'en'
  );
  const { showEmergencyAlert, isPermissionGranted } = usePushNotifications(language);
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCase, setSelectedCase] = useState<EmergencyCase | null>(null);
  const [showCaseModal, setShowCaseModal] = useState(false);

  const fetchCases = useCallback(async () => {
    if (!user) return;

    try {
      // For CHWs, get cases assigned to them; for admins, get all cases
      let query = supabase
        .from('emergency_cases')
        .select('*')
        .order('created_at', { ascending: false });

      if (isChw() && !isAdmin()) {
        query = query.eq('assigned_chw_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCases(data as EmergencyCase[] || []);
    } catch (error) {
      console.error('Error fetching cases:', error);
      toast.error(language === 'en' ? 'Failed to load cases' : 'Imeshindikana kupakia kesi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isChw, isAdmin, language]);

  useEffect(() => {
    if (!authLoading && !isChw() && !isAdmin()) {
      navigate('/');
      return;
    }
    
    if (user) {
      fetchCases();
    }
  }, [user, authLoading, isChw, isAdmin, navigate, fetchCases]);

  // Real-time subscription for case updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('emergency-cases-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_cases',
        },
        (payload) => {
          console.log('Real-time update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newCase = payload.new as EmergencyCase;
            // Only add if it's for this CHW or user is admin
            if (isAdmin() || newCase.assigned_chw_id === user.id) {
              setCases(prev => [newCase, ...prev]);
              toast.info(
                language === 'en' 
                  ? 'New case received' 
                  : 'Kesi mpya imepokelewa'
              );
              
              // Send push notification for new cases
              if (isPermissionGranted) {
                showEmergencyAlert(
                  newCase.symptoms,
                  newCase.priority,
                  newCase.id
                );
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedCase = payload.new as EmergencyCase;
            setCases(prev => 
              prev.map(c => c.id === updatedCase.id ? updatedCase : c)
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setCases(prev => prev.filter(c => c.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, language]);

  useEffect(() => {
    if (profile?.preferred_language) {
      setLanguage(profile.preferred_language as Language);
    }
  }, [profile?.preferred_language]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCases();
  };

  const handleCaseSelect = (caseItem: EmergencyCase) => {
    setSelectedCase(caseItem);
    setShowCaseModal(true);
  };

  const handleUpdateStatus = async (id: string, status: string, notes?: string) => {
    try {
      const updates: Record<string, unknown> = { status };
      
      if (notes) {
        updates.resolution_notes = notes;
      }
      
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('emergency_cases')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setCases(prev => prev.map(c => 
        c.id === id ? { ...c, ...updates } as EmergencyCase : c
      ));

      toast.success(language === 'en' ? 'Case updated' : 'Kesi imesasishwa');
    } catch (error) {
      console.error('Error updating case:', error);
      toast.error(language === 'en' ? 'Failed to update case' : 'Imeshindikana kusasisha kesi');
      throw error;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate stats
  const today = new Date().toDateString();
  const stats = {
    total: cases.length,
    pending: cases.filter(c => c.status === 'pending' || c.status === 'assigned').length,
    resolvedToday: cases.filter(c => 
      c.status === 'resolved' && 
      new Date(c.created_at).toDateString() === today
    ).length,
    critical: cases.filter(c => c.priority === 'critical' && c.status !== 'resolved').length,
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <DashboardHeader
        language={language}
        onLanguageChange={setLanguage}
        chwName={profile?.full_name || ''}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <StatsCards
        language={language}
        totalCases={stats.total}
        pendingCases={stats.pending}
        resolvedToday={stats.resolvedToday}
        criticalCases={stats.critical}
      />

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="cases" className="h-full">
          <div className="px-4 pt-2">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="cases">
                {language === 'en' ? 'Cases' : 'Kesi'}
              </TabsTrigger>
              <TabsTrigger value="analytics">
                {language === 'en' ? 'Analytics' : 'Takwimu'}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="cases" className="h-[calc(100%-48px)] mt-0">
            <CasesList
              cases={cases}
              loading={loading}
              language={language}
              onCaseSelect={handleCaseSelect}
            />
          </TabsContent>

          <TabsContent value="analytics" className="p-4 space-y-4 overflow-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <CaseTrendsChart cases={cases} language={language} />
              <PriorityDistributionChart cases={cases} language={language} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ResponseTimeChart cases={cases} language={language} />
              <StatusOverviewChart cases={cases} language={language} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CaseDetailModal
        open={showCaseModal}
        onOpenChange={setShowCaseModal}
        caseData={selectedCase}
        language={language}
        onUpdateStatus={handleUpdateStatus}
      />
    </div>
  );
};

export default Dashboard;
