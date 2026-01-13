import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Language } from '@/lib/translations';
import { Progress } from '@/components/ui/progress';

interface EmergencyCase {
  id: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'escalated';
}

interface StatusOverviewChartProps {
  cases: EmergencyCase[];
  language: Language;
}

const statusLabels = {
  en: {
    pending: 'Pending',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    escalated: 'Escalated',
  },
  sw: {
    pending: 'Inasubiri',
    assigned: 'Imepewa',
    in_progress: 'Inaendelea',
    resolved: 'Imetatuliwa',
    escalated: 'Imepandishwa',
  },
};

const statusColors = {
  pending: 'bg-warning',
  assigned: 'bg-primary',
  in_progress: 'bg-chart-2',
  resolved: 'bg-success',
  escalated: 'bg-destructive',
};

const StatusOverviewChart = ({ cases, language }: StatusOverviewChartProps) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      assigned: 0,
      in_progress: 0,
      resolved: 0,
      escalated: 0,
    };

    cases.forEach((c) => {
      counts[c.status] += 1;
    });

    const total = cases.length || 1;

    return Object.entries(counts).map(([status, count]) => ({
      status,
      label: statusLabels[language][status as keyof typeof statusLabels.en],
      count,
      percentage: Math.round((count / total) * 100),
      color: statusColors[status as keyof typeof statusColors],
    }));
  }, [cases, language]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {language === 'en' ? 'Status Overview' : 'Muhtasari wa Hali'}
        </CardTitle>
        <CardDescription>
          {language === 'en' ? 'Current case status breakdown' : 'Mgawanyiko wa hali ya kesi'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((item) => (
          <div key={item.status} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">
                {item.count} ({item.percentage}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={`h-full rounded-full ${item.color} transition-all duration-500`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default StatusOverviewChart;
