import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getClientIP } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'text/plain',
  'X-Content-Type-Options': 'nosniff',
};

function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[^0-9*#]/g, '').slice(0, 100);
}

function sanitizePhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/[^0-9+]/g, '').slice(0, 20);
}

function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') return '';
  return sessionId.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 100);
}

const MENUS = {
  main: {
    en: `CON Welcome to MediReach+
1. First Aid Help
2. Find Nearest Hospital
3. Emergency Alert
4. My Health Profile
0. Change Language`,
    sw: `CON Karibu MediReach+
1. Msaada wa Huduma ya Kwanza
2. Tafuta Hospitali ya Karibu
3. Tahadhari ya Dharura
4. Wasifu Wangu wa Afya
0. Badilisha Lugha`,
  },
  firstAid: {
    en: `CON Select emergency type:
1. Bleeding
2. Burns
3. Choking
4. Fractures
5. Heart Attack Signs
0. Back to Main`,
    sw: `CON Chagua aina ya dharura:
1. Kutoka Damu
2. Kuungua
3. Kukaba
4. Kuvunjika Mfupa
5. Dalili za Mshtuko wa Moyo
0. Rudi Nyuma`,
  },
  language: {
    text: `CON Select Language / Chagua Lugha:
1. English
2. Kiswahili`,
  },
};

const FIRST_AID_TIPS: Record<string, { en: string; sw: string }> = {
  bleeding: {
    en: `END BLEEDING:
1. Apply direct pressure
2. Elevate injury above heart
3. Keep pressure for 10-15 min
4. If severe, call 999

SEEK HELP if bleeding won't stop.`,
    sw: `END KUTOKA DAMU:
1. Bonyeza moja kwa moja
2. Inua jeraha juu ya moyo
3. Weka shinikizo dakika 10-15
4. Ikiwa kali, piga simu 999

TAFUTA MSAADA ikiwa damu haisimami.`,
  },
  burns: {
    en: `END BURNS:
1. Cool under water 20 min
2. Remove jewelry nearby
3. Cover with clean cloth
4. Do NOT use ice or butter

SEEK HELP for large burns.`,
    sw: `END KUUNGUA:
1. Poza chini ya maji dakika 20
2. Ondoa vito karibu
3. Funika kwa kitambaa safi
4. USITUMIE barafu au siagi

TAFUTA MSAADA kwa kuungua kubwa.`,
  },
  choking: {
    en: `END CHOKING:
1. Ask "Can you speak?"
2. Give 5 back blows
3. Give 5 abdominal thrusts
4. Repeat until clear

Call 999 if unconscious.`,
    sw: `END KUKABA:
1. Uliza "Unaweza kusema?"
2. Toa mapigo 5 ya mgongo
3. Toa kushinikiza tumbo mara 5
4. Rudia hadi safi

Piga simu 999 ikiwa amepoteza fahamu.`,
  },
  fractures: {
    en: `END FRACTURES:
1. Keep injured area still
2. Apply ice in cloth
3. Support with padding
4. Do NOT straighten bone

SEEK HELP immediately.`,
    sw: `END KUVUNJIKA MFUPA:
1. Weka eneo bila kusogea
2. Tumia barafu kwenye kitambaa
3. Saidia kwa vifaa laini
4. USIJARIBU kunyoosha mfupa

TAFUTA MSAADA mara moja.`,
  },
  heartAttack: {
    en: `END HEART ATTACK:
CALL 999 IMMEDIATELY!
1. Have person sit/lie down
2. Loosen tight clothing
3. Give aspirin if available
4. Stay calm, monitor breathing

Signs: chest pain, arm pain, sweating`,
    sw: `END MSHTUKO WA MOYO:
PIGA SIMU 999 MARA MOJA!
1. Mtu akae/alale chini
2. Legeza nguo zenye kubana
3. Mpe aspirini ikiwa inapatikana
4. Tulia, angalia kupumua

Dalili: maumivu ya kifua, maumivu ya mkono, jasho`,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const formData = await req.formData();
    const sessionId = sanitizeSessionId(formData.get('sessionId') as string);
    const phoneNumber = sanitizePhoneNumber(formData.get('phoneNumber') as string);
    const text = sanitizeInput(formData.get('text') as string || '');

    if (!sessionId || !phoneNumber) {
      return new Response('END Invalid request.', { headers: corsHeaders });
    }

    // Rate limit per phone number (30/min)
    if (!checkRateLimit(`ussd:${phoneNumber}`, 30, 60000)) {
      return new Response('END Too many requests. Please try again later.', { headers: corsHeaders });
    }

    console.log('USSD request:', { sessionId: sessionId.slice(0, 8) + '...', inputLength: text.length });

    let { data: session } = await supabase
      .from('ussd_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!session) {
      const { data: newSession } = await supabase
        .from('ussd_sessions')
        .insert({ session_id: sessionId, phone_number: phoneNumber, current_menu: 'main', session_data: { language: 'en' } })
        .select()
        .single();
      session = newSession;
    }

    const language = (session?.session_data?.language as 'en' | 'sw') || 'en';
    const inputs = text.split('*');
    const lastInput = inputs[inputs.length - 1];

    let response = '';

    if (text === '' || text === '0*0') {
      response = MENUS.main[language];
    } else if (text === '0') {
      response = MENUS.language.text;
    } else if (inputs[0] === '0' && inputs.length === 2) {
      const newLang = lastInput === '1' ? 'en' : 'sw';
      await supabase.from('ussd_sessions').update({ session_data: { ...session?.session_data, language: newLang } }).eq('session_id', sessionId);
      response = MENUS.main[newLang];
    } else if (inputs[0] === '1') {
      if (inputs.length === 1) {
        response = MENUS.firstAid[language];
      } else {
        const tipMap: Record<string, string> = { '1': 'bleeding', '2': 'burns', '3': 'choking', '4': 'fractures', '5': 'heartAttack' };
        const tipKey = tipMap[lastInput];
        if (tipKey && FIRST_AID_TIPS[tipKey]) {
          response = FIRST_AID_TIPS[tipKey][language];
        } else if (lastInput === '0') {
          response = MENUS.main[language];
        } else {
          response = MENUS.firstAid[language];
        }
      }
    } else if (inputs[0] === '2') {
      response = language === 'en'
        ? `END Nearest Hospitals:
1. Kenyatta National Hospital
   Tel: +254 20 2726300

2. Nairobi Hospital
   Tel: +254 20 2845000

Call 999 for ambulance.`
        : `END Hospitali za Karibu:
1. Hospitali ya Kenyatta
   Simu: +254 20 2726300

2. Hospitali ya Nairobi
   Simu: +254 20 2845000

Piga 999 kwa ambulensi.`;
    } else if (inputs[0] === '3') {
      response = language === 'en'
        ? `END EMERGENCY ALERT SENT!
Your location has been shared.
Help is on the way.

Emergency Numbers:
Police: 999
Ambulance: 999
Fire: 999`
        : `END TAHADHARI YA DHARURA IMETUMWA!
Mahali pako pameshirikiwa.
Msaada unakuja.

Nambari za Dharura:
Polisi: 999
Ambulensi: 999
Zimamoto: 999`;
    } else if (inputs[0] === '4') {
      response = language === 'en'
        ? `END Your Health Profile:
To update your profile, use the MediReach+ app or send SMS to our number.

For emergencies, your profile helps responders.`
        : `END Wasifu Wako wa Afya:
Kusasisha wasifu wako, tumia programu ya MediReach+ au tuma SMS kwa nambari yetu.

Kwa dharura, wasifu wako husaidia wahudumu.`;
    } else {
      response = MENUS.main[language];
    }

    await supabase.from('ussd_sessions').update({ updated_at: new Date().toISOString() }).eq('session_id', sessionId);

    return new Response(response, { headers: corsHeaders });
  } catch (error) {
    console.error('USSD handler error:', error instanceof Error ? error.message : 'Unknown');
    return new Response('END An error occurred. Please try again.', { headers: corsHeaders });
  }
});
