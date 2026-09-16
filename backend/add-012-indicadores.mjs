// add-012 — Server Functions da spec 009 (indicadores e relatórios): KPIs e
// blocos de `/analises`, SLA dos pedidos por etapa, funil das solicitações,
// compras × vendas no WinThor e os relatórios salvos de `/relatorios`. Ver
// docs/specs/009-indicadores-e-relatorios/.
//
// STUB DA BASE (S2): o arquivo existe para o `PUBLISH_ORDER` e o mapa de ids
// nascerem com a onda 3; quem preenche `definitions` é o agente da 009 (S3).
//
// Faixa de id local: 79xx (R-051/R-072 do 000) — leituras 7901-7917
// (sgcIndResumo, sgcIndPedidosPorFase, sgcIndAgendaAtrasos, sgcIndProdutosBo,
// sgcIndPerfilFornecedor, sgcIndLeadTime, sgcWintComprasVsVendas,
// sgcSlaPedidosKpis, sgcSlaPedidosListar, sgcSlaPedidosListarTotal,
// sgcSlaPedidoFases, sgcSolicitacoesFunil, sgcSolicitacoesPorVendedor,
// sgcRelatoriosListar, sgcRelatorioPedidos, sgcRelatorioPedidosTotal,
// sgcRelatorioAgregar), escritas 7950-7952 (sgcEscRelatorioInserir,
// sgcEscRelatorioAtualizar, sgcEscRelatorioExcluir). Se a 010 provar que
// precisa de consulta própria, ela entra aqui em 7990-7999 (R-051).
//
// O padrão a seguir é o de `add-010-bo.mjs`: guarda de persona única (R-013),
// `WINTHOR` com os nomes que falam com o Oracle, `montarDefinitions(ids)` +
// `export const definitions`, publicação em dois passos e `isEntrypoint()`
// guardado por `MITRA_BASE_URL`. Esta spec não tem JAVASCRIPT nem cron: o
// paralelismo dos blocos é da tela (R-057).
//
// Os dias úteis do SLA vêm de `backend/lib/dias-uteis.mjs` (R-025) e a régua de
// situação das solicitações, de `backend/sql/situacao-solicitacao.sql` pelo
// `fragmento(nome)` de `backend/lib/fragmentos.mjs` (R-070/R-075) — a 009 não
// escreve régua própria.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-012-indicadores.mjs

import 'dotenv/config';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintComprasVsVendas'];

export const definitions = [];
