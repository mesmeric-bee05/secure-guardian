import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Smartphone, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CheckRow = { name: string; set: boolean; valid: boolean; hint: string };
type ConfigResp = {
  ready: boolean;
  mode: string;
  checks?: CheckRow[];
  probe?: { ok: boolean; expires_in?: number; error?: string };
  verified_at?: string;
};

export default function MpesaConfigTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConfigResp | null>(null);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('254708374149');
  const [testResp, setTestResp] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    const { data: resp, error } = await supabase.functions.invoke('mpesa-config-check');
    if (error) toast.error(error.message);
    setData((resp as ConfigResp) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runTest = async () => {
    if (!/^2547\d{8}$/.test(testPhone)) {
      toast.error('Phone must be 2547XXXXXXXX');
      return;
    }
    setTesting(true);
    setTestResp(null);
    const { data: resp, error } = await supabase.functions.invoke('mpesa-stk-push', {
      body: { amount: 1, phone: testPhone, reference: 'ConfigCheck' },
    });
    setTesting(false);
    if (error) {
      toast.error(error.message);
      setTestResp({ error: error.message, data: resp });
      return;
    }
    setTestResp(resp);
    toast.success('STK push sent — check the phone');
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-primary" /> M-PESA Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Verify all Daraja credentials before enabling real STK Push.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Recheck
        </Button>
      </div>

      <Card className={data?.ready ? 'border-green-500/50 bg-green-500/5' : 'border-amber-500/50 bg-amber-500/5'}>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold">
              {data?.ready ? '✓ Live-ready' : '⚠ Demo mode'}
            </p>
            <p className="text-sm text-muted-foreground">
              Mode: <Badge variant="outline">{data?.mode ?? 'unset'}</Badge>
              {data?.verified_at && <span className="ml-2 text-xs">Verified {new Date(data.verified_at).toLocaleTimeString()}</span>}
            </p>
          </div>
          {data?.ready ? (
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          ) : (
            <XCircle className="w-8 h-8 text-amber-500" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Secrets checklist</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data?.checks ?? []).map((c) => (
            <div key={c.name} className="flex items-center justify-between border rounded-lg px-3 py-2">
              <div>
                <p className="font-mono text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </div>
              {c.set && c.valid ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive" />
              )}
            </div>
          ))}
          {!data?.checks && (
            <p className="text-sm text-muted-foreground">
              Detailed checklist requires admin access. Sign in as admin to view.
            </p>
          )}
        </CardContent>
      </Card>

      {data?.probe && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Live Daraja probe
          </CardTitle></CardHeader>
          <CardContent>
            {data.probe.ok ? (
              <p className="text-sm text-green-600">
                ✓ Auth token generated — expires in {data.probe.expires_in}s
              </p>
            ) : (
              <p className="text-sm text-destructive">
                ✗ Probe failed: {data.probe.error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Test STK Push (KES 1)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="test-phone">Phone (2547XXXXXXXX)</Label>
            <Input
              id="test-phone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
              inputMode="numeric"
            />
          </div>
          <Button onClick={runTest} disabled={testing || !data?.ready}>
            {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : 'Send test STK'}
          </Button>
          {!data?.ready && (
            <p className="text-xs text-amber-600">Configuration incomplete — test disabled.</p>
          )}
          {testResp != null && (
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-48">
              {JSON.stringify(testResp, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
