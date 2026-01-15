import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Language } from '@/lib/translations';

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
}

interface GroupedProtocols {
  [category: string]: Protocol[];
}

export function useProtocols(language: Language = 'en') {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [groupedProtocols, setGroupedProtocols] = useState<GroupedProtocols>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProtocols() {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('first_aid_protocols')
          .select('*')
          .order('category', { ascending: true });

        if (fetchError) throw fetchError;

        const parsedProtocols = (data || []).map(p => ({
          ...p,
          steps: typeof p.steps === 'string' ? JSON.parse(p.steps) : p.steps,
        })) as Protocol[];

        setProtocols(parsedProtocols);

        // Group by category
        const grouped = parsedProtocols.reduce((acc, protocol) => {
          const cat = protocol.category;
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(protocol);
          return acc;
        }, {} as GroupedProtocols);

        setGroupedProtocols(grouped);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load protocols');
      } finally {
        setIsLoading(false);
      }
    }

    fetchProtocols();
  }, []);

  const getTitle = (protocol: Protocol) => 
    language === 'sw' ? protocol.title_sw : protocol.title_en;

  const getContent = (protocol: Protocol) => 
    language === 'sw' ? protocol.content_sw : protocol.content_en;

  const getSteps = (protocol: Protocol): string[] => {
    if (!protocol.steps) return [];
    if (Array.isArray(protocol.steps)) return protocol.steps;
    return language === 'sw' ? protocol.steps.sw || [] : protocol.steps.en || [];
  };

  return {
    protocols,
    groupedProtocols,
    isLoading,
    error,
    getTitle,
    getContent,
    getSteps,
  };
}
