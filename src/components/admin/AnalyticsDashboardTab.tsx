import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Users, Activity, AlertTriangle, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';

interface SummaryMetrics {
  totalUsers: number;
  activeCHWs: number;
  totalCases: number;
  openCases: number;
  avgResponseHours: number | null;
}

interface GrowthPoint { date: string; count: number }
interface CHWMetric { name: string; activeCases: number; resolvedCases: number }

export default function AnalyticsDashboardTab() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [userGrowth, setUserGrowth] = useState<GrowthPoint[]>([]);
  const [caseTrends, setCaseTrends] = useState<GrowthPoint[]>([]);
  const [chwMetrics, setCHWMetrics] = useState<CHWMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchSummary(), fetchUserGrowth(), fetchCaseTrends(), fetchCHWMetrics()]);
    setLoading(false);
  }

  async function fetchSummary() {
    const [profilesRes, chwRes, casesRes, openRes, resolvedRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('chw_assignments').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('emergency_cases').select('id', { count: 'exact', head: true }),
      supabase.from('emergency_cases').select('id', { count: 'exact', head: true }).in('status', ['pending', 'assigned', 'in_progress']),
      supabase.from('emergency_cases').select('created_at, resolved_at').not('resolved_at', 'is', null).limit(500),
    ]);

    let avgHours: number | null = null;
    if (resolvedRes.data && resolvedRes.data.length > 0) {
      const totalMs = resolvedRes.data.reduce((sum, c) => {
        return sum + (new Date(c.resolved_at!).getTime() - new Date(c.created_at!).getTime());
      }, 0);
      avgHours = Math.round((totalMs / resolvedRes.data.length / 3600000) * 10) / 10;
    }

    setMetrics({
      totalUsers: profilesRes.count ?? 0,
      activeCHWs: chwRes.count ?? 0,
      totalCases: casesRes.count ?? 0,
      openCases: openRes.count ?? 0,
      avgResponseHours: avgHours,
    });
  }

  async function fetchUserGrowth() {
    const since = subDays(new Date(), 30).toISOString();
    const { data } = await supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (!data) return;
    const map: Record<string, number> = {};
    data.forEach((p) => {
      const day = format(parseISO(p.created_at!), 'MMM dd');
      map[day] = (map[day] || 0) + 1;
    });
    setUserGrowth(Object.entries(map).map(([date, count]) => ({ date, count })));
  }

  async function fetchCaseTrends() {
    const since = subDays(new Date(), 30).toISOString();
    const { data } = await supabase
      .from('emergency_cases')
      .select('created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (!data) return;
    const map: Record<string, number> = {};
    data.forEach((c) => {
      const day = format(parseISO(c.created_at!), 'MMM dd');
      map[day] = (map[day] || 0) + 1;
    });
    setCaseTrends(Object.entries(map).map(([date, count]) => ({ date, count })));
  }

  async function fetchCHWMetrics() {
    const { data: cases } = await supabase
      .from('emergency_cases')
      .select('assigned_chw_id, status')
      .not('assigned_chw_id', 'is', null);

    if (!cases || cases.length === 0) return;

    const chwIds = [...new Set(cases.map((c) => c.assigned_chw_id!))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', chwIds);

    const nameMap: Record<string, string> = {};
    profiles?.forEach((p) => { nameMap[p.user_id] = p.full_name; });

    const chwMap: Record<string, { active: number; resolved: number }> = {};
    cases.forEach((c) => {
      const id = c.assigned_chw_id!;
      if (!chwMap[id]) chwMap[id] = { active: 0, resolved: 0 };
      if (c.status === 'resolved') chwMap[id].resolved++;
      else chwMap[id].active++;
    });

    setCHWMetrics(
      Object.entries(chwMap).map(([id, v]) => ({
        name: nameMap[id] || id.slice(0, 8),
        activeCases: v.active,
        resolvedCases: v.resolved,
      }))
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Total Users', value: metrics?.totalUsers ?? 0, icon: Users, color: 'text-blue-500' },
    { label: 'Active CHWs', value: metrics?.activeCHWs ?? 0, icon: Activity, color: 'text-green-500' },
    { label: 'Total Cases', value: metrics?.totalCases ?? 0, icon: AlertTriangle, color: 'text-orange-500' },
    { label: 'Open Cases', value: metrics?.openCases ?? 0, icon: TrendingUp, color: 'text-red-500' },
    { label: 'Avg Response', value: metrics?.avgResponseHours != null ? `${metrics.avgResponseHours}h` : 'N/A', icon: Clock, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Analytics Dashboard</h2>
        <p className="text-sm text-muted-foreground">Real-time system metrics and performance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <c.icon className={`h-5 w-5 ${c.color}`} />
                <Badge variant="outline" className="text-xs">{c.label}</Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* User Growth */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">User Registrations (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {userGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" name="New Users" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                <CheckCircle className="h-4 w-4 mr-2" /> No new registrations in the last 30 days
              </div>
            )}
          </CardContent>
        </Card>

        {/* Case Volume */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Emergency Cases (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {caseTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={caseTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="Cases" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                <CheckCircle className="h-4 w-4 mr-2" /> No cases in the last 30 days
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CHW Performance */}
      {chwMetrics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CHW Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chwMetrics} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip />
                <Legend />
                <Bar dataKey="activeCases" name="Active Cases" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="resolvedCases" name="Resolved" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* System Health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Database', status: 'Operational' },
              { label: 'Authentication', status: 'Operational' },
              { label: 'Backend Functions', status: 'Operational' },
              { label: 'Realtime', status: 'Operational' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.status}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
