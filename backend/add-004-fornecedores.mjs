// add-004 — Server Functions da spec 001 (fornecedores): cadastro do ERP e
// parametrização de compra por fornecedor. Ver docs/specs/001-fornecedores/.
//
// Faixa de id local: 71xx — leituras e JAVASCRIPT a partir de 7101
// (sgcFornecedorListar…), escritas a partir de 7150 (sgcEscFornecedorInserir…).
//
// Guarda de persona (RN-012, R-013): só admin/gestor/diretoria escrevem.
// Vive DENTRO de `sgcFornecedorSalvar`, consultada por `runQueryMitra` com
// `:VAR_USER` ANTES de qualquer escrita (D-005 — chamada aninhada não
// propaga `:VAR_USER`). As 13 `sgcEsc*`, chamadas só por id de dentro dela,
// repetem o mesmo `EXISTS` sobre `{{usuarioId}}`, passado explícito.
//
// Ids das 13 escritas: o corpo de `sgcFornecedorSalvar` carrega o marcador
// `__SGC_IDS_001__`, trocado pelo mapa `chave -> id` — os ids REAIS na
// publicação (resolvidos por nome, depois de publicar as escritas) e os ids
// LOCAIS de `frontend/src/lib/server-functions.ts` no `definitions` do
// simulador (mesmo padrão de add-001-kanban.mjs).
//
// sgcWintFornecedores e sgcWintFiliais (Oracle): jdbcId resolvido por NOME
// (`jdbcIdWinthor`, add-003-jdbc-winthor.mjs) só na publicação real; no
// simulador o jdbcId é ignorado (rodam sobre as PC* de schema-winthor.mjs).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-004-fornecedores.mjs
//
// Regra: todo INSERT ... SELECT ... WHERE leva FROM DUAL entre o SELECT e o
// WHERE (padrao do add-005). SQLite aceita SELECT <expr> WHERE <cond> sem
// FROM, mas o MySQL da plataforma não — é erro de sintaxe lá. O dialeto do
// simulador remove o FROM DUAL, então nada muda localmente.

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { idsDoMapa } from './ids-do-mapa.mjs';

const FRONTEND_MAP = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));

/** Extrai o corpo de uma função JS como texto (o que a plataforma executa). */
function source(fn) {
  const text = fn.toString();
  return text.slice(text.indexOf('{') + 1, text.lastIndexOf('}')).trim();
}

// Guarda de persona (000/README §Server functions, cópia literal — R-013):
// admin/gestor/diretoria podem escrever; READ_ONLY nunca; sem persona
// gravada, cai no ACCESS_LEVEL (P-02 B).
const GUARDA_PERSONA = (paramUsuario) => `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${paramUsuario}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN ('admin','gestor','diretoria')
  )`;
const GUARDA = GUARDA_PERSONA('{{usuarioId}}');

/* ─────────────── as 13 escritas (7150–7162) ─────────────── */
// Uma instrução por SF; guardadas por {{usuarioId}} (D-005). INSERT vira
// INSERT...SELECT...WHERE <guarda> para o guard também valer em inserção
// (SQL não tem WHERE em VALUES puro).

const ESCRITAS = [
  {
    chave: 'fornecedorInserir',
    name: 'sgcEscFornecedorInserir',
    resumo: 'RF-005 — novo fornecedor parametrizado',
    code: `INSERT INTO SGC_FORNECEDOR (CODFORNEC, FORNECEDOR, CNPJ, CNPJ_FORMATADO, PRAZO_ENTREGA_DIAS, PRAZO_ENTREGA_TIPO,
    PEDIDO_MINIMO, FECHAMENTO_DIA_INICIO, FECHAMENTO_DIA_FIM, LINK_PLATAFORMA, VALIDADE_MINIMA_DIAS,
    SLA_ANALISE_DIAS, SLA_FATURAMENTO_DIAS, ATIVO, CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{fornecedor}}', '{{cnpj}}', NULLIF('{{cnpjFormatado}}', ''), {{prazoEntregaDias}}, '{{prazoEntregaTipo}}',
    {{pedidoMinimo}}, {{fechamentoDiaInicio}}, {{fechamentoDiaFim}}, NULLIF('{{linkPlataforma}}', ''), {{validadeMinimaDias}},
    {{slaAnaliseDias}}, {{slaFaturamentoDias}}, ({{ativo}} = 1), NULLIF({{usuarioId}}, 0), '{{agora}}', NULLIF({{usuarioId}}, 0), '{{agora}}'
FROM DUAL
WHERE ${GUARDA}`,
  },
  {
    chave: 'fornecedorAtualizar',
    name: 'sgcEscFornecedorAtualizar',
    resumo: 'RF-005 — alteração da parametrização',
    code: `UPDATE SGC_FORNECEDOR SET
  FORNECEDOR = '{{fornecedor}}', CNPJ = '{{cnpj}}', CNPJ_FORMATADO = NULLIF('{{cnpjFormatado}}', ''),
  PRAZO_ENTREGA_DIAS = {{prazoEntregaDias}}, PRAZO_ENTREGA_TIPO = '{{prazoEntregaTipo}}', PEDIDO_MINIMO = {{pedidoMinimo}},
  FECHAMENTO_DIA_INICIO = {{fechamentoDiaInicio}}, FECHAMENTO_DIA_FIM = {{fechamentoDiaFim}},
  LINK_PLATAFORMA = NULLIF('{{linkPlataforma}}', ''), VALIDADE_MINIMA_DIAS = {{validadeMinimaDias}},
  SLA_ANALISE_DIAS = {{slaAnaliseDias}}, SLA_FATURAMENTO_DIAS = {{slaFaturamentoDias}}, ATIVO = ({{ativo}} = 1),
  ATUALIZADO_POR = NULLIF({{usuarioId}}, 0), ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{id}} AND ${GUARDA}`,
  },
  {
    chave: 'fornecedorFiliaisLimpar',
    name: 'sgcEscFornecedorFiliaisLimpar',
    resumo: 'RF-011 — limpa filiais antes de regravar (salvar substitui tudo)',
    code: `DELETE FROM SGC_FORNECEDOR_FILIAL WHERE FORNECEDOR_ID = {{fornecedorId}} AND ${GUARDA}`,
  },
  {
    chave: 'fornecedorFilialInserir',
    name: 'sgcEscFornecedorFilialInserir',
    resumo: 'RF-006 — filial atendida',
    code: `INSERT INTO SGC_FORNECEDOR_FILIAL (FORNECEDOR_ID, CODFILIAL, FILIAL)
SELECT {{fornecedorId}}, '{{codfilial}}', NULLIF('{{filial}}', '')
FROM DUAL
WHERE ${GUARDA}`,
  },
  {
    chave: 'fornecedorContatosLimpar',
    name: 'sgcEscFornecedorContatosLimpar',
    resumo: 'RF-011 — limpa contatos das linhas antes de regravar',
    code: `DELETE FROM SGC_FORNECEDOR_LINHA_CONTATO
WHERE LINHA_ID IN (SELECT ID FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = {{fornecedorId}})
  AND ${GUARDA}`,
  },
  {
    chave: 'fornecedorFaixasLimpar',
    name: 'sgcEscFornecedorFaixasLimpar',
    resumo: 'RF-011 — limpa faixas das linhas antes de regravar',
    code: `DELETE FROM SGC_FORNECEDOR_FAIXA_PRAZO
WHERE LINHA_ID IN (SELECT ID FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = {{fornecedorId}})
  AND ${GUARDA}`,
  },
  {
    chave: 'fornecedorLinhasLimpar',
    name: 'sgcEscFornecedorLinhasLimpar',
    resumo: 'RF-011 — limpa linhas antes de regravar (depois de contatos/faixas)',
    code: `DELETE FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = {{fornecedorId}} AND ${GUARDA}`,
  },
  {
    chave: 'fornecedorLinhaInserir',
    name: 'sgcEscFornecedorLinhaInserir',
    resumo: 'RF-007 — linha de produto',
    code: `INSERT INTO SGC_FORNECEDOR_LINHA (FORNECEDOR_ID, NOME, ORDEM)
SELECT {{fornecedorId}}, '{{nome}}', {{ordem}}
FROM DUAL
WHERE ${GUARDA}`,
  },
  {
    chave: 'fornecedorContatoInserir',
    name: 'sgcEscFornecedorContatoInserir',
    resumo: 'RF-008 — contato de envio da linha',
    code: `INSERT INTO SGC_FORNECEDOR_LINHA_CONTATO (LINHA_ID, NOME, EMAIL)
SELECT {{linhaId}}, NULLIF('{{nome}}', ''), '{{email}}'
FROM DUAL
WHERE ${GUARDA}`,
  },
  {
    chave: 'fornecedorFaixaInserir',
    name: 'sgcEscFornecedorFaixaInserir',
    resumo: 'RF-009 — faixa/opção de prazo de pagamento',
    code: `INSERT INTO SGC_FORNECEDOR_FAIXA_PRAZO (LINHA_ID, VALOR_DE, VALOR_ATE, ROTULO, PARCELAS, ORDEM)
SELECT {{linhaId}}, {{valorDe}}, {{valorAte}}, COALESCE(NULLIF('{{rotulo}}', ''), 'Opção única'), '{{parcelas}}', {{ordem}}
FROM DUAL
WHERE ${GUARDA}`,
  },
  {
    chave: 'fornecedorDocumentosLimpar',
    name: 'sgcEscFornecedorDocumentosLimpar',
    resumo: 'RF-011 — limpa documentos antes de regravar',
    code: `DELETE FROM SGC_FORNECEDOR_DOCUMENTO WHERE FORNECEDOR_ID = {{fornecedorId}} AND ${GUARDA}`,
  },
  {
    chave: 'fornecedorDocumentoInserir',
    name: 'sgcEscFornecedorDocumentoInserir',
    resumo: 'RF-010 — documento do fornecedor',
    code: `INSERT INTO SGC_FORNECEDOR_DOCUMENTO (FORNECEDOR_ID, TIPO, NOME, ENDERECO, VENCIMENTO, CRIADO_POR, CRIADO_EM)
SELECT {{fornecedorId}}, '{{tipo}}', '{{nome}}', '{{endereco}}', NULLIF('{{vencimento}}', ''), NULLIF({{usuarioId}}, 0), '{{agora}}'
FROM DUAL
WHERE ${GUARDA}`,
  },
  {
    chave: 'fornecedorLogInserir',
    name: 'sgcEscFornecedorLogInserir',
    resumo: 'RF-012 — uma linha de histórico por campo alterado (FO-06 B)',
    code: `INSERT INTO SGC_FORNECEDOR_LOG (FORNECEDOR_ID, CAMPO, DE, PARA, POR, EM)
SELECT {{fornecedorId}}, '{{campo}}', NULLIF('{{de}}', ''), NULLIF('{{para}}', ''), NULLIF({{usuarioId}}, 0), '{{agora}}'
FROM DUAL
WHERE ${GUARDA}`,
  },
];

/* ─────────────── leituras (7101–7105) ─────────────── */

const FILTROS_LISTAR = `
  AND ('{{busca}}' = '' OR UPPER(F.FORNECEDOR) LIKE UPPER(CONCAT('%', '{{busca}}', '%'))
       OR UPPER(F.CNPJ) LIKE UPPER(CONCAT('%', '{{busca}}', '%'))
       OR CONCAT('', F.CODFORNEC) LIKE CONCAT('%', '{{busca}}', '%'))
  AND ('{{codfilial}}' = '' OR EXISTS (SELECT 1 FROM SGC_FORNECEDOR_FILIAL FF2 WHERE FF2.FORNECEDOR_ID = F.ID AND FF2.CODFILIAL = '{{codfilial}}'))
  AND ({{ativo}} = 0 OR ({{ativo}} = 1 AND F.ATIVO = 1) OR ({{ativo}} = 2 AND F.ATIVO = 0))`;

const LEITURAS_SQL = [
  {
    name: 'sgcFornecedorListar',
    resumo: 'RF-001, RF-002, RF-003 — lista paginada, com busca e filtros. Contagens de filial/linha, não a lista (C-09)',
    code: `SELECT F.ID, F.CODFORNEC, F.FORNECEDOR, F.CNPJ, F.CNPJ_FORMATADO, F.PRAZO_ENTREGA_DIAS, F.PRAZO_ENTREGA_TIPO,
  F.PEDIDO_MINIMO, F.ATIVO, F.ATUALIZADO_EM,
  (SELECT COUNT(*) FROM SGC_FORNECEDOR_FILIAL FF WHERE FF.FORNECEDOR_ID = F.ID) AS QT_FILIAIS,
  (SELECT COUNT(*) FROM SGC_FORNECEDOR_LINHA FL WHERE FL.FORNECEDOR_ID = F.ID) AS QT_LINHAS
FROM SGC_FORNECEDOR F
WHERE 1 = 1${FILTROS_LISTAR}
ORDER BY F.FORNECEDOR
LIMIT {{limite}} OFFSET {{offset}}`,
  },
  {
    name: 'sgcFornecedorListarTotal',
    resumo: 'RF-001, RF-002 — total para a paginação, mesmos filtros da listagem',
    code: `SELECT COUNT(*) AS TOTAL
FROM SGC_FORNECEDOR F
WHERE 1 = 1${FILTROS_LISTAR}`,
  },
  {
    name: 'sgcWintFornecedores',
    resumo: 'RF-004, C-008 — cadastro de fornecedores do ERP (Oracle/WinThor); seletor, sem paginação (D-003)',
    code: `SELECT F.CODFORNEC, F.FORNECEDOR, NVL(F.CGC, ' ') AS CGC
  FROM PCFORNEC F
 WHERE F.CODFORNEC <> 999999
   AND ('{{busca}}' = '' OR UPPER(F.FORNECEDOR) LIKE '%' || UPPER('{{busca}}') || '%'
        OR CONCAT('', F.CODFORNEC) LIKE '%' || '{{busca}}' || '%')
 ORDER BY F.FORNECEDOR`,
  },
  {
    name: 'sgcWintFiliais',
    resumo: 'RF-006, C-008 — filiais do ERP (Oracle/WinThor)',
    code: `SELECT F.CODIGO AS CODFILIAL, F.RAZAOSOCIAL AS FILIAL
  FROM PCFILIAL F
 WHERE F.CODIGO <> '99'
 ORDER BY F.CODIGO`,
  },
];

/* ─────────────── sgcFornecedorCarregar (7103, JAVASCRIPT) ─────────────── */
// Uma execução: pai + 5 filhas + log (RNF-002). fornecedor: null quando o
// código do ERP ainda não tem parametrização (RF-004).

function carregarCode() {
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
    const [fornecedor] = await query(`SELECT * FROM SGC_FORNECEDOR WHERE CODFORNEC = ${codfornec} LIMIT 1`);
    if (!fornecedor) return { fornecedor: null, filiais: [], linhas: [], contatos: [], faixas: [], documentos: [], log: [] };

    const fornecedorId = inteiro(fornecedor.ID);
    const filiais = await query(`SELECT * FROM SGC_FORNECEDOR_FILIAL WHERE FORNECEDOR_ID = ${fornecedorId} ORDER BY CODFILIAL`);
    const linhas = await query(`SELECT * FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = ${fornecedorId} ORDER BY ORDEM, ID`);
    const linhaIds = linhas.map((l) => inteiro(l.ID));
    const contatos = linhaIds.length
      ? await query(`SELECT * FROM SGC_FORNECEDOR_LINHA_CONTATO WHERE LINHA_ID IN (${linhaIds.join(',')}) ORDER BY ID`)
      : [];
    const faixas = linhaIds.length
      ? await query(`SELECT * FROM SGC_FORNECEDOR_FAIXA_PRAZO WHERE LINHA_ID IN (${linhaIds.join(',')}) ORDER BY ORDEM, ID`)
      : [];
    const documentos = await query(`SELECT * FROM SGC_FORNECEDOR_DOCUMENTO WHERE FORNECEDOR_ID = ${fornecedorId} ORDER BY ID DESC`);
    const log = await query(`SELECT L.*, IU.NOME AS POR_NOME FROM SGC_FORNECEDOR_LOG L
LEFT JOIN INT_USER IU ON IU.ID = L.POR
WHERE L.FORNECEDOR_ID = ${fornecedorId}
ORDER BY L.ID DESC
LIMIT 20`);

    return { fornecedor, filiais, linhas, contatos, faixas, documentos, log };
  });
}

/* ─────────────── sgcFornecedorSalvar (7106, JAVASCRIPT) ─────────────── */
// Guarda por :VAR_USER → valida (mesmas mensagens de src/lib/fornecedor.ts,
// D-009) → fotografia anterior → grava pai → substitui filhas inteiras
// (RF-011) → log campo a campo (FO-06 B). Chama as sgcEsc* por id, com
// usuarioId explícito (D-005).

const MARCADOR_IDS = '__SGC_IDS_001__';
function injetarIds(code, mapa) {
  return code.split(MARCADOR_IDS).join(JSON.stringify(mapa));
}

function salvarCodeTemplate() {
  return source(async function corpo() {
    const { runQueryMitra, executeServerFunctionMitra } = require('mitra-sdk');
    const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);
    const IDS = __SGC_IDS_001__;

    function linhasDe(resposta) {
      let saida = resposta?.result ?? resposta;
      if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
      if (saida?.output) saida = saida.output;
      if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
      return saida?.rows ?? saida?.result?.rows ?? saida?.result ?? [];
    }
    async function query(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }
    async function escrever(chave, input) {
      const serverFunctionId = IDS[chave];
      if (!serverFunctionId) throw new Error(`Escrita não publicada: ${chave}`);
      const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId, input: input || {} });
      const resultado = resposta?.result ?? resposta;
      if (resultado?.executionStatus === 'FAILED') throw new Error(`Falha na escrita ${chave}: ${resultado.error || 'sem detalhe'}`);
      return resultado?.output;
    }
    const inteiro = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; };
    const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''");
    const agora = () => new Date().toISOString().slice(0, 19);

    // Persona de quem chama, por :VAR_USER (D-005): a checagem que decide é
    // sempre esta, aqui dentro — não passou, nada é gravado.
    const permitido = await query(`SELECT 1 AS OK
FROM INT_USER IU
LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
WHERE IU.ID = :VAR_USER
  AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
  AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                             WHEN 'ADMIN' THEN 'admin'
                             WHEN 'RESTRICTED' THEN 'comercial'
                             ELSE 'analista' END) IN ('admin','gestor','diretoria')`);
    if (!permitido.length) return { ok: false, error: 'Só admin, gestor e diretoria parametrizam fornecedor.' };

    const [sessao] = await query('SELECT ID FROM INT_USER WHERE ID = :VAR_USER LIMIT 1');
    const quemChama = sessao ? inteiro(sessao.ID) : 0;

    const payload = event.payload || {};
    const f = payload.fornecedor || {};
    const linhasPayload = Array.isArray(payload.linhas) ? payload.linhas : [];
    const filiaisPayload = Array.isArray(payload.filiais) ? payload.filiais : [];
    const documentosPayload = Array.isArray(payload.documentos) ? payload.documentos : [];

    // ── validação — mesmas regras e mensagens de src/lib/fornecedor.ts (D-009) ──
    function cnpjValido(valor) {
      const d = String(valor ?? '').replace(/\D/g, '');
      if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
      const digito = (base) => {
        let soma = 0; let peso = base.length - 7;
        for (const c of base) { soma += Number(c) * peso; peso = peso === 2 ? 9 : peso - 1; }
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
      };
      const doze = d.slice(0, 12);
      const d1 = digito(doze);
      const d2 = digito(doze + d1);
      return d === `${doze}${d1}${d2}`;
    }
    function emailValido(valor) {
      const v = String(valor ?? '').trim();
      if (!v || /\s/.test(v)) return false;
      const partes = v.split('@');
      if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
      return partes[1].includes('.') && !partes[1].endsWith('.');
    }
    function parcelasValidas(texto) {
      const partes = String(texto ?? '').split('/').map((p) => p.trim());
      if (!partes.length || partes.some((p) => p === '')) return false;
      return partes.every((p) => Number.isFinite(Number(p)) && Number(p) > 0);
    }
    function janelaValida(inicio, fim) {
      const i = Number(inicio); const t = Number(fim);
      return Number.isInteger(i) && Number.isInteger(t) && i >= 1 && i <= 31 && t >= 1 && t <= 31;
    }

    if (!cnpjValido(f.cnpj)) return { ok: false, error: 'CNPJ inválido.' };
    if (!(Number(f.pedidoMinimo) > 0)) return { ok: false, error: 'Pedido mínimo deve ser maior que zero.' };
    if (!janelaValida(f.fechamentoDiaInicio, f.fechamentoDiaFim)) {
      return { ok: false, error: 'Janela de fechamento inválida: os dois dias devem estar entre 1 e 31.' };
    }
    for (const linha of linhasPayload) {
      const nome = String(linha.nome ?? '').trim();
      if (!nome) return { ok: false, error: 'Informe o nome da linha.' };
      for (const contato of linha.contatos || []) {
        if (!emailValido(contato.email)) return { ok: false, error: `E-mail inválido no contato da linha ${nome}.` };
      }
      const faixas = linha.faixas || [];
      const distintas = Array.from(new Map(faixas.map((x) => [`${Number(x.valorDe) || 0}:${Number(x.valorAte) || 0}`, x])).values())
        .sort((a, b) => (Number(a.valorDe) || 0) - (Number(b.valorDe) || 0));
      const semTeto = distintas.filter((x) => (Number(x.valorAte) || 0) === 0);
      if (semTeto.length > 1) return { ok: false, error: `Só uma faixa pode ficar sem teto (linha ${nome}).` };
      if (semTeto.length === 1 && (Number(distintas[distintas.length - 1].valorAte) || 0) !== 0) {
        return { ok: false, error: `A faixa sem teto precisa ser a última (linha ${nome}).` };
      }
      for (let i = 0; i < distintas.length; i += 1) {
        const de = Number(distintas[i].valorDe) || 0;
        const ate = Number(distintas[i].valorAte) || 0;
        if (ate !== 0 && ate <= de) return { ok: false, error: `Faixa inválida na linha ${nome}.` };
        if (i > 0) {
          const anteriorAte = Number(distintas[i - 1].valorAte) || 0;
          const fimAnterior = anteriorAte === 0 ? Infinity : anteriorAte;
          if (de < fimAnterior) return { ok: false, error: `As faixas de valor não podem se sobrepor (linha ${nome}).` };
        }
      }
      for (const faixa of faixas) {
        if (!parcelasValidas(faixa.parcelas)) return { ok: false, error: `Opção de prazo inválida na linha ${nome}.` };
      }
    }

    // ── fotografia anterior (log campo a campo, FO-06 B) ──
    const codfornec = inteiro(f.codfornec);
    const [existente] = await query(`SELECT * FROM SGC_FORNECEDOR WHERE CODFORNEC = ${codfornec} LIMIT 1`);
    const anteriorRow = existente || {};

    function formatar(tipo, valor) {
      if (tipo === 'moeda') return (Number(valor) || 0).toFixed(2);
      if (tipo === 'inteiro') return String(Number(valor) || 0);
      if (tipo === 'booleano') return Number(valor) ? 'Ativo' : 'Inativo';
      return String(valor ?? '');
    }

    const agoraTexto = agora();
    const dados = {
      usuarioId: quemChama,
      codfornec,
      fornecedor: f.fornecedor || '',
      cnpj: String(f.cnpj ?? '').replace(/\D/g, ''),
      cnpjFormatado: f.cnpjFormatado || '',
      prazoEntregaDias: Number(f.prazoEntregaDias) || 0,
      prazoEntregaTipo: f.prazoEntregaTipo || 'uteis',
      pedidoMinimo: Number(f.pedidoMinimo) || 0,
      fechamentoDiaInicio: Number(f.fechamentoDiaInicio) || 1,
      fechamentoDiaFim: Number(f.fechamentoDiaFim) || 1,
      linkPlataforma: f.linkPlataforma || '',
      validadeMinimaDias: Number(f.validadeMinimaDias) || 0,
      slaAnaliseDias: Number(f.slaAnaliseDias) || 0,
      slaFaturamentoDias: Number(f.slaFaturamentoDias) || 0,
      ativo: f.ativo === false || Number(f.ativo) === 0 ? 0 : 1,
      agora: agoraTexto,
    };

    let fornecedorId = existente ? inteiro(existente.ID) : 0;
    if (fornecedorId) {
      await escrever('fornecedorAtualizar', { ...dados, id: fornecedorId });
    } else {
      await escrever('fornecedorInserir', dados);
      const [relido] = await query(`SELECT ID FROM SGC_FORNECEDOR WHERE CODFORNEC = ${codfornec} LIMIT 1`);
      fornecedorId = relido ? inteiro(relido.ID) : 0;
    }
    if (!fornecedorId) return { ok: false, error: 'Não foi possível gravar o fornecedor.' };

    // ── substitui filhas inteiras (RF-011: salvar vale pela parametrização inteira) ──
    await escrever('fornecedorFiliaisLimpar', { usuarioId: quemChama, fornecedorId });
    for (const filial of filiaisPayload) {
      await escrever('fornecedorFilialInserir', {
        usuarioId: quemChama, fornecedorId, codfilial: String(filial.codfilial ?? ''), filial: filial.filial || '',
      });
    }

    await escrever('fornecedorContatosLimpar', { usuarioId: quemChama, fornecedorId });
    await escrever('fornecedorFaixasLimpar', { usuarioId: quemChama, fornecedorId });
    await escrever('fornecedorLinhasLimpar', { usuarioId: quemChama, fornecedorId });

    for (let i = 0; i < linhasPayload.length; i += 1) {
      const linha = linhasPayload[i];
      await escrever('fornecedorLinhaInserir', { usuarioId: quemChama, fornecedorId, nome: linha.nome, ordem: i + 1 });
      const [linhaRow] = await query(`SELECT ID FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = ${fornecedorId} AND ORDEM = ${i + 1} ORDER BY ID DESC LIMIT 1`);
      const linhaId = linhaRow ? inteiro(linhaRow.ID) : 0;
      for (const contato of linha.contatos || []) {
        await escrever('fornecedorContatoInserir', { usuarioId: quemChama, linhaId, nome: contato.nome || '', email: contato.email || '' });
      }
      const faixas = linha.faixas || [];
      for (let j = 0; j < faixas.length; j += 1) {
        const faixa = faixas[j];
        await escrever('fornecedorFaixaInserir', {
          usuarioId: quemChama, linhaId, valorDe: Number(faixa.valorDe) || 0, valorAte: Number(faixa.valorAte) || 0,
          rotulo: faixa.rotulo || '', parcelas: faixa.parcelas || '', ordem: j + 1,
        });
      }
    }

    await escrever('fornecedorDocumentosLimpar', { usuarioId: quemChama, fornecedorId });
    for (const doc of documentosPayload) {
      const tipo = doc.tipo === 'Modelo de envio de pedido' ? 'Modelo de envio de pedido' : 'Documento';
      await escrever('fornecedorDocumentoInserir', {
        usuarioId: quemChama, fornecedorId, tipo, nome: doc.nome || '', endereco: doc.endereco || '',
        vencimento: doc.vencimento || '', agora: agoraTexto,
      });
    }

    // ── log campo a campo (FO-06 B): uma linha por campo que mudou ──
    const CAMPOS = [
      ['CNPJ', 'CNPJ', 'texto', anteriorRow.CNPJ, dados.cnpj],
      ['PRAZO_ENTREGA_DIAS', 'Prazo de entrega (dias)', 'inteiro', anteriorRow.PRAZO_ENTREGA_DIAS, dados.prazoEntregaDias],
      ['PRAZO_ENTREGA_TIPO', 'Prazo de entrega (tipo)', 'texto', anteriorRow.PRAZO_ENTREGA_TIPO, dados.prazoEntregaTipo],
      ['PEDIDO_MINIMO', 'Pedido mínimo', 'moeda', anteriorRow.PEDIDO_MINIMO, dados.pedidoMinimo],
      ['FECHAMENTO_DIA_INICIO', 'Fechamento (dia inicial)', 'inteiro', anteriorRow.FECHAMENTO_DIA_INICIO, dados.fechamentoDiaInicio],
      ['FECHAMENTO_DIA_FIM', 'Fechamento (dia final)', 'inteiro', anteriorRow.FECHAMENTO_DIA_FIM, dados.fechamentoDiaFim],
      ['LINK_PLATAFORMA', 'Link da plataforma', 'texto', anteriorRow.LINK_PLATAFORMA, dados.linkPlataforma],
      ['VALIDADE_MINIMA_DIAS', 'Validade mínima', 'inteiro', anteriorRow.VALIDADE_MINIMA_DIAS, dados.validadeMinimaDias],
      ['SLA_ANALISE_DIAS', 'SLA de análise', 'inteiro', anteriorRow.SLA_ANALISE_DIAS, dados.slaAnaliseDias],
      ['SLA_FATURAMENTO_DIAS', 'SLA de faturamento', 'inteiro', anteriorRow.SLA_FATURAMENTO_DIAS, dados.slaFaturamentoDias],
      ['ATIVO', 'Situação', 'booleano', anteriorRow.ATIVO, dados.ativo],
    ];
    let alteracoes = 0;
    for (const [, campo, tipo, valorAnterior, valorNovo] of CAMPOS) {
      const de = formatar(tipo, valorAnterior);
      const para = formatar(tipo, valorNovo);
      if (de !== para) {
        await escrever('fornecedorLogInserir', { usuarioId: quemChama, fornecedorId, campo, de, para, agora: agoraTexto });
        alteracoes += 1;
      }
    }

    return { ok: true, fornecedorId, codfornec, alteracoes };
  });
}

/* ─────────────── montagem das definitions ─────────────── */

function montarDefinitions(idsEscritas, { jdbcId } = {}) {
  return [
    ...ESCRITAS.map((e) => ({ name: e.name, type: 'SQL', description: e.resumo, code: e.code })),
    ...LEITURAS_SQL.map((d) => ({
      name: d.name, type: 'SQL', description: d.resumo, code: d.code,
      ...(jdbcId && d.name.startsWith('sgcWint') ? { jdbcId } : {}),
    })),
    { name: 'sgcFornecedorCarregar', type: 'JAVASCRIPT', description: 'RF-004..RF-012 — pai + filhas + log numa execução (RNF-002)', code: carregarCode() },
    { name: 'sgcFornecedorSalvar', type: 'JAVASCRIPT', description: 'RF-005..RF-013 — valida, substitui a parametrização inteira e loga (D-009)', code: injetarIds(salvarCodeTemplate(), idsEscritas) },
  ];
}

// `definitions` para o SIMULADOR: ids locais de frontend/src/lib/server-functions.ts
// (mesmo padrão de add-001-kanban.mjs). Na publicação real, isEntrypoint()
// resolve os ids REAIS das escritas (por nome, depois de publicá-las) e
// remonta as definitions antes de publicar o resto — ver abaixo.
function idsLocaisDasEscritas() {
  const porNome = idsDoMapa(FRONTEND_MAP);
  return Object.fromEntries(ESCRITAS.map((e) => [e.chave, porNome[e.name]]));
}

export const definitions = montarDefinitions(idsLocaisDasEscritas());

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function functionId(item) {
  return item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;
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
  const jdbcId = await jdbcIdWinthor(projectId);

  const lista = await sdk.listServerFunctionsMitra({ projectId });
  const porNome = new Map((lista?.result ?? lista ?? []).map((fn) => [fn.name, fn]));

  async function publicar(definition) {
    const existente = porNome.get(definition.name);
    const extras = {
      ...(definition.jdbcId ? { jdbcId: definition.jdbcId } : {}),
      ...(definition.cronExpression ? { cronExpression: definition.cronExpression } : {}),
    };
    if (existente) {
      const id = functionId(existente);
      await sdk.updateServerFunctionMitra({ projectId, serverFunctionId: id, code: definition.code, description: definition.description, ...extras });
      console.log(`  atualizada  ${definition.name} (${id})`);
      return id;
    }
    const criada = await sdk.createServerFunctionMitra({ projectId, name: definition.name, type: definition.type, code: definition.code, description: definition.description, ...extras });
    const id = functionId(criada);
    console.log(`  criada      ${definition.name} (${id})`);
    porNome.set(definition.name, { ...definition, id });
    return id;
  }

  // 1) as 13 escritas primeiro (código não depende de id nenhum); guarda os ids REAIS.
  const idsReais = {};
  for (const escrita of ESCRITAS) idsReais[escrita.chave] = await publicar({ name: escrita.name, type: 'SQL', description: escrita.resumo, code: escrita.code });

  // 2) o resto, com sgcFornecedorSalvar já carregando os ids reais das escritas.
  const resto = montarDefinitions(idsReais, { jdbcId }).filter((d) => !ESCRITAS.some((e) => e.name === d.name));
  for (const definition of resto) await publicar(definition);

  console.log(`Pronto: ${ESCRITAS.length + resto.length} server functions (spec 001 — fornecedores).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
