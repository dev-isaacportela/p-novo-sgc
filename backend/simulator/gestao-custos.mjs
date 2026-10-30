// Gestão de Custos no simulador — a conexão de integração `gestao-de-custos`
// (projeto Mitra 60574, banco MySQL do próprio projeto), de onde o SGC lê as
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
//   (60574) e, opcional, `GESTAO_CUSTOS_CAMINHO`. Dois caminhos, nesta ordem:
//   `runQuery` (SQL direto no projeto; exige token de desenvolvedor) e, se ele
//   é recusado, `records` — o REST `GET /interactions/records/PRODUTOS` com
//   `X-TenantID: <projeto>`, que um token business alcança. O `records` não
//   roda SQL: ele lê a PRODUTOS inteira (páginas de 200) e emula o SELECT da
//   sgcCustoUnidadesPorCaixa (CODPROD + COALESCE(UNIDADES_POR_CAIXA, 1)), com a
//   tabela em cache por 5 min. `GESTAO_CUSTOS_CAMINHO=records` pula o runQuery.
//   O SDK é uma INSTÂNCIA própria (`createMitraSdkInstance`): nada global,
//   nada em `process.env`. O caminho que valeu aparece no log e no /health.
//
// NUNCA preencha MITRA_BASE_URL / MITRA_TOKEN / MITRA_BASE_URL_INTEGRATIONS /
// MITRA_PROJECT_ID na VPS: são as variáveis de ESCRITA dos add-*.mjs e do
// setup-backend.mjs (o `MITRA_BASE_URL` vazio é a trava "este script roda no
// sandbox", CLAUDE.md regras 1 e 2). Este módulo não as lê — com só elas
// preenchidas, ele NÃO liga (G-004 do smoke).
//
// Nunca escrita: só SELECT/WITH passam, só GET no REST, e nada de runDml/runDdl aqui.

import 'dotenv/config';
import { toSqlite } from './mysql-dialect.mjs';

export const CONEXAO_GESTAO_CUSTOS = 'gestao-de-custos';
// Projeto Mitra vivo do Gestão de Custos = 60574. O "p-46967" é o nome do
// REPOSITÓRIO com o código do Gestão de Custos, não o id do projeto (a PRODUTOS
// do 46967 não tem UNIDADES_POR_CAIXA; a do 60574 tem em todas as linhas).
export const GESTAO_CUSTOS_PROJECT_ID_PADRAO = 60574;
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
 * O que a sgcCustoUnidadesPorCaixa devolveria para estes registros da PRODUTOS
 * (REST `records`): CODPROD e COALESCE(UNIDADES_POR_CAIXA, 1). Linha sem CODPROD
 * numérico é descartada; `$type$` e as demais colunas ficam de fora.
 */
export function unidadesDeRegistros(registros) {
  const linhas = [];
  for (const registro of registros ?? []) {
    const codprod = Number(registro?.CODPROD);
    if (!Number.isInteger(codprod) || codprod <= 0) continue;
    const unidades = Number(registro.UNIDADES_POR_CAIXA);
    linhas.push({ CODPROD: codprod, UNIDADES_POR_CAIXA: Number.isFinite(unidades) && unidades > 0 ? unidades : 1 });
  }
  return linhas;
}

const STATUS_ENCERRADOS = new Set(['INATIVA', 'INACTIVE', 'CANCELADA', 'CANCELADO', 'REJEITADA', 'REPROVADA']);
const dataIso = (valor) => String(valor ?? '').slice(0, 10);

/** A SQL de uma definition é a das políticas de preço especial (R-125)? */
export function ehCustosEspeciais(definition) {
  return /\bCOST_POLICIES\b/.test(String(definicaoDeIntegracao(definition)?.body?.sql ?? ''));
}

/**
 * O que a sgcCustoEspeciaisProdutos devolveria para estas tabelas (REST
 * `records`): as três origens de cliente unidas (lista da política, CLIENTE_ID
 * da política, aberta = 0), filtradas por produto pedido, custo > 0, status
 * não encerrado e vigência em `hoje`; sem repetição.
 */
export function custosEspeciaisDeRegistros({ politicas, itens, clientes }, codprods, hoje) {
  const pedidos = new Set((codprods ?? []).map(Number));
  const dia = dataIso(hoje);
  const porPolitica = new Map();
  for (const c of clientes ?? []) {
    const lista = porPolitica.get(Number(c.POLICY_ID)) ?? [];
    lista.push(Number(c.CLIENTE_ID));
    porPolitica.set(Number(c.POLICY_ID), lista);
  }
  const vistos = new Set();
  const saida = [];
  for (const p of politicas ?? []) {
    const status = String(p.STATUS ?? 'ATIVA').toUpperCase();
    if (STATUS_ENCERRADOS.has(status)) continue;
    const inicio = dataIso(p.DT_START);
    const fim = dataIso(p.DT_END);
    if ((inicio && inicio > dia) || (fim && fim < dia)) continue;
    const daLista = porPolitica.get(Number(p.ID)) ?? [];
    const proprio = Number(p.CLIENTE_ID ?? 0);
    const codclis = [...daLista, ...(proprio > 0 ? [proprio] : [])];
    const alvos = codclis.length > 0 ? codclis : [0];
    for (const i of (itens ?? []).filter((item) => Number(item.POLICY_ID) === Number(p.ID))) {
      const codprod = Number(i.PRODUCT_ID);
      const custo = Number(i.SPECIAL_COST);
      if (!pedidos.has(codprod) || !(custo > 0)) continue;
      for (const codcli of alvos) {
        const chave = `${codprod}|${codcli}|${p.ID}|${custo}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        saida.push({
          CODPROD: codprod, CODCLI: codcli, CUSTO_ESPECIAL: custo, VARIACAO_PERCENTUAL: Number(i.VARIATION_PERCENT ?? 0),
          POLITICA_ID: Number(p.ID), POLITICA_NOME: String(p.NAME ?? ''), DATA_FIM: fim || null,
        });
      }
    }
  }
  return saida;
}

/**
 * Abre o executor conforme o .env: sem `SIMULATOR_GESTAO_CUSTOS=mitra`, o de
 * SQLite (se houver `db`) ou `null`; com ele, o da plataforma, em leitura.
 * `sdk` e `fetch` são injetáveis só para os testes sem rede.
 */
export async function abrirGestaoCustos({
  env = process.env, log = console, db = null, sdk = null, fetch: buscar = globalThis.fetch,
} = {}) {
  if (env.SIMULATOR_GESTAO_CUSTOS !== 'mitra') return db ? executorSqlite(db) : null;

  // Só GESTAO_CUSTOS_*: as MITRA_* dos add-* nunca são lidas aqui.
  const faltam = ['GESTAO_CUSTOS_BASE_URL', 'GESTAO_CUSTOS_TOKEN'].filter((chave) => !env[chave]);
  if (faltam.length) throw new Error(`SIMULATOR_GESTAO_CUSTOS=mitra exige ${faltam.join(', ')} no backend/.env (nunca commitado; nunca preencha MITRA_* na VPS).`);

  const projectId = Number(env.GESTAO_CUSTOS_PROJECT_ID || GESTAO_CUSTOS_PROJECT_ID_PADRAO);
  const token = env.GESTAO_CUSTOS_TOKEN;
  // O SDK e o REST montam as rotas sobre a ORIGEM (esquema + host + porta); um
  // caminho colado junto (ex.: /interactions/records) é descartado aqui, com aviso.
  const baseURL = origemDe(env.GESTAO_CUSTOS_BASE_URL, log);
  let caminho = env.GESTAO_CUSTOS_CAMINHO === 'records' ? 'records' : 'runQuery';
  if (caminho === 'runQuery' && !sdk) {
    const { createMitraSdkInstance } = await import('mitra-sdk');
    // Instância própria: não configura o SDK global nem escreve em process.env.
    sdk = createMitraSdkInstance({ baseURL, token, integrationURL: baseURL });
  }

  /** `runQuery` no projeto; recusado (token business, projeto fora do alcance) vira `records`. */
  async function consultar(sql) {
    try {
      const resposta = await sdk.runQuery({ projectId, sql });
      return resposta?.result?.rows ?? resposta?.rows ?? [];
    } catch (erro) {
      // O SDK às vezes põe um objeto em `message`; o aviso precisa ser legível.
      const motivo = typeof erro?.message === 'string' ? erro.message : JSON.stringify(erro?.message ?? erro);
      log.warn(`[gestao-custos] runQuery no projeto ${projectId} recusado (${String(motivo).split('\n')[0].slice(0, 160)}); usando o REST /interactions/records.`);
      caminho = 'records';
      return null;
    }
  }

  /** Todas as páginas de uma tabela pelo REST `records`, só GET, com o mesmo token. */
  async function registros(tabela) {
    const linhas = [];
    for (let pagina = 0; ; pagina++) {
      const url = new URL(`/interactions/records/${tabela}`, baseURL);
      url.searchParams.set('page', String(pagina));
      url.searchParams.set('size', '200');
      const resposta = await buscar(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'X-TenantID': String(projectId), 'Content-Type': 'application/json' },
      });
      if (!resposta.ok) throw new Error(`[gestao-custos] GET records/${tabela} no projeto ${projectId}: HTTP ${resposta.status}`);
      const corpo = await resposta.json();
      const conteudo = Array.isArray(corpo?.content) ? corpo.content : [];
      linhas.push(...conteudo);
      if (conteudo.length === 0 || pagina + 1 >= Number(corpo?.totalPages ?? 0)) break;
    }
    return linhas;
  }

  // Cache: por CODPROD e por definition no runQuery (só o que falta vai à
  // plataforma); a tabela inteira no records (uma vez a cada 5 min).
  const caches = new Map();
  const cacheDe = (nome) => {
    if (!caches.has(nome)) caches.set(nome, new Map());
    return caches.get(nome);
  };
  const tabelas = new Map();
  async function tabelaPeloRest(nome) {
    const agora = Date.now();
    const guardada = tabelas.get(nome);
    if (guardada && guardada.ate > agora) return guardada.linhas;
    const linhas = await registros(nome);
    tabelas.set(nome, { linhas, ate: agora + TTL_CACHE_MS });
    return linhas;
  }
  const produtosPeloRest = () => tabelaPeloRest('PRODUTOS');
  async function custosEspeciaisPeloRest(codprods) {
    const [politicas, itens, clientes] = await Promise.all([tabelaPeloRest('COST_POLICIES'), tabelaPeloRest('POLICY_ITEMS'), tabelaPeloRest('COST_POLICY_CLIENTS')]);
    return custosEspeciaisDeRegistros({ politicas, itens, clientes }, codprods, new Date().toISOString());
  }

  log.log(`[gestao-custos] INTEGRATION ${CONEXAO_GESTAO_CUSTOS} na plataforma: projeto ${projectId}, caminho inicial ${caminho}`);

  return {
    get descricao() { return `mitra projeto ${projectId} via ${caminho}`; },
    get caminho() { return caminho; },
    aceita: ehGestaoCustos,
    /**
     * A PRODUTOS inteira como a plataforma a devolve (CODPROD, UNIDADES_POR_CAIXA
     * crua, sem COALESCE), para a checagem manual (gestao-custos-checar.mjs).
     */
    async produtos() {
      if (caminho === 'runQuery') {
        const linhas = await consultar('SELECT CODPROD, UNIDADES_POR_CAIXA FROM PRODUTOS');
        if (linhas) return linhas;
      }
      return (await produtosPeloRest()).map(({ $type$: _tipo, ...linha }) => linha);
    },
    async executar(definition, input) {
      const lista = codprodsDe(input);
      if (lista.length === 0) return [];
      const cache = cacheDe(String(definition?.name ?? 'sgcCustoUnidadesPorCaixa'));
      const agora = Date.now();
      const prontos = [];
      const faltam = [];
      for (const codprod of lista) {
        const guardado = cache.get(codprod);
        if (guardado && guardado.ate > agora) prontos.push(...guardado.linhas);
        else faltam.push(codprod);
      }
      if (faltam.length === 0) return prontos;
      let linhas = caminho === 'runQuery' ? await consultar(montarSql(definition, { ...input, codprods: faltam.join(',') })) : null;
      if (!linhas) {
        const pedidos = new Set(faltam);
        linhas = ehCustosEspeciais(definition)
          ? await custosEspeciaisPeloRest(faltam)
          : unidadesDeRegistros(await produtosPeloRest()).filter((linha) => pedidos.has(linha.CODPROD));
      }
      const porCodprod = new Map(faltam.map((codprod) => [codprod, []]));
      for (const linha of linhas) {
        const codprod = Number(linha.CODPROD ?? linha.codprod);
        if (porCodprod.has(codprod)) porCodprod.get(codprod).push(linha);
      }
      for (const [codprod, doCodprod] of porCodprod) cache.set(codprod, { linhas: doCodprod, ate: agora + TTL_CACHE_MS });
      prontos.push(...linhas);
      return prontos;
    },
  };
}
