// add-005 — Server Functions da spec 002 (quadro de compras): pedido, fases,
// personas, notificações e envio à indústria. Ver
// docs/specs/002-quadro-de-compras/.
//
// Faixa de id local: 72xx — leituras e JAVASCRIPT a partir de 7201
// (sgcPersonaAtual…), escritas a partir de 7250 (sgcEscPedidoCriar…), até
// 7260 (sgcEscPedidoCapaInserir). O id local vem de SERVER_FUNCTIONS em
// frontend/src/lib/server-functions.ts até o sync-server-function-map.mjs
// trazer os reais do sandbox — mesmo padrão de add-001-kanban.mjs.
//
// As regras ligadas do quadro (sgcPodeMover/sgcPodeExcluir, gancho de
// servidor) entram em `ganchos` no `instalar()` de add-001-kanban.mjs, junto
// com esta spec — não aqui.
//
// SF chamada por id (kbCardCriar sem sessão, os ganchos gravados em KB_META,
// as sgcEsc* internas desta spec): no simulador resolve pelo mapa inteiro de
// backend/ids-do-mapa.mjs (`idsDoMapa`), usado em
// backend/simulator/smoke/base.mjs; na publicação real o id vem por NOME,
// via `listServerFunctionsMitra`.
//
// Ainda SEM Server Function: a spec 002 entra aqui. `definitions = []` até lá.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-005-quadro-compras.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-005-quadro-compras: nenhuma server function ainda — stub da spec 002 (quadro de compras).');
}
