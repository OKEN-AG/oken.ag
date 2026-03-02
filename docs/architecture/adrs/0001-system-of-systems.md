# ADR 0001 — System of Systems como arquitetura alvo

## Status
Accepted

## Contexto
A plataforma Oken exige evolução modular com boundaries estáveis e integração desacoplada.

## Decisão
Adotar arquitetura em quatro camadas permanentes: Interfaces, Common Core, Adapters e Wrappers.
O Common Core permanece canônico e segmentado por bounded context.

## Consequências
- Contratos entre contexts devem ser versionados (API/evento/snapshot).
- Decisões cross-context passam por governança arquitetural registrada.
