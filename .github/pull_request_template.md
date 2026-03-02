## Contexto
- Feature/Issue:
- Bounded Context primário:
- Contextos afetados:
- Squads R/A/C/I:

## Tipo de mudança
- [ ] Core (domínio/invariantes)
- [ ] Contrato (API/evento/snapshot)
- [ ] Adapter/Wrapper (integração externa)
- [ ] Observabilidade/Runbook
- [ ] Segurança/Compliance

## Checklist Arquitetural
### Boundary e domínio
- [ ] Sem acesso direto a DB de outro contexto
- [ ] Linguagem e naming consistentes com o contexto dono

### Contratos e compatibilidade
- [ ] OpenAPI/Schema atualizado e versionado (v1/v2)
- [ ] Backward compatibility definida (ou v2 criada)
- [ ] Exemplos canônicos atualizados

### Resiliência
- [ ] Timeout/deadline em síncrono
- [ ] Idempotência em escrita sensível
- [ ] Async com retry + DLQ + dedupe

### Segurança e auditoria
- [ ] AuthZ revisado (Identity policies/claims)
- [ ] Audit trail para ações críticas
- [ ] LGPD/regulatório considerado

### Blockchain (se aplicável)
- [ ] Uso apenas via Adapter (subledger/anchor/rail)
- [ ] Core opera sem blockchain
- [ ] Fallback documentado

### Operação
- [ ] Runbook atualizado
- [ ] Métricas/SLOs atualizados
- [ ] Plano de rollback/reprocessamento definido

## Evidências
- Logs/prints:
- Links para docs alterados:
