// add-019 — Server Functions da spec 017 (solicitações: apoio à avaliação e
// visões agrupadas). Ver docs/specs/017-solicitacoes-apoio-e-visoes/.
//
// Faixa de id local: 88xx — leituras 8801-8802 (sgcSolicitacoesAgrupar,
// sgcSolicitacoesAgruparTotal). Nenhuma escrita, nenhum DDL.
//
// O apoio à avaliação (RN-SOL-19 do legado) NÃO tem SF aqui: reusa as três
// leituras do add-013 que já contam a venda válida (R-131) —
// sgcWintProdutoHistorico, sgcWintProdutoVendasNotas e
// sgcWintProdutoEstoqueFiliais (plan.md §O que se reusa).
//
// As visões agrupadas (RN-SOL-16) filtram e recortam com o MESMO texto da
// lista da 008: o recorte do comercial, as junções do contrato de R-075 e os
// filtros publicados vêm do add-011, e a régua de situação do fragmento
// `situacao-solicitacao.sql` (R-070) — nada copiado.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox, depois do add-011 e do add-013): cd backend && node add-019-solicitacoes-apoio.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { fragmento } from './lib/fragmentos.mjs';
import { FILTROS_PUBLICADOS, JUNCOES_SOLICITACAO, RECORTE_COMERCIAL } from './add-011-solicitacoes.mjs';

const SITUACAO = fragmento('situacao-solicitacao.sql');

/** As três dimensões de RN-SOL-16; outra qualquer devolve nenhum grupo (RN-10). */
export const DIMENSOES = ['vendedor', 'fornecedor', 'filial'];

// RN-07: cada solicitação cai em UMA situação do grupo. A partição é completa
// porque STATUS só tem quatro valores e a régua devolve `sem_pedido` para tudo
// que não é aprovado com card vivo (R-076): pendente | aprovada sem pedido (na
// fila) | aprovada em andamento (em compra) | atendida | não atendida |
// recusada ou cancelada. RN-08: o rótulo do vendedor é o nome de quem
// registrou; o do fornecedor e o da filial, a foto gravada na solicitação.
// Todo ramo passa por CAST(... AS CHAR): o CASE junta colunas de tabelas
// diferentes (INT_USER é da plataforma), e no MySQL duas colações implícitas
// distintas no mesmo CASE são "Illegal mix of collations".
const GRUPOS = `SELECT S.CODPROD, S.STATUS, S.CRIADO_EM, ${SITUACAO} AS SITUACAO,
    CASE '{{dimensao}}'
      WHEN 'vendedor'   THEN CAST(S.CRIADO_POR AS CHAR)
      WHEN 'fornecedor' THEN CAST(S.CODFORNEC AS CHAR)
      ELSE CAST(S.CODFILIAL AS CHAR) END AS CHAVE,
    CASE '{{dimensao}}'
      WHEN 'vendedor'   THEN CAST(COALESCE(UC.NOME, '') AS CHAR)
      WHEN 'fornecedor' THEN CAST(COALESCE(S.FORNECEDOR, '') AS CHAR)
      ELSE CAST(COALESCE(NULLIF(S.FILIAL, ''), S.CODFILIAL) AS CHAR) END AS ROTULO
  FROM SGC_SOLICITACAO S
  ${JUNCOES_SOLICITACAO}
  WHERE ${RECORTE_COMERCIAL}
  ${FILTROS_PUBLICADOS}
    AND '{{dimensao}}' IN (${DIMENSOES.map((d) => `'${d}'`).join(', ')})`;

// RN-10: do grupo com mais solicitações para o com menos; empate pela mais
// recente e depois pela chave. Paginado (P-08: agrupa a fila inteira filtrada,
// nunca a página à vista).
const SQL_AGRUPAR = `SELECT T.CHAVE, MAX(T.ROTULO) AS ROTULO,
  COUNT(*) AS TOTAL,
  COUNT(DISTINCT T.CODPROD) AS PRODUTOS,
  SUM(CASE WHEN T.STATUS = 'pendente' THEN 1 ELSE 0 END) AS PENDENTES,
  SUM(CASE WHEN T.STATUS = 'aprovada' AND T.SITUACAO = 'sem_pedido' THEN 1 ELSE 0 END) AS NA_FILA,
  SUM(CASE WHEN T.STATUS = 'aprovada' AND T.SITUACAO NOT IN ('sem_pedido', 'atendida', 'nao_atendida') THEN 1 ELSE 0 END) AS EM_COMPRA,
  SUM(CASE WHEN T.STATUS = 'aprovada' AND T.SITUACAO = 'atendida' THEN 1 ELSE 0 END) AS ATENDIDAS,
  SUM(CASE WHEN T.STATUS = 'aprovada' AND T.SITUACAO = 'nao_atendida' THEN 1 ELSE 0 END) AS NAO_ATENDIDAS,
  SUM(CASE WHEN T.STATUS IN ('recusada', 'cancelada') THEN 1 ELSE 0 END) AS ENCERRADAS,
  MAX(T.CRIADO_EM) AS ULTIMA
FROM (
  ${GRUPOS}
) T
GROUP BY T.CHAVE
ORDER BY TOTAL DESC, ULTIMA DESC, T.CHAVE
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_AGRUPAR_TOTAL = `SELECT COUNT(DISTINCT T.CHAVE) AS TOTAL
FROM (
  ${GRUPOS}
) T`;

/* ─────────────── a lista publicada ─────────────── */

const LEITURAS = [
  {
    name: 'sgcSolicitacoesAgrupar',
    code: SQL_AGRUPAR,
    resumo: 'RN-SOL-16 (017, RF-07..RF-11) - a fila agrupada por vendedor, fornecedor ou filial: total, produtos distintos e as seis situações que somam o total (pendente, na fila, em compra, atendida, não atendida, recusada ou cancelada), com os filtros e o recorte do comercial da sgcSolicitacoesListar. Params: dimensao (vendedor|fornecedor|filial), status, situacao, codfornec int, codfilial, vendedor int, minhas int, busca, limite int, offset int',
  },
  {
    name: 'sgcSolicitacoesAgruparTotal',
    code: SQL_AGRUPAR_TOTAL,
    resumo: 'RN-SOL-16 (017) - o número de grupos da mesma visão, para a paginação. Params: os mesmos, sem limite/offset',
  },
];

export const definitions = LEITURAS.map((f) => ({ name: f.name, type: 'SQL', description: f.resumo, code: f.code }));

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
  const mapa = new Map(lista.map((f) => [f.name, f.id]));

  for (const definicao of definitions) {
    const corpo = {
      projectId,
      name: definicao.name,
      type: definicao.type,
      code: definicao.code,
      description: definicao.description,
    };
    const id = mapa.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }

  console.log(`Pronto: ${definitions.length} server functions da spec 017 (visões agrupadas das solicitações).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
