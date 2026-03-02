import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

function getCorsHeaders(req: Request) {
  const allowedRaw = Deno.env.get('ALLOWED_ORIGINS') || '*';
  const origin = req.headers.get('Origin') || '';
  let allowOrigin = '*';

  if (allowedRaw !== '*') {
    const allowed = allowedRaw.split(',').map((s) => s.trim());
    allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    Vary: 'Origin',
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const {
      policyKey,
      context = {},
      tenantId = null,
      decisionType = null,
      operationId = null,
      persistSnapshot = true,
    } = body || {};

    if (!policyKey) {
      throw new Error('policyKey is required');
    }

    const { data, error } = await supabase.rpc('policy_resolve', {
      p_policy_key: policyKey,
      p_context: context,
      p_tenant_id: tenantId,
      p_decision_type: decisionType,
      p_operation_id: operationId,
      p_persist_snapshot: persistSnapshot,
    });

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
