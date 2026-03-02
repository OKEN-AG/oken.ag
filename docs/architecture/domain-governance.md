# Domain Governance

## Objetivo

Este documento formaliza a governança dos bounded contexts oficiais da plataforma, seus responsáveis e as regras obrigatórias para evolução de domínio.

## Bounded Contexts Oficiais

| Contexto | Escopo funcional | Dono técnico | Dono de produto |
| --- | --- | --- | --- |
| **Identity** | Usuários, autenticação, autorização, perfis e vínculo com organizações. | Tech Lead de Plataforma | PM de Plataforma |
| **Programs** | Programas de incentivo, critérios, vigência, elegibilidade e catálogos. | Tech Lead de Incentivos | PM de Incentivos |
| **Deals** | Negociações, propostas, aceites, estados de aprovação e lifecycle do deal. | Tech Lead Comercial Digital | PM Comercial |
| **Vault** | Evidências, documentos, trilha de auditoria, snapshots e retenção. | Tech Lead de Compliance & Dados | PM de Compliance |
| **Rails** | Fluxos operacionais, orquestração entre contextos e estados de processamento. | Tech Lead de Orquestração | PM de Operações |
| **Finance** | Cálculo financeiro, accruals, pagamentos, repasses e reconciliações operacionais. | Tech Lead Financeiro | PM Financeiro |
| **Accounting/Tax** | Classificação contábil/fiscal, obrigações tributárias e integração com ERP/fiscal. | Tech Lead Contábil/Fiscal | PM Contábil/Fiscal |

> **Nota operacional:** os nomes de pessoas para cada papel devem ser mantidos no diretório interno de governança organizacional. Neste repositório, os papéis são registrados por função para evitar desatualização nominal.

## Regras de Mudança de Domínio

Toda mudança que altere semântica, contratos de evento, APIs ou persistência de um bounded context deve seguir o fluxo abaixo.

### 1) RFC obrigatória

É obrigatório abrir uma RFC (Request for Comments) antes da implementação quando ocorrer ao menos um dos cenários:

- inclusão/remoção de entidade de domínio;
- alteração de invariantes de negócio;
- alteração de schema de evento ou payload API;
- alteração de relacionamento entre bounded contexts;
- migração de dados que afete compatibilidade.

**Mínimo da RFC:**

1. Contexto(s) impactado(s);
2. Motivação e problema de negócio;
3. Mudança proposta (modelo, eventos, APIs, dados);
4. Plano de compatibilidade e rollout;
5. Estratégia de migração/backfill (quando aplicável);
6. Riscos e plano de rollback.

### 2) Versionamento semântico

Mudanças de domínio e de schema devem seguir SemVer:

- **MAJOR**: quebra de compatibilidade (ex.: remoção de campo obrigatório, mudança de semântica incompatível);
- **MINOR**: evolução compatível (ex.: novo campo opcional, novo evento, novo enum sem quebra em consumidores tolerantes);
- **PATCH**: correções sem alteração de contrato.

#### Política de aplicação

- Cada schema em `docs/schemas/core/` deve manter um campo `version` no padrão `MAJOR.MINOR.PATCH`.
- Toda mudança de MAJOR exige plano de coexistência entre versões por janela mínima definida em RFC.
- Alterações MINOR e PATCH devem manter leitura de versões anteriores durante rollout.

## Critérios de aprovação

Uma mudança de domínio só pode ser aprovada quando:

- houver RFC aprovada (quando aplicável);
- checklist de PR para domínio estiver completo;
- política de compatibilidade estiver explícita nos schemas afetados;
- impactos em eventos, APIs e dados estiverem documentados.
