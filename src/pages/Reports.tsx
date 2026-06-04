import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, TrendingUp, Users, Clock, Activity, MapPin, MessageSquare, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts';
import { CSVExportButton } from '@/components/reports/CSVExportButton';
import { AdminReportExportButton } from '@/components/reports/AdminReportExportButton';
import { DateRangeFilter, DateRange } from '@/components/reports/DateRangeFilter';
import { subDays, eachDayOfInterval, format, isWithinInterval, startOfDay, endOfDay, differenceInHours } from 'date-fns';

interface CaseData {
  id: string;
  symptoms: string;
  priority: string | null;
  status: string | null;
  created_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
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
  const [allCases, setAllCases] = useState<CaseData[]>([]);
  const [chwNames, setChwNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [adminMetrics, setAdminMetrics] = useState<{ smsTotal: number; smsDelivered: number; smsFailed: number; securityEvents24h: number } | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  useEffect(() => {
    if (!embedded && !authLoading && !isChw() && !isAdmin()) {
      navigate('/');
    }
  }, [embedded, authLoading, isChw, isAdmin, navigate]);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('emergency_cases')
        .select('id, symptoms, priority, status, created_at, resolved_at, updated_at, assigned_chw_id, location_address')
        .order('created_at', { ascending: false });
      
      const cases = data || [];
      setAllCases(cases);

      // Fetch CHW profile names
      const chwIds = [...new Set(cases.filter(c => c.assigned_chw_id).map(c => c.assigned_chw_id!))];
      if (chwIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', chwIds);
        
        const names: Record<string, string> = {};
        profiles?.forEach(p => { names[p.user_id] = p.full_name; });
        setChwNames(names);
      }

      setLoading(false);
    }
    fetchData();
  }, []);

  // Admin-only: SMS delivery + security event aggregates
  useEffect(() => {
    if (authLoading || !isAdmin()) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: sms }, { count: secCount }] = await Promise.all([
        supabase.from('sms_logs').select('status').gte('created_at', since),
        supabase.from('security_events').select('*', { count: 'exact', head: true }).gte('created_at', since),
      ]);
      if (cancelled) return;
      const smsTotal = sms?.length ?? 0;
      const smsDelivered = sms?.filter((r: { status: string | null }) => r.status === 'delivered' || r.status === 'sent').length ?? 0;
      const smsFailed = sms?.filter((r: { status: string | null }) => r.status === 'failed').length ?? 0;
      setAdminMetrics({ smsTotal, smsDelivered, smsFailed, securityEvents24h: secCount ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAdmin]);

  const cases = useMemo(() => {
    return allCases.filter(c => {
      if (!c.created_at) return false;
      const caseDate = new Date(c.created_at);
      return isWithinInterval(caseDate, {
        start: startOfDay(dateRange.from),
        end: endOfDay(dateRange.to),
      });
    });
  }, [allCases, dateRange]);

  const trendData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const step = Math.max(1, Math.floor(days.length / 60));
    const sampledDays = days.filter((_, i) => i % step === 0);
    
    return sampledDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return {
        date: format(day, 'MMM d'),
        cases: cases.filter(c => c.created_at?.startsWith(dateStr)).length,
        resolved: cases.filter(c => c.resolved_at?.startsWith(dateStr)).length,
      };
    });
  }, [cases, dateRange]);

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

  // Response time trend data (avg hours to resolution per day)
  const responseTimeTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const step = Math.max(1, Math.floor(days.length / 30));
    const sampledDays = days.filter((_, i) => i % step === 0);

    return sampledDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const resolved = cases.filter(c =>
        c.resolved_at?.startsWith(dateStr) && c.created_at
      );
      const avgHrs = resolved.length > 0
        ? Math.round(resolved.reduce((sum, c) =>
            sum + differenceInHours(new Date(c.resolved_at!), new Date(c.created_at!)), 0
          ) / resolved.length * 10) / 10
        : null;

      return { date: format(day, 'MMM d'), avgHours: avgHrs };
    }).filter(d => d.avgHours !== null);
  }, [cases, dateRange]);

  // Regional breakdown
  const regionalData = useMemo(() => {
    const regionMap: Record<string, number> = {};
    cases.forEach(c => {
      const addr = c.location_address;
      if (!addr) return;
      // Extract region: use last meaningful part of address or full short address
      const parts = addr.split(',').map(p => p.trim());
      const region = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
      if (region) {
        regionMap[region] = (regionMap[region] || 0) + 1;
      }
    });
    return Object.entries(regionMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.slice(0, 25), count }));
  }, [cases]);

  const chwPerformance = useMemo(() => {
    const map: Record<string, { count: number; resolved: number; totalHours: number }> = {};
    cases.forEach(c => {
      if (!c.assigned_chw_id) return;
      if (!map[c.assigned_chw_id]) map[c.assigned_chw_id] = { count: 0, resolved: 0, totalHours: 0 };
      map[c.assigned_chw_id].count++;
      if (c.status === 'resolved') {
        map[c.assigned_chw_id].resolved++;
        if (c.created_at && c.resolved_at) {
          map[c.assigned_chw_id].totalHours += differenceInHours(
            new Date(c.resolved_at), new Date(c.created_at)
          );
        }
      }
    });
    return Object.entries(map)
      .map(([id, data]) => ({
        id,
        name: chwNames[id] || id.slice(0, 8) + '…',
        cases: data.count,
        resolved: data.resolved,
        rate: data.count ? Math.round(data.resolved / data.count * 100) : 0,
        avgHours: data.resolved ? Math.round(data.totalHours / data.resolved * 10) / 10 : '-',
      }))
      .sort((a, b) => b.cases - a.cases)
      .slice(0, 10);
  }, [cases, chwNames]);

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
        {/* Filters + Export */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
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

        {/* Admin-only ops metrics (24h) */}
        {adminMetrics && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Operations (last 24h) — Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs">SMS sent</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{adminMetrics.smsTotal}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">Delivery rate</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {adminMetrics.smsTotal ? Math.round((adminMetrics.smsDelivered / adminMetrics.smsTotal) * 100) : 0}%
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <ShieldAlert className="h-4 w-4" />
                    <span className="text-xs">SMS failures</span>
                  </div>
                  <p className="text-2xl font-bold text-destructive">{adminMetrics.smsFailed}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <ShieldAlert className="h-4 w-4" />
                    <span className="text-xs">Security events</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{adminMetrics.securityEvents24h}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trends */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Case Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="cases" stroke="hsl(217, 91%, 50%)" strokeWidth={2} name="New Cases" dot={false} />
                  <Line type="monotone" dataKey="resolved" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Resolved" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Trend */}
        {responseTimeTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Response Time Trend (avg hours to resolution)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={responseTimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} unit="h" />
                    <Tooltip formatter={(val: number) => [`${val}h`, 'Avg Resolution']} />
                    <Area type="monotone" dataKey="avgHours" stroke="hsl(280, 70%, 50%)" fill="hsl(280, 70%, 50%)" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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

        {/* Regional Breakdown */}
        {regionalData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Cases by Region
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionalData} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(180, 60%, 45%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

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
                      <th className="text-left py-2 text-muted-foreground font-medium">Health Worker</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Cases</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Resolved</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Rate</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Avg Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chwPerformance.map((chw) => (
                      <tr key={chw.id} className="border-b border-border/50">
                        <td className="py-2 text-foreground">{chw.name}</td>
                        <td className="py-2 text-right text-foreground">{chw.cases}</td>
                        <td className="py-2 text-right text-foreground">{chw.resolved}</td>
                        <td className="py-2 text-right font-semibold text-foreground">{chw.rate}%</td>
                        <td className="py-2 text-right text-muted-foreground">{chw.avgHours}</td>
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
