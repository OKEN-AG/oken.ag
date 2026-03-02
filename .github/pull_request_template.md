## Resumo

<!-- objetivo da mudança, contexto e impacto -->

## Bounded context e boundary

- [ ] Contexto principal identificado
- [ ] Contextos afetados listados
- [ ] Sem acesso direto a banco de outro contexto

## Contratos e compatibilidade

- [ ] API/evento/snapshot versionado
- [ ] Estratégia de backward compatibility definida
- [ ] Campos críticos validados com testes

## Integração e resiliência

- [ ] Timeout + erro + idempotência (fluxo síncrono)
- [ ] Retry + DLQ + deduplicação (fluxo assíncrono)
- [ ] Snapshot com `as_of`, versão e origem

## Segurança, compliance e auditoria

- [ ] Revisão de autenticação/autorização
- [ ] Trilhas de auditoria para operações críticas
- [ ] Impacto regulatório (financeiro/fiscal/LGPD) revisado

## Blockchain (quando aplicável)

- [ ] Encapsulada em adapter
- [ ] Core sem dependência hard
- [ ] Uso explícito: subledger, anchor e/ou rail

## Operação

- [ ] RACI da feature (R/A/C/I)
- [ ] Runbook/observabilidade atualizados
- [ ] Rollback/reprocessamento definidos
