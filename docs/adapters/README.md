# Padrão de Adapters

## Requisitos mínimos

- Contrato interno estável e versionado para o Core.
- Timeout e retry explícitos por operação.
- Idempotência para escrita e compensação quando necessário.
- Circuit-breaker para dependências externas instáveis.
- Logs estruturados e métricas (latência, erro, throughput).

## Checklist de qualidade

- [ ] Contrato publicado e owner definido.
- [ ] Política de fallback e degradação graciosa.
- [ ] Alertas operacionais e runbook vinculados.
