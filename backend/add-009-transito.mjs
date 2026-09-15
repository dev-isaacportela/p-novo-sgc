// add-009 — Server Functions da spec 006 (trânsito e recebimento): previsão
// por nota, sincronização com o WinThor, alerta de atraso, Trânsito →
// Faturamento automático. Ainda STUB — nasce aqui (S2, base da onda 2) só com
// a faixa de id; as `definitions` chegam com o agente da 006. Ver
// docs/specs/006-transito-e-recebimento/{spec,plan,tasks}.md.
//
// Faixa de id local: 76xx (R-024) — leituras e JAVASCRIPT 7601-7606
// (sgcNfsRecebimentoCard, sgcNfsEmAtraso, sgcRecebimentoSincronizar — cron
// `0 25 9-23/2 * * *` —, etc.), escritas 7650-7651 (sgcEscNfRecebimento,
// sgcEscNfAlertaAtraso), chamadas só por id. Padrão a seguir (ver
// add-007-agenda.mjs): `definitions` com os ids do mapa deste projeto
// (backend/ids-do-mapa.mjs), marcador `__SGC_IDS__` nas escritas chamadas por
// id, `isEntrypoint()` guardado por `MITRA_BASE_URL`.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox, quando a 006 publicar): cd backend && node add-009-transito.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

// A spec 006 preenche: nenhuma Server Function publicada ainda.
export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-009-transito.mjs ainda não tem definitions — nada para publicar (stub da base, S2).');
}
