import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, CheckCircle2, Clock, Activity, Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Case = {
  id: string;
  assigned_chw_id: string | null;
  status: string | null;
  priority: string | null;
  created_at: string;
  resolved_at?: string | null;
  location_address?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  active: '#3b82f6',
  resolved: '#10b981',
  cancelled: '#6b7280',
};

export default function CHWAnalyticsTab() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<Case[]>([]);
  const [chwCount, setChwCount] = useState(0);
  const [chwNames, setChwNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: caseData, error } = await supabase
        .from('emergency_cases')
        .select('id, assigned_chw_id, status, priority, created_at, resolved_at, region')
        .not('assigned_chw_id', 'is', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) toast.error(error.message);
      const rows = (caseData ?? []) as Case[];
      setCases(rows);

      const chwIds = Array.from(new Set(rows.map((c) => c.assigned_chw_id).filter(Boolean))) as string[];
      if (chwIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', chwIds);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p) => (map[p.user_id] = p.full_name || p.user_id.slice(0, 8)));
        setChwNames(map);
      }

      const { count } = await supabase
        .from('chw_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      setChwCount(count ?? 0);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const total = cases.length;
    const resolvedThisWeek = cases.filter(
      (c) => c.status === 'resolved' && c.resolved_at && new Date(c.resolved_at).getTime() >= weekAgo,
    ).length;
    const responseTimes = cases
      .filter((c) => c.resolved_at)
      .map((c) => (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 60000);
    const avgMin = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    return { total, resolvedThisWeek, avgMin };
  }, [cases]);

  const casesPerChw = useMemo(() => {
    const map: Record<string, number> = {};
    cases.forEach((c) => {
      if (!c.assigned_chw_id) return;
      map[c.assigned_chw_id] = (map[c.assigned_chw_id] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([id, count]) => ({ name: chwNames[id] || id.slice(0, 8), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [cases, chwNames]);

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    cases.forEach((c) => {
      const k = c.status || 'unknown';
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [cases]);

  const byRegion = useMemo(() => {
    const map: Record<string, number> = {};
    cases.forEach((c) => {
      const k = c.region || 'Unknown';
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [cases]);

  const downloadCsv = () => {
    const header = 'case_id,chw_id,chw_name,status,priority,region,created_at,resolved_at\n';
    const rows = cases
      .map((c) =>
        [
          c.id,
          c.assigned_chw_id ?? '',
          (chwNames[c.assigned_chw_id ?? ''] ?? '').replace(/,/g, ' '),
          c.status ?? '',
          c.priority ?? '',
          (c.region ?? '').replace(/,/g, ' '),
          c.created_at,
          c.resolved_at ?? '',
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chw-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            CHW Case Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Last 90 days of CHW-assigned emergency cases.
          </p>
        </div>
        <Button variant="outline" onClick={downloadCsv} disabled={!cases.length}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-4 h-4" />} label="Active CHWs" value={chwCount} />
        <StatCard icon={<Activity className="w-4 h-4" />} label="Assigned cases" value={stats.total} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Resolved this week" value={stats.resolvedThisWeek} />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Avg resolve (min)" value={stats.avgMin} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Cases per CHW (top 10)</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            {casesPerChw.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No CHW-assigned cases yet.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={casesPerChw}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status distribution</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            {byStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No data.</p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={90} label>
                    {byStatus.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Cases by county</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            {byRegion.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No region data.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={byRegion} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
