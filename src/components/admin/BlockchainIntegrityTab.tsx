import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldAlert, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type VerifyResult = {
  ok: boolean;
  broken_at: number | null;
  total: number;
  verified_at: string;
};

type HistoryRow = {
  id: string;
  created_at: string;
  details: Record<string, unknown> | null;
};

export default function BlockchainIntegrityTab() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('security_events')
      .select('id, created_at, details')
      .eq('event_type', 'audit_chain_verify')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      toast.error('Failed to load verification history');
    } else {
      setHistory((data ?? []) as HistoryRow[]);
    }
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const runVerification = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('audit-chain-verify', {
        body: {},
      });
      if (error) throw error;
      const r = data as VerifyResult;
      setResult(r);
      if (r.ok) {
        toast.success(`Audit chain verified — ${r.total} entries intact`);
      } else {
        toast.error(`Tampering detected at chain index ${r.broken_at}`);
      }
      await loadHistory();
    } catch (err) {
      toast.error((err as Error).message || 'Verification failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Link2 className="w-6 h-6 text-primary" />
          Audit Chain Integrity
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tamper-evident SHA-256 hash chain over <code>audit_logs</code>. Each entry hashes the
          previous entry's hash and its own canonical content, so any modification is detectable.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runVerification} disabled={running}>
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Verifying chain…
              </>
            ) : (
              <>Verify now</>
            )}
          </Button>

          {result && (
            <div
              className={`rounded-lg border p-4 flex items-start gap-3 ${
                result.ok
                  ? 'border-green-500/40 bg-green-500/5'
                  : 'border-destructive/40 bg-destructive/5'
              }`}
            >
              {result.ok ? (
                <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <p className="font-medium">
                  {result.ok ? 'Chain intact' : `Chain broken at index ${result.broken_at}`}
                </p>
                <p className="text-muted-foreground">
                  Verified {result.total} entries at {new Date(result.verified_at).toLocaleString()}.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Verifications</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifications recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((row) => {
                const d = (row.details ?? {}) as {
                  ok?: boolean;
                  broken_at?: number | null;
                  total?: number;
                };
                return (
                  <li key={row.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <p className="font-medium">
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">
                        {d.total ?? 0} entries
                        {d.broken_at != null && ` · broken at #${d.broken_at}`}
                      </p>
                    </div>
                    <Badge variant={d.ok ? 'default' : 'destructive'}>
                      {d.ok ? 'OK' : 'TAMPERED'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
