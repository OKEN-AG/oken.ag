import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type SyncBody = {
  provider: string;
  requestId?: string;
  operationId?: string;
  tenantId?: string | null;
};

const REQUEST_TIMEOUT_MS = Number(Deno.env.get('REGISTRY_STATUS_SYNC_TIMEOUT_MS') ?? '8000');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json() as SyncBody;
    if (!body.provider) {
      return new Response(JSON.stringify({ error: 'provider is required' }), { status: 400, headers: corsHeaders });
    }

    const tenantId = body.tenantId ?? req.headers.get('x-tenant-id');

    let requestQuery = supabase
      .from('registry_requests')
      .select('id,operation_id,provider,external_request_id,tenant_id')
      .eq('provider', body.provider);

    if (body.requestId) requestQuery = requestQuery.eq('id', body.requestId);
    else if (body.operationId) requestQuery = requestQuery.eq('operation_id', body.operationId);

    const requestResult = await requestQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (requestResult.error) return new Response(JSON.stringify({ error: requestResult.error.message }), { status: 500, headers: corsHeaders });
    if (!requestResult.data) return new Response(JSON.stringify({ error: 'Registry request not found' }), { status: 404, headers: corsHeaders });

    const endpointResult = await supabase
      .from('registry_endpoints')
      .select('destination,tenant_id')
      .eq('provider', body.provider)
      .eq('endpoint_type', 'status_sync')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (endpointResult.error) return new Response(JSON.stringify({ error: endpointResult.error.message }), { status: 500, headers: corsHeaders });

    const endpoint = (endpointResult.data ?? []).find((candidate) => candidate.tenant_id === tenantId)
      ?? (endpointResult.data ?? []).find((candidate) => candidate.tenant_id === null);

    if (!endpoint) {
      return new Response(JSON.stringify({ error: `No active status_sync endpoint configured for provider ${body.provider}` }), { status: 422, headers: corsHeaders });
    }

    const url = new URL(endpoint.destination);
    if (requestResult.data.external_request_id) {
      url.searchParams.set('external_request_id', requestResult.data.external_request_id);
    } else {
      url.searchParams.set('request_id', requestResult.data.id);
    }

    const response = await fetchWithTimeout(url.toString());
    const upstreamPayload = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Upstream status sync failed with ${response.status}`, payload: upstreamPayload }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const externalStatus = String(upstreamPayload.status ?? 'submitted');
    const mappedStatus = await supabase.rpc('map_registry_external_status', {
      p_provider: body.provider,
      p_external_status: externalStatus,
      p_tenant_id: tenantId,
    });

    if (mappedStatus.error) return new Response(JSON.stringify({ error: mappedStatus.error.message }), { status: 500, headers: corsHeaders });

    const canonicalStatus = mappedStatus.data as string;
    const requirementFlag = canonicalStatus === 'reprovado';

    const updateResult = await supabase.from('registry_requests').update({
      external_status: externalStatus,
      canonical_status: canonicalStatus,
      requirement_flag: requirementFlag,
      responded_at: new Date().toISOString(),
      error_payload: null,
    }).eq('id', requestResult.data.id).select('id,canonical_status,requirement_flag,responded_at').single();

    if (updateResult.error) return new Response(JSON.stringify({ error: updateResult.error.message }), { status: 500, headers: corsHeaders });

    await supabase.from('registry_reconciliation').insert({
      tenant_id: tenantId,
      provider: body.provider,
      operation_id: requestResult.data.operation_id,
      request_id: requestResult.data.id,
      source: 'status_sync',
      external_status: externalStatus,
      canonical_status: canonicalStatus,
      requirement_flag: requirementFlag,
      details: upstreamPayload,
    });

    return new Response(JSON.stringify({ request: updateResult.data, upstream: upstreamPayload }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
