// Instala/atualiza o motor de quadros (@benenutri/mitra-kanban) neste projeto.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario: a plataforma
// so gera migration quando o script roda no sandbox.
// Uso (no sandbox): cd backend && node add-001-kanban.mjs && node sync-server-function-map.mjs
//
// `definitions` e exportado para o simulador local carregar as MESMAS server
// functions que a lib publica. Os ids das escritas internas (kbEsc*) vem do
// mapa do frontend deste projeto — e por ele que o simulador resolve chamadas
// por id, antes e depois do sync trazer os ids reais.
//
// Ganchos (regras ligadas do SGC — sgcPodeMover/sgcPodeExcluir em KB_META)
// entram aqui com a spec 002; por enquanto a instalação é só o motor puro.

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { instalar, montarDefinitions, lerIdsDoMapa } from '@benenutri/mitra-kanban/backend';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));

export const definitions = montarDefinitions(lerIdsDoMapa(MAPA));

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const resultado = await instalar({ sdk, projectId: Number(process.env.MITRA_PROJECT_ID), mapaFrontend: MAPA });
  console.log(`Pronto: motor ${resultado.versao}, ${Object.keys(resultado.funcoes).length} server functions.`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
