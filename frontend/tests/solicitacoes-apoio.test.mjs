// Spec 017: o apoio à avaliação da solicitação (src/lib/solicitacoes-apoio.ts),
// sobre a mesma série da R-139 (vendas-filial.ts) e a mesma regra de clientes
// da R-135 (clientes-produto.ts). Os números são os do seed/017 do simulador.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  janelaDoApoio, clientesDoApoio, cincoMaiores, clienteNoApoio, fraseDoCliente, estoqueNoApoio, listaParcial, TETO_NOTAS,
} from '../src/lib/solicitacoes-apoio.ts';
import { serieDaFilial, resumoDaFilial } from '../src/lib/vendas-filial.ts';

const HOJE = '2026-11-03';

/** Uma nota de `sgcWintProdutoVendasNotas`. */
const nota = (mes, codcli, quantidade, extra = {}) => ({
  MES: mes, DTMOV: `${mes}-15`, NUMNOTA: Math.round(Math.random() * 1e6), NUMTRANSVENDA: 0,
  CODCLI: codcli, CLIENTE: `Cliente ${codcli}`, CODATV1: 1, RAMO: 'CLINICA',
  QUANTIDADE: quantidade, VALOR_TOTAL: quantidade * 25, PUBLICO: 0, ...extra,
});

// O seed/017: 9311 70 (2 notas), 9312 50, 9313 40 (2), 9314 30, 9315 20 (2), 9316 5; o público 9317 com 200.
const NOTAS = [
  nota('2026-05', 9313, 20), nota('2026-06', 9311, 40), nota('2026-07', 9315, 10), nota('2026-08', 9312, 50),
  nota('2026-08', 9317, 200, { PUBLICO: 1, CODATV1: 11 }), nota('2026-09', 9314, 30), nota('2026-09', 9316, 5),
  nota('2026-10', 9311, 30), nota('2026-10', 9315, 10), nota('2026-11', 9313, 20, { DTMOV: '2026-11-01' }),
  nota('2026-04', 9314, 60),
];

test('RN-02 (017): a janela do apoio são os MESMOS sete meses do gráfico — do dia 1 do sexto fechado até hoje', () => {
  const j = janelaDoApoio(HOJE);
  assert.deepEqual(j.meses, ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(j.inicio, '2026-05-01');
  assert.equal(j.fim, HOJE);
  assert.deepEqual(serieDaFilial([], HOJE, true).map((m) => m.mes), j.meses, 'a série da R-139 cobre os mesmos meses');
});

test('C-01 (017): sete barras, a última parcial, total 195 e média 32,5 nos seis fechados (o público sai)', () => {
  const historico = [
    ['2026-05', 20, 0], ['2026-06', 40, 0], ['2026-07', 10, 0], ['2026-08', 250, 200],
    ['2026-09', 35, 0], ['2026-10', 40, 0], ['2026-11', 20, 0],
  ].map(([MES, SAIDAS, SAIDAS_PUBLICAS]) => ({ MES, SAIDAS, ENTRADAS: 0, SAIDAS_PUBLICAS }));
  const serie = serieDaFilial(historico, HOJE, true);
  assert.equal(serie.length, 7);
  assert.deepEqual(serie.map((m) => m.vendas), [20, 40, 10, 50, 35, 40, 20]);
  assert.equal(serie.at(-1).parcial, true);
  const resumo = resumoDaFilial(serie, 65);
  assert.equal(resumo.total, 195);
  assert.equal(resumo.mediaMensal, 32.5);
});

test('C-02 / C-03 / RN-01 / RN-03 (017): os cinco maiores são 9311, 9312, 9313, 9314 e 9315 — sem o 9316, sem o público, sem a nota fora da janela', () => {
  const { meses } = janelaDoApoio(HOJE);
  const todos = clientesDoApoio(NOTAS, meses);
  assert.ok(!todos.some((c) => c.codcli === 9317), 'o órgão público fica fora sempre (P-03)');
  assert.deepEqual(todos.map((c) => [c.codcli, c.quantidade]), [[9311, 70], [9312, 50], [9313, 40], [9314, 30], [9315, 20], [9316, 5]],
    'a nota de 2026-04 (60 do 9314) está fora da janela');
  const cinco = cincoMaiores(todos);
  assert.deepEqual(cinco.map((c) => c.codcli), [9311, 9312, 9313, 9314, 9315]);
  assert.equal(cinco[0].notas.length, 2);
  assert.equal(cinco[2].ultimaCompra, '2026-11-01', 'a última compra do 9313 é a do mês corrente');
});

test('RN-03 (017): empate na quantidade desempata pelo valor e depois pelo código do cliente', () => {
  const { meses } = janelaDoApoio(HOJE);
  const empate = clientesDoApoio([
    nota('2026-10', 9402, 10, { VALOR_TOTAL: 100 }), nota('2026-10', 9401, 10, { VALOR_TOTAL: 100 }), nota('2026-10', 9403, 10, { VALOR_TOTAL: 300 }),
  ], meses);
  assert.deepEqual(empate.map((c) => c.codcli), [9403, 9401, 9402]);
});

test('C-04 / RN-04 (017): o cliente da solicitação — entre os cinco (marcado), fora deles (5 un. em 1 nota), não comprou, sem cliente', () => {
  const todos = clientesDoApoio(NOTAS, janelaDoApoio(HOJE).meses);
  assert.deepEqual(clienteNoApoio(todos, 9311), { situacao: 'entre_os_cinco', posicao: 1, quantidade: 70, notas: 2 });
  assert.equal(fraseDoCliente(clienteNoApoio(todos, 9311)), null, 'entre os cinco, a marca é a linha da lista');

  const fora = clienteNoApoio(todos, 9316);
  assert.deepEqual(fora, { situacao: 'fora_dos_cinco', quantidade: 5, notas: 1 });
  assert.equal(fraseDoCliente(fora), 'O cliente desta solicitação levou 5 un. em 1 nota nos meses do gráfico (fora dos cinco maiores).');

  assert.deepEqual(clienteNoApoio(todos, 9399), { situacao: 'nao_comprou' });
  assert.match(fraseDoCliente(clienteNoApoio(todos, 9399)), /não comprou este produto nesta filial/);

  for (const vazio of [0, '0', null, undefined]) {
    assert.deepEqual(clienteNoApoio(todos, vazio), { situacao: 'sem_cliente' });
  }
  assert.equal(fraseDoCliente(clienteNoApoio(todos, 0)), 'Sem cliente informado', 'sem cliente nunca é "não comprou"');
  assert.deepEqual(clienteNoApoio(todos, 9317), { situacao: 'nao_comprou' }, 'o órgão público não conta nem para o cliente da solicitação');
});

test('C-05 / RN-05 (017): disponível 65 e a caminho 36 na filial; cobertura de 60 dias pela média; sem venda, sem giro; filial ausente, sem posição', () => {
  const linhas = [
    { CODFILIAL: '1', ESTOQUE_ATUAL: 10, ESTOQUE_EM_TRANSITO: 0 },
    { CODFILIAL: '3', ESTOQUE_ATUAL: 65, ESTOQUE_EM_TRANSITO: 36 },
  ];
  assert.deepEqual(estoqueNoApoio(linhas, '3'), { disponivel: 65, aCaminho: 36 });
  assert.deepEqual(estoqueNoApoio(linhas, 3), { disponivel: 65, aCaminho: 36 }, 'código da filial em número também casa');
  assert.equal(estoqueNoApoio(linhas, '2'), null);
  assert.deepEqual(estoqueNoApoio([{ CODFILIAL: '3', ESTOQUE_ATUAL: -4, ESTOQUE_EM_TRANSITO: 0 }], '3'), { disponivel: 0, aCaminho: 0 }, 'nunca negativo');

  const serie = serieDaFilial([20, 40, 10, 50, 35, 40, 20].map((v, i) => ({ MES: `2026-${String(5 + i).padStart(2, '0')}`, SAIDAS: v, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 })), HOJE, true);
  assert.equal(resumoDaFilial(serie, 65).coberturaDias, 60, '65 ÷ (32,5 ÷ 30) = 60 dias');
  assert.equal(resumoDaFilial(serieDaFilial([], HOJE, true), 65).coberturaDias, null, 'sem venda: sem giro, nunca uma cobertura inventada');
});

test('C-06 / C-07 / RN-06 (017): sem notas a lista é vazia (o aviso é da tela) e a série tem 7 zeros; 3.000 notas marcam a lista como parcial, 2.999 não', () => {
  assert.deepEqual(clientesDoApoio([], janelaDoApoio(HOJE).meses), []);
  assert.deepEqual(clientesDoApoio(null, janelaDoApoio(HOJE).meses), [], 'leitura que falhou não vira cliente nenhum, nem zero');
  assert.deepEqual(serieDaFilial([], HOJE, true).map((m) => m.vendas), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(TETO_NOTAS, 3000);
  assert.equal(listaParcial(Array.from({ length: 3000 }, () => nota('2026-10', 1, 1))), true);
  assert.equal(listaParcial(Array.from({ length: 2999 }, () => nota('2026-10', 1, 1))), false);
  assert.equal(listaParcial(null), false);
});
