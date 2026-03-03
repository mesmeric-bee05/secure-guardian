import { useState } from 'react';
import { format, subDays, startOfMonth, startOfYear } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'This month', value: 'month' },
  { label: 'This year', value: 'year' },
  { label: 'All time', value: 'all' },
  { label: 'Custom', value: 'custom' },
];

function getPresetRange(preset: string): DateRange {
  const now = new Date();
  switch (preset) {
    case '7d': return { from: subDays(now, 7), to: now };
    case '30d': return { from: subDays(now, 30), to: now };
    case '90d': return { from: subDays(now, 90), to: now };
    case 'month': return { from: startOfMonth(now), to: now };
    case 'year': return { from: startOfYear(now), to: now };
    case 'all': return { from: new Date('2020-01-01'), to: now };
    default: return { from: subDays(now, 30), to: now };
  }
}

export function DateRangeFilter({ dateRange, onDateRangeChange }: DateRangeFilterProps) {
  const [preset, setPreset] = useState('30d');

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value !== 'custom') {
      onDateRangeChange(getPresetRange(value));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[140px] h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === 'custom' && (
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 text-xs justify-start', !dateRange.from && 'text-muted-foreground')}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateRange.from ? format(dateRange.from, 'MMM d, yyyy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => date && onDateRangeChange({ ...dateRange, from: date })}
                disabled={(date) => date > new Date()}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">–</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-9 text-xs justify-start', !dateRange.to && 'text-muted-foreground')}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateRange.to ? format(dateRange.to, 'MMM d, yyyy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.to}
                onSelect={(date) => date && onDateRangeChange({ ...dateRange, to: date })}
                disabled={(date) => date > new Date() || date < dateRange.from}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
