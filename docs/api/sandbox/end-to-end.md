# Sandbox API (v0.1)

Base URL: `https://api.sandbox.oken.ag/v1`

## Padrões obrigatórios

- Autenticação: `Authorization: Bearer <token OAuth2>` **ou** `x-api-key: <key>`.
- Rastreio: `x-correlation-id: <uuid>` em todas as chamadas.
- Escrita idempotente (`POST`): `idempotency-key: <string-única>`.
- Multi-tenant: incluir `tenant_id` em filtros/listagens e payload de criação.

## Fluxo ponta a ponta

1. Criar uma parte (`POST /parties`).
2. Criar um deal usando a parte (`POST /deals`).
3. Anexar evidência ao deal (`POST /evidence`).
4. Consultar eventos gerados (`GET /events`).
5. Registrar webhook para receber `deal.*` e `evidence.*`.

## Retry de webhook

- Estratégia: `exponential_backoff_with_jitter`
- Tentativas: 8
- Delay inicial: 30s (até 3600s)
- Códigos de retry: `408,409,425,429,500,502,503,504`

## Verificação de assinatura HMAC

Headers recebidos:

- `x-oken-signature: t=<timestamp>,v1=<signature_hex>`
- `x-oken-delivery-id: <uuid>`
- `x-oken-attempt: <n>`

Assinatura esperada:

```text
v1 = hex(HMAC_SHA256(secret, "${timestamp}.${raw_body}"))
```

Recusar requisição se:

- timestamp fora da janela (recomendado: 5 minutos)
- assinatura inválida
- replay de `x-oken-delivery-id` já processado

## Exemplos

Ver pasta `docs/api/sandbox/examples/`.
