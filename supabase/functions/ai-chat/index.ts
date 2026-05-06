import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { parseBody, badRequest, LanguageSchema } from "../_shared/validation.ts";

const ChatBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(4000),
    }).strict(),
  ).min(1).max(50),
  language: LanguageSchema.default('en'),
}).strict();

const SYSTEM_PROMPT_EN = `You are MediReach+ AI, a compassionate and knowledgeable first aid assistant. Your role is to provide clear, actionable first aid guidance for common medical emergencies.

CRITICAL SAFETY RULES:
1. Always recommend seeking professional medical help for serious conditions
2. Never diagnose conditions - only provide first aid guidance
3. For life-threatening emergencies (chest pain, difficulty breathing, severe bleeding, loss of consciousness), immediately advise calling emergency services (999 or 112)
4. Include clear "When to seek hospital care" guidance
5. Ask clarifying questions when symptoms are unclear

RED FLAG SYMPTOMS (Always escalate immediately):
- Chest pain or pressure
- Difficulty breathing
- Severe bleeding that won't stop
- Loss of consciousness
- Signs of stroke (face drooping, arm weakness, speech difficulty)
- Severe allergic reactions
- Suspected poisoning

RESPONSE FORMAT:
1. Acknowledge the situation with empathy
2. Provide step-by-step first aid instructions
3. List warning signs to watch for
4. Recommend when to seek professional help

Always end with a medical disclaimer: "This is first aid guidance only. For medical emergencies, call 999 or visit the nearest hospital."`;

const SYSTEM_PROMPT_SW = `Wewe ni MediReach+ AI, msaidizi wa huduma ya kwanza mwenye huruma na ujuzi. Jukumu lako ni kutoa mwongozo wa wazi na unaoweza kutekelezwa wa huduma ya kwanza kwa dharura za kawaida za kimatibabu.

SHERIA MUHIMU ZA USALAMA:
1. Daima pendekeza kutafuta msaada wa kimatibabu kwa hali mbaya
2. Usifanye uchunguzi - toa mwongozo wa huduma ya kwanza tu
3. Kwa dharura zinazotishia maisha (maumivu ya kifua, ugumu wa kupumua, kutoka damu sana, kupoteza fahamu), shauri mara moja kupiga simu huduma za dharura (999 au 112)
4. Jumuisha mwongozo wa wazi "Wakati wa kwenda hospitali"
5. Uliza maswali ya ufafanuzi wakati dalili haziko wazi

DALILI ZA HATARI (Ongeza mara moja):
- Maumivu au shinikizo la kifua
- Ugumu wa kupumua
- Kutoka damu sana ambako hakusimami
- Kupoteza fahamu
- Dalili za kiharusi (uso kulegea, udhaifu wa mkono, ugumu wa kusema)
- Mzio mkubwa
- Sumu inayoshukiwa

MUUNDO WA JIBU:
1. Kubali hali hiyo kwa huruma
2. Toa maagizo ya hatua kwa hatua ya huduma ya kwanza
3. Orodhesha ishara za onyo za kuangalia
4. Pendekeza wakati wa kutafuta msaada wa kitaalamu

Mwishoni daima jumuisha kanusho: "Hii ni mwongozo wa huduma ya kwanza tu. Kwa dharura za kimatibabu, piga simu 999 au tembelea hospitali ya karibu."`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.claims.sub as string;

    // Rate limiting
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const rawBody = await req.json();
    const validation = validateChatInput(rawBody);
    
    if (!validation.valid || !validation.parsed) {
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, language } = validation.parsed;
    const systemPrompt = language === 'sw' ? SYSTEM_PROMPT_SW : SYSTEM_PROMPT_EN;

    console.log('AI Chat request:', { userId: userId.slice(0, 8) + '...', messageCount: messages.length, language });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error('AI gateway error:', response.status);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('AI service temporarily unavailable');
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    const corsHeaders = getCorsHeaders(req);
    console.error('AI chat error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An internal error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
