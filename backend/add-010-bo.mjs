// add-010 — Server Functions da spec 007 (produtos em B.O.): itens
// indisponíveis, previsão de liberação, carta de falta, clientes impactados,
// painel consolidado. Ainda STUB — nasce aqui (S2, base da onda 2) só com a
// faixa de id; as `definitions` chegam com o agente da 007. Ver
// docs/specs/007-produtos-em-bo/{spec,plan,tasks}.md.
//
// Faixa de id local: 77xx (R-024) — leituras e JAVASCRIPT 7701-7709
// (sgcBoItensCard, sgcBoPainel, sgcBoCarregar, sgcBoMarcar, sgcBoMonitorar —
// cron `0 5 11 * * *` —, etc.), escritas 7750-7756 (sgcEscBoItemInserir…
// sgcEscPedidoAlertaBo). Padrão a seguir (ver add-007-agenda.mjs):
// `definitions` com os ids do mapa deste projeto (backend/ids-do-mapa.mjs),
// marcador `__SGC_IDS__` nas escritas chamadas por id, `isEntrypoint()`
// guardado por `MITRA_BASE_URL`.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox, quando a 007 publicar): cd backend && node add-010-bo.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

// A spec 007 preenche: nenhuma Server Function publicada ainda.
export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-010-bo.mjs ainda não tem definitions — nada para publicar (stub da base, S2).');
}
