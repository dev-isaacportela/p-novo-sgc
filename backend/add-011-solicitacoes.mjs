// add-011 — Server Functions da spec 008 (solicitações do comercial): registro
// pelo vendedor, avaliação por compras, vínculo com o item do pedido, histórico
// e rastreio pós-aprovação. Ver docs/specs/008-solicitacoes-do-comercial/.
//
// STUB DA BASE (S2): o arquivo existe para o `PUBLISH_ORDER` e o mapa de ids
// nascerem com a onda 3; quem preenche `definitions` é o agente da 008 (S3).
//
// Faixa de id local: 78xx (R-051/R-072 do 000) — leituras e JAVASCRIPT
// 7801-7807 (sgcWintClienteBuscar, sgcWintRastreioSolicitacoes,
// sgcSolicitacoesListar, sgcSolicitacoesListarTotal, sgcSolicitacoesDaMontagem,
// sgcSolicitacaoCarregar, sgcSolicitacaoIncluirNoPedido), escritas 7850-7857
// (sgcEscSolicitacaoInserir…sgcEscSolicitacaoHistoricoRegistrar).
//
// O padrão a seguir é o de `add-010-bo.mjs`, o mais novo da casa: preâmbulo JS
// e guarda de persona única (R-013) copiados de lá, `WINTHOR` com os nomes que
// falam com o Oracle, `montarDefinitions(ids)` + `export const definitions`,
// publicação em dois passos (SQL primeiro, JAVASCRIPT depois com os ids reais,
// R-016) e `isEntrypoint()` guardado por `MITRA_BASE_URL`.
//
// A régua de situação de atendimento vem de `backend/sql/situacao-solicitacao.sql`
// pelo loader `fragmento(nome)` de `backend/lib/fragmentos.mjs` (R-070/R-075) —
// o arquivo .sql é entrega da 008, com o contrato de aliases no cabeçalho.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-011-solicitacoes.mjs

import 'dotenv/config';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintClienteBuscar', 'sgcWintRastreioSolicitacoes'];

export const definitions = [];
