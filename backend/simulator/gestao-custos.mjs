// Gestão de Custos no simulador — a conexão de integração `gestao-de-custos`
// (projeto Mitra 46967, banco MySQL do próprio projeto), de onde o SGC lê as
// unidades por caixa (`PRODUTOS.UNIDADES_POR_CAIXA`). Em produção a Server
// Function `sgcCustoUnidadesPorCaixa` (add-006, type INTEGRATION) é executada
// pela plataforma: o `code` é um JSON com `connection`, `method`, `endpoint` e
// `body.sql`, e os `event.<param>` do SQL são substituídos por TEXTO.
//
// Irmão de winthor-oracle.mjs. Dois modos:
//
// - SEM env (o padrão, e o que check e smoke usam): a INTEGRATION roda no
//   SQLite, sobre a tabela CUSTO_PRODUTOS que o seed da 003 já tem no lugar da
//   PRODUTOS do Gestão de Custos. Determinístico e sem rede.
// - `SIMULATOR_GESTAO_CUSTOS=mitra` no backend/.env: a consulta vai à
//   plataforma, como LEITURA, com variáveis SÓ deste adaptador —
//   `GESTAO_CUSTOS_BASE_URL`, `GESTAO_CUSTOS_TOKEN`, `GESTAO_CUSTOS_PROJECT_ID`
//   (46967, `runQuery` direto, o caminho preferido) e, só para o fallback pela
//   conexão `gestao-de-custos`, `GESTAO_CUSTOS_INTEGRATIONS_URL` e
//   `GESTAO_CUSTOS_CONEXAO_PROJECT_ID` (o projeto que tem a conexão). O SDK é
//   uma INSTÂNCIA própria (`createMitraSdkInstance`): nada global, nada em
//   `process.env`. O caminho que valeu aparece no log e no /health. Cache em
//   memória por CODPROD (5 min) para não martelar a plataforma.
//
// NUNCA preencha MITRA_BASE_URL / MITRA_TOKEN / MITRA_BASE_URL_INTEGRATIONS /
// MITRA_PROJECT_ID na VPS: são as variáveis de ESCRITA dos add-*.mjs e do
// setup-backend.mjs (o `MITRA_BASE_URL` vazio é a trava "este script roda no
// sandbox", CLAUDE.md regras 1 e 2). Este módulo não as lê — com só elas
// preenchidas, ele NÃO liga (G-004 do smoke).
//
// Nunca escrita: só SELECT/WITH passam, e nada de runDml/runDdl aqui.

import 'dotenv/config';
import { toSqlite } from './mysql-dialect.mjs';

export const CONEXAO_GESTAO_CUSTOS = 'gestao-de-custos';
export const GESTAO_CUSTOS_PROJECT_ID_PADRAO = 46967;
const TTL_CACHE_MS = 5 * 60 * 1000;

/** O JSON do `code` de uma definition INTEGRATION, ou `null`. */
export function definicaoDeIntegracao(definition) {
  if (definition?.type !== 'INTEGRATION') return null;
  try {
    const json = JSON.parse(String(definition.code));
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/** Só a INTEGRATION cuja conexão é a do Gestão de Custos. */
export function ehGestaoCustos(definition) {
  const json = definicaoDeIntegracao(definition);
  return Boolean(json && json.connection === CONEXAO_GESTAO_CUSTOS);
}

/**
 * O SQL pronto: `event.<param>` substituído pelo input, por texto, como a
 * plataforma faz. Só número ou lista numérica (dígitos e vírgulas) passam —
 * letra é recusada, porque a substituição é textual. Lista vazia vira NULL
 * (`IN (NULL)` não casa nada). Só SELECT/WITH.
 */
export function montarSql(definition, input) {
  const json = definicaoDeIntegracao(definition);
  if (!json) throw new Error('A definition não é uma INTEGRATION com JSON válido.');
  const sql = String(json.body?.sql ?? '');
  const pronto = sql.replace(/\bevent\.(\w+)\b/g, (_, chave) => {
    const valor = input?.[chave];
    const texto = valor === undefined || valor === null ? '' : String(valor).trim();
    if (texto === '') return 'NULL';
    if (!/^\d+(\s*,\s*\d+)*$/.test(texto)) {
      throw new Error(`event.${chave}: só número ou lista numérica entra no SQL da integração (recebeu "${texto.slice(0, 40)}").`);
    }
    return texto;
  });
  if (!/^\s*(SELECT|WITH)\b/i.test(pronto)) throw new Error('A integração gestao-de-custos é somente leitura: só SELECT/WITH.');
  return pronto;
}

/** Só esquema, host e porta de uma URL; caminho colado junto é descartado com aviso. */
export function origemDe(texto, log = console) {
  const bruto = String(texto ?? '').trim();
  try {
    const url = new URL(bruto);
    if (url.pathname && url.pathname !== '/') log.warn(`[gestao-custos] ignorando o caminho "${url.pathname}" da URL — o SDK usa só a origem ${url.origin}.`);
    return url.origin;
  } catch {
    return bruto;
  }
}

/** A lista de CODPROD do input, como números (vazia quando não há lista). */
export function codprodsDe(input) {
  return String(input?.codprods ?? '').split(',').map((parte) => Number(parte.trim())).filter((n) => Number.isInteger(n) && n > 0);
}

/** O executor em SQLite: PRODUTOS do Gestão de Custos é a CUSTO_PRODUTOS do seed. */
export function executorSqlite(db) {
  return {
    descricao: 'sqlite (CUSTO_PRODUTOS do seed)',
    aceita: ehGestaoCustos,
    async executar(definition, input) {
      const sql = montarSql(definition, input).replace(/\bPRODUTOS\b/g, 'CUSTO_PRODUTOS');
      return db.prepare(toSqlite(sql)).all().map((linha) => ({ ...linha }));
    },
  };
}

/**
 * Abre o executor conforme o .env: sem `SIMULATOR_GESTAO_CUSTOS=mitra`, o de
 * SQLite (se houver `db`) ou `null`; com ele, o da plataforma, em leitura.
 */
export async function abrirGestaoCustos({ env = process.env, log = console, db = null } = {}) {
  if (env.SIMULATOR_GESTAO_CUSTOS !== 'mitra') return db ? executorSqlite(db) : null;

  // Só GESTAO_CUSTOS_*: as MITRA_* dos add-* nunca são lidas aqui.
  const faltam = ['GESTAO_CUSTOS_BASE_URL', 'GESTAO_CUSTOS_TOKEN'].filter((chave) => !env[chave]);
  if (faltam.length) throw new Error(`SIMULATOR_GESTAO_CUSTOS=mitra exige ${faltam.join(', ')} no backend/.env (nunca commitado; nunca preencha MITRA_* na VPS).`);

  const projectId = Number(env.GESTAO_CUSTOS_PROJECT_ID || GESTAO_CUSTOS_PROJECT_ID_PADRAO);
  const projetoDaConexao = Number(env.GESTAO_CUSTOS_CONEXAO_PROJECT_ID || 0);
  const { createMitraSdkInstance } = await import('mitra-sdk');
  // Instância própria: não configura o SDK global nem escreve em process.env.
  // O SDK monta as rotas sobre a ORIGEM (esquema + host + porta); um caminho
  // colado junto (ex.: /interactions/records) é descartado aqui, com aviso.
  const baseURL = origemDe(env.GESTAO_CUSTOS_BASE_URL, log);
  const sdk = createMitraSdkInstance({
    baseURL,
    token: env.GESTAO_CUSTOS_TOKEN,
    integrationURL: origemDe(env.GESTAO_CUSTOS_INTEGRATIONS_URL || baseURL, log),
  });

  let caminho = 'runQuery';
  async function consultar(sql) {
    if (caminho === 'runQuery') {
      try {
        const resposta = await sdk.runQuery({ projectId, sql });
        return resposta?.result?.rows ?? resposta?.rows ?? [];
      } catch (erro) {
        if (!projetoDaConexao || typeof sdk.callIntegration !== 'function') throw erro;
        log.warn(`[gestao-custos] runQuery no projeto ${projectId} recusado (${String(erro.message).split('\n')[0]}); usando a conexão ${CONEXAO_GESTAO_CUSTOS} do projeto ${projetoDaConexao}.`);
        caminho = 'integration';
      }
    }
    const resposta = await sdk.callIntegration({
      projectId: projetoDaConexao, connection: CONEXAO_GESTAO_CUSTOS, method: 'POST', endpoint: 'runQuery', body: { sql },
    });
    const corpo = resposta?.body ?? resposta;
    return corpo?.rows ?? corpo?.result?.rows ?? [];
  }

  // Cache por CODPROD: só o que ainda não foi perguntado vai à plataforma.
  const cache = new Map();
  log.log(`[gestao-custos] INTEGRATION ${CONEXAO_GESTAO_CUSTOS} na plataforma: projeto ${projectId}${projetoDaConexao ? ` (ou a conexão do projeto ${projetoDaConexao})` : ''}`);

  return {
    get descricao() { return `mitra projeto ${projectId} via ${caminho}`; },
    get caminho() { return caminho; },
    aceita: ehGestaoCustos,
    /** Consulta solta, para a checagem manual (gestao-custos-checar.mjs). */
    consultar,
    async executar(definition, input) {
      const lista = codprodsDe(input);
      if (lista.length === 0) return consultar(montarSql(definition, input));
      const agora = Date.now();
      const prontos = [];
      const faltam = [];
      for (const codprod of lista) {
        const guardado = cache.get(codprod);
        if (guardado && guardado.ate > agora) prontos.push(...guardado.linhas);
        else faltam.push(codprod);
      }
      if (faltam.length > 0) {
        const linhas = await consultar(montarSql(definition, { ...input, codprods: faltam.join(',') }));
        const porCodprod = new Map(faltam.map((codprod) => [codprod, []]));
        for (const linha of linhas) {
          const codprod = Number(linha.CODPROD ?? linha.codprod);
          if (porCodprod.has(codprod)) porCodprod.get(codprod).push(linha);
        }
        for (const [codprod, doCodprod] of porCodprod) cache.set(codprod, { linhas: doCodprod, ate: agora + TTL_CACHE_MS });
        prontos.push(...linhas);
      }
      return prontos;
    },
  };
}
