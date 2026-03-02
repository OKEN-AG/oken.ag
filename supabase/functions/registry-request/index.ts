import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type RegistryRequestPayload = {
  operationId?: string;
  documentId?: string;
  provider: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string;
  requestType?: 'registration' | 'status_sync';
  tenantId?: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json() as RegistryRequestPayload;
    if (!body?.provider || !body?.idempotencyKey || !body?.payload) {
      return new Response(JSON.stringify({ error: 'provider, idempotencyKey and payload are required' }), { status: 400, headers: corsHeaders });
    }

    const tenantId = body.tenantId ?? req.headers.get('x-tenant-id');

    const endpointResult = await supabase
      .from('registry_endpoints')
      .select('id,destination,tenant_id')
      .eq('provider', body.provider)
      .eq('endpoint_type', 'request')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (endpointResult.error) {
      return new Response(JSON.stringify({ error: endpointResult.error.message }), { status: 500, headers: corsHeaders });
    }

    const endpoint = (endpointResult.data ?? []).find((candidate) => candidate.tenant_id === tenantId)
      ?? (endpointResult.data ?? []).find((candidate) => candidate.tenant_id === null);

    if (!endpoint) {
      return new Response(JSON.stringify({ error: `No active request endpoint configured for provider ${body.provider}` }), { status: 422, headers: corsHeaders });
    }

    const requestResult = await supabase
      .from('registry_requests')
      .insert({
        tenant_id: tenantId,
        operation_id: body.operationId ?? null,
        document_id: body.documentId ?? null,
        endpoint_id: endpoint.id,
        provider: body.provider,
        request_type: body.requestType ?? 'registration',
        idempotency_key: body.idempotencyKey,
        payload: body.payload,
        correlation_id: body.correlationId ?? null,
      })
      .select('id,provider,idempotency_key,requested_at')
      .single();

    if (requestResult.error) {
      return new Response(JSON.stringify({ error: requestResult.error.message }), { status: 500, headers: corsHeaders });
    }

    const outboxResult = await supabase
      .from('registry_event_outbox')
      .insert({
        registry_request_id: requestResult.data.id,
        endpoint_id: endpoint.id,
        destination: endpoint.destination,
        payload: body.payload,
      })
      .select('id,status,destination,created_at')
      .single();

    if (outboxResult.error) {
      return new Response(JSON.stringify({ error: outboxResult.error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ request: requestResult.data, outbox: outboxResult.data }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
