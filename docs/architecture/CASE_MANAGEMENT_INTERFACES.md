# Interfaces Operacionais por Papel e Gestão de Casos

## Objetivo
Estruturar o desenho de interfaces e filas operacionais orientadas a caso para suportar execução com governança (`maker-checker`, quatro-olhos, alçadas), tratamento de exceções e observabilidade ponta a ponta.

---

## 1) Portais específicos por perfil

### 1.1 Credor / OEM
- Visão de pipeline por programa/campanha, exposição de risco e carteira em formalização.
- Aprovação comercial/financeira por alçada com trilha de auditoria.
- Painel de desempenho de originadores, tomadores e fornecedores.

### 1.2 Operações / Backoffice
- Workbench central para triagem e execução de filas por etapa.
- Ações em lote (priorizar, redistribuir, escalar, reabrir caso).
- Sinalização de gargalos por SLA e por bloqueador recorrente.

### 1.3 Formalização / Jurídico
- Esteira de contratos e checklists legais por tipo de operação.
- Controle de versão documental, pendências de assinatura e exigências cartoriais.
- Aprovação com dupla validação para cláusulas críticas e overrides.

### 1.4 Tomador
- Acompanhamento do status do caso, pendências e prazos.
- Upload de documentos e resposta a exigências com histórico.
- Linha do tempo de eventos relevantes (KYC, aprovação, formalização, liquidação).

### 1.5 Fornecedor / Comprador
- Portal de aceite operacional/comercial e confirmação documental.
- Gestão de pendências de entrega, faturamento e reconciliação.
- Histórico de notificações e contraparte associada ao caso.

### 1.6 Investidor
- Visão de carteira por ativo/caso com risco, status e eventos críticos.
- Acompanhamento de alocação, liquidação e inadimplência.
- Fila específica de `investor ops` com métricas de SLA e impacto financeiro.

### 1.7 Compliance
- Supervisão de KYC/KYB, documentação obrigatória e flags regulatórias.
- Aprovações de exceção com justificativa mandatória e evidências anexas.
- Painel de auditoria com trilha completa por caso, ator e decisão.

---

## 2) Filas por etapa (queue model)

Cada caso deve transitar por filas explícitas, com owner, SLA e regra de saída:

1. **KYC/KYB**: validação cadastral, PEP/sanções, risco AML e pendências de cadastro.
2. **Documentos**: checklist obrigatório, validade, assinatura e consistência de metadados.
3. **Formalização**: geração/revisão/aprovação de instrumentos e assinaturas.
4. **Pagamentos**: instrução, autorização, liquidação e confirmação bancária.
5. **Reconciliação**: conciliação de eventos financeiros e divergências operacionais.
6. **Cobrança**: régua de cobrança, renegociação e acionamento jurídico.
7. **Investor Ops**: eventos de carteira, distribuição, ajustes e comunicação a investidores.

### Regras mínimas de fila
- `entry_criteria`: critérios objetivos para entrada na etapa.
- `exit_criteria`: condições para avanço sem ambiguidade.
- `blocked_reason`: enum obrigatório quando o caso não progride.
- `owner_role` e `owner_id`: responsabilidade nominal por etapa.
- `sla_due_at` e `sla_breached_at`: controle de prazo e violação.

---

## 3) Governança de decisão (`maker-checker`, quatro-olhos, alçadas)

### 3.1 Políticas obrigatórias
- **Maker-checker**: quem propõe uma ação crítica não pode aprová-la.
- **Quatro-olhos**: exigência de dupla validação em eventos sensíveis.
- **Alçadas**: regras parametrizadas por valor, risco, contraparte e produto.

### 3.2 Override controlado
- Permitir override apenas para perfis autorizados.
- Exigir `justification_code` + comentário livre obrigatório.
- Registrar evidências anexas e impacto esperado.
- Forçar revisão posterior por função de controle (ex.: compliance/auditoria).

### 3.3 SLA por etapa e por decisão
- SLA operacional da fila (`time_to_first_action`, `time_to_resolution`).
- SLA de aprovação (`time_to_approve`, `time_in_override`).
- Escalonamento automático por faixa de atraso (warning/critical).

---

## 4) Integração com `exception_cases`

Padronizar tratamento de exceções como subdomínio transversal:

- Todo caso pode abrir 0..N `exception_cases` vinculados à etapa atual.
- Exceção deve conter severidade, categoria, impacto e owner.
- Comentários e anexos versionados com trilha temporal.
- Playbook de tratamento vinculado por tipo de exceção.

### Contrato funcional mínimo
- `exception_case_id`, `deal_id`, `stage`, `severity`, `status`, `owner_id`.
- `playbook_id`, `next_action`, `next_action_due_at`.
- `resolution_code`, `resolution_notes`, `resolved_at`.

---

## 5) Observability by case

Cada portal deve expor o mesmo resumo operacional por caso:

- **Etapa atual** (`current_stage`).
- **Blocker ativo** (`blocker_reason` + idade do blocker).
- **Owner responsável** (papel e usuário).
- **Próximo SLA** (`next_sla_at`, status de risco de violação).
- **Risco operacional** (atraso, retrabalho, handoffs).
- **Risco financeiro** (valor em risco, exposição, probabilidade de perda).
- **Risco regulatório** (KYC pendente, documentação crítica, override sem fechamento).

### Indicadores mínimos
- `cycle_time_by_stage`.
- `queue_age_p95` por etapa.
- `override_rate` por alçada.
- `exception_reopen_rate`.
- `sla_breach_rate` por portal/time.

---

## 6) Sequência recomendada de implementação

1. Modelar filas e metadados de SLA por etapa.
2. Implantar políticas de aprovação (`maker-checker` + alçadas).
3. Conectar `exception_cases` com comentários, anexos e playbooks.
4. Publicar visão única de observabilidade por caso.
5. Especializar UX por portal sem duplicar regra de negócio.
