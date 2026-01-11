import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import StatsCards from '@/components/dashboard/StatsCards';
import CasesList from '@/components/dashboard/CasesList';
import CaseDetailModal from '@/components/dashboard/CaseDetailModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Language } from '@/lib/translations';
import { toast } from 'sonner';

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

      <CasesList
        cases={cases}
        loading={loading}
        language={language}
        onCaseSelect={handleCaseSelect}
      />

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
