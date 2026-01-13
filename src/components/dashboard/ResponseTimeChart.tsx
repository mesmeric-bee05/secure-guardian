import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Language } from '@/lib/translations';
import { differenceInMinutes, format, subDays, startOfDay } from 'date-fns';

interface EmergencyCase {
  id: string;
  status: string;
  created_at: string;
  resolved_at?: string | null;
}

interface ResponseTimeChartProps {
  cases: EmergencyCase[];
  language: Language;
}

const chartConfig = {
  avgTime: {
    label: 'Avg Response (min)',
    color: 'hsl(var(--chart-2))',
  },
};

const ResponseTimeChart = ({ cases, language }: ResponseTimeChartProps) => {
  const data = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 6 - i));
      return {
        date,
        dateStr: format(date, 'EEE'),
        totalTime: 0,
        count: 0,
        avgTime: 0,
      };
    });

    cases.forEach((c) => {
      if (c.status === 'resolved' && c.resolved_at) {
        const caseDate = startOfDay(new Date(c.created_at));
        const dayEntry = last7Days.find(
          (d) => d.date.getTime() === caseDate.getTime()
        );
        if (dayEntry) {
          const responseTime = differenceInMinutes(
            new Date(c.resolved_at),
            new Date(c.created_at)
          );
          dayEntry.totalTime += responseTime;
          dayEntry.count += 1;
        }
      }
    });

    return last7Days.map((d) => ({
      ...d,
      avgTime: d.count > 0 ? Math.round(d.totalTime / d.count) : 0,
    }));
  }, [cases]);

  const overallAvg = useMemo(() => {
    const resolvedCases = cases.filter((c) => c.status === 'resolved' && c.resolved_at);
    if (resolvedCases.length === 0) return 0;
    
    const totalMinutes = resolvedCases.reduce((sum, c) => {
      return sum + differenceInMinutes(
        new Date(c.resolved_at!),
        new Date(c.created_at)
      );
    }, 0);
    
    return Math.round(totalMinutes / resolvedCases.length);
  }, [cases]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{language === 'en' ? 'Response Times' : 'Muda wa Majibu'}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {language === 'en' ? 'Avg: ' : 'Wastani: '}
            <span className="font-semibold text-foreground">{overallAvg} min</span>
          </span>
        </CardTitle>
        <CardDescription>
          {language === 'en' 
            ? 'Average resolution time per day' 
            : 'Muda wa wastani wa utatuzi kwa siku'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
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
              width={40}
              tickFormatter={(value) => `${value}m`}
            />
            <ChartTooltip 
              content={<ChartTooltipContent />}
              formatter={(value) => [`${value} min`, language === 'en' ? 'Avg Time' : 'Muda wa Wastani']}
            />
            <Bar 
              dataKey="avgTime" 
              fill="hsl(var(--chart-2))" 
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default ResponseTimeChart;
