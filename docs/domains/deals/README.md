# Domínio deals

## 1. Objetivo e escopo

Definir responsabilidades do domínio **deals** no Common Core, com ownership explícito e boundary estável.

## 2. Agregados e invariantes

- Agregados centrais documentados pelo squad dono.
- Invariantes obrigatórias com validação em contrato e testes.

## 3. Comandos e eventos

- Comandos síncronos versionados via API.
- Eventos assíncronos imutáveis com `event_id` e `occurred_at`.

## 4. Integrações externas via adapters

- Integrações externas ocorrem apenas por adapters.
- Requisitos mínimos: timeout, retry, idempotência e observabilidade.

## 5. Compliance e auditoria

- Revisão de autorização/autenticação para operações críticas.
- Trilha de auditoria para mutações e decisões sensíveis.

## 6. Backlog técnico

- Evoluções pendentes com owner, risco e critério de aceite.
