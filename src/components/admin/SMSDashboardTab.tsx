import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  MessageSquare, 
  Loader2, 
  Eye,
  RefreshCw,
  Send,
  Inbox,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface SMSLog {
  id: string;
  phone_number: string;
  message: string;
  status: string | null;
  direction: string | null;
  delivery_status: string | null;
  failure_reason: string | null;
  created_at: string | null;
  delivered_at: string | null;
  status_updated_at: string | null;
  user_id: string | null;
  provider_message_id: string | null;
}

const statusColors: Record<string, string> = {
  sent: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  delivered: 'bg-green-500/10 text-green-600 border-green-500/30',
  failed: 'bg-red-500/10 text-red-600 border-red-500/30',
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b'];

export function SMSDashboardTab() {
  const [logs, setLogs] = useState<SMSLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<SMSLog | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
    deliveryRate: 0,
  });

  // Chart data
  const [chartData, setChartData] = useState<{ date: string; sent: number; delivered: number }[]>([]);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      setLogs(data || []);

      // Calculate stats
      const total = data?.length || 0;
      const delivered = data?.filter(l => l.delivery_status === 'delivered' || l.status === 'delivered').length || 0;
      const failed = data?.filter(l => l.delivery_status === 'failed' || l.status === 'failed').length || 0;
      const pending = data?.filter(l => l.status === 'pending' || l.status === 'sent').length || 0;

      setStats({
        total,
        delivered,
        failed,
        pending,
        deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
      });

      // Calculate chart data (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split('T')[0];
      });

      const chartDataMap: Record<string, { sent: number; delivered: number }> = {};
      last7Days.forEach(date => {
        chartDataMap[date] = { sent: 0, delivered: 0 };
      });

      data?.forEach(log => {
        if (log.created_at) {
          const date = log.created_at.split('T')[0];
          if (chartDataMap[date]) {
            chartDataMap[date].sent++;
            if (log.delivery_status === 'delivered' || log.status === 'delivered') {
              chartDataMap[date].delivered++;
            }
          }
        }
      });

      setChartData(last7Days.map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        sent: chartDataMap[date].sent,
        delivered: chartDataMap[date].delivered,
      })));

    } catch (error) {
      console.error('Error fetching SMS logs:', error);
      toast.error('Failed to load SMS logs');
    } finally {
      setLoading(false);
    }
  };

  const openDetailModal = (log: SMSLog) => {
    setSelectedLog(log);
    setIsDetailModalOpen(true);
  };

  const maskPhoneNumber = (phone: string) => {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 4) + '***' + phone.slice(-3);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.phone_number.includes(searchQuery) ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' || 
      log.status === statusFilter || 
      log.delivery_status === statusFilter;
    
    const matchesDirection = 
      directionFilter === 'all' || 
      log.direction === directionFilter;

    return matchesSearch && matchesStatus && matchesDirection;
  });

  const pieData = [
    { name: 'Delivered', value: stats.delivered },
    { name: 'Sent', value: stats.pending },
    { name: 'Failed', value: stats.failed },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total SMS</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.delivered}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.deliveryRate}%</p>
                <p className="text-xs text-muted-foreground">Delivery Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SMS Volume (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="sent" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="Sent"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="delivered" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    name="Delivered"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Delivery Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SMS Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              SMS Logs
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 sm:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchLogs}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No SMS logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.slice(0, 100).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {log.created_at 
                            ? new Date(log.created_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {maskPhoneNumber(log.phone_number)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {log.message.slice(0, 50)}
                          {log.message.length > 50 ? '...' : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {log.direction === 'outbound' ? (
                              <><Send className="w-3 h-3 mr-1" /> Out</>
                            ) : (
                              <><Inbox className="w-3 h-3 mr-1" /> In</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={statusColors[log.delivery_status || log.status || 'pending']}
                          >
                            {log.delivery_status || log.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDetailModal(log)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              SMS Details
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Phone Number</p>
                  <p className="font-mono">{selectedLog.phone_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Direction</p>
                  <Badge variant="outline">
                    {selectedLog.direction || 'outbound'}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Message</p>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{selectedLog.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge 
                    variant="outline"
                    className={statusColors[selectedLog.delivery_status || selectedLog.status || 'pending']}
                  >
                    {selectedLog.delivery_status || selectedLog.status || 'pending'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Provider ID</p>
                  <p className="text-sm font-mono truncate">
                    {selectedLog.provider_message_id || '-'}
                  </p>
                </div>
              </div>

              {selectedLog.failure_reason && (
                <div>
                  <p className="text-xs text-muted-foreground">Failure Reason</p>
                  <p className="text-sm text-destructive">{selectedLog.failure_reason}</p>
                </div>
              )}

              <div className="border-t pt-4 space-y-2">
                <p className="text-xs font-medium">Timeline</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>
                      {selectedLog.created_at 
                        ? new Date(selectedLog.created_at).toLocaleString()
                        : '-'}
                    </span>
                  </div>
                  {selectedLog.status_updated_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status Updated</span>
                      <span>{new Date(selectedLog.status_updated_at).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedLog.delivered_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivered</span>
                      <span>{new Date(selectedLog.delivered_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
