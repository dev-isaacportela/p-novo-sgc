// add-013 — Server Functions da spec 011 (compras inteligentes): a consulta de
// ressuprimento no WinThor (medidas por produto ativo do fornecedor na filial),
// os detalhes do SKU, os parâmetros de compra, as vendas desconsideradas, o
// bloqueio do carrinho por pedido aberto e a eficiência do comprador. Ver
// docs/specs/011-compras-inteligentes/.
//
// STUB DA BASE (S2): o arquivo existe para o `PUBLISH_ORDER` e o mapa de ids
// nascerem com a onda 4; quem preenche `definitions` é o agente da 011 (S3).
//
// Faixa de id local: 81xx (R-081 do 000) — leituras 8101-8109
// (sgcWintRessuprimento, sgcWintProdutoHistorico, sgcWintProdutoUltimasCompras,
// sgcWintProdutoEstoqueFiliais, sgcWintProdutoVendas, sgcParametrosCompraListar,
// sgcVendasDesconsideradasListar, sgcPedidoAbertoDoFornecedor,
// sgcEficienciaComprador), escritas 8150-8154 (sgcEscParametroCompraSalvar,
// sgcEscParametroCompraSilenciar, sgcEscParametroCompraRestaurar,
// sgcEscVendaDesconsiderar, sgcEscVendaReconsiderar).
//
// O padrão a seguir é o de `add-010-bo.mjs`: guarda de persona única (R-013),
// `WINTHOR` com os nomes que falam com o Oracle, `montarDefinitions(ids)` +
// `export const definitions`, publicação em dois passos e `isEntrypoint()`
// guardado por `MITRA_BASE_URL`. Esta spec não tem JAVASCRIPT nem cron
// (R-081): a fórmula roda em regra pura da tela (`lib/ressuprimento.ts`,
// R-083) e o pedido do carrinho nasce pelas SFs da 002 e da 003 (R-091).
//
// As tabelas `SGC_PARAMETRO_COMPRA` e `SGC_VENDA_DESCONSIDERADA` já estão no
// `setup-backend.mjs`, e os shims que a consulta principal usa (`POWER`,
// `SQRT`, `ADD_MONTHS` e o gerador de calendário `FROM DUAL CONNECT BY LEVEL`)
// já estão em `simulator/mysql-dialect.mjs` — os dois pela base (R-113).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-013-compras-inteligentes.mjs

import 'dotenv/config';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintRessuprimento', 'sgcWintProdutoHistorico',
  'sgcWintProdutoUltimasCompras', 'sgcWintProdutoEstoqueFiliais', 'sgcWintProdutoVendas'];

export const definitions = [];
