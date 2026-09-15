// Regra pura da spec 001 (fornecedores) — RN-002..RN-010, RN-014. Ver
// docs/specs/001-fornecedores/plan.md §Testes (T-088, T-089).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cnpjValido, formatarCnpj, janelaFechamentoValida, slaEfetivo, rotuloPrazoEntrega,
  documentoVencido, emailValido, validarFaixas, faixaDoValor, validarParametrizacao,
} from '../src/lib/fornecedor.ts';

test('RN-002: CNPJ válido e inválido', () => {
  assert.equal(cnpjValido('49324221000104'), true);
  assert.equal(cnpjValido('49324221000105'), false);
  assert.equal(cnpjValido('4932422100010'), false);
  assert.equal(cnpjValido('11111111111111'), false);
  assert.equal(formatarCnpj('49324221000104'), '49.324.221/0001-04');
});

test('RN-004: janela de fechamento entre 1 e 31, podendo virar o mês', () => {
  assert.equal(janelaFechamentoValida(7, 15), true);
  assert.equal(janelaFechamentoValida(28, 5), true); // vira o mês (R-003)
  assert.equal(janelaFechamentoValida(0, 15), false);
  assert.equal(janelaFechamentoValida(7, 32), false);
});

test('RN-005: SLA vazio vale 1 e 5 dias úteis', () => {
  assert.deepEqual(slaEfetivo({ analise: 0, faturamento: 0 }), {
    analise: { dias: 1, origem: 'padrao' },
    faturamento: { dias: 5, origem: 'padrao' },
  });
  assert.deepEqual(slaEfetivo({ analise: 3 }).analise, { dias: 3, origem: 'parametrizado' });
});

test('RN-006: rótulo do prazo de entrega', () => {
  assert.equal(rotuloPrazoEntrega(7, 'uteis'), '7 dias úteis');
  assert.equal(rotuloPrazoEntrega(1, 'corridos'), '1 dia corrido');
  assert.equal(rotuloPrazoEntrega(0, 'uteis'), '');
});

test('RN-014: documento vencido', () => {
  assert.equal(documentoVencido('2027-03-31', '2027-04-01'), true);
  assert.equal(documentoVencido('2027-03-31', '2027-03-31'), false);
  assert.equal(documentoVencido('', '2027-04-01'), false);
});

test('RN-007: e-mail do contato de envio', () => {
  assert.equal(emailValido('elaine@'), false);
  assert.equal(emailValido('elaine.santos@fresenius-kabi.com'), true);
});

test('RN-008: faixas sem sobreposição', () => {
  assert.equal(validarFaixas([{ valorDe: 0, valorAte: 20000 }, { valorDe: 20000, valorAte: 45000 }]).ok, true);
  const sobreposta = validarFaixas([{ valorDe: 0, valorAte: 20000 }, { valorDe: 10000, valorAte: 30000 }]);
  assert.equal(sobreposta.ok, false);
  assert.ok(sobreposta.erro);
  assert.equal(validarFaixas([{ valorDe: 0, valorAte: 0 }, { valorDe: 50000, valorAte: 0 }]).ok, false);
});

test('RN-009: opção de prazo recusada quando não vira parcelas válidas', () => {
  const base = {
    fornecedor: { cnpj: '49324221000104', pedidoMinimo: 100, fechamentoDiaInicio: 1, fechamentoDiaFim: 10 },
    linhas: [{ nome: 'Nutrição Enteral', contatos: [], faixas: [{ valorDe: 0, valorAte: 0, parcelas: '0/30' }] }],
  };
  const invalida = validarParametrizacao(base);
  assert.equal(invalida.ok, false);
  assert.match(invalida.error ?? '', /Nutrição Enteral/);

  base.linhas[0].faixas[0].parcelas = 'trinta';
  const invalida2 = validarParametrizacao(base);
  assert.equal(invalida2.ok, false);
  assert.match(invalida2.error ?? '', /Nutrição Enteral/);

  base.linhas[0].faixas[0].parcelas = '30/60/90';
  assert.equal(validarParametrizacao(base).ok, true);
});

test('RN-010: faixa aplicável ao valor do pedido', () => {
  const faixas = [
    { valorDe: 0, valorAte: 20000, parcelas: '30' },
    { valorDe: 20000, valorAte: 45000, parcelas: '30/45' },
    { valorDe: 45000, valorAte: 0, rotulo: 'Opção A', parcelas: '30/45/60' },
    { valorDe: 45000, valorAte: 0, rotulo: 'Opção B', parcelas: '30/60' },
  ];
  assert.deepEqual(faixaDoValor(faixas, 20000), [[30, 45]]);
  assert.deepEqual(faixaDoValor(faixas, 50000), [[30, 45, 60], [30, 60]]);
  assert.deepEqual(faixaDoValor(faixas, 19999.99), [[30]]);
});
