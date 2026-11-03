// add-021 — Server Functions da spec 019 (projeção manual): o ajuste
// percentual da venda projetada de um produto, por fornecedor e filial, com
// validade e motivo. Estende a 011 (compras inteligentes). Ver
// docs/specs/019-projecao-manual/.
//
// Faixa de id local: 91xx (R-200 do 000) — leitura 9101
// (sgcProjecaoManualListar), escritas 9150-9151 (sgcEscProjecaoManualSalvar,
// sgcEscProjecaoManualRemover).
//
// NENHUMA definição aqui é JAVASCRIPT nem fala com o WinThor: o percentual é
// aplicado na regra pura da tela (`lib/ressuprimento.ts` e `lib/previsao.ts`,
// P-01), como a fórmula da 011 (R-083). A tabela `SGC_PROJECAO_MANUAL` está no
// `setup-backend.mjs` (DDL_019).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-021-projecao-manual.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';

/* ──────────────────────────────────────────────────────────────────────────
   A guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente de
   add-013-compras-inteligentes.mjs; só a lista de personas muda. `:VAR_USER`
   vale porque as duas escritas são chamadas direto da tela.
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas) {
  const lista = personas.map((p) => `'${p}'`).join(', ');
  return `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = :VAR_USER
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN (${lista})
  )`;
}

/** RN-007 (P-06): ajustar e remover = parametrizar da 011 (admin e gestor). */
const PARAMETRIZAR = ['admin', 'gestor'];

/* ─────────────── leitura ─────────────── */

// Os vencidos vêm também: quem decide se o ajuste vale é a tela, pela data de
// hoje dela (RN-001). PERCENTUAL 0 é ajuste removido e não volta.
const SQL_LISTAR = `SELECT ID, CODFORNEC, CODFILIAL, CODPROD, PERCENTUAL,
       COALESCE(VALIDA_ATE, '') AS VALIDA_ATE,
       COALESCE(MOTIVO, '') AS MOTIVO,
       ATUALIZADO_POR, ATUALIZADO_EM
FROM SGC_PROJECAO_MANUAL
WHERE CODFORNEC = {{codfornec}} AND CODFILIAL = '{{codfilial}}' AND PERCENTUAL <> 0
ORDER BY CODPROD
LIMIT {{limite}} OFFSET {{offset}}`;

/* ─────────────── escritas (uma instrução por SF, guardadas por :VAR_USER) ─────────────── */

// RN-004 no servidor: a faixa do percentual, a validade preenchida e o motivo.
// A janela de datas (hoje..hoje + 365) é conferida na tela: o "hoje" do
// servidor tem outro fuso. Recusa = 0 linhas, e a tela relê o que voltou.
const SQL_SALVAR = `INSERT INTO SGC_PROJECAO_MANUAL
  (CODFORNEC, CODFILIAL, CODPROD, PERCENTUAL, VALIDA_ATE, MOTIVO, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{codfilial}}', {{codprod}}, {{percentual}}, '{{validaAte}}', '{{motivo}}', :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE {{codfornec}} > 0 AND {{codprod}} > 0 AND TRIM('{{codfilial}}') <> ''
  AND {{percentual}} <> 0 AND {{percentual}} >= -90 AND {{percentual}} <= 300
  AND LENGTH(TRIM('{{validaAte}}')) = 10
  AND LENGTH(TRIM('{{motivo}}')) >= 5
  AND ${guarda(PARAMETRIZAR)}
ON DUPLICATE KEY UPDATE
  PERCENTUAL     = VALUES(PERCENTUAL),
  VALIDA_ATE     = VALUES(VALIDA_ATE),
  MOTIVO         = VALUES(MOTIVO),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM  = VALUES(ATUALIZADO_EM)`;

// RN-005 (P-04): remover zera o percentual e a validade e guarda quem removeu.
const SQL_REMOVER = `UPDATE SGC_PROJECAO_MANUAL
SET PERCENTUAL = 0, VALIDA_ATE = '', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE CODFORNEC = {{codfornec}} AND CODFILIAL = '{{codfilial}}' AND CODPROD = {{codprod}}
  AND ${guarda(PARAMETRIZAR)}`;

/* ─────────────── a lista publicada ─────────────── */

const FUNCOES = [
  {
    name: 'sgcProjecaoManualListar',
    code: SQL_LISTAR,
    resumo: 'Spec 019 RF-001/RN-001 - ajustes de projecao manual (PERCENTUAL <> 0, vencidos inclusive) do fornecedor na filial; a tela decide pela data se valem. Params: codfornec int, codfilial string, limite int, offset int',
  },
  {
    name: 'sgcEscProjecaoManualSalvar',
    code: SQL_SALVAR,
    resumo: 'Spec 019 RF-001/RN-004 - upsert do ajuste do produto (percentual -90..300 e <> 0, validade AAAA-MM-DD, motivo >= 5); admin e gestor. Params: codfornec int, codfilial string, codprod int, percentual decimal, validaAte string, motivo string, atualizadoEm string',
  },
  {
    name: 'sgcEscProjecaoManualRemover',
    code: SQL_REMOVER,
    resumo: 'Spec 019 RN-005 - remove o ajuste do produto (percentual 0, validade vazia), guardando quem e quando; admin e gestor. Params: codfornec int, codfilial string, codprod int, atualizadoEm string',
  },
];

export const definitions = FUNCOES.map((f) => ({ name: f.name, type: 'SQL', description: f.resumo, code: f.code }));

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

  console.log(`Pronto: ${definitions.length} server functions da spec 019 (projeção manual).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
