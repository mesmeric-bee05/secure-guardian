import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, TrendingUp, Users, Clock, Activity, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { CSVExportButton } from '@/components/reports/CSVExportButton';

interface CaseData {
  id: string;
  symptoms: string;
  priority: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  assigned_chw_id: string | null;
  location_address: string | null;
}

const COLORS = [
  'hsl(217, 91%, 50%)',
  'hsl(180, 60%, 45%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(280, 70%, 50%)',
];

interface ReportsProps {
  embedded?: boolean;
}

export default function Reports({ embedded = false }: ReportsProps) {
  const navigate = useNavigate();
  const { isChw, isAdmin, loading: authLoading } = useAuth();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!embedded && !authLoading && !isChw() && !isAdmin()) {
      navigate('/');
    }
  }, [embedded, authLoading, isChw, isAdmin, navigate]);

  useEffect(() => {
    async function fetchCases() {
      const { data } = await supabase
        .from('emergency_cases')
        .select('id, symptoms, priority, status, created_at, resolved_at, assigned_chw_id, location_address')
        .order('created_at', { ascending: false });
      setCases(data || []);
      setLoading(false);
    }
    fetchCases();
  }, []);

  const trendData = useMemo(() => {
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split('T')[0];
    });
    return last30.map(date => ({
      date: date.slice(5),
      cases: cases.filter(c => c.created_at?.startsWith(date)).length,
      resolved: cases.filter(c => c.resolved_at?.startsWith(date)).length,
    }));
  }, [cases]);

  const resolutionData = useMemo(() => {
    const statuses = ['pending', 'assigned', 'in_progress', 'resolved', 'escalated'];
    return statuses.map(s => ({
      name: s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: cases.filter(c => c.status === s).length,
    })).filter(d => d.value > 0);
  }, [cases]);

  const priorityData = useMemo(() => {
    const priorities = ['low', 'medium', 'high', 'critical'];
    return priorities.map(p => ({
      name: p.charAt(0).toUpperCase() + p.slice(1),
      count: cases.filter(c => c.priority === p).length,
    }));
  }, [cases]);

  const topSymptoms = useMemo(() => {
    const freq: Record<string, number> = {};
    cases.forEach(c => {
      const key = c.symptoms.toLowerCase().trim().slice(0, 40);
      freq[key] = (freq[key] || 0) + 1;
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [cases]);

  const avgResolutionHours = useMemo(() => {
    const resolved = cases.filter(c => c.resolved_at && c.created_at);
    if (!resolved.length) return 0;
    const total = resolved.reduce((sum, c) => {
      return sum + (new Date(c.resolved_at!).getTime() - new Date(c.created_at!).getTime());
    }, 0);
    return Math.round(total / resolved.length / 3600000 * 10) / 10;
  }, [cases]);

  const chwPerformance = useMemo(() => {
    const map: Record<string, { count: number; resolved: number }> = {};
    cases.forEach(c => {
      if (!c.assigned_chw_id) return;
      if (!map[c.assigned_chw_id]) map[c.assigned_chw_id] = { count: 0, resolved: 0 };
      map[c.assigned_chw_id].count++;
      if (c.status === 'resolved') map[c.assigned_chw_id].resolved++;
    });
    return Object.entries(map)
      .map(([id, data]) => ({
        id: id.slice(0, 8),
        cases: data.count,
        resolved: data.resolved,
        rate: data.count ? Math.round(data.resolved / data.count * 100) : 0,
      }))
      .sort((a, b) => b.cases - a.cases)
      .slice(0, 10);
  }, [cases]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const resolvedCount = cases.filter(c => c.status === 'resolved').length;
  const resolutionRate = cases.length ? Math.round(resolvedCount / cases.length * 100) : 0;

  return (
    <div className={embedded ? '' : 'min-h-screen bg-background'}>
      {!embedded && (
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex items-center gap-3 px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Reports & Analytics</h1>
                <p className="text-xs text-muted-foreground">Health data insights</p>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={`${embedded ? 'space-y-6' : 'p-4 lg:p-6 space-y-6 max-w-7xl mx-auto'}`}>
        {/* Export + Summary */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {embedded ? '' : 'Overview'}
          </h2>
          <CSVExportButton cases={cases} />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Total Cases</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{cases.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">Resolution Rate</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{resolutionRate}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Avg Resolution</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{avgResolutionHours}h</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs">Active CHWs</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {new Set(cases.filter(c => c.assigned_chw_id).map(c => c.assigned_chw_id)).size}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 30-Day Trends */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">30-Day Case Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="cases" stroke="hsl(217, 91%, 50%)" strokeWidth={2} name="New Cases" />
                  <Line type="monotone" dataKey="resolved" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Resolved" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Status Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Case Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={resolutionData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {resolutionData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Priority Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cases by Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {priorityData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Symptoms */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Reported Symptoms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSymptoms} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(217, 91%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* CHW Performance */}
        {chwPerformance.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">CHW Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">CHW ID</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Cases</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Resolved</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chwPerformance.map((chw) => (
                      <tr key={chw.id} className="border-b border-border/50">
                        <td className="py-2 font-mono text-foreground">{chw.id}…</td>
                        <td className="py-2 text-right text-foreground">{chw.cases}</td>
                        <td className="py-2 text-right text-foreground">{chw.resolved}</td>
                        <td className="py-2 text-right font-semibold text-foreground">{chw.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
