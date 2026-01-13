import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Language } from '@/lib/translations';

interface EmergencyCase {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface PriorityDistributionChartProps {
  cases: EmergencyCase[];
  language: Language;
}

const priorityLabels = {
  en: {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  },
  sw: {
    low: 'Chini',
    medium: 'Wastani',
    high: 'Juu',
    critical: 'Dharura',
  },
};

const priorityColors = {
  low: 'hsl(var(--chart-3))',
  medium: 'hsl(var(--chart-4))',
  high: 'hsl(var(--chart-5))',
  critical: 'hsl(var(--critical))',
};

const chartConfig = {
  low: {
    label: 'Low',
    color: 'hsl(var(--chart-3))',
  },
  medium: {
    label: 'Medium',
    color: 'hsl(var(--chart-4))',
  },
  high: {
    label: 'High',
    color: 'hsl(var(--chart-5))',
  },
  critical: {
    label: 'Critical',
    color: 'hsl(var(--critical))',
  },
};

const PriorityDistributionChart = ({ cases, language }: PriorityDistributionChartProps) => {
  const data = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    cases.forEach((c) => {
      counts[c.priority] += 1;
    });

    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([priority, count]) => ({
        name: priorityLabels[language][priority as keyof typeof priorityLabels.en],
        value: count,
        priority,
        fill: priorityColors[priority as keyof typeof priorityColors],
      }));
  }, [cases, language]);

  const total = cases.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {language === 'en' ? 'Priority Distribution' : 'Usambazaji wa Kipaumbele'}
        </CardTitle>
        <CardDescription>
          {language === 'en' ? 'Cases by priority level' : 'Kesi kwa kiwango cha kipaumbele'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {data.map((item) => (
            <div key={item.priority} className="flex items-center gap-2 text-sm">
              <div 
                className="h-3 w-3 rounded-full" 
                style={{ backgroundColor: item.fill }}
              />
              <span className="text-muted-foreground">
                {item.name}: {item.value} ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PriorityDistributionChart;
