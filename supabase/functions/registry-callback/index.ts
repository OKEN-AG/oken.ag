import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type CallbackBody = {
  provider: string;
  externalStatus: string;
  callbackRef?: string;
  requestId?: string;
  externalRequestId?: string;
  tenantId?: string | null;
  payload?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json() as CallbackBody;
    if (!body.provider || !body.externalStatus) {
      return new Response(JSON.stringify({ error: 'provider and externalStatus are required' }), { status: 400, headers: corsHeaders });
    }

    const tenantId = body.tenantId ?? req.headers.get('x-tenant-id');
    let requestQuery = supabase.from('registry_requests').select('id,operation_id,tenant_id').eq('provider', body.provider);

    if (body.requestId) requestQuery = requestQuery.eq('id', body.requestId);
    else if (body.externalRequestId) requestQuery = requestQuery.eq('external_request_id', body.externalRequestId);
    else return new Response(JSON.stringify({ error: 'requestId or externalRequestId is required' }), { status: 400, headers: corsHeaders });

    const requestResult = await requestQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (requestResult.error) return new Response(JSON.stringify({ error: requestResult.error.message }), { status: 500, headers: corsHeaders });
    if (!requestResult.data) return new Response(JSON.stringify({ error: 'Registry request not found' }), { status: 404, headers: corsHeaders });

    const mappedStatus = await supabase.rpc('map_registry_external_status', {
      p_provider: body.provider,
      p_external_status: body.externalStatus,
      p_tenant_id: tenantId,
    });

    if (mappedStatus.error) return new Response(JSON.stringify({ error: mappedStatus.error.message }), { status: 500, headers: corsHeaders });

    const canonicalStatus = mappedStatus.data as string;
    const requirementFlag = canonicalStatus === 'reprovado';
    const headersObj = Object.fromEntries(req.headers.entries());

    const callbackInsert = await supabase.from('registry_callbacks').insert({
      tenant_id: tenantId,
      request_id: requestResult.data.id,
      provider: body.provider,
      callback_ref: body.callbackRef ?? null,
      external_status: body.externalStatus,
      canonical_status: canonicalStatus,
      requirement_flag: requirementFlag,
      payload: body.payload ?? {},
      headers: headersObj,
      processed_at: new Date().toISOString(),
    }).select('id,request_id,canonical_status,requirement_flag').single();

    if (callbackInsert.error) return new Response(JSON.stringify({ error: callbackInsert.error.message }), { status: 500, headers: corsHeaders });

    const requestUpdate = await supabase.from('registry_requests').update({
      external_status: body.externalStatus,
      canonical_status: canonicalStatus,
      requirement_flag: requirementFlag,
      responded_at: new Date().toISOString(),
    }).eq('id', requestResult.data.id);

    if (requestUpdate.error) return new Response(JSON.stringify({ error: requestUpdate.error.message }), { status: 500, headers: corsHeaders });

    await supabase.from('registry_reconciliation').insert({
      tenant_id: tenantId,
      provider: body.provider,
      operation_id: requestResult.data.operation_id,
      request_id: requestResult.data.id,
      callback_id: callbackInsert.data.id,
      source: 'callback',
      external_status: body.externalStatus,
      canonical_status: canonicalStatus,
      requirement_flag: requirementFlag,
      details: {
        callbackRef: body.callbackRef ?? null,
        receivedAt: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ callback: callbackInsert.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
