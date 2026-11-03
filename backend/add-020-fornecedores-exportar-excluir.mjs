// add-020 — Server Functions da spec 018 (fornecedores: exportar a
// parametrização e excluí-la guardando uma cópia), extensão da 001. Ver
// docs/specs/018-fornecedores-exportar-excluir/.
//
// Faixa de id local: 89xx — escritas 8950-8956, JAVASCRIPT 8980.
//
// Exportação (RN-PAR-12 do legado): `sgcFornecedorExportar`, JAVASCRIPT de
// leitura — uma página de fornecedores e as filhas dela numa execução só
// (RNF-001: 300 fornecedores = 3 execuções em blocos de 100).
//
// Exclusão (RN-PAR-08): sete SQL de uma instrução, chamadas DIRETO DA TELA na
// ordem de `ESCRITAS_EXCLUSAO` (frontend/src/lib/fornecedor-planilha.ts),
// guardadas por `:VAR_USER` com as personas da 001 (admin, gestor, diretoria).
// A primeira guarda a cópia; cada uma das outras só apaga se a cópia daquela
// parametrização já existe (RN-006) — sem cópia, nada sai.
//
// A tabela SGC_FORNECEDOR_EXCLUSAO está no `setup-backend.mjs` (DDL_018).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-020-fornecedores-exportar-excluir.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

/** Extrai o corpo de uma função JS como texto (o que a plataforma executa). */
function source(fn) {
  const text = fn.toString();
  return text.slice(text.indexOf('{') + 1, text.lastIndexOf('}')).trim();
}

/* ──────────────────────────────────────────────────────────────────────────
   Guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente de
   add-016-galderma.mjs; as personas são as de parametrizar da 001 (RN-012),
   porque excluir não pode ser mais solto que editar (P-05).
   ────────────────────────────────────────────────────────────────────────── */

const GUARDA = `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = :VAR_USER
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN ('admin', 'gestor', 'diretoria')
  )`;

/** Id da parametrização do código pedido (no máximo um: UNIQUE por CODFORNEC). */
const ID_DO_CODIGO = '(SELECT F.ID FROM SGC_FORNECEDOR F WHERE F.CODFORNEC = {{codfornec}})';

/** RN-006: a cópia da parametrização `coluna` já foi guardada. */
const copia = (coluna) => `EXISTS (SELECT 1 FROM SGC_FORNECEDOR_EXCLUSAO E WHERE E.FORNECEDOR_ID = ${coluna})`;

/** Linhas de produto do fornecedor, já com a cópia guardada (contatos e faixas pendem da linha). */
const LINHAS_COM_COPIA = `(SELECT L.ID FROM SGC_FORNECEDOR_LINHA L
    WHERE L.FORNECEDOR_ID = ${ID_DO_CODIGO} AND ${copia('L.FORNECEDOR_ID')})`;

/* ─────────────── escritas (8950-8956), na ordem de execução ─────────────── */

const ESCRITAS = [
  {
    name: 'sgcEscFornecedorExclusaoRegistrar',
    description: 'RF-006/RN-006 - guarda a copia da parametrizacao antes de excluir; uma por parametrizacao (repetir nao regrava). Params: codfornec int, detalhe (JSON), agora',
    code: `INSERT INTO SGC_FORNECEDOR_EXCLUSAO (FORNECEDOR_ID, CODFORNEC, FORNECEDOR, CNPJ, DETALHE, EXCLUIDO_POR, EXCLUIDO_EM)
SELECT F.ID, F.CODFORNEC, F.FORNECEDOR, F.CNPJ, '{{detalhe}}', :VAR_USER, '{{agora}}'
FROM SGC_FORNECEDOR F
WHERE F.CODFORNEC = {{codfornec}}
  AND NOT ${copia('F.ID')}
  AND ${GUARDA}`,
  },
  {
    name: 'sgcEscFornecedorExclusaoContatos',
    description: 'RF-006 - exclusao, passo 2: contatos das linhas (so com a copia guardada). Params: codfornec int',
    code: `DELETE FROM SGC_FORNECEDOR_LINHA_CONTATO
WHERE LINHA_ID IN ${LINHAS_COM_COPIA}
  AND ${GUARDA}`,
  },
  {
    name: 'sgcEscFornecedorExclusaoFaixas',
    description: 'RF-006 - exclusao, passo 3: faixas de prazo das linhas (so com a copia guardada). Params: codfornec int',
    code: `DELETE FROM SGC_FORNECEDOR_FAIXA_PRAZO
WHERE LINHA_ID IN ${LINHAS_COM_COPIA}
  AND ${GUARDA}`,
  },
  {
    name: 'sgcEscFornecedorExclusaoLinhas',
    description: 'RF-006 - exclusao, passo 4: linhas de produto (depois de contatos e faixas). Params: codfornec int',
    code: `DELETE FROM SGC_FORNECEDOR_LINHA
WHERE FORNECEDOR_ID = ${ID_DO_CODIGO}
  AND ${copia('SGC_FORNECEDOR_LINHA.FORNECEDOR_ID')}
  AND ${GUARDA}`,
  },
  {
    name: 'sgcEscFornecedorExclusaoFiliais',
    description: 'RF-006 - exclusao, passo 5: filiais atendidas. Params: codfornec int',
    code: `DELETE FROM SGC_FORNECEDOR_FILIAL
WHERE FORNECEDOR_ID = ${ID_DO_CODIGO}
  AND ${copia('SGC_FORNECEDOR_FILIAL.FORNECEDOR_ID')}
  AND ${GUARDA}`,
  },
  {
    name: 'sgcEscFornecedorExclusaoDocumentos',
    description: 'RF-006/P-07 - exclusao, passo 6: documentos (o arquivo continua no endereco; a copia guarda o endereco). Params: codfornec int',
    code: `DELETE FROM SGC_FORNECEDOR_DOCUMENTO
WHERE FORNECEDOR_ID = ${ID_DO_CODIGO}
  AND ${copia('SGC_FORNECEDOR_DOCUMENTO.FORNECEDOR_ID')}
  AND ${GUARDA}`,
  },
  {
    // Correlação com a tabela de fora (SGC_FORNECEDOR.ID), não subconsulta
    // sobre ela: o MySQL recusa DELETE com SELECT na própria tabela (1093).
    // O histórico (SGC_FORNECEDOR_LOG) fica (P-04).
    name: 'sgcEscFornecedorExclusaoFornecedor',
    description: 'RF-006 - exclusao, ultimo passo: a parametrizacao; o historico fica (P-04). Params: codfornec int',
    code: `DELETE FROM SGC_FORNECEDOR
WHERE CODFORNEC = {{codfornec}}
  AND ${copia('SGC_FORNECEDOR.ID')}
  AND ${GUARDA}`,
  },
];

/* ─────────────── sgcFornecedorExportar (8980, JAVASCRIPT de leitura) ─────────────── */
// RF-001/RF-002: `codfornec` 0 = todos os parametrizados (ativos e inativos,
// sem filtro da lista — P-02). Mesmas colunas da sgcFornecedorCarregar.

function exportarCode() {
  return source(async function corpo() {
    const { runQueryMitra } = require('mitra-sdk');
    const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);

    function linhasDe(resposta) {
      let saida = resposta?.result ?? resposta;
      if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
      if (saida?.output) saida = saida.output;
      if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
      return saida?.rows ?? saida?.result?.rows ?? saida?.result ?? [];
    }
    async function query(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }
    const inteiro = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; };

    const codfornec = inteiro(event.codfornec);
    const limite = Math.min(Math.max(inteiro(event.limite) || 100, 1), 500);
    const offset = Math.max(inteiro(event.offset), 0);

    const fornecedores = await query(`SELECT * FROM SGC_FORNECEDOR
WHERE (${codfornec} = 0 OR CODFORNEC = ${codfornec})
ORDER BY FORNECEDOR, CODFORNEC
LIMIT ${limite} OFFSET ${offset}`);
    const vazio = { fornecedores, filiais: [], linhas: [], contatos: [], faixas: [], documentos: [] };
    if (!fornecedores.length) return vazio;

    const ids = fornecedores.map((f) => inteiro(f.ID)).join(',');
    const filiais = await query(`SELECT * FROM SGC_FORNECEDOR_FILIAL WHERE FORNECEDOR_ID IN (${ids}) ORDER BY FORNECEDOR_ID, CODFILIAL`);
    const linhas = await query(`SELECT * FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID IN (${ids}) ORDER BY FORNECEDOR_ID, ORDEM, ID`);
    const linhaIds = linhas.map((l) => inteiro(l.ID));
    const contatos = linhaIds.length
      ? await query(`SELECT * FROM SGC_FORNECEDOR_LINHA_CONTATO WHERE LINHA_ID IN (${linhaIds.join(',')}) ORDER BY LINHA_ID, ID`)
      : [];
    const faixas = linhaIds.length
      ? await query(`SELECT * FROM SGC_FORNECEDOR_FAIXA_PRAZO WHERE LINHA_ID IN (${linhaIds.join(',')}) ORDER BY LINHA_ID, ORDEM, ID`)
      : [];
    const documentos = await query(`SELECT * FROM SGC_FORNECEDOR_DOCUMENTO WHERE FORNECEDOR_ID IN (${ids}) ORDER BY FORNECEDOR_ID, ID DESC`);

    return { fornecedores, filiais, linhas, contatos, faixas, documentos };
  });
}

export const definitions = [
  ...ESCRITAS.map((e) => ({ name: e.name, type: 'SQL', description: e.description, code: e.code })),
  {
    name: 'sgcFornecedorExportar',
    type: 'JAVASCRIPT',
    description: 'RF-001/RF-002 - exportacao da parametrizacao: pagina de fornecedores (codfornec 0 = todos) e as filhas numa execucao. Params: codfornec int, limite int, offset int',
    code: exportarCode(),
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
  const mapa = new Map(lista.map((f) => [f.name, f.id]));

  for (const definicao of definitions) {
    const corpo = { projectId, name: definicao.name, type: definicao.type, code: definicao.code, description: definicao.description };
    const id = mapa.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }

  console.log(`Pronto: ${definitions.length} server functions da spec 018 (fornecedores: exportar e excluir).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
