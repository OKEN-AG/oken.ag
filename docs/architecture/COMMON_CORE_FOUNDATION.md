# Oken Common Core Foundation (Fase 1)

## Objetivo
Estabelecer a base de **domínio + dados** para evoluir o sistema atual para um modelo de *system of systems* com 4 camadas permanentes:

1. Interfaces / Originação / Operação
2. Common Core
3. Adapters e integrações
4. Wrappers regulatórios

> Princípio: blockchain, escrow, Pix/BaaS e registradores são adapters plugáveis; o núcleo operacional e de evidências permanece estável.

---

## 1) Fronteiras de camada

### 1.1 Interfaces
Portais e APIs de entrada para: cliente credor, operação/backoffice, jurídico, tomador, fornecedor, comprador, investidor, parceiros e auditoria.

### 1.2 Common Core
Fonte única de verdade de entidades, estados, eventos e snapshots.

### 1.3 Adapters
Conectores externos (banco, KYC, assinatura, registrador, ERP, oráculos, blockchain opcional).

### 1.4 Wrappers regulatórios
Cascas de produto/regulação (plataforma 88, gestão/fundos, securitização) sem acoplamento de regra regulatória dentro do core.

---

## 2) Entidades canônicas mínimas do Common Core

### 2.1 Partes e organizações
- `parties`: pessoas/empresas/investidores/produtores/fornecedores/compradores.
- `organizations`: cliente, credor, originador, fundo, securitizadora e afins.

### 2.2 Programa e operação econômica
- `programs`: campanha/linha/safra com versionamento.
- `deals`: caso econômico em formação e ciclo operacional.

### 2.3 Evidência, snapshot e rastreabilidade
- `evidences`: documento, hash, assinatura, laudo, oráculo.
- `core_snapshots`: fotografias imutáveis usadas em decisão crítica.

### 2.4 Backbone de eventos
- `business_events`: trilha canônica e consultável de eventos de negócio.
- `event_outbox`: publicação assíncrona confiável (idempotência + retries).

---

## 3) Regras de desenho (Fase 1)

1. **Toda decisão crítica deve carregar `snapshot_id`.**
2. **Eventos são imutáveis e versionados (`event_version`).**
3. **Integrações assíncronas saem por outbox**, nunca por chamada direta não transacional.
4. **Adapters não definem verdade de negócio**; apenas refletem estado externo reconciliável.
5. **Transição incremental** com ponte para legado (`campaigns`, `operations`, `operation_documents`).

---

## 4) Plano de transição com o legado atual

### 4.1 Origem de dados existente
Hoje o sistema opera com foco em campanhas/operações e snapshots de cálculo.

### 4.2 Estratégia de migração
1. Introduzir tabelas canônicas sem remover tabelas legadas.
2. Conectar `programs.legacy_campaign_id -> campaigns.id`.
3. Conectar `deals.legacy_operation_id -> operations.id`.
4. Iniciar escrita de eventos em `business_events` para novos fluxos.
5. Migrar gradualmente serviços e telas para leitura do core.

### 4.3 Critério de pronto da fase
- Domínio canônico criado e versionado.
- Outbox habilitada para integrações críticas.
- Snapshots obrigatórios para decisões de elegibilidade/pricing/formalização/liquidação.

---

## 5) Próximas entregas (Fase 2)

1. Expandir core para `cash_accounts`, `positions`, `investor_orders`, `accounting_entries`, `tax_events`.
2. Catálogo oficial de eventos com schema registry (`docs/schemas/events/*`).
3. APIs internas por domínio (`/parties`, `/programs`, `/deals`, `/evidence`, `/events`).
4. Case management com SLA, approvals e exception handling.



## 6) Endurecimento aplicado após revisão (Fase 1.1)

Após revisão da fundação inicial, foi definido endurecimento mínimo de banco:

- FK explícita `deals.snapshot_id -> core_snapshots.id`.
- Checks de integridade (`event_version > 0`, `attempts >= 0`, valores monetários não negativos em `deals`).
- Índices únicos para pontes legadas (`programs.legacy_campaign_id`, `deals.legacy_operation_id`).
- Triggers de `updated_at` para tabelas novas do core.
- Políticas RLS mínimas para leitura autenticada e gestão por administradores.

> Próxima evolução recomendada: substituir políticas globais por políticas tenant-aware com `tenant_id` obrigatório e escopo por organização/partes relacionadas.

---


## 7) Segurança tenant-aware (Fase 1.2)

A evolução seguinte da segurança substitui leitura global por leitura **escopada por tenant**:

- função `public.current_tenant_id()` para resolver `tenant_id` do JWT com fallback seguro;
- políticas RLS de `SELECT/INSERT/UPDATE` por `tenant_id`, com exceção administrativa;
- `event_outbox` escopado por tenant via relacionamento com `business_events`;
- índices por `tenant_id` para manter performance das políticas RLS.

### Checklist operacional para ativação
1. Garantir emissão de `tenant_id` no JWT para usuários autenticados.
2. Iniciar backfill de `tenant_id` em registros legados migrados para o core.
3. Evoluir para `tenant_id NOT NULL` nas tabelas canônicas quando backfill concluir.
4. Configurar testes de regressão de acesso cruzado entre tenants.

---


## 8) Ponte legado/core para estabilização da migração (Fase 1.3)

Para suportar operação paralela com legado sem perda de rastreabilidade:

- Trigger `sync_legacy_operation_to_core_deal_trigger` sincroniza escrita de `operations` para `deals` no fluxo atual de criação/atualização.
- `core_snapshots` são persistidos nos pontos de decisão de `simulacao`, `pedido` (aprovação) e `formalizado`.
- `business_events` são emitidos com `snapshot_id` e `idempotency_key` determinística por operação/status/timestamp.
- Logs de reconciliação ficam em `operation_deal_reconciliation_logs` para auditoria de divergências legado x core.
- View `operations_deals_divergence_dashboard` publica o dashboard SQL de divergência para estabilização da migração.
