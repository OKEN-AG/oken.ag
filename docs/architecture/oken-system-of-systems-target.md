# Oken System of Systems — Arquitetura Alvo

## Objetivo

Consolidar a visão arquitetural alvo da plataforma Oken como um **System of Systems**, explicitando camadas permanentes, boundaries de domínio no Core, contratos de integração, regras de uso de blockchain, responsabilidades por domínio/squad e critérios de aceite para evolução técnica.

---

## 1) Camadas permanentes

A arquitetura deve respeitar, de forma estável, as quatro camadas abaixo.

### 1.1 Interfaces

Camada de entrada/saída com usuários e sistemas externos.

- Portais web e apps;
- APIs públicas e privadas (B2B/B2C);
- Webhooks e integrações expostas;
- Backoffice operacional e financeiro.

**Responsabilidades**

- experiência de uso e jornada;
- validações de borda e anti-corruption na entrada;
- composição/orquestração de chamadas para o Core.

**Não responsabilidades**

- regras centrais de negócio;
- persistência de estado canônico.

### 1.2 Common Core

Núcleo canônico de domínio, regras, estados e contratos principais.

- modelagem de entidades centrais e invariantes;
- processamento transacional crítico;
- versionamento de contratos de negócio;
- emissão de eventos de domínio confiáveis.

**Responsabilidades**

- manter semântica de negócio consistente;
- ser a fonte primária de verdade dos dados críticos;
- garantir compatibilidade evolutiva dos contratos centrais.

**Não responsabilidades**

- acoplamento a tecnologia específica de integração;
- dependência direta de infraestrutura externa variável.

### 1.3 Adapters

Conectores para tecnologias/sistemas externos e serviços especializados.

- bancos e gateways de pagamento;
- ERP/fiscal;
- mensageria e brokers;
- provedores KYC/KYB;
- blockchain (quando aplicável).

**Responsabilidades**

- traduzir protocolos e contratos externos;
- encapsular particularidades técnicas de cada provedor;
- implementar políticas de retry, timeout e idempotência.

**Não responsabilidades**

- definir semântica de domínio do negócio;
- ser registro canônico principal.

### 1.4 Wrappers

Empacotamento de serviços legados, parceiros e capacidades não nativas.

- façade para sistemas herdados;
- normalização de payloads heterogêneos;
- proteção contra drift de contrato externo;
- desacoplamento de migração incremental.

**Responsabilidades**

- estabilizar consumo de sistemas voláteis;
- oferecer interface padronizada para Interfaces e Core via Adapters.

**Não responsabilidades**

- substituir governança de domínio;
- centralizar regra crítica de negócio.

---

## 2) Mapa de bounded contexts do Core

O Common Core é segmentado nos bounded contexts abaixo.

| Bounded Context | Escopo principal | Entradas típicas | Saídas típicas |
| --- | --- | --- | --- |
| **Identity** | Identidade, autenticação, autorização, vínculos organizacionais e perfis. | cadastro, login, claims, eventos IAM | tokens/claims, eventos de identidade |
| **Deals** | Negociação, proposta, aceite, lifecycle comercial e estados de aprovação. | propostas, critérios, aprovações | eventos de deal, estados transacionais |
| **Vault** | Evidências, documentos, snapshots, trilha de auditoria e retenção. | upload, metadados, hash, referências | snapshots, evidências versionadas, trilhas |
| **Rails** | Trilhos operacionais e roteamento de processos entre contextos. | eventos do core, regras operacionais | comandos internos, eventos de execução |
| **Finance** | Cálculo financeiro, accrual, liquidação, repasse e reconciliação operacional. | deals aprovados, parâmetros financeiros | lançamentos financeiros, status de pagamento |
| **Accounting/Tax** | Classificação contábil/fiscal, obrigações e integração fiscal/ERP. | fatos financeiros, regras fiscais | partidas contábeis, eventos fiscais |
| **Workflow/Case** | Gestão de casos, tarefas, exceções, SLAs e fila operacional. | eventos de exceção, solicitações manuais | estados de caso, tarefas e decisões |
| **Data/BI** | Modelagem analítica, métricas, histórico consolidado e consumo BI. | eventos/snapshots do core | datasets analíticos, KPIs e visões |

### Princípios de boundary

- Cada contexto possui linguagem ubíqua própria e contratos explícitos.
- Comunicação entre contextos ocorre por contratos versionados (API/evento/snapshot), nunca por acesso direto ao banco de outro contexto.
- Mudanças de semântica requerem governança arquitetural e plano de compatibilidade.

---

## 3) Contratos de integração entre camadas

Integrações oficiais entre camadas devem seguir três mecanismos complementares.

### 3.1 API síncrona

Usar quando há necessidade de resposta imediata ao fluxo de usuário ou transação online.

**Padrões obrigatórios**

- versionamento explícito de API (ex.: `/v1`, `/v2`);
- contrato OpenAPI e exemplos canônicos;
- idempotency-key para operações de escrita sensíveis;
- deadlines, timeout e política de erro padronizada.

### 3.2 Eventos assíncronos

Usar para desacoplamento temporal, reatividade e propagação de fatos de domínio.

**Padrões obrigatórios**

- eventos imutáveis e versionados;
- `event_id` único e `occurred_at` obrigatório;
- semântica de entrega definida (at-least-once com idempotência no consumidor);
- estratégia de retry e DLQ documentada.

### 3.3 Snapshots

Usar para transferência de estado consolidado, backfill, auditoria e consumo analítico.

**Padrões obrigatórios**

- identificador de snapshot, versão de schema e referência temporal (`as_of`);
- rastreabilidade para origem dos dados (contexto, aggregate, versão);
- integridade verificável (hash/checksum quando aplicável);
- política de retenção e reprocessamento definida.

### Diretriz de escolha

- **API síncrona**: comando/consulta imediata;
- **Evento assíncrono**: propagação de fato e integração reativa;
- **Snapshot**: visão consolidada e reconciliação histórica.

---

## 4) Regra explícita sobre blockchain

Blockchain é **sempre um Adapter opcional**, nunca parte do núcleo canônico.

### Regra mandatória

- O Core não depende de blockchain para manter invariantes de negócio.
- O registro canônico primário permanece no Common Core.
- Blockchain pode ser usada como:
  - **subledger** complementar;
  - **anchor** de integridade (prova/hash);
  - **rail** alternativo de liquidação.

### Implicações arquiteturais

- Troca de tecnologia blockchain não pode exigir redesign do domínio central.
- Falha/indisponibilidade de rede blockchain não pode paralisar o core transacional crítico.
- Integrações blockchain devem ser encapsuladas por Adapters com contratos estáveis para cima.

---

## 5) Matriz RACI por domínio/squad

Matriz de referência para evitar sobreposição de responsabilidade.

Legenda: **R** = Responsible, **A** = Accountable, **C** = Consulted, **I** = Informed.

| Domínio / Decisão | Plataforma/Core Squad | Comercial/Deals Squad | Finance Squad | Fiscal/Contábil Squad | Operações/Workflow Squad | Data/BI Squad | Segurança/Compliance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Identity** (modelo e políticas) | **A/R** | C | I | I | I | I | C |
| **Deals** (regras e lifecycle) | C | **A/R** | C | I | C | I | I |
| **Vault** (evidência, retenção, trilha) | **A/R** | I | I | C | C | I | C |
| **Rails** (orquestração operacional) | A | C | C | I | **R** | I | I |
| **Finance** (cálculo, liquidação, reconciliação) | C | C | **A/R** | C | I | I | I |
| **Accounting/Tax** (classificação e obrigações) | I | I | C | **A/R** | I | I | C |
| **Workflow/Case** (casos, SLAs, exceções) | C | C | C | I | **A/R** | I | I |
| **Data/BI** (modelagem analítica e KPIs) | C | C | C | C | C | **A/R** | I |
| **Contratos entre contextos (API/evento/snapshot)** | **A/R** | C | C | C | C | C | C |
| **Uso de blockchain como adapter** | **A/R** | I | C | C | I | I | C |

### Regras de governança RACI

- Toda decisão estrutural deve ter um único **A** por domínio.
- PRs com impacto cross-context exigem aprovação dos **A** afetados.
- Conflito entre squads deve escalar para Architecture Council com registro de decisão.

---

## 6) Critérios de aceite arquitetural (checklist de PR técnico)

Toda feature que altere contratos, fluxo de domínio ou integração deve atender ao checklist abaixo.

### 6.1 Boundary e domínio

- [ ] A feature declara claramente o bounded context principal e contextos afetados.
- [ ] Não há violação de boundary (sem acesso direto a banco de outro contexto).
- [ ] Linguagem de domínio e nomes de contrato estão consistentes com o contexto dono.

### 6.2 Contratos e compatibilidade

- [ ] APIs/eventos/snapshots alterados estão versionados e documentados.
- [ ] Há estratégia de compatibilidade backward/rollout (quando aplicável).
- [ ] Campos obrigatórios/semântica crítica têm validação e testes.

### 6.3 Integração e resiliência

- [ ] Fluxos síncronos têm timeout, tratamento de erro e idempotência.
- [ ] Fluxos assíncronos têm política de retry, DLQ e deduplicação.
- [ ] Snapshots têm `as_of`, versionamento e rastreabilidade de origem.

### 6.4 Segurança, auditoria e compliance

- [ ] Requisitos de autenticação/autorização foram revisados.
- [ ] Eventos e operações críticas possuem trilha de auditoria.
- [ ] Requisitos regulatórios (financeiro/fiscal/LGPD) foram considerados.

### 6.5 Regra blockchain

- [ ] Se blockchain foi usada, está encapsulada em Adapter.
- [ ] Core funciona sem dependência hard de blockchain.
- [ ] Papel da blockchain está explícito como subledger, anchor e/ou rail.

### 6.6 Responsabilidade e operação

- [ ] RACI da feature identifica squads R/A/C/I.
- [ ] Runbook operacional e métricas de observabilidade foram atualizados.
- [ ] Plano de rollback/reprocessamento está definido para mudanças críticas.

---

## Decisão arquitetural consolidada

A plataforma Oken evolui com **Common Core canônico + integrações desacopladas por Adapters/Wrappers + Interfaces orientadas a produto**, assegurando governança por bounded context, contratos versionados e responsabilidade explícita por domínio.
