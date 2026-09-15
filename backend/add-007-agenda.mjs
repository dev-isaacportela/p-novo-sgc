// add-007 — Server Functions da spec 004 (agenda de análises): agendamento
// recorrente que gera pedido de compra. Ver
// docs/specs/004-agenda-de-analises/.
//
// Faixa de id local: 74xx — leituras e JAVASCRIPT a partir de 7401
// (sgcAgendaListar…, inclusive sgcAgendaProcessar, cron `0 */30 * * * *`),
// escritas a partir de 7450 (sgcEscAgendaInserir…), até 7458
// (sgcEscAgendaEnvio). O id local vem de SERVER_FUNCTIONS em
// frontend/src/lib/server-functions.ts até o sync-server-function-map.mjs
// trazer os reais do sandbox — mesmo padrão de add-001-kanban.mjs.
//
// Ainda SEM Server Function: a spec 004 entra aqui. `definitions = []` até lá.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-007-agenda.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-007-agenda: nenhuma server function ainda — stub da spec 004 (agenda de análises).');
}
