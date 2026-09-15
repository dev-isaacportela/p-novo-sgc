// Leva os ids reais das server functions para o frontend.
//
// Roda DEPOIS de publicar (`node add-*.mjs`) no sandbox: le a lista publicada
// no projeto e reescreve o bloco SERVER_FUNCTIONS de
// `frontend/src/lib/server-functions.ts`. Os nomes (SERVER_FUNCTION_NAMES)
// nao sao tocados — eles sao o contrato escrito a mao.
//
// Uso: cd backend && npm run sync:function-map

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureSdkMitra, listServerFunctionsMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const HERE = dirname(fileURLToPath(import.meta.url));

// Mesmos valores de simulator/config.mjs — mantidos aqui para o sync nao
// depender do simulador existir.
const MAPA = resolve(HERE, '..', 'frontend', 'src', 'lib', 'server-functions.ts');
const MAP_NAMES = 'SERVER_FUNCTION_NAMES';
const MAP_IDS = 'SERVER_FUNCTIONS';

const fonte = await readFile(MAPA, 'utf8');

function bloco(marcador) {
  // Ancorar na DECLARACAO, nunca no primeiro `marcador` do arquivo: o nome
  // aparece antes nos comentarios do cabecalho.
  const inicio = fonte.indexOf(`export const ${marcador} = {`);
  if (inicio === -1) throw new Error(`${marcador} nao encontrado em ${MAPA}`);
  const abre = fonte.indexOf('{', inicio);
  const fecha = fonte.indexOf('}', abre);
  const pares = fonte.slice(abre + 1, fecha).split('\n')
    .map((linha) => linha.trim().replace(/,$/, ''))
    .filter((linha) => linha && !linha.startsWith('//'))
    .map((linha) => {
      const [chave, bruto] = linha.split(':').map((parte) => parte.trim());
      return [chave, bruto.replace(/^'|'$/g, '')];
    });
  return { abre, fecha, mapa: Object.fromEntries(pares) };
}

const nomes = bloco(MAP_NAMES).mapa;
const alvo = bloco(MAP_IDS);

const resposta = await listServerFunctionsMitra({ projectId });
const publicadas = new Map((resposta?.result ?? resposta ?? []).map((fn) => [fn.name, fn]));

const linhas = [];
const faltando = [];
for (const [chave, nome] of Object.entries(nomes)) {
  const publicada = publicadas.get(nome);
  if (!publicada) {
    faltando.push(nome);
    linhas.push(`  ${chave}: '${alvo.mapa[chave] ?? '0'}',`);
    continue;
  }
  linhas.push(`  ${chave}: '${publicada.id ?? publicada.serverFunctionId}',`);
}

const saida = `${fonte.slice(0, alvo.abre + 1)}\n${linhas.join('\n')}\n${fonte.slice(alvo.fecha)}`;
await writeFile(MAPA, saida, 'utf8');

console.log(`Mapa atualizado: ${linhas.length} funcoes -> ${MAPA}`);
if (faltando.length) {
  console.warn(`Ainda nao publicadas (id preservado): ${faltando.join(', ')}`);
  process.exitCode = 1;
}
