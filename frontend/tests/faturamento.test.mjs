// Faturamento da spec 005 (src/lib/faturamento.ts): percentual faturado,
// escalonamento do alerta, a linha do cartão e as colunas do CSV.
//
// `textoDaCapaFaturamento` é o par de `textoDaCapa` do cron
// (`sgcFaturamentoMonitorar`): os dois escrevem o MESMO campo do cartão. As
// frases deste teste são as mesmas que o smoke do backend confere.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentuaisFaturados, nivelDeAlerta, textoDaCapaFaturamento, colunasDoCsv,
  temNfNaCapa, resumoDaCobranca,
} from '../src/lib/faturamento.ts';

test('C-014 / RN-008: 72.000 de 120.000 e 1.200 de 2.000 dão 60 % em valor e em quantidade, com saldo de 48.000', () => {
  const p = percentuaisFaturados({ vlPedido: 120000, vlFaturado: 72000, qtPedida: 2000, qtFaturada: 1200 });
  assert.equal(p.valor, 60);
  assert.equal(p.quantidade, 60);
  assert.equal(p.saldo, 48000);
});

test('RN-008: pedido de valor zero dá 0 % sem divisão por zero, e 120.000 de 120.000 fecha em 100 % com saldo zero', () => {
  const zero = percentuaisFaturados({ vlPedido: 0, vlFaturado: 0, qtPedida: 0, qtFaturada: 0 });
  assert.equal(zero.valor, 0);
  assert.equal(zero.quantidade, 0);

  const cheio = percentuaisFaturados({ vlPedido: 120000, vlFaturado: 120000, qtPedida: 2000, qtFaturada: 2000 });
  assert.equal(cheio.valor, 100, '100 % em valor é o que encerra o acompanhamento');
  assert.equal(cheio.saldo, 0);
});

test('C-020 / C-021 / RN-009: 2 dias úteis não avisa, 3 avisa os responsáveis e 5 avisa também a gerência', () => {
  assert.equal(nivelDeAlerta(0), 0);
  assert.equal(nivelDeAlerta(2), 0);
  assert.equal(nivelDeAlerta(3), 3);
  assert.equal(nivelDeAlerta(4), 3);
  assert.equal(nivelDeAlerta(5), 5);
  assert.equal(nivelDeAlerta(9), 5, 'acima de 5 o nível não sobe — o que muda é a repetição diária');
});

test('C-019 / RN-013: com nota a capa mostra faturado, percentual e saldo; sem nota e com menos de 3 dias úteis não há linha', () => {
  assert.equal(
    textoDaCapaFaturamento({ temNf: true, vlFaturado: 72000, percValor: 60, saldo: 48000, diasUteis: 3 }),
    'R$ 72.000,00 (60 %) · saldo R$ 48.000,00',
  );
  assert.equal(
    textoDaCapaFaturamento({ temNf: false, vlFaturado: 0, percValor: 0, saldo: 120000, diasUteis: 2 }),
    '', 'cartão sem atraso e sem nota não ganha linha de faturamento',
  );
  assert.equal(
    textoDaCapaFaturamento({ temNf: false, vlFaturado: 0, percValor: 0, saldo: 120000, diasUteis: 4 }),
    'Faturamento pendente · 4 dias úteis',
  );
  assert.equal(
    textoDaCapaFaturamento({ temNf: true, vlFaturado: 59999.5, percValor: 59.999, saldo: 40000.5, diasUteis: 9 }),
    'R$ 59.999,50 (60 %) · saldo R$ 40.000,50', 'o percentual arredonda em duas casas e some quando é inteiro',
  );
});

test('RN-013: a capa não usa espaço não separável — o cron monta a mesma frase na mão e a tela não pode reescrever o campo a cada rodada', () => {
  const texto = textoDaCapaFaturamento({ temNf: true, vlFaturado: 72000, percValor: 60, saldo: 48000, diasUteis: 3 });
  assert.equal(texto.includes(String.fromCharCode(0xa0)), false);
  assert.ok(texto.startsWith('R$ 72.000,00'));
});

test('C-026: colunasDoCsv devolve o cabeçalho e uma linha por pedido, na ordem da tela', () => {
  const linhas = [
    {
      ID_CARD: 501, TITULO: 'Fresenius Kabi · Matriz', FASE: 'enviado', FORNECEDOR: 'Fresenius Kabi',
      FILIAL: 'Benenutri Matriz', NUMPED: '998901', DT_ENVIO: '2026-09-10', VL_TOTAL: 120000,
      VL_FATURADO: 72000, PERC_VALOR: 60, DIAS_UTEIS: 3, QT_CONTATOS: 1,
      DT_ULTIMO_CONTATO: '2026-09-11', ULTIMO_CONTATO_POR: 'Ana', DT_PREVISAO_BO: '', QT_BO_ABERTO: 0,
    },
    { ID_CARD: 502, TITULO: 'Nestlé · Norte', DIAS_UTEIS: 9 },
  ];
  const { cabecalho, corpo } = colunasDoCsv(linhas);
  assert.equal(cabecalho.length, 15);
  assert.equal(cabecalho[0], 'Pedido');
  assert.equal(corpo.length, 2);
  assert.deepEqual(corpo[0], [
    'Fresenius Kabi · Matriz', 'Fresenius Kabi', 'Benenutri Matriz', '998901', 'enviado',
    '2026-09-10', '120000,00', '72000,00', '60', 3, 1, '2026-09-11', 'Ana', '', 0,
  ]);
  assert.equal(corpo[1][9], 9, 'a linha incompleta não quebra: coluna ausente vira vazia ou zero');
  assert.equal(corpo[1][6], '0,00');
});

test('A-7 (revisão onda 2): a capa tem nota pelo VALOR faturado, não pela contagem de linhas de SGC_NF — a nota de VL_TOTAL zero fazia a tela e o cron escreverem textos diferentes', () => {
  assert.equal(temNfNaCapa(72000), true);
  assert.equal(temNfNaCapa(0), false, 'uma nota vinculada com valor zero não é faturamento');
  assert.equal(temNfNaCapa(''), false);
  assert.equal(temNfNaCapa(null), false);

  // O caso do achado: uma nota existe (nfs.length > 0), mas VL_FATURADO é zero
  // e já se passaram 4 dias úteis. O cron escreve a linha de pendência; a tela,
  // pelo critério antigo, escreveria "R$ 0,00 (0 %)" e as duas se sobrescreveriam.
  const capa = (temNf) => textoDaCapaFaturamento({ temNf, vlFaturado: 0, percValor: 0, saldo: 120000, diasUteis: 4 });
  assert.equal(capa(temNfNaCapa(0)), 'Faturamento pendente · 4 dias úteis');
  assert.match(capa(true), /R\$ 0,00 \(0 %\)/, 'é este o texto que divergia do cron');
});

test('A-4 (revisão onda 2): a cobrança enviada vira contato no histórico — o resumo é um só para as duas telas que abrem o diálogo', () => {
  assert.equal(
    resumoDaCobranca('Faturamento pendente — pedido 998901', 'captacao@fresenius-kabi.com'),
    'Cobrança de faturamento enviada por e-mail para captacao@fresenius-kabi.com — Faturamento pendente — pedido 998901',
  );
  // `sgcEscContatoInserir` recusa resumo vazio (TRIM('{{resumo}}') <> ''):
  // sem assunto e sem destinatário o texto ainda precisa existir.
  assert.equal(resumoDaCobranca('', ''), 'Cobrança de faturamento enviada por e-mail para a indústria');
  assert.ok(resumoDaCobranca('', '').trim().length > 0);
});
