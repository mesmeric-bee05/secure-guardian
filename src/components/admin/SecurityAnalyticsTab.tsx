// Security Analytics: counts by event_type and scope (menu_path proxy) over time, with CSV export.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, Activity } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';

type Granularity = 'hour' | 'day';
const MAX_ROWS = 5000;

interface Row {
  created_at: string;
  event_type: string;
  scope: string | null;
  details: { phone_hash?: string } | null;
}

function toISODateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function bucketKey(iso: string, gran: Granularity) {
  const d = new Date(iso);
  if (gran === 'hour') {
    return `${d.toISOString().slice(0, 13)}:00`;
  }
  return d.toISOString().slice(0, 10);
}

export default function SecurityAnalyticsTab() {
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }, [now]);

  const [from, setFrom] = useState(toISODateInput(defaultFrom));
  const [to, setTo] = useState(toISODateInput(now));
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const load = async () => {
    setLoading(true);
    setTruncated(false);
    try {
      const fromISO = new Date(`${from}T00:00:00.000Z`).toISOString();
      const toISO = new Date(`${to}T23:59:59.999Z`).toISOString();
      const { data, error } = await supabase
        .from('security_events')
        .select('created_at, event_type, scope, details')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS);
      if (error) throw error;
      setRows((data ?? []) as Row[]);
      if ((data?.length ?? 0) >= MAX_ROWS) setTruncated(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load security events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bucketed stacked series
  const { series, eventTypes } = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();
    const types = new Set<string>();
    for (const r of rows) {
      const b = bucketKey(r.created_at, granularity);
      const t = r.event_type || 'unknown';
      types.add(t);
      const row = buckets.get(b) ?? {};
      row[t] = (row[t] ?? 0) + 1;
      buckets.set(b, row);
    }
    const series = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, counts]) => ({ bucket, ...counts }));
    return { series, eventTypes: Array.from(types).sort() };
  }, [rows, granularity]);

  const topScopes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const s = r.scope || '(unknown)';
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([scope, count]) => ({ scope, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows]);

  const topPhones = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const h = r.details?.phone_hash;
      if (!h) continue;
      m.set(h, (m.get(h) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([hash, count]) => ({ hash, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rows]);

  const exportCsv = () => {
    const header = ['bucket', 'event_type', 'count'];
    const lines: string[][] = [header];
    for (const s of series) {
      for (const t of eventTypes) {
        const n = Number((s as Record<string, unknown>)[t] ?? 0);
        if (n > 0) lines.push([s.bucket, t, String(n)]);
      }
    }
    const csv = lines
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-analytics-${from}_${to}-${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Palette from semantic tokens
  const COLORS = [
    'hsl(var(--primary))',
    'hsl(var(--destructive))',
    'hsl(var(--secondary))',
    'hsl(var(--muted-foreground))',
    'hsl(var(--accent))',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Security Analytics</h2>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Bucket</label>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">Hour</SelectItem>
                <SelectItem value="day">Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button onClick={exportCsv} disabled={rows.length === 0} size="sm">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            {rows.length} rows{truncated && ' (capped — narrow the date range for full data)'}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Events over time (stacked by event_type)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="bucket" className="text-xs" />
              <YAxis className="text-xs" allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend />
              {eventTypes.map((t, i) => (
                <Bar key={t} dataKey={t} stackId="a" fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Top scopes (menu_path)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topScopes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" allowDecimals={false} />
                <YAxis dataKey="scope" type="category" width={130} className="text-xs" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Top phone hashes (hashed, PII-safe)</h3>
          {topPhones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hashed phone data in range.</p>
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-1">phone_hash</th><th className="py-1 text-right">events</th></tr>
                </thead>
                <tbody>
                  {topPhones.map((p) => (
                    <tr key={p.hash} className="border-t border-border">
                      <td className="py-1 font-mono text-xs">{p.hash.slice(0, 16)}…</td>
                      <td className="py-1 text-right">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
