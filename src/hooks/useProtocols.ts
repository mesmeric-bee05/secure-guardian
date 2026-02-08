import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage } from '@/lib/offlineStorage';
import { Language } from '@/lib/translations';

interface ReferenceBook {
  title: string;
  author: string;
  url: string;
  isbn?: string;
}

interface Protocol {
  id: string;
  category: string;
  title_en: string;
  title_sw: string;
  content_en: string;
  content_sw: string;
  steps: { en: string[]; sw: string[] };
  red_flags: string[] | null;
  seek_help_when: string[] | null;
  severity: string | null;
  video_url: string | null;
  reference_books: ReferenceBook[] | null;
}

interface GroupedProtocols {
  [category: string]: Protocol[];
}

export function useProtocols(language: Language = 'en') {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [groupedProtocols, setGroupedProtocols] = useState<GroupedProtocols>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const processProtocols = (data: any[]) => {
    const parsedProtocols = data.map(p => ({
      ...p,
      steps: typeof p.steps === 'string' ? JSON.parse(p.steps) : p.steps,
    })) as Protocol[];

    setProtocols(parsedProtocols);

    const grouped = parsedProtocols.reduce((acc, protocol) => {
      const cat = protocol.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(protocol);
      return acc;
    }, {} as GroupedProtocols);

    setGroupedProtocols(grouped);
  };

  useEffect(() => {
    async function fetchProtocols() {
      try {
        setIsLoading(true);
        
        if (!navigator.onLine) {
          // Load from cache when offline
          const cached = await offlineStorage.getCachedProtocols();
          if (cached.length > 0) {
            processProtocols(cached);
            setIsOfflineData(true);
            setError(null);
          } else {
            setError(language === 'en' ? 'No cached data available offline' : 'Hakuna data iliyohifadhiwa');
          }
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('first_aid_protocols')
          .select('*')
          .order('category', { ascending: true });

        if (fetchError) throw fetchError;

        const protocolData = data || [];
        processProtocols(protocolData);
        setIsOfflineData(false);
        setError(null);

        // Cache for offline use
        if (protocolData.length > 0) {
          await offlineStorage.cacheProtocols(protocolData);
        }
      } catch (err) {
        // Try cache on error
        try {
          const cached = await offlineStorage.getCachedProtocols();
          if (cached.length > 0) {
            processProtocols(cached);
            setIsOfflineData(true);
            setError(null);
            return;
          }
        } catch {}
        setError(err instanceof Error ? err.message : 'Failed to load protocols');
      } finally {
        setIsLoading(false);
      }
    }

    fetchProtocols();
  }, [language]);

  const getTitle = (protocol: Protocol) => 
    language === 'sw' ? protocol.title_sw : protocol.title_en;

  const getContent = (protocol: Protocol) => 
    language === 'sw' ? protocol.content_sw : protocol.content_en;

  const getSteps = (protocol: Protocol): string[] => {
    if (!protocol.steps) return [];
    
    // Handle array of step objects with step_en/step_sw format
    if (Array.isArray(protocol.steps)) {
      return protocol.steps.map((step: any) => {
        if (typeof step === 'string') return step;
        if (typeof step === 'object' && step !== null) {
          return language === 'sw' 
            ? (step.step_sw || step.step_en || '') 
            : (step.step_en || step.step_sw || '');
        }
        return '';
      }).filter(Boolean);
    }
    
    // Handle legacy {en: [], sw: []} format
    if (typeof protocol.steps === 'object' && protocol.steps !== null) {
      const steps = protocol.steps as { en?: string[]; sw?: string[] };
      return language === 'sw' ? steps.sw || [] : steps.en || [];
    }
    
    return [];
  };

  return {
    protocols,
    groupedProtocols,
    isLoading,
    error,
    isOfflineData,
    getTitle,
    getContent,
    getSteps,
  };
}
