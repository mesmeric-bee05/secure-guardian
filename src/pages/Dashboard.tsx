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
import RealtimeStatus from '@/components/dashboard/RealtimeStatus';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeCases } from '@/hooks/useRealtimeCases';
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
  const { user, profile, isChw, isAdmin, loading: authLoading, rolesLoaded } = useAuth();
  const [language, setLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'en'
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCase, setSelectedCase] = useState<EmergencyCase | null>(null);
  const [showCaseModal, setShowCaseModal] = useState(false);

  // Use realtime cases hook
  const {
    assignedCases,
    isConnected,
    isNotificationsEnabled,
    enableNotifications,
    refreshCases,
  } = useRealtimeCases({
    language,
    onCaseAssigned: (caseData) => {
      console.log('Case assigned to CHW:', caseData.id);
    },
  });

  useEffect(() => {
    if (!authLoading && rolesLoaded && !isChw() && !isAdmin()) {
      navigate('/');
      return;
    }
    
    if (user && rolesLoaded) {
      setLoading(false);
    }
  }, [user, authLoading, rolesLoaded, isChw, isAdmin, navigate]);

  useEffect(() => {
    if (profile?.preferred_language) {
      setLanguage(profile.preferred_language as Language);
    }
  }, [profile?.preferred_language]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshCases();
    setRefreshing(false);
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

      toast.success(language === 'en' ? 'Case updated' : 'Kesi imesasishwa');
      
      // Refresh to get latest data
      await refreshCases();
    } catch (error) {
      console.error('Error updating case:', error);
      toast.error(language === 'en' ? 'Failed to update case' : 'Imeshindikana kusasisha kesi');
      throw error;
    }
  };

  if (authLoading || loading || !rolesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate stats from realtime cases
  const cases = assignedCases as EmergencyCase[];
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
    <div className="flex flex-col min-h-screen bg-background">
      <DashboardHeader
        language={language}
        onLanguageChange={setLanguage}
        chwName={profile?.full_name || ''}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Realtime Status Bar */}
      <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
        <span className="text-sm text-muted-foreground">
          {language === 'en' ? 'Real-time updates' : 'Masasisho ya wakati halisi'}
        </span>
        <RealtimeStatus
          isConnected={isConnected}
          isNotificationsEnabled={isNotificationsEnabled}
          onEnableNotifications={enableNotifications}
          language={language}
        />
      </div>

      <StatsCards
        language={language}
        totalCases={stats.total}
        pendingCases={stats.pending}
        resolvedToday={stats.resolvedToday}
        criticalCases={stats.critical}
      />

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="cases" className="flex flex-col h-full">
          <div className="px-4 pt-2 shrink-0">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="cases">
                {language === 'en' ? 'Cases' : 'Kesi'}
              </TabsTrigger>
              <TabsTrigger value="analytics">
                {language === 'en' ? 'Analytics' : 'Takwimu'}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="cases" className="flex-1 mt-0 overflow-auto">
            <CasesList
              cases={cases}
              loading={loading}
              language={language}
              onCaseSelect={handleCaseSelect}
            />
          </TabsContent>

          <TabsContent value="analytics" className="flex-1 mt-0 overflow-auto p-4 space-y-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <CaseTrendsChart cases={cases} language={language} />
              <PriorityDistributionChart cases={cases} language={language} />
            </div>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
