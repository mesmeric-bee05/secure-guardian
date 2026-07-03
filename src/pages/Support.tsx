import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Heart, Loader2, Smartphone, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import LanguageToggle from '@/components/ui/LanguageToggle';

type Lang = 'en' | 'sw';

const t = {
  en: {
    title: 'Support MediReach+',
    subtitle:
      'Your donation helps keep emergency first-aid free and offline-ready for every Kenyan.',
    back: 'Back',
    amount: 'Amount (KES)',
    phone: 'M-PESA phone (2547XXXXXXXX)',
    donate: 'Donate via M-PESA',
    processing: 'Sending STK push…',
    prompt: 'Check your phone for the M-PESA prompt to complete your donation.',
    disclaimer:
      'Donations support platform operations only. Emergency features remain free of charge.',
    secure: 'Secured via Safaricom Daraja. We never store your M-PESA PIN.',
    notConfigured:
      'M-PESA is not configured on this environment yet. Ask an administrator to add the M-PESA API credentials.',
    signInRequired: 'Please sign in to make a donation.',
    invalidPhone: 'Enter your phone as 2547XXXXXXXX (12 digits).',
  },
  sw: {
    title: 'Saidia MediReach+',
    subtitle:
      'Mchango wako husaidia kutoa huduma ya kwanza ya dharura bila malipo kwa kila Mkenya.',
    back: 'Rudi',
    amount: 'Kiasi (KSh)',
    phone: 'Nambari ya M-PESA (2547XXXXXXXX)',
    donate: 'Changia kupitia M-PESA',
    processing: 'Inatuma ombi la STK…',
    prompt: 'Angalia simu yako kwa ombi la M-PESA ili kukamilisha mchango wako.',
    disclaimer:
      'Michango husaidia uendeshaji wa mfumo tu. Huduma za dharura zitabaki bila malipo.',
    secure: 'Imelindwa kupitia Safaricom Daraja. Hatuhifadhi PIN yako ya M-PESA.',
    notConfigured:
      'M-PESA bado haijasanidiwa kwenye mazingira haya. Mwombe msimamizi kuongeza vitambulisho vya API vya M-PESA.',
    signInRequired: 'Tafadhali ingia ili kutoa mchango.',
    invalidPhone: 'Weka nambari kama 2547XXXXXXXX (nambari 12).',
  },
} as const;

const PRESETS = [100, 500, 1000, 2500];

export default function Support() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [lang, setLang] = useState<Lang>((profile?.preferred_language as Lang) || 'en');
  const [amount, setAmount] = useState(500);
  const [phone, setPhone] = useState(
    (profile?.phone_number || '').replace(/^\+?/, '').replace(/\D/g, ''),
  );
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const l = t[lang];

  useEffect(() => {
    supabase.functions
      .invoke('mpesa-config-check')
      .then(({ data }) => setReady(Boolean((data as { ready?: boolean } | null)?.ready)))
      .catch(() => setReady(false));
  }, []);

  const seo = {
    en: {
      title: 'Support MediReach+ — Donate via M-PESA',
      description:
        'Donate to MediReach+ via M-PESA and help keep bilingual AI first aid, offline protocols, and USSD emergency alerts free across Kenya.',
    },
    sw: {
      title: 'Saidia MediReach+ — Changia kupitia M-PESA',
      description:
        'Changia MediReach+ kupitia M-PESA na usaidie kuweka huduma za kwanza za AI, itifaki za nje ya mtandao, na tahadhari za USSD bila malipo Kenya.',
    },
  }[lang];
  const canonical = 'https://fortify-trust-wall.lovable.app/support';

  const submit = async () => {
    if (!user) {
      toast.error(l.signInRequired);
      navigate('/auth');
      return;
    }
    if (!/^2547\d{8}$/.test(phone)) {
      toast.error(l.invalidPhone);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
        body: { amount, phone, reference: 'MediReach' },
      });
      if (error) {
        // Try to surface the friendly message from the function
        const msg =
          (data as { message?: string; error?: string })?.message ||
          (data as { error?: string })?.error ||
          error.message;
        if (msg === 'mpesa_not_configured' || (data as { error?: string })?.error === 'mpesa_not_configured') {
          toast.error(l.notConfigured);
        } else {
          toast.error(msg);
        }
        return;
      }
      const resp = data as { ok?: boolean; message?: string; error?: string };
      if (resp?.error === 'mpesa_not_configured') {
        toast.error(l.notConfigured);
        return;
      }
      toast.success(l.prompt);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label={l.back}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" />
              {l.title}
            </h1>
          </div>
          <LanguageToggle language={lang} onToggle={setLang} />
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        <p className="text-muted-foreground text-sm">{l.subtitle}</p>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="w-4 h-4 text-primary" /> M-PESA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{l.amount}</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={amount === p ? 'default' : 'outline'}
                    onClick={() => setAmount(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={10}
                max={70000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="phone">{l.phone}</Label>
              <Input
                id="phone"
                inputMode="numeric"
                placeholder="254712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </div>

            <Button
              onClick={submit}
              disabled={loading || amount < 10 || phone.length !== 12}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {l.processing}
                </>
              ) : (
                <>
                  <Heart className="w-4 h-4 mr-2" />
                  {l.donate}
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
              {l.secure}
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">{l.disclaimer}</p>
      </main>
    </div>
  );
}
