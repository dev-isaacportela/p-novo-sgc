// Suite de testes do backend do SGC 2 — banco descartavel.
//
// O motor em si e testado na lib (mitra-kanban/backend/simulator/smoke.mjs).
// Aqui a pergunta e outra: a lib INSTALADA NESTE PROJETO, pelo add-001-kanban.mjs
// e pelo mapa de ids deste frontend, funciona — e os shims Oracle que a spec 003
// (WinThor) vai precisar ja traduzem o basico corretamente?
//
// Uso: cd backend && npm run sim:smoke   (ou npm test)

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEED, FRONTEND_MAP } from './config.mjs';
import { seedDatabase, USUARIOS, CENARIO, FASES } from './seed.mjs';
import { registerMysqlFunctions, toSqlite } from './mysql-dialect.mjs';
import { loadDefinitions, createRunner } from './runtime.mjs';
import { ESCRITAS, PUBLICAS, lerIdsDoMapa, nomesAusentesNoMapa } from '@benenutri/mitra-kanban/backend';

const DB = join(tmpdir(), `p-novo-sgc-${SEED}-${process.pid}-smoke.db`);
rmSync(DB, { force: true });
seedDatabase(DB, { reset: true });

const db = new DatabaseSync(DB);
registerMysqlFunctions(db);
const { byName, overridden } = await loadDefinitions();

// As JAVASCRIPT chamam as escritas por id: o id vem do mapa DESTE projeto.
const byId = new Map();
for (const [chave, id] of Object.entries(lerIdsDoMapa(FRONTEND_MAP))) {
  byId.set(id, byName.get(ESCRITAS.find((e) => e.chave === chave).name));
}
const execute = createRunner(db, { resolveById: (id) => byId.get(id) ?? null });

const U = CENARIO.usuarios;
const chamar = (nome, input = {}, userId = U.admin) => {
  const definicao = byName.get(nome);
  assert.ok(definicao, `server function ${nome} nao existe em PUBLISH_ORDER`);
  return execute(definicao, input, userId);
};

let feitos = 0;
const teste = async (titulo, fn) => {
  try {
    await fn();
  } catch (erro) {
    console.log(`  FALHOU  ${titulo}\n          ${erro.stack || erro.message}`);
    db.close();
    process.exit(1);
  }
  feitos += 1;
  console.log(`  ok  ${titulo}`);
};

await teste('S0-001: add-001-kanban.mjs carrega ESCRITAS.length + PUBLICAS.length server functions com os ids do mapa deste projeto', async () => {
  assert.equal(byName.size, ESCRITAS.length + PUBLICAS.length);
  assert.equal(overridden.length, 0);
  for (const definicao of byName.values()) assert.ok(!definicao.code.includes('__KB_IDS__'), `${definicao.name} ficou com o marcador de ids`);
  assert.equal(byId.size, ESCRITAS.length);
  for (const [id, definicao] of byId) assert.ok(definicao, `id ${id} do mapa nao resolve para uma escrita`);
});

await teste('S0-002: kbUsuarioSessao devolve cada um dos 5 usuarios do seed pelo :VAR_USER (nome e e-mail)', async () => {
  for (const [chave, id] of Object.entries(U)) {
    const esperado = USUARIOS[id - 1];
    const { rows } = await chamar('kbUsuarioSessao', {}, id);
    assert.equal(rows.length, 1, `usuario ${chave} (id ${id}) nao veio`);
    assert.equal(rows[0].NOME, esperado.nome);
    assert.equal(rows[0].EMAIL, esperado.email);
  }
});

await teste('S0-003: kbBoardCarregar com slug "compras" devolve o quadro com 10 fases ativas na ordem certa (8 comuns, 1 sucesso, 1 cancelado); souAdmin so para o admin', async () => {
  const comoAdmin = await chamar('kbBoardCarregar', { boardId: 0, slug: 'compras' }, U.admin);
  assert.equal(comoAdmin.ok, true, comoAdmin.error);
  assert.equal(comoAdmin.fases.length, 10);
  assert.deepEqual(comoAdmin.fases.map((f) => f.nome), FASES.map((f) => f.nome));
  assert.equal(comoAdmin.fases.filter((f) => f.tipo === 'comum').length, 8);
  assert.equal(comoAdmin.fases.filter((f) => f.tipo === 'sucesso').length, 1);
  assert.equal(comoAdmin.fases.filter((f) => f.tipo === 'cancelado').length, 1);
  assert.equal(comoAdmin.souAdmin, true);

  const comoAna = await chamar('kbBoardCarregar', { boardId: 0, slug: 'compras' }, U.ana);
  assert.equal(comoAna.ok, true, comoAna.error);
  assert.equal(comoAna.souAdmin, false);
});

await teste('S0-004: kbCardCriar (Ana) cria card na fase "analise" com KB_MOVIMENTO de entrada; kbCardMover para "tecnica" funciona; kbCardsListar devolve 1 card', async () => {
  const criado = await chamar('kbCardCriar', {
    boardId: CENARIO.boardCompras, titulo: 'Pedido de teste do esqueleto', valoresJson: '{}', responsavelId: 0, prazo: '',
  }, U.ana);
  assert.equal(criado.ok, true, criado.error);

  const detalheInicial = await chamar('kbCardDetalhe', { cardId: criado.id }, U.ana);
  assert.equal(detalheInicial.card.faseId, CENARIO.fases.analise);
  assert.equal(detalheInicial.movimentos.length, 1, 'deveria ter o movimento de entrada');
  assert.equal(detalheInicial.movimentos[0].deFaseId, null);
  assert.equal(detalheInicial.movimentos[0].paraFaseId, CENARIO.fases.analise);

  const movido = await chamar('kbCardMover', { cardId: criado.id, faseId: CENARIO.fases.tecnica, ordem: 0 }, U.ana);
  assert.equal(movido.ok, true, movido.error);

  const lista = await chamar('kbCardsListar', {
    boardId: CENARIO.boardCompras, faseId: 0, busca: '', responsavelId: 0, incluirConcluidos: 0, limite: 20, offset: 0,
  }, U.ana);
  assert.equal(lista.ok, true, lista.error);
  assert.equal(lista.total, 1);
  assert.equal(lista.cards.length, 1);
  assert.equal(lista.cards[0].faseId, CENARIO.fases.tecnica);
});

await teste('S0-005: shims Oracle (NVL, TO_DATE, TO_CHAR, TRUNC(SYSDATE), FROM DUAL, WHERE ROWNUM <= 2) traduzem e rodam com o resultado esperado', async () => {
  // Tabela temporaria so deste teste — o SGC ainda nao semeia tabelas do WinThor.
  db.exec('CREATE TABLE PCTESTE (ID INTEGER PRIMARY KEY, NOME TEXT)');
  db.exec("INSERT INTO PCTESTE (NOME) VALUES ('Fornecedor A'), ('Fornecedor B'), ('Fornecedor C')");

  const sql = toSqlite(`SELECT P.ID,
    NVL(P.NOME, 'sem nome') AS NOME,
    TO_CHAR(TO_DATE('15/09/2026', 'DD/MM/YYYY'), 'DD/MM/YYYY') AS DATA_FORMATADA,
    TRUNC(SYSDATE) AS HOJE,
    (SELECT NVL(NULL, 'ok') FROM DUAL) AS TESTE_DUAL
  FROM PCTESTE P
  WHERE ROWNUM <= 2
  ORDER BY P.ID`);

  const linhas = db.prepare(sql).all();
  assert.equal(linhas.length, 2, 'ROWNUM <= 2 deveria virar LIMIT 2');
  assert.equal(linhas[0].NOME, 'Fornecedor A');
  assert.equal(linhas[0].DATA_FORMATADA, '15/09/2026', 'TO_DATE + TO_CHAR deveriam ida-e-volta o mesmo formato');
  assert.match(linhas[0].HOJE, /^\d{4}-\d{2}-\d{2}$/, 'TRUNC(SYSDATE) deveria virar data sem hora');
  assert.equal(linhas[0].TESTE_DUAL, 'ok', 'FROM DUAL deveria sumir e NVL(NULL, x) devolver x');

  // NVL cobre o caso "tem valor": nao troca pelo default.
  const semTroca = db.prepare(toSqlite("SELECT NVL('valor', 'default') AS V FROM DUAL")).all();
  assert.equal(semTroca[0].V, 'valor');

  // TRUNC(numero) continua numerico — nao vira data.
  const numerico = db.prepare(toSqlite('SELECT TRUNC(3.9) AS N FROM DUAL')).all();
  assert.equal(numerico[0].N, 3);
});

await teste('S0-006: nomesAusentesNoMapa(FRONTEND_MAP) devolve vazio, e o mapa reserva kbNotaRegistrar (nome da 1.3.0, ainda nao publicada)', async () => {
  assert.deepEqual(nomesAusentesNoMapa(FRONTEND_MAP), []);
  const fonte = readFileSync(FRONTEND_MAP, 'utf8');
  assert.ok(fonte.includes("kbNotaRegistrar: 'kbNotaRegistrar'"), 'kbNotaRegistrar deveria estar reservado em SERVER_FUNCTION_NAMES');
  assert.match(fonte, /kbNotaRegistrar: '\d+'/, 'kbNotaRegistrar deveria ter um id local em SERVER_FUNCTIONS');
});

console.log(`\n  ${feitos} verificacoes passaram.`);
db.close();
