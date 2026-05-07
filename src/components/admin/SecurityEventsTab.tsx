// Security Events Dashboard - tracks 429s, validation failures, suspicious patterns
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldAlert, AlertTriangle, RefreshCw, Activity } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type Window = '1h' | '24h' | '7d';
const WINDOW_MS: Record<Window, number> = { '1h': 3.6e6, '24h': 8.64e7, '7d': 6.048e8 };

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

interface SummaryRow { event_type: string; scope: string; count: number }
interface TopIpRow { ip_address: string; total: number; rate_limit_hits: number; validation_failures: number }

export default function SecurityEventsTab() {
  const [windowSel, setWindowSel] = useState<Window>('24h');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [topIps, setTopIps] = useState<TopIpRow[]>([]);
  const [recent, setRecent] = useState<SecurityEventRow[]>([]);

  const since = useMemo(
    () => new Date(Date.now() - WINDOW_MS[windowSel]).toISOString(),
    [windowSel],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [s, t, r] = await Promise.all([
        supabase.rpc('security_events_summary', { _since: since } as any),
        supabase.rpc('security_top_ips', { _since: since, _limit: 15 } as any),
        supabase
          .from('security_events')
          .select('*')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
      if (!s.error && s.data) setSummary(s.data as any);
      if (!t.error && t.data) setTopIps(t.data as any);
      if (!r.error && r.data) setRecent(r.data as any);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [since]);

  const totals = useMemo(() => {
    const acc = { total: 0, rate429: 0, validation: 0, suspicious: 0 };
    for (const row of summary) {
      acc.total += Number(row.count);
      if (row.event_type === 'rate_limit_429') acc.rate429 += Number(row.count);
      if (row.event_type === 'validation_failed') acc.validation += Number(row.count);
      if (row.event_type === 'suspicious') acc.suspicious += Number(row.count);
    }
    return acc;
  }, [summary]);

  const chartData = useMemo(() => {
    const map = new Map<string, { scope: string; rate429: number; validation: number; other: number }>();
    for (const r of summary) {
      const key = r.scope || '(unknown)';
      const cur = map.get(key) || { scope: key, rate429: 0, validation: 0, other: 0 };
      const c = Number(r.count);
      if (r.event_type === 'rate_limit_429') cur.rate429 += c;
      else if (r.event_type === 'validation_failed') cur.validation += c;
      else cur.other += c;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.rate429 + b.validation + b.other) - (a.rate429 + a.validation + a.other),
    ).slice(0, 10);
  }, [summary]);

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
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

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
        <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Top suspicious IPs</h3>
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
                <tr key={row.ip_address} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono">{row.ip_address}</td>
                  <td className="py-2 pr-3">{row.total}</td>
                  <td className="py-2 pr-3">{row.rate_limit_hits}</td>
                  <td className="py-2 pr-3">{row.validation_failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Recent events ({recent.length})</h3>
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
                {recent.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No events.</td></tr>
                )}
                {recent.map((ev) => (
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
