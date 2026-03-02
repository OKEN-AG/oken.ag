# Contrato operacional por portal (feed, ações, precedentes, outputs e backend)

Este documento define o **mínimo obrigatório** por portal para eliminar dados mockados, padronizar ações com capability + estado prévio, e garantir rastreabilidade ponta a ponta (status, eventos de domínio e auditoria).

## Regras transversais (válidas para todos os portais)

### 1) Feed mínimo
- Cada portal deve exibir **apenas filas relevantes para a persona**.
- Itens em feed devem ser compostos por:
  - `entity_id` (caso/operação)
  - `status_atual`
  - `owner` (quando aplicável)
  - `sla_due_at`
  - `pending_count_real` (pendências reais; sem mocks)
  - `updated_at`
- KPIs mínimos:
  - `% SLA em risco` (vence em até X horas)
  - `% SLA estourado`
  - `pendências abertas` (somatório real)
  - `itens atribuídos ao usuário`

### 2) Inputs permitidos
- Toda ação de usuário é modelada como comando de domínio (`action_type`) com payload validado.
- A UI não pode habilitar ações fora da persona.
- Ações críticas devem passar por RPC de backend.

### 3) Precedentes por ação
- Toda ação exige:
  - `required_capability`
  - `allowed_from_states[]`
  - validações de negócio mínimas (documento obrigatório, aceite prévio etc.)
- Se qualquer precedente falhar, retornar erro tipado (`code`, `message`, `details`).

### 4) Outputs obrigatórios
Toda ação válida deve produzir, em transação lógica:
1. atualização de `status` da entidade,
2. geração de `domain_event`,
3. registro em auditoria estruturada:

```json
{
  "actor": "user_id|service",
  "entity_id": "uuid",
  "from_state": "...",
  "to_state": "...",
  "reason": "texto|motivo_operacional",
  "created_at": "timestamp"
}
```

### 5) Backend obrigatório
- RLS por `tenant_id` + perfil/capability.
- RPC para ações críticas (proibido `update` direto do cliente em status sensível).
- Eventos publicados para monitoramento/compliance (`event_outbox` / stream corporativo).

---

## Matriz por portal

## Portal Credor / OEM

### Feed mínimo
- Fila de formalização de cessão por operação do credor.
- Fila de documentos pendentes do programa/campanha.
- Casos atribuídos ao gerente de carteira.
- KPIs: SLA de aceite de cessão, volume financeiro em pendência, pendências documentais abertas.

### Inputs permitidos
- Aceitar cessão.
- Solicitar ajuste documental.
- Aprovar pacote de documentos.
- Rejeitar cessão com motivo.

### Precedentes
- `queue.formalizacao.manage` para aceitar/rejeitar cessão.
- `queue.docs.manage` para ações de documentos.
- Estado mínimo:
  - aceitar/rejeitar cessão: `cession_pending`.
  - aprovar pacote documental: `docs_submitted`.

### Outputs
- Transição de status de operação (`cession_pending -> cession_accepted|cession_rejected`, etc.).
- Evento de domínio: `cession.accepted`, `cession.rejected`, `docs.package_approved`.
- Auditoria com `actor`, `entity_id`, `from_state`, `to_state`, `reason`.

---

## Portal Backoffice

### Feed mínimo
- Fila operacional consolidada (KYC, docs, formalização, pagamentos, cobrança, reconciliação).
- Casos atribuídos por squad/célula.
- KPIs: SLA por fila, backlog real, throughput diário, reprocessos.

### Inputs permitidos
- Atribuir/reatribuir caso.
- Encaminhar para próxima etapa.
- Solicitar complemento documental.
- Marcar pendência operacional resolvida.

### Precedentes
- Capability específica da fila (`queue.*.manage`) + `portal.backoffice.view`.
- Estado mínimo por transição (ex.: só encaminhar se `current_step_completed=true`).

### Outputs
- Atualização de estágio operacional (`step_n -> step_n+1` ou `on_hold`).
- Eventos: `case.assigned`, `case.reassigned`, `case.forwarded`, `case.pending_resolved`.
- Auditoria completa de transição e motivo.

---

## Portal Jurídico

### Feed mínimo
- Fila de casos com exceção jurídica/contencioso.
- Contratos em revisão com SLA de devolutiva.
- Casos atribuídos por advogado/responsável.
- KPIs: SLA de parecer, número de cláusulas críticas pendentes, aging jurídico.

### Inputs permitidos
- Aprovar minuta jurídica.
- Solicitar revisão contratual.
- Registrar contestação.
- Encerrar análise com parecer.

### Precedentes
- `queue.formalizacao.manage` e/ou capability jurídica dedicada.
- Estado mínimo:
  - aprovar minuta: `legal_review_pending`.
  - contestar: `legal_analysis_in_progress`.

### Outputs
- Atualização de status jurídico (`legal_review_pending -> legal_approved|legal_contested`).
- Eventos: `legal.minute_approved`, `legal.revision_requested`, `legal.contestation_registered`.
- Auditoria com trilha completa.

---

## Portal Tomador

### Feed mínimo
- Fila pessoal do tomador: exigências ativas e próximos passos.
- Casos do tomador com status e SLA de resposta.
- KPIs: pendências do tomador, tempo médio de resposta, itens próximos do vencimento.

### Inputs permitidos
- Enviar documento.
- Aceitar termos/condições.
- Responder exigência.
- Contestação de pendência indevida.

### Precedentes
- `portal.tomador.view` + capability de ação documental quando aplicável.
- Estado mínimo:
  - envio documental: `awaiting_borrower_documents`.
  - aceite termos: `awaiting_borrower_acceptance`.

### Outputs
- Atualização de status (`awaiting_borrower_documents -> borrower_docs_submitted`).
- Eventos: `borrower.document_submitted`, `borrower.terms_accepted`, `borrower.pending_contested`.
- Auditoria orientada a usuário final (com motivo textual).

---

## Portal Fornecedor

### Feed mínimo
- Fila de pedidos/documentos ligados ao fornecedor.
- Casos atribuídos ao fornecedor (entrega, faturamento, comprovação).
- KPIs: SLA de envio de NF/comprovantes, pendências comerciais abertas.

### Inputs permitidos
- Enviar NF/documento fiscal.
- Confirmar entrega.
- Corrigir documento rejeitado.
- Solicitar reanálise de pagamento.

### Precedentes
- `queue.docs.manage` e `queue.pagamentos.manage` quando aplicável.
- Estado mínimo:
  - envio NF: `awaiting_supplier_invoice`.
  - reanálise pagamento: `payment_rejected`.

### Outputs
- Atualização de status (`awaiting_supplier_invoice -> invoice_submitted`, etc.).
- Eventos: `supplier.invoice_submitted`, `supplier.delivery_confirmed`, `payment.reanalysis_requested`.
- Auditoria de cadeia fiscal/comercial.

---

## Portal Investidor

### Feed mínimo
- Fila de reconciliação/cobrança e exceções de carteira.
- Casos atribuídos por analista de investimentos.
- KPIs: SLA de reconciliação, inadimplência em aberto, divergências não conciliadas.

### Inputs permitidos
- Aprovar alocação/liquidação.
- Contestar divergência.
- Confirmar reconciliação.
- Escalar caso para cobrança.

### Precedentes
- `queue.reconciliacao.manage` e `queue.cobranca.manage`.
- Estado mínimo:
  - confirmar reconciliação: `reconciliation_pending`.
  - escalar cobrança: `delinquency_identified`.

### Outputs
- Atualização de status financeiro (`reconciliation_pending -> reconciled`, `delinquency_identified -> collection_initiated`).
- Eventos: `investor.reconciliation_confirmed`, `investor.divergence_contested`, `collection.escalated`.
- Auditoria com justificativa regulatória quando necessário.

---

## Portal Compliance / Auditoria

### Feed mínimo
- Fila de alertas de compliance, trilhas incompletas e exceções de política.
- Casos atribuídos ao auditor/compliance officer.
- KPIs: SLA de tratamento de alerta, não conformidades abertas, aging de plano de ação.

### Inputs permitidos
- Aprovar evidência de compliance.
- Reprovar evidência com exigência.
- Abrir incidente de conformidade.
- Encerrar incidente com plano de ação.

### Precedentes
- `portal.compliance_auditoria.view` + `audit.read` e `audit.write`.
- Estado mínimo:
  - aprovar/reprovar evidência: `evidence_under_review`.
  - encerrar incidente: `incident_in_progress`.

### Outputs
- Atualização de status de conformidade (`evidence_under_review -> evidence_approved|evidence_rejected`).
- Eventos: `compliance.evidence_approved`, `compliance.evidence_rejected`, `compliance.incident_opened`, `compliance.incident_closed`.
- Auditoria obrigatória e imutável (append-only).

---

## Contrato técnico mínimo para implementação backend

## 1) Tabelas/visões recomendadas
- `case_feed_view` (materializa feed por persona com SLA e pendências reais).
- `case_actions` (log de comandos recebidos).
- `domain_events` ou `event_outbox` (publicação assíncrona e reprocessável).
- `audit_log` (append-only com colunas obrigatórias do item 4).

## 2) RPC de ação crítica (padrão)
Assinatura sugerida:

```sql
perform_case_action(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_entity_id uuid,
  p_action_type text,
  p_reason text,
  p_payload jsonb
) returns jsonb
```

Comportamento mínimo:
1. validar tenant + capability + estado atual,
2. aplicar transição de status,
3. inserir `domain_event`,
4. inserir `audit_log`,
5. retornar estado atualizado + metadados.

## 3) RLS mínimo
- Todas as tabelas de domínio com `tenant_id` obrigatório.
- Policies separadas para leitura e escrita por capability/perfil.
- `audit_log`: leitura restrita, escrita apenas via função `SECURITY DEFINER`.

## 4) Observabilidade e compliance
- Publicar eventos com `correlation_id` e `causation_id`.
- Expor métricas de SLA real por portal/fila.
- Garantir reprocesso idempotente de eventos falhos (DLQ).

## Critérios de aceite
- Nenhum KPI de feed depende de mock/manual.
- Toda ação crítica só ocorre via RPC (sem update direto do cliente).
- 100% das transições críticas geram evento + auditoria.
- RLS impede acesso cruzado entre tenants e perfis sem capability.
