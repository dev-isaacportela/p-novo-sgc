// add-006 — Server Functions da spec 003 (itens do pedido): análise de
// montagem no WinThor, alertas (vencimento/excesso) e prazo de pagamento. Ver
// docs/specs/003-itens-do-pedido/.
//
// Faixa de id local: 73xx — leituras e JAVASCRIPT a partir de 7301
// (sgcWintAnaliseMontagem…), escritas a partir de 7350 (sgcEscItemGravar…).
// O id local vem de SERVER_FUNCTIONS em frontend/src/lib/server-functions.ts
// até o sync-server-function-map.mjs trazer os reais do sandbox — mesmo
// padrão de add-001-kanban.mjs.
//
// As sgcWint* (Oracle) resolvem o jdbcId por NOME, com `jdbcIdWinthor` de
// add-003-jdbc-winthor.mjs — nunca por id numérico fixo. No simulador o
// jdbcId é ignorado. sgcCustoUnidadesPorCaixa é INTEGRATION (conexão
// gestao-de-custos), não JDBC.
//
// Ainda SEM Server Function: a spec 003 entra aqui. `definitions = []` até lá.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-006-itens.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-006-itens: nenhuma server function ainda — stub da spec 003 (itens do pedido).');
}
