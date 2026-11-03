// add-014 — Server Functions da spec 012 (coberturas por curva): a auditoria
// campo a campo de `SGC_COBERTURA` em `SGC_COBERTURA_LOG`. Ver
// docs/specs/012-coberturas-por-curva/.
//
// Faixa de id local: 82xx (R-081 do 000) — leitura 8201
// (sgcCoberturaLogListar) e escrita 8250 (sgcEscCoberturaLogInserir), R-102.
// `sgcCoberturaListar` (7307), `sgcEscCoberturaGravar` (7358) e
// `sgcEscCoberturaExcluir` (7359) continuam no `add-006`, com os ids delas:
// nenhuma SF das ondas 1-3 muda de id (R-081).
//
// Esta spec não fala com o WinThor, não tem JAVASCRIPT e não tem cron: a régua
// do limite é pura (`lib/cobertura.ts`, R-089/R-111) e a tela chama as duas SQL
// direto, com `:VAR_USER`. Por isso a publicação é de um passo só — não há
// corpo JAVASCRIPT com id para regravar (R-016).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-014-coberturas-abc.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

/** Nenhuma SF desta spec fala com o WinThor — o log vive no banco interno. */
export const WINTHOR = [];

/* ──────────────────────────────────────────────────────────────────────────
   Guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente de
   add-006-itens.mjs; só a lista de personas muda. `:VAR_USER` vale porque as
   duas escritas são chamadas DIRETO da tela. É a MESMA guarda de
   `sgcEscCoberturaGravar`: um salvamento recusado casa 0 linhas nos dois
   lugares e não deixa log órfão (RNF-005).
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas, quem = ':VAR_USER') {
  const lista = personas.map((p) => `'${p}'`).join(', ');
  return `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${quem}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN (${lista})
  )`;
}

/** RN-008: gestor e admin mantêm a parametrização — e, portanto, o histórico dela. */
const COBERTURA = ['admin', 'gestor'];

/* ─────────────── leituras — banco do projeto ─────────────── */

// C-014: `ORDER BY L.ID DESC` é "do mais recente para o mais antigo" sem
// depender do formato do carimbo. `LEFT JOIN` em SGC_COBERTURA (e não JOIN):
// o histórico sobrevive a qualquer sumiço futuro do alvo.
const SQL_COBERTURA_LOG_LISTAR = `SELECT L.ID, L.ID_COBERTURA, C.NIVEL, C.CODIGO, C.DESCRICAO,
       L.CAMPO, L.ANTES, L.DEPOIS, L.ACAO, L.POR,
       COALESCE(U.NOME, '') AS POR_NOME, L.EM
FROM SGC_COBERTURA_LOG L
LEFT JOIN SGC_COBERTURA C ON C.ID = L.ID_COBERTURA
LEFT JOIN INT_USER U ON U.ID = L.POR
WHERE ({{idCobertura}} = 0 OR L.ID_COBERTURA = {{idCobertura}})
ORDER BY L.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

/* ─────────────── escritas SQL (uma instrução por SF) ─────────────── */

// D-004: o ID_COBERTURA não vem da tela — sai da própria SGC_COBERTURA pela
// chave única (NIVEL, CODIGO). A escrita guardada anterior não devolve o id
// gerado (D-03 da revisão da onda 1), e uma releitura custaria execução por
// salvamento. Sem FROM DUAL: a instrução já tem um FROM real. Alvo
// inexistente casa 0 linhas — o log nunca aponta para nada.
const SQL_COBERTURA_LOG_INSERIR = `INSERT INTO SGC_COBERTURA_LOG (ID_COBERTURA, CAMPO, ANTES, DEPOIS, ACAO, POR, EM)
SELECT C.ID, '{{campo}}', '{{antes}}', '{{depois}}', '{{acao}}', :VAR_USER, '{{em}}'
FROM SGC_COBERTURA C
WHERE C.NIVEL = '{{nivel}}' AND C.CODIGO = '{{codigo}}'
  AND ${guarda(COBERTURA)}`;

export const definitions = [
  {
    name: 'sgcCoberturaLogListar',
    type: 'SQL',
    description: 'RF-015/C-014 - historico das coberturas, do mais recente para o mais antigo; idCobertura 0 traz todas. Params: idCobertura int, limite int, offset int',
    code: SQL_COBERTURA_LOG_LISTAR,
  },
  {
    name: 'sgcEscCoberturaLogInserir',
    type: 'SQL',
    description: 'RF-008/RF-009 - uma linha de historico por campo alterado; o ID_COBERTURA sai da chave unica (nivel, codigo). Params: nivel string, codigo string, campo string, antes string, depois string, acao string, em string',
    code: SQL_COBERTURA_LOG_INSERIR,
  },
];

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
  const projectId = Number(process.env.MITRA_PROJECT_ID);

  const lista = (await sdk.listServerFunctionsMitra({ projectId })).result ?? [];
  const porNome = new Map(lista.map((f) => [f.name, f.id]));

  for (const definicao of definitions) {
    const corpo = {
      projectId,
      name: definicao.name,
      type: definicao.type,
      code: definicao.code,
      description: definicao.description,
    };
    const id = porNome.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }

  console.log(`Pronto: ${definitions.length} server functions da spec 012 (coberturas por curva).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
