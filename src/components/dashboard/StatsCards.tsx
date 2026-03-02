import { 
  ClipboardList, 
  Clock, 
  CheckCircle, 
  AlertTriangle 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Language } from '@/lib/translations';

interface StatsCardsProps {
  language: Language;
  totalCases: number;
  pendingCases: number;
  resolvedToday: number;
  criticalCases: number;
}

const StatsCards = ({
  language,
  totalCases,
  pendingCases,
  resolvedToday,
  criticalCases,
}: StatsCardsProps) => {
  const stats = [
    {
      icon: ClipboardList,
      labelEn: 'Total Cases',
      labelSw: 'Kesi Zote',
      value: totalCases,
      color: 'text-blue-600',
      bg: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      icon: Clock,
      labelEn: 'Pending',
      labelSw: 'Zinasubiri',
      value: pendingCases,
      color: 'text-amber-600',
      bg: 'bg-amber-100 dark:bg-amber-950',
    },
    {
      icon: CheckCircle,
      labelEn: 'Resolved Today',
      labelSw: 'Zilizokamilika Leo',
      value: resolvedToday,
      color: 'text-green-600',
      bg: 'bg-green-100 dark:bg-green-950',
    },
    {
      icon: AlertTriangle,
      labelEn: 'Critical',
      labelSw: 'Muhimu',
      value: criticalCases,
      color: 'text-red-600',
      bg: 'bg-red-100 dark:bg-red-950',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">
                  {language === 'en' ? stat.labelEn : stat.labelSw}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StatsCards;
