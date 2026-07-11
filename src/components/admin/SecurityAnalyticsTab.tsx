// Security Analytics: counts by event_type and scope (menu_path proxy) over time, with CSV export.
// Filters: event_type, menu_path (substring on scope + details->>menu_path), date range.
// Admin-gated at both RLS (is_admin) and UI level (defence-in-depth).
import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, Activity, ShieldOff } from 'lucide-react';
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
const ALL_EVENT_TYPES = '__all__';

interface Row {
  created_at: string;
  event_type: string;
  scope: string | null;
  details: { phone_hash?: string; menu_path?: string } | null;
}

function toISODateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function bucketKey(iso: string, gran: Granularity) {
  const d = new Date(iso);
  if (gran === 'hour') return `${d.toISOString().slice(0, 13)}:00`;
  return d.toISOString().slice(0, 10);
}

export default function SecurityAnalyticsTab() {
  const { isAdmin, rolesLoaded, loading: authLoading } = useAuth();
  const now = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }, [now]);

  const [from, setFrom] = useState(toISODateInput(defaultFrom));
  const [to, setTo] = useState(toISODateInput(now));
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>(ALL_EVENT_TYPES);
  const [menuPathFilter, setMenuPathFilter] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const load = async () => {
    setLoading(true);
    setTruncated(false);
    try {
      const fromISO = new Date(`${from}T00:00:00.000Z`).toISOString();
      const toISO = new Date(`${to}T23:59:59.999Z`).toISOString();
      let q = supabase
        .from('security_events')
        .select('created_at, event_type, scope, details')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS);
      if (eventTypeFilter !== ALL_EVENT_TYPES) {
        q = q.eq('event_type', eventTypeFilter);
      }
      if (menuPathFilter.trim()) {
        const needle = menuPathFilter.trim().replace(/[%,]/g, '');
        // Substring match on scope OR details->>menu_path.
        q = q.or(`scope.ilike.%${needle}%,details->>menu_path.ilike.%${needle}%`);
      }
      const { data, error } = await q;
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
    if (isAdmin()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Distinct event types from currently loaded rows for the dropdown.
  const knownEventTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.event_type) s.add(r.event_type);
    return Array.from(s).sort();
  }, [rows]);

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
    const et = eventTypeFilter === ALL_EVENT_TYPES ? 'all' : eventTypeFilter;
    const mp = menuPathFilter.trim() ? `-${menuPathFilter.trim().replace(/[^a-z0-9]/gi, '')}` : '';
    a.download = `security-analytics-${from}_${to}-${granularity}-${et}${mp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const COLORS = [
    'hsl(var(--primary))',
    'hsl(var(--destructive))',
    'hsl(var(--secondary))',
    'hsl(var(--muted-foreground))',
    'hsl(var(--accent))',
  ];

  // Admin guard — RLS already blocks non-admins from selecting rows, but this
  // avoids a confusing empty-state screen for non-admins.
  if (authLoading || !rolesLoaded) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin()) {
    return (
      <Card className="p-6 flex items-start gap-3">
        <ShieldOff className="w-5 h-5 text-destructive mt-0.5" />
        <div>
          <h2 className="font-semibold text-foreground">Admin access required</h2>
          <p className="text-sm text-muted-foreground">
            Security analytics are restricted to administrators.
          </p>
        </div>
      </Card>
    );
  }

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
            <Input
              type="date"
              data-testid="sec-filter-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              data-testid="sec-filter-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Event type</label>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-48" data-testid="sec-filter-event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EVENT_TYPES}>All event types</SelectItem>
                {['rate_limit_429', 'validation_failed', 'auth_failed', 'suspicious'].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
                {knownEventTypes
                  .filter((t) => !['rate_limit_429', 'validation_failed', 'auth_failed', 'suspicious'].includes(t))
                  .map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Menu path / scope contains</label>
            <Input
              data-testid="sec-filter-menu-path"
              placeholder="e.g. donate, ussd, ai-chat"
              value={menuPathFilter}
              onChange={(e) => setMenuPathFilter(e.target.value)}
              className="w-56"
            />
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
          <Button onClick={load} disabled={loading} variant="outline" size="sm" data-testid="sec-refresh">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button
            onClick={exportCsv}
            disabled={rows.length === 0}
            size="sm"
            data-testid="sec-export-csv"
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <div className="ml-auto text-sm text-muted-foreground" data-testid="sec-row-count">
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
