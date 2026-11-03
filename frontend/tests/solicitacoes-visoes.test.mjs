// Spec 017: as visões agrupadas da fila de solicitações (src/lib/solicitacoes-visoes.ts).
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPCOES_VISAO, DIMENSOES, COLUNAS_SITUACAO, linhaDoGrupo, particaoConfere, filtroDoGrupo, comOpcao,
} from '../src/lib/solicitacoes-visoes.ts';

// As duas linhas de C-08, como a sgcSolicitacoesAgrupar devolve (UPPERCASE, números em texto).
const LEO = {
  CHAVE: '5', ROTULO: 'Leo Comercial', TOTAL: '4', PRODUTOS: '2', PENDENTES: '1', NA_FILA: '1', EM_COMPRA: '1',
  ATENDIDAS: '0', NAO_ATENDIDAS: '0', ENCERRADAS: '1', ULTIMA: '2026-10-30T10:00:00',
};
const ADMIN = {
  CHAVE: '1', ROTULO: 'Admin SGC', TOTAL: 3, PRODUTOS: 2, PENDENTES: 0, NA_FILA: 0, EM_COMPRA: 0,
  ATENDIDAS: 1, NAO_ATENDIDAS: 1, ENCERRADAS: 1, ULTIMA: '2026-10-12T10:00:00',
};

test('RF-07 (017): quatro visões — Detalhada (a da 008) e as três dimensões de RN-SOL-16', () => {
  assert.deepEqual(OPCOES_VISAO.map((o) => o.value), ['detalhe', 'vendedor', 'fornecedor', 'filial']);
  assert.deepEqual(DIMENSOES, ['vendedor', 'fornecedor', 'filial']);
  assert.equal(OPCOES_VISAO[0].label, 'Detalhada');
});

test('C-08 / RN-07 (017): a linha vira grupo com números; as seis situações, na ordem das colunas, somam o total', () => {
  const leo = linhaDoGrupo('vendedor', LEO);
  assert.deepEqual(
    [leo.chave, leo.rotulo, leo.total, leo.produtos, ...COLUNAS_SITUACAO.map((c) => leo[c.campo])],
    ['5', 'Leo Comercial', 4, 2, 1, 1, 1, 0, 0, 1],
  );
  assert.deepEqual(COLUNAS_SITUACAO.map((c) => c.label), ['Pendentes', 'Na fila', 'Em compra', 'Atendidas', 'Não atendidas', 'Recusadas ou canceladas']);
  assert.equal(particaoConfere(leo), true);
  assert.equal(particaoConfere(linhaDoGrupo('vendedor', ADMIN)), true);
  assert.equal(particaoConfere(linhaDoGrupo('vendedor', { ...LEO, TOTAL: 5 })), false, 'soma que não fecha é avisada');
});

test('RN-08 (017): rótulo vazio vira "Sem vendedor", "Sem fornecedor" ou o código da filial', () => {
  assert.equal(linhaDoGrupo('vendedor', { ...LEO, ROTULO: '' }).rotulo, 'Sem vendedor');
  assert.equal(linhaDoGrupo('fornecedor', { CHAVE: '1099', ROTULO: '  ' }).rotulo, 'Sem fornecedor');
  assert.equal(linhaDoGrupo('filial', { CHAVE: '7', ROTULO: null }).rotulo, '7');
  assert.equal(linhaDoGrupo('filial', { CHAVE: '2', ROTULO: 'Benenutri Filial Norte' }).rotulo, 'Benenutri Filial Norte');
  const vazio = linhaDoGrupo('filial', {});
  assert.equal(vazio.total, 0, 'número ausente é 0, nunca NaN');
});

test('C-12 / RN-11 (017): abrir o grupo devolve o filtro da lista — vendedor (id e nome), codfornec ou codfilial, com o rótulo da ficha', () => {
  assert.deepEqual(filtroDoGrupo('vendedor', linhaDoGrupo('vendedor', LEO)), { campo: 'vendedor', vendedor: { id: 5, nome: 'Leo Comercial' } });
  assert.deepEqual(
    filtroDoGrupo('fornecedor', linhaDoGrupo('fornecedor', { CHAVE: '1099', ROTULO: 'FORNECEDOR VISOES 017' })),
    { campo: 'codfornec', valor: '1099', rotulo: 'FORNECEDOR VISOES 017' },
  );
  assert.deepEqual(
    filtroDoGrupo('filial', linhaDoGrupo('filial', { CHAVE: '2', ROTULO: 'Benenutri Filial Norte' })),
    { campo: 'codfilial', valor: '2', rotulo: 'Benenutri Filial Norte' },
  );
});

test('C-12 (017): o seletor ganha a opção do grupo aberto quando ela não está na página à vista — e não a repete', () => {
  const opcoes = [{ value: '1042', label: 'NESTLE BRASIL LTDA' }];
  assert.deepEqual(comOpcao(opcoes, '1099', 'FORNECEDOR VISOES 017').map((o) => o.value), ['1042', '1099']);
  assert.equal(comOpcao(opcoes, '1042', 'outro').length, 1);
  assert.deepEqual(comOpcao(opcoes, '', 'x'), opcoes, 'sem filtro, as opções de sempre');
  assert.deepEqual(comOpcao(opcoes, '9', ''), [...opcoes, { value: '9', label: '9' }]);
});
