## Resumo

<!-- Descreva brevemente a mudança e o objetivo de negócio/técnico. -->

## Checklist obrigatório — mudanças de domínio

> Preencha este bloco quando a PR alterar entidades, regras de negócio, eventos, APIs ou dados.

- [ ] Identifiquei os bounded contexts impactados.
- [ ] RFC criada/aprovada (ou justifiquei por que não é necessária).
- [ ] Avaliei impacto em **eventos** (novos, alterados, removidos, versionados).
- [ ] Avaliei impacto em **APIs** (request/response, contratos, consumers/producers).
- [ ] Avaliei impacto em **dados** (schema, migrações, backfill, retenção, auditoria).
- [ ] Atualizei versionamento semântico dos schemas afetados (`MAJOR.MINOR.PATCH`).
- [ ] Documentei política de compatibilidade (backward/forward) para os contratos alterados.
- [ ] Defini plano de rollout e rollback para mudanças com risco de incompatibilidade.

## Evidências de validação

- [ ] Testes automatizados relevantes executados.
- [ ] Verificações manuais/documentais relevantes executadas.
