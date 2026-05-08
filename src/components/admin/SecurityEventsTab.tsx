// Security Events Dashboard - tracks 429s, validation failures, suspicious patterns
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldAlert, AlertTriangle, RefreshCw, Activity, Download, X } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { toast } from 'sonner';

type Window = '1h' | '24h' | '7d';
const WINDOW_MS: Record<Window, number> = { '1h': 3.6e6, '24h': 8.64e7, '7d': 6.048e8 };

const EVENT_TYPES = ['rate_limit_429', 'validation_failed', 'suspicious', 'auth_failed'] as const;
const SEVERITIES = ['info', 'warn', 'critical'] as const;

interface SecurityEventRow {
  id: string;
  created_at: string;
  event_type: string;
  scope: string | null;
  ip_address: string | null;
  user_id: string | null;
  details: any;
  severity: string;
}

interface Filters {
  eventType: string;
  severity: string;
  scope: string;
  ip: string;
  userId: string;
}

const EMPTY_FILTERS: Filters = { eventType: 'all', severity: 'all', scope: '', ip: '', userId: '' };

export default function SecurityEventsTab() {
  const [windowSel, setWindowSel] = useState<Window>('24h');
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const since = useMemo(
    () => new Date(Date.now() - WINDOW_MS[windowSel]).toISOString(),
    [windowSel],
  );

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('security_events')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (filters.eventType !== 'all') q = q.eq('event_type', filters.eventType);
      if (filters.severity !== 'all') q = q.eq('severity', filters.severity);
      if (filters.scope.trim()) q = q.ilike('scope', `%${filters.scope.trim()}%`);
      if (filters.ip.trim()) q = q.ilike('ip_address', `%${filters.ip.trim()}%`);
      if (filters.userId.trim()) q = q.eq('user_id', filters.userId.trim());

      const { data, error } = await q;
      if (error) {
        toast.error(`Failed to load events: ${error.message}`);
      } else {
        setEvents((data ?? []) as SecurityEventRow[]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Debounce reload on filter/window change
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, filters.eventType, filters.severity, filters.scope, filters.ip, filters.userId]);

  const totals = useMemo(() => {
    const acc = { total: events.length, rate429: 0, validation: 0, suspicious: 0 };
    for (const e of events) {
      if (e.event_type === 'rate_limit_429') acc.rate429++;
      else if (e.event_type === 'validation_failed') acc.validation++;
      else if (e.event_type === 'suspicious') acc.suspicious++;
    }
    return acc;
  }, [events]);

  const chartData = useMemo(() => {
    const map = new Map<string, { scope: string; rate429: number; validation: number; other: number }>();
    for (const e of events) {
      const key = e.scope || '(unknown)';
      const cur = map.get(key) || { scope: key, rate429: 0, validation: 0, other: 0 };
      if (e.event_type === 'rate_limit_429') cur.rate429++;
      else if (e.event_type === 'validation_failed') cur.validation++;
      else cur.other++;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => (b.rate429 + b.validation + b.other) - (a.rate429 + a.validation + a.other))
      .slice(0, 10);
  }, [events]);

  const topIps = useMemo(() => {
    const map = new Map<string, { ip: string; total: number; r429: number; vfail: number }>();
    for (const e of events) {
      if (!e.ip_address) continue;
      const cur = map.get(e.ip_address) || { ip: e.ip_address, total: 0, r429: 0, vfail: 0 };
      cur.total++;
      if (e.event_type === 'rate_limit_429') cur.r429++;
      if (e.event_type === 'validation_failed') cur.vfail++;
      map.set(e.ip_address, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [events]);

  const exportCsv = () => {
    if (events.length === 0) { toast.error('No events to export'); return; }
    const headers = ['created_at', 'event_type', 'scope', 'severity', 'ip_address', 'user_id', 'details'];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = events.map((e) => [
      e.created_at,
      e.event_type,
      e.scope ?? '',
      e.severity,
      e.ip_address ?? '',
      e.user_id ?? '',
      e.details ? JSON.stringify(e.details) : '',
    ].map((v) => escape(String(v))).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-events-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${events.length} events`);
  };

  const hasActiveFilters =
    filters.eventType !== 'all' || filters.severity !== 'all' ||
    !!filters.scope || !!filters.ip || !!filters.userId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Security Events</h2>
            <p className="text-sm text-muted-foreground">Rate-limit 429s, validation failures, and suspicious patterns.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['1h', '24h', '7d'] as Window[]).map((w) => (
            <Button key={w} size="sm" variant={windowSel === w ? 'default' : 'outline'} onClick={() => setWindowSel(w)}>
              {w}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || events.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Event type</label>
            <Select value={filters.eventType} onValueChange={(v) => setFilters((f) => ({ ...f, eventType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Severity</label>
            <Select value={filters.severity} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Scope contains</label>
            <Input value={filters.scope} placeholder="e.g. ai-chat" onChange={(e) => setFilters((f) => ({ ...f, scope: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">IP contains</label>
            <Input value={filters.ip} placeholder="e.g. 10.0.0" onChange={(e) => setFilters((f) => ({ ...f, ip: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">User ID</label>
            <Input value={filters.userId} placeholder="UUID" onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} />
          </div>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X className="h-3 w-3 mr-1" /> Clear filters
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total events" value={totals.total} />
        <StatCard label="429 (rate-limited)" value={totals.rate429} accent="warn" />
        <StatCard label="Validation failures" value={totals.validation} accent="warn" />
        <StatCard label="Suspicious" value={totals.suspicious} accent="danger" />
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /> Events by endpoint</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No events in this window.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="scope" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="rate429" stackId="a" fill="hsl(var(--primary))" name="429" />
                <Bar dataKey="validation" stackId="a" fill="hsl(var(--destructive))" name="Validation" />
                <Bar dataKey="other" stackId="a" fill="hsl(var(--muted-foreground))" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Top IPs (filtered)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">429s</th>
                <th className="py-2 pr-3">Validation fails</th>
              </tr>
            </thead>
            <tbody>
              {topIps.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No data.</td></tr>
              )}
              {topIps.map((row) => (
                <tr key={row.ip} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono">{row.ip}</td>
                  <td className="py-2 pr-3">{row.total}</td>
                  <td className="py-2 pr-3">{row.r429}</td>
                  <td className="py-2 pr-3">{row.vfail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Events ({events.length})</h3>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Scope</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No events.</td></tr>
                )}
                {events.slice(0, 200).map((ev) => (
                  <tr key={ev.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(ev.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={ev.event_type === 'rate_limit_429' ? 'default' : 'destructive'}>
                        {ev.event_type}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{ev.scope || '—'}</td>
                    <td className="py-2 pr-3 font-mono">{ev.ip_address || '—'}</td>
                    <td className="py-2 pr-3">{ev.severity}</td>
                    <td className="py-2 pr-3 max-w-[280px] truncate font-mono text-muted-foreground">
                      {ev.details ? JSON.stringify(ev.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length > 200 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Showing 200 of {events.length}. Use CSV export for the full set.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'warn' | 'danger' }) {
  const tone = accent === 'danger' ? 'text-destructive' : accent === 'warn' ? 'text-orange-500' : 'text-foreground';
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value.toLocaleString()}</p>
    </Card>
  );
}
