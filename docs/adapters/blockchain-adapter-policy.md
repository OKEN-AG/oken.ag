# Política de Blockchain como Adapter

## Regra mandatória

Blockchain é opcional e nunca compõe o núcleo canônico do Common Core.

## Usos permitidos

1. Subledger complementar;
2. Anchor de integridade (hash/prova);
3. Rail alternativo de liquidação.

## Usos proibidos

- Persistir estado canônico primário no ledger externo.
- Tornar invariantes de negócio dependentes de disponibilidade blockchain.

## Continuidade e fallback

- Core deve operar plenamente sem rede blockchain.
- Falhas no adapter blockchain devem acionar fila de compensação/reprocessamento.
