# Blockchain Adapter Policy (Oken)

## Regra mandatória
Blockchain é Adapter opcional. O Core não depende de blockchain para invariantes.

## Usos permitidos (somente)
1) Subledger complementar
- registrar movimentos derivados do Core
- nunca substituir ledger canônico de Finance

2) Anchor de integridade
- gravar hashes de documentos/snapshots (Vault)
- objetivo: prova de integridade/imutabilidade verificável

3) Rail alternativo de liquidação
- somente quando Finance aciona explicitamente um adapter de liquidação on-chain
- deve existir fallback off-chain

## Usos proibidos
- armazenar estado canônico de Deal/Finance no chain como fonte primária
- acoplar transação crítica do Core à disponibilidade da rede blockchain
- colocar chave/segredo em client-side ou em contexto não custodiado sem política aprovada

## Requisitos técnicos do adapter
- idempotência por (tx_intent_id)
- retry com backoff + circuit-breaker
- confirmação por estado (submitted/confirmed/finalized) modelada como máquina de estados no adapter
- observabilidade obrigatória (latência, taxa de falha, fila, tempo de finalização)
- estratégia de reconciliação: comparar intent do Core vs receipts on-chain

## Fallback e continuidade
- indisponibilidade do adapter NÃO bloqueia o Core
- Core registra “pending_blockchain_anchor” / “pending_onchain_settlement” e segue o fluxo quando possível
