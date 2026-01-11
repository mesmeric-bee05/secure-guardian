import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import CaseCard from './CaseCard';
import { Language } from '@/lib/translations';

interface EmergencyCase {
  id: string;
  symptoms: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'escalated';
  location_address: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
  } | null;
}

interface CasesListProps {
  cases: EmergencyCase[];
  loading: boolean;
  language: Language;
  onCaseSelect: (caseItem: EmergencyCase) => void;
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'resolved';

const filterTabs: { value: StatusFilter; labelEn: string; labelSw: string }[] = [
  { value: 'all', labelEn: 'All', labelSw: 'Zote' },
  { value: 'pending', labelEn: 'Pending', labelSw: 'Zinasubiri' },
  { value: 'in_progress', labelEn: 'Active', labelSw: 'Zinazoendelea' },
  { value: 'resolved', labelEn: 'Resolved', labelSw: 'Zilizokamilika' },
];

const CasesList = ({ cases, loading, language, onCaseSelect }: CasesListProps) => {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filteredCases = cases.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'pending') return c.status === 'pending' || c.status === 'assigned';
    if (filter === 'in_progress') return c.status === 'in_progress';
    if (filter === 'resolved') return c.status === 'resolved';
    return true;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="px-4 py-3 border-b">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <TabsList className="w-full grid grid-cols-4">
            {filterTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {language === 'en' ? tab.labelEn : tab.labelSw}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredCases.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {language === 'en' ? 'No cases found' : 'Hakuna kesi zilizopatikana'}
            </p>
          ) : (
            filteredCases.map((caseItem) => (
              <CaseCard
                key={caseItem.id}
                case_={caseItem}
                language={language}
                onClick={() => onCaseSelect(caseItem)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default CasesList;
