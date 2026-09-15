// add-008 — Server Functions da spec 005 (notas fiscais e faturamento):
// detecção automática de NF, conferência NF × pedido, faturamento e cobrança.
// Ainda STUB — nasce aqui (S2, base da onda 2) só com a faixa de id e o campo
// do quadro; as `definitions` chegam com o agente da 005. Ver
// docs/specs/005-notas-fiscais-e-faturamento/{spec,plan,tasks}.md.
//
// Faixa de id local: 75xx (R-024) — leituras e JAVASCRIPT 7501-7515
// (sgcWintNfEntradas, sgcNfSugestoesListar, sgcNfDetectar — cron
// `0 */30 * * * *` — sgcFaturamentoMonitorar — cron `0 0 11 * * *` — etc.),
// escritas 7550-7559 (sgcEscNfInserir…sgcEscAvisoInserir). Padrão a seguir
// (ver add-007-agenda.mjs): `definitions` com os ids do mapa deste projeto
// (backend/ids-do-mapa.mjs), marcador `__SGC_IDS__` nas escritas chamadas por
// id, `isEntrypoint()` guardado por `MITRA_BASE_URL`.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox, quando a 005 publicar): cd backend && node add-008-notas-fiscais.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

// R-048: o campo do quadro `faturamento` (texto, capa: "R$ 72.000 (60 %) ·
// saldo R$ 48.000"), no MESMO formato de `CAMPOS` de add-005-quadro-compras.mjs
// (RN-017: nenhum campo obrigatório, nenhum de fase). `seed/002-quadro.mjs`
// insere em KB_CAMPO a partir daqui, como já faz com os da 002; no sandbox
// quem cria é o `isEntrypoint()` do add-008, quando a 005 o implementar.
export const CAMPOS_008 = [
  { chave: 'faturamento', label: 'Faturamento', tipo: 'texto', noCard: true },
];

// A spec 005 preenche: nenhuma Server Function publicada ainda.
export const definitions = [];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  console.log('add-008-notas-fiscais.mjs ainda não tem definitions — nada para publicar (stub da base, S2).');
}
