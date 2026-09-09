import { useCallback, useEffect, useMemo, useState } from 'react';
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
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw, Smartphone, ShieldAlert, Clock, CheckCircle2, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { Json } from '@/integrations/supabase/types';

type WindowKey = '24h' | '7d' | '30d';

const WINDOW_HOURS: Record<WindowKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

interface Donation {
  id: string;
  amount_kes: number;
  phone_msisdn: string | null;
  status: string;
  checkout_request_id: string | null;
  mpesa_receipt: string | null;
  created_at: string;
}

interface LedgerEvent {
  id: string;
  checkout_request_id: string;
  reference_id: string;
  donation_id: string | null;
  result_code: number | null;
  status: string | null;
  received_at: string;
}

interface DenialRow {
  id: string;
  action: string;
  resource_id: string | null;
  details: Json;
  created_at: string | null;
}

function maskPhone(msisdn: string | null): string {
  if (!msisdn) return '—';
  const digits = msisdn.replace(/\D/g, '');
  if (digits.length < 6) return '••••';
  return `${digits.slice(0, 6)}•••${digits.slice(-2)}`;
}

function reasonOf(details: Json): string {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const value = (details as Record<string, unknown>).reason;
    if (typeof value === 'string') return value;
  }
  return 'unknown';
}

function ageOf(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function MpesaOpsTab() {
  const [windowKey, setWindowKey] = useState<WindowKey>('24h');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [donationIdInput, setDonationIdInput] = useState('');
  const [donationId, setDonationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Donation[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [ledger, setLedger] = useState<LedgerEvent[]>([]);
  const [denials, setDenials] = useState<DenialRow[]>([]);

  const since = useMemo(
    () => new Date(Date.now() - WINDOW_HOURS[windowKey] * 3600_000).toISOString(),
    [windowKey],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let pendingQuery = supabase
        .from('donations')
        .select('id, amount_kes, phone_msisdn, status, checkout_request_id, mpesa_receipt, created_at')
        .eq('status', 'pending')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      if (donationId) pendingQuery = pendingQuery.eq('id', donationId);

      let ledgerQuery = supabase
        .from('mpesa_callback_events')
        .select('id, checkout_request_id, reference_id, donation_id, result_code, status, received_at')
        .gte('received_at', since)
        .order('received_at', { ascending: false })
        .limit(50);
      if (donationId) ledgerQuery = ledgerQuery.eq('donation_id', donationId);

      let denialQuery = supabase
        .from('audit_logs')
        .select('id, action, resource_id, details, created_at')
        .eq('action', 'mpesa_callback_rejected')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      if (reasonFilter !== 'all') denialQuery = denialQuery.eq('details->>reason', reasonFilter);
      if (donationId) denialQuery = denialQuery.eq('resource_id', donationId);

      const completedQuery = supabase
        .from('donations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('created_at', since);

      const [p, l, d, c] = await Promise.all([pendingQuery, ledgerQuery, denialQuery, completedQuery]);

      if (p.error) throw p.error;
      if (l.error) throw l.error;
      if (d.error) throw d.error;
      if (c.error) throw c.error;

      setPending((p.data as Donation[]) || []);
      setLedger((l.data as LedgerEvent[]) || []);
      setDenials((d.data as DenialRow[]) || []);
      setCompletedCount(c.count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load M-PESA operations data');
    } finally {
      setLoading(false);
    }
  }, [since, reasonFilter, donationId]);

  useEffect(() => {
    load();
  }, [load]);

  const duplicateCount = denials.filter((d) => reasonOf(d.details) === 'duplicate_reference').length;

  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    denials.forEach((d) => {
      const r = reasonOf(d.details);
      counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
  }, [denials]);

  const cards = [
    { key: 'pending', label: 'Pending donations', value: pending.length, icon: Clock },
    { key: 'completed', label: 'Successful callbacks', value: completedCount, icon: CheckCircle2 },
    { key: 'denied', label: 'Denied attempts', value: denials.length, icon: ShieldAlert },
    { key: 'duplicate', label: 'Duplicate references', value: duplicateCount, icon: Copy },
  ];

  return (
    <div className="space-y-6" data-testid="mpesa-ops">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">M-PESA Operations</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={windowKey} onValueChange={(v) => setWindowKey(v as WindowKey)}>
            <SelectTrigger className="w-[130px]" data-testid="ops-window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="w-[190px]" data-testid="ops-reason">
              <SelectValue placeholder="All reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              {['invalid_token', 'missing_token', 'token_not_configured', 'amount_mismatch', 'donation_not_pending', 'duplicate_reference', 'unknown_donation', 'malformed_payload', 'processing_error'].map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={donationIdInput}
            onChange={(e) => setDonationIdInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setDonationId(donationIdInput.trim()); }}
            onBlur={() => setDonationId(donationIdInput.trim())}
            placeholder="Donation ID"
            className="w-[240px]"
            data-testid="ops-donation-id"
          />
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh" data-testid="ops-refresh">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="ops-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.key} data-testid={`ops-card-${c.key}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <c.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-foreground mt-2" data-testid={`ops-count-${c.key}`}>
                {loading ? '—' : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.keys(reasonCounts).length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="ops-reason-chips">
          {Object.entries(reasonCounts).map(([reason, count]) => (
            <button key={reason} onClick={() => setReasonFilter(reason)} data-reason={reason}>
              <Badge variant={reasonFilter === reason ? 'default' : 'secondary'}>
                {reason} · {count}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Pending donations</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount (KES)</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Checkout ID</TableHead>
                <TableHead>Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground" data-testid="ops-pending-empty">No pending donations in this window</TableCell></TableRow>
              ) : pending.map((d) => (
                <TableRow key={d.id} data-testid="ops-pending-row" data-donation-id={d.id}>
                  <TableCell className="font-medium">{d.amount_kes}</TableCell>
                  <TableCell>{maskPhone(d.phone_msisdn)}</TableCell>
                  <TableCell className="font-mono text-xs">{d.checkout_request_id || '—'}</TableCell>
                  <TableCell>{ageOf(d.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Callback ledger</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Checkout ID</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground" data-testid="ops-ledger-empty">No callback events in this window</TableCell></TableRow>
              ) : ledger.map((e) => (
                <TableRow key={e.id} data-testid="ops-ledger-row" data-reference={e.reference_id} data-donation-id={e.donation_id || ''}>
                  <TableCell className="font-mono text-xs">{e.reference_id}</TableCell>
                  <TableCell className="font-mono text-xs">{e.checkout_request_id}</TableCell>
                  <TableCell>{e.result_code ?? '—'}</TableCell>
                  <TableCell><Badge variant={e.status === 'completed' ? 'default' : 'secondary'}>{e.status || 'unknown'}</Badge></TableCell>
                  <TableCell>{format(new Date(e.received_at), 'MMM d, HH:mm')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Denied callback attempts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead>Donation ID</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {denials.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground" data-testid="ops-denials-empty">No denied attempts in this window</TableCell></TableRow>
              ) : denials.map((d) => (
                <TableRow key={d.id} data-testid="ops-denial-row" data-reason={reasonOf(d.details)} data-resource-id={d.resource_id || ''}>
                  <TableCell><Badge variant="destructive">{reasonOf(d.details)}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{d.resource_id || '—'}</TableCell>
                  <TableCell>{d.created_at ? format(new Date(d.created_at), 'MMM d, HH:mm') : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
