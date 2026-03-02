# Oken — Naming Conventions (Published Language)

## Objetivo
Padronizar naming de APIs, eventos, snapshots e comandos para evitar drift semântico entre contexts.

## Regras

### Eventos
Formato obrigatório: `<context>.<event_name>.v<version>`
- `context`: lowercase (`identity`, `deals`, `finance`)
- `event_name`: snake_case
- `version`: inteiro positivo iniciado em 1

Exemplos:
- `deals.deal_approved.v1`
- `finance.settlement_initiated.v1`

### Snapshots
Formato obrigatório: `<context>.<snapshot_name>.v<version>`

Exemplos:
- `finance.settlement_snapshot.v1`
- `vault.document_snapshot.v1`

### APIs
- Prefixo versionado obrigatório: `/v1/...`, `/v2/...`
- Comandos de transição de estado em verbo explícito:
  - `POST /v1/deals/{id}/approve`

### Schema files
- Evento: `docs/schemas/events/<event_name>.schema.json`
- Snapshot: `docs/schemas/snapshots/<snapshot_name>.schema.json`
- Nome do arquivo deve coincidir com o identificador de versão do contrato.

## Governança
- Mudança de semântica incompatível exige nova versão (`v2+`) e ADR.
- PR que altera contratos deve atualizar exemplos canônicos e catálogo de contratos.
