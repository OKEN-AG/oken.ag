import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type OutboxCandidate = {
  id: string;
  business_event_id: string;
  destination: string;
  status: 'pending' | 'failed';
  attempts: number;
  created_at: string;
  updated_at: string;
  business_events: {
    payload: Record<string, unknown>;
    event_name: string;
    tenant_id: string | null;
    correlation_id: string | null;
    idempotency_key: string | null;
  } | null;
};

const BATCH_SIZE = Number(Deno.env.get('OUTBOX_WORKER_BATCH_SIZE') ?? '50');
const MAX_ATTEMPTS = Number(Deno.env.get('OUTBOX_WORKER_MAX_ATTEMPTS') ?? '8');
const BASE_DELAY_MS = Number(Deno.env.get('OUTBOX_WORKER_BASE_DELAY_MS') ?? '1000');
const MAX_JITTER_MS = Number(Deno.env.get('OUTBOX_WORKER_MAX_JITTER_MS') ?? '300');
const REQUEST_TIMEOUT_MS = Number(Deno.env.get('OUTBOX_WORKER_REQUEST_TIMEOUT_MS') ?? '8000');

function buildErrorPayload(err: unknown): { message: string; name: string; details: string } {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      details: JSON.stringify({ cause: err.cause ?? null }),
    };
  }

  return {
    message: 'Unknown outbox publish error',
    name: 'UnknownError',
    details: JSON.stringify(err ?? null),
  };
}

function computeBackoffMs(attemptNo: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attemptNo - 1);
  const jitter = Math.floor(Math.random() * (MAX_JITTER_MS + 1));
  return exponential + jitter;
}

async function publishToDestination(destination: string, payload: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(destination, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Publisher HTTP ${response.status} for ${destination}: ${body.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [pendingResult, failedResult] = await Promise.all([
    supabase
      .from('event_outbox')
      .select('id,business_event_id,destination,status,attempts,created_at,updated_at,business_events(payload,event_name,tenant_id,correlation_id,idempotency_key)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE),
    supabase
      .from('event_outbox')
      .select('id,business_event_id,destination,status,attempts,created_at,updated_at,business_events(payload,event_name,tenant_id,correlation_id,idempotency_key)')
      .eq('status', 'failed')
      .lte('next_retry_at', new Date().toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(BATCH_SIZE),
  ]);

  if (pendingResult.error || failedResult.error) {
    return new Response(JSON.stringify({ error: pendingResult.error?.message ?? failedResult.error?.message }), { status: 500 });
  }

  const candidates = [...(pendingResult.data ?? []), ...(failedResult.data ?? [])] as OutboxCandidate[];

  const workset = candidates.slice(0, BATCH_SIZE);
  let published = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const candidate of workset) {
    if (!candidate.business_events) {
      continue;
    }

    const attemptNo = candidate.attempts + 1;
    const startedAt = performance.now();

    const claim = await supabase
      .from('event_outbox')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .eq('attempts', candidate.attempts)
      .eq('updated_at', candidate.updated_at)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();

    if (claim.error || !claim.data) {
      continue;
    }

    try {
      const publishTimeMs = Math.max(0, Date.now() - Date.parse(candidate.created_at));

      await publishToDestination(candidate.destination, {
        eventId: candidate.business_event_id,
        eventName: candidate.business_events.event_name,
        occurredAt: new Date().toISOString(),
        correlationId: candidate.business_events.correlation_id,
        idempotencyKey: candidate.business_events.idempotency_key,
        payload: candidate.business_events.payload,
      });

      const latencyMs = Math.round(performance.now() - startedAt);

      await supabase.from('event_outbox').update({
        status: 'published',
        attempts: attemptNo,
        next_retry_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', candidate.id);

      await supabase.from('event_outbox_publish_attempts').insert({
        outbox_id: candidate.id,
        business_event_id: candidate.business_event_id,
        destination: candidate.destination,
        attempt_no: attemptNo,
        status: 'success',
        latency_ms: latencyMs,
        publish_time_ms: publishTimeMs,
      });

      published += 1;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const publishTimeMs = Math.max(0, Date.now() - Date.parse(candidate.created_at));
      const errorPayload = buildErrorPayload(err);
      const stack = err instanceof Error ? err.stack ?? null : null;

      if (attemptNo >= MAX_ATTEMPTS) {
        await supabase.rpc('event_outbox_to_dead_letter', {
          p_outbox_id: candidate.id,
          p_error_payload: errorPayload,
          p_error_stack: stack,
        });

        await supabase.from('event_outbox_publish_attempts').insert({
          outbox_id: candidate.id,
          business_event_id: candidate.business_event_id,
          destination: candidate.destination,
          attempt_no: attemptNo,
          status: 'dead_lettered',
          latency_ms: latencyMs,
          publish_time_ms: publishTimeMs,
          error_message: errorPayload.message,
        });

        deadLettered += 1;
      } else {
        const retryDelayMs = computeBackoffMs(attemptNo);
        const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();

        await supabase.from('event_outbox').update({
          status: 'failed',
          attempts: attemptNo,
          next_retry_at: nextRetryAt,
          last_error: errorPayload.message,
          updated_at: new Date().toISOString(),
        }).eq('id', candidate.id);

        await supabase.from('event_outbox_publish_attempts').insert({
          outbox_id: candidate.id,
          business_event_id: candidate.business_event_id,
          destination: candidate.destination,
          attempt_no: attemptNo,
          status: 'retry',
          latency_ms: latencyMs,
          publish_time_ms: publishTimeMs,
          error_message: errorPayload.message,
        });

        retried += 1;
      }
    }
  }

  return new Response(JSON.stringify({ processed: workset.length, published, retried, deadLettered }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
