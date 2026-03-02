# Arquitetura de Isolamento Core vs Wrapper

## Objetivo
Definir o isolamento entre **Common Core** e **wrappers regulatórios**, padronizando:

1. boundary por wrapper (entidades expostas, APIs permitidas, obrigações de reporte);
2. feature flags/capabilities por wrapper e tenant;
3. pacotes de reporting por wrapper;
4. eventos regulatórios obrigatórios por trilho com evidência auditável.

## Princípios de isolamento

- O **Core** concentra entidades canônicas, estados e eventos de negócio.
- Cada **wrapper** controla apenas regras de exposição, compliance e reporte do seu trilho.
- Nenhum wrapper altera semântica do Core; só aplica políticas e contratos externos.
- Todo evento regulatório obrigatório deve apontar para evidência persistida.

## Matriz Core vs Wrapper

| Domínio | Core (fonte de verdade) | Wrapper (especialização) |
| --- | --- | --- |
| Entidades | `parties`, `organizations`, `programs`, `deals`, `evidences`, `core_snapshots` | Catálogo de entidades permitidas por wrapper em `wrapper_boundaries.exposed_entities` |
| APIs | APIs internas canônicas por domínio | Escopos permitidos por wrapper em `wrapper_boundaries.allowed_api_scopes` |
| Reporting | Eventos e fatos normalizados no Core | Pacotes por wrapper em `wrapper_reporting_packages` |
| Compliance | Eventos em `business_events` e trilha de evidência em `evidences` | Requisitos obrigatórios em `regulatory_event_requirements` e vínculo com prova em `regulatory_event_evidences` |
| Habilitação funcional | Regras genéricas e fluxos do produto | Feature flags/capabilities por tenant em `wrapper_capabilities` |

## Boundary por wrapper

A tabela `wrapper_boundaries` estabelece o contrato de isolamento por wrapper + tenant:

- **entidades expostas**: lista explícita de entidades do Core visíveis para o wrapper;
- **APIs permitidas**: escopos autorizados para chamadas externas;
- **obrigações de reporte**: JSON versionável com obrigações regulatórias por autoridade/período.

### Wrappers padrão suportados

- `w88`
- `fundos`
- `securitizacao`
- `servicing`

## Capability model por wrapper e tenant

`wrapper_capabilities` habilita rollout progressivo com granularidade de tenant:

- chave de capability (`capability_key`);
- estado habilitado/desabilitado (`is_enabled`);
- estratégia de rollout (`rollout_strategy`);
- janelas de ativação/desativação (`enabled_at`/`disabled_at`).

Uso recomendado:

1. manter capabilities destrutivas desligadas por padrão;
2. liberar por tenant piloto;
3. promover para população total após validação de métricas e evidências.

## Pacotes de reporting por wrapper

`wrapper_reporting_packages` centraliza os pacotes regulatórios por wrapper, incluindo:

- `package_code` e `package_name`;
- órgão regulador;
- periodicidade;
- referência de schema do payload.

Pacotes padrão sem tenant (`tenant_id = NULL`):

- Plataforma 88 (`W88-MENSAL`);
- Fundos (`FUNDOS-MENSAL`);
- Securitização (`SEC-MENSAL`);
- Servicing (`SERV-DIARIO`).

Tenants podem sobrescrever/adicionar pacotes específicos mantendo o mesmo modelo.

## Eventos regulatórios obrigatórios e evidência

### Mapeamento obrigatório por trilho

`regulatory_event_requirements` define quais eventos são obrigatórios por trilho regulatório:

- trilho (`regulatory_trail`): `plataforma_88`, `fundos`, `securitizacao`, `servicing`;
- wrapper responsável;
- evento e versão;
- tipo de evidência mínima;
- regra de prazo (`evidence_due_rule`) e retenção (`retention_days`).

### Armazenamento de evidência

`regulatory_event_evidences` vincula:

- requisito regulatório;
- ocorrência real em `business_events`;
- prova correspondente em `evidences`.

Esse vínculo fecha a trilha de auditoria do requisito até a evidência material.

## Controles de segurança

Todas as tabelas de isolamento/regulação usam RLS com escopo tenant-aware:

- leitura e escrita permitidas para `admin`;
- demais usuários limitados ao `tenant_id` do JWT (`public.current_tenant_id()`).

## Operação recomendada

1. Criar boundary inicial por wrapper para cada tenant ativo.
2. Definir capability baseline por wrapper.
3. Confirmar pacote regulatório padrão e sobrescritas por tenant quando necessário.
4. Cadastrar requisitos obrigatórios por trilho.
5. Exigir vínculo de evidência para conclusão de eventos regulatórios.
