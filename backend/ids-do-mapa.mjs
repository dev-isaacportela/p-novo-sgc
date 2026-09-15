// Le TODOS os blocos de frontend/src/lib/server-functions.ts — o da lib
// (kb*, 80xx/90xx) e os quatro do projeto (sgc*, 71xx-74xx) — e devolve
// { nomeDaSF: idLocal }.
//
// Diferente do `lerIdsDoMapa` de @benenutri/mitra-kanban/backend: aquele
// devolve só as kbEsc* (as escritas DA LIB). As features precisam resolver
// por id outras coisas tambem — `kbCardCriar` (chamado sem sessao pelo cron
// da agenda), `sgcPodeMover`/`sgcPodeExcluir` (gravados em KB_META por
// `instalar({ ganchos })`) e as `sgcEsc*` internas de cada spec — e por isso
// este helper devolve o mapa INTEIRO, por nome.
//
// Uso: `smoke/base.mjs` monta o `resolveById` do runner a partir daqui; os
// add-004..007 (ainda stub) citam este arquivo como o caminho para resolver
// ids no simulador quando ganharem SF por id — na publicação real os ids vêm
// por NOME, via `listServerFunctionsMitra` (nunca hardcoded).

import { readFileSync } from 'node:fs';

function bloco(fonte, marcador) {
  const inicio = fonte.indexOf(`export const ${marcador} = {`);
  if (inicio === -1) return {};
  const abre = fonte.indexOf('{', inicio);
  const fecha = fonte.indexOf('}', abre);
  return Object.fromEntries(fonte.slice(abre + 1, fecha).split('\n')
    .map((linha) => linha.trim().replace(/,$/, ''))
    .filter((linha) => linha && !linha.startsWith('//'))
    .map((linha) => {
      const [chave, bruto] = linha.split(':').map((parte) => parte.trim());
      return [chave, String(bruto || '').replace(/^'|'$/g, '')];
    }));
}

/** `caminho` = frontend/src/lib/server-functions.ts (ou equivalente). */
export function idsDoMapa(caminho) {
  const fonte = readFileSync(caminho, 'utf8');
  const nomes = bloco(fonte, 'SERVER_FUNCTION_NAMES');
  const idsPorChave = bloco(fonte, 'SERVER_FUNCTIONS');
  const porNome = {};
  for (const [chave, nome] of Object.entries(nomes)) {
    const id = idsPorChave[chave];
    if (id) porNome[nome] = Number(id);
  }
  return porNome;
}
