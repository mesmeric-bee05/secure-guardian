import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Language } from '@/lib/translations';
import { format, subDays, startOfDay } from 'date-fns';

interface EmergencyCase {
  id: string;
  status: string;
  created_at: string;
}

interface CaseTrendsChartProps {
  cases: EmergencyCase[];
  language: Language;
}

const chartConfig = {
  cases: {
    label: 'Cases',
    color: 'hsl(var(--chart-1))',
  },
  resolved: {
    label: 'Resolved',
    color: 'hsl(var(--chart-3))',
  },
};

const CaseTrendsChart = ({ cases, language }: CaseTrendsChartProps) => {
  const data = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 6 - i));
      return {
        date,
        dateStr: format(date, 'EEE'),
        cases: 0,
        resolved: 0,
      };
    });

    cases.forEach((c) => {
      const caseDate = startOfDay(new Date(c.created_at));
      const dayEntry = last7Days.find(
        (d) => d.date.getTime() === caseDate.getTime()
      );
      if (dayEntry) {
        dayEntry.cases += 1;
        if (c.status === 'resolved') {
          dayEntry.resolved += 1;
        }
      }
    });

    return last7Days;
  }, [cases]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {language === 'en' ? 'Case Trends' : 'Mwenendo wa Kesi'}
        </CardTitle>
        <CardDescription>
          {language === 'en' ? 'Cases over the last 7 days' : 'Kesi za siku 7 zilizopita'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCases" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="dateStr" 
              tickLine={false} 
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis 
              tickLine={false} 
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              width={30}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="cases"
              stroke="hsl(var(--chart-1))"
              fill="url(#fillCases)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              stroke="hsl(var(--chart-3))"
              fill="url(#fillResolved)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default CaseTrendsChart;
