// Nota fiscal da spec 005 (src/lib/nf.ts): sugestão por semelhança, casamento
// do item pelos três códigos e as conferências. Os números aqui são os MESMOS
// do `backend/simulator/smoke/005-notas-fiscais.mjs` — a regra existe duas
// vezes (tela e server function) e é este par de testes que impede as duas de
// divergirem em silêncio.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOLERANCIA_PRECO, VALIDADE_MINIMA_PADRAO_DIAS,
  pontuarSugestao, casarItem, resultadoDoCasamento, classificarDelta,
  diasDeValidade, resultadoDeValidade, resultadoDeQuantidade, resultadoDePrazo,
  textoDaOcorrencia, CANAIS_CONTATO,
} from '../src/lib/nf.ts';

// O pedido `enviadoSemPedido` do seed: cinco itens, 5.000,00, enviado em
// 24/08/2026; a nota 7002 emitida três dias depois traz quatro deles e o 9999.
const ITENS_PEDIDO = [
  { CODPROD: 5001, CODFAB: '', EAN: '', QT_PEDIDA: 100, PRECO_CUSTO: 10 },
  { CODPROD: 5002, CODFAB: 'FK-123', EAN: '', QT_PEDIDA: 100, PRECO_CUSTO: 10 },
  { CODPROD: 5003, CODFAB: '', EAN: '7891234567890', QT_PEDIDA: 100, PRECO_CUSTO: 10 },
  { CODPROD: 5004, CODFAB: '', EAN: '', QT_PEDIDA: 100, PRECO_CUSTO: 10 },
  { CODPROD: 5005, CODFAB: '', EAN: '', QT_PEDIDA: 100, PRECO_CUSTO: 10 },
];

const CONTEXTO = {
  itensPedido: ITENS_PEDIDO,
  dataEnvio: '2026-08-24',
  valorPedido: 5000,
  saldoPedido: 5000,
};

const nf = (extra) => ({
  NUMNOTA: 7002, SERIE: '1', DT_EMISSAO: '2026-08-27', VL_TOTAL: 3000, itens: [], ...extra,
});

test('C-002 / RN-002: a nota 7002, com 4 dos 5 itens do pedido, emitida 3 dias depois do envio e cabendo no saldo, pontua 88', () => {
  const candidata = nf({
    itens: [
      { CODPROD: 5001 }, { CODPROD: 5002 }, { CODPROD: 5003 }, { CODPROD: 5004 },
      { CODPROD: 9999 },
    ],
  });
  const achado = pontuarSugestao(candidata, CONTEXTO);
  assert.equal(achado.score, 88, '48 de cobertura (4/5 × 60) + 20 da data + 20 do valor');
  assert.equal(achado.motivo, '4 de 5 itens do pedido estão na NF');
});

test('RN-002: um item de cinco, emissão fora da janela e valor acima do saldo pontua 12 — e nenhum item do pedido não vira sugestão', () => {
  const soUm = nf({ DT_EMISSAO: '2026-12-01', VL_TOTAL: 99000, itens: [{ CODPROD: 5001 }] });
  assert.equal(pontuarSugestao(soUm, CONTEXTO).score, 12);

  const nenhum = nf({ itens: [{ CODPROD: 9999 }, { CODPROD: 8801 }] });
  assert.equal(pontuarSugestao(nenhum, CONTEXTO), null, 'sem nenhum produto do pedido não há o que sugerir');
  assert.equal(pontuarSugestao(nenhum, { ...CONTEXTO, itensPedido: [] }), null);
});

test('RN-002: a pontuação respeita o piso de 5 e o teto de 95 — o casamento por número de pedido, que vale 100, não passa por aqui', () => {
  // Cobertura mínima e nenhum bônus: 60/100 arredonda para 1, o piso segura em 5.
  const muitosItens = Array.from({ length: 100 }, (_, i) => ({ CODPROD: 6000 + i }));
  const magra = nf({ DT_EMISSAO: '2027-06-01', VL_TOTAL: 90000, itens: [{ CODPROD: 6000 }] });
  assert.equal(pontuarSugestao(magra, { ...CONTEXTO, itensPedido: muitosItens }).score, 5);

  // Cobertura total com os dois bônus: 60 + 20 + 20 = 100, o teto segura em 95.
  const cheia = nf({ itens: ITENS_PEDIDO.map((item) => ({ CODPROD: item.CODPROD })) });
  assert.equal(pontuarSugestao(cheia, CONTEXTO).score, 95);
});

test('C-008 / RN-003: o item casa por código do produto, depois por código de fábrica, depois por código de barras — e o que não casa é divergente', () => {
  assert.deepEqual(
    casarItem({ CODPROD: 5001 }, ITENS_PEDIDO).casadoPor, 'codprod',
  );
  const porFabrica = casarItem({ CODPROD: 9001, CODFAB: 'FK-123' }, ITENS_PEDIDO);
  assert.equal(porFabrica.casadoPor, 'codfab');
  assert.equal(porFabrica.item.CODPROD, 5002);

  const porBarras = casarItem({ CODPROD: 9002, EAN: '7891234567890' }, ITENS_PEDIDO);
  assert.equal(porBarras.casadoPor, 'ean');
  assert.equal(porBarras.item.CODPROD, 5003);

  const semCasamento = casarItem({ CODPROD: 9999, CODFAB: '', EAN: '' }, ITENS_PEDIDO);
  assert.equal(semCasamento.casadoPor, 'nenhum');
  assert.equal(semCasamento.item, null);

  assert.equal(resultadoDoCasamento('codprod'), 'conforme');
  assert.equal(resultadoDoCasamento('codfab'), 'atencao');
  assert.equal(resultadoDoCasamento('ean'), 'atencao');
  assert.equal(resultadoDoCasamento('nenhum'), 'divergente');
});

test('RN-003: o código do produto ganha do código de fábrica quando os dois casariam — a ordem é a regra, não a coincidência', () => {
  const itens = [
    { CODPROD: 7777, CODFAB: 'FK-999' },
    { CODPROD: 5001, CODFAB: 'FK-123' },
  ];
  assert.equal(casarItem({ CODPROD: 5001, CODFAB: 'FK-999' }, itens).item.CODPROD, 5001);
});

test('C-010 / RN-004: preço igual é conforme, 0,8 % é atenção e 1,5 % é divergente — a régua é 1 %', () => {
  assert.equal(TOLERANCIA_PRECO, 0.01);
  assert.equal(classificarDelta(10, 10).resultado, 'conforme');

  const atencao = classificarDelta(20, 20.16);
  assert.equal(atencao.resultado, 'atencao');
  assert.ok(Math.abs(atencao.delta - 0.008) < 1e-9, '0,8 % cabe na tolerância');

  const divergente = classificarDelta(30, 30.45);
  assert.equal(divergente.resultado, 'divergente');
  assert.ok(Math.abs(divergente.delta - 0.015) < 1e-9);

  assert.equal(classificarDelta(10, 9.95).resultado, 'atencao', 'para menos vale a mesma régua');
  assert.equal(classificarDelta(0, 0).resultado, 'conforme');
  assert.equal(classificarDelta(0, 10).resultado, 'divergente', 'esperado zero com valor faturado não é conforme');
});

test('C-011 / RN-005: a validade é medida contra o mínimo do fornecedor; sem data de validade a conferência é de atenção, nunca silenciosa', () => {
  assert.equal(VALIDADE_MINIMA_PADRAO_DIAS, 120);
  assert.equal(diasDeValidade('2026-08-28', '2027-01-18'), 143);
  assert.equal(diasDeValidade('2026-08-28', '2026-11-17'), 81);
  assert.equal(diasDeValidade('2026-08-28', ''), null);

  // 1015 exige 120 dias: 143 passa, 81 não. 1042 exige 180: os dois caem.
  assert.equal(resultadoDeValidade(143, 120), 'conforme');
  assert.equal(resultadoDeValidade(81, 120), 'divergente');
  assert.equal(resultadoDeValidade(143, 180), 'divergente');
  assert.equal(resultadoDeValidade(81, 180), 'divergente');

  assert.equal(resultadoDeValidade(null, 120), 'atencao');
  assert.equal(resultadoDeValidade(143, 0), 'conforme', 'fornecedor sem mínimo cai no padrão de 120');
  assert.equal(resultadoDeValidade(100, 0), 'divergente');
});

test('C-012 / RN-006: quantidade acima da pedida é divergente; abaixo é conforme e diz o saldo', () => {
  assert.equal(resultadoDeQuantidade(1000, 1200).resultado, 'divergente');
  assert.equal(resultadoDeQuantidade(1000, 1000).resultado, 'conforme');

  const parcial = resultadoDeQuantidade(1000, 600);
  assert.equal(parcial.resultado, 'conforme');
  assert.match(parcial.texto, /saldo de 400/);
});

test('C-013 / RN-007: 28/35/42 nas duplicatas contra 28/35/42 acordado é conforme; 30/60 é divergente; sem duplicata e sem prazo declarado é atenção', () => {
  const conforme = resultadoDePrazo('28/35/42', [28, 35, 42], 0);
  assert.equal(conforme.resultado, 'conforme');
  assert.equal(conforme.esperado, '28/35/42');
  assert.equal(conforme.encontrado, '28/35/42');

  assert.equal(resultadoDePrazo('28/35/42', [30, 60], 0).resultado, 'divergente');
  assert.equal(resultadoDePrazo('28/35/42', [42, 35, 28], 0).resultado, 'divergente', 'a ordem das parcelas faz parte do prazo');

  // Sem duplicata a nota vale pelo prazo que ela mesma declara (a 7002 traz 30).
  const semDuplicata = resultadoDePrazo('30/60', [], 30);
  assert.equal(semDuplicata.resultado, 'divergente');
  assert.equal(semDuplicata.encontrado, '30');

  assert.equal(resultadoDePrazo('28/35/42', [], 0).resultado, 'atencao');
  assert.equal(resultadoDePrazo('conforme contrato', [30], 0).resultado, 'atencao');
});

test('C-009: a frase da conferência é montada na tela a partir do que o servidor gravou (D-006), não lida pronta de uma coluna', () => {
  assert.match(
    textoDaOcorrencia({ TIPO: 'item_nao_pedido', RESULTADO: 'divergente', VALOR_ENCONTRADO: '9999' }, 'BRINDE PROMOCIONAL'),
    /^BRINDE PROMOCIONAL: o item faturado não consta no pedido \(9999\)\.$/,
  );
  assert.match(
    textoDaOcorrencia({ TIPO: 'preco_divergente', RESULTADO: 'divergente', VALOR_ESPERADO: 'R$ 30,00', VALOR_ENCONTRADO: 'R$ 30,45', DELTA_PERC: 0.015 }),
    /R\$ 30,45 contra R\$ 30,00 do pedido \(1,50 %\)/,
  );
  assert.match(
    textoDaOcorrencia({ TIPO: 'validade_curta', RESULTADO: 'divergente', VALOR_ESPERADO: '120 dias', VALOR_ENCONTRADO: '81 dias' }),
    /validade de 81 dias, mínimo de 120 dias/,
  );
  assert.match(
    textoDaOcorrencia({ TIPO: 'prazo_divergente', RESULTADO: 'divergente', VALOR_ESPERADO: '28/35/42', VALOR_ENCONTRADO: '30/60' }),
    /prazo da nota 30\/60 contra 28\/35\/42 acordado no pedido/,
  );
});

// Espelho LITERAL do `IN` de `sgcEscContatoInserir` (add-008-notas-fiscais.mjs):
//   AND '{{canalContato}}' IN ('email', 'telefone', 'whatsapp', 'portal')
// Mudou um lado, muda o outro — é a única ligação entre a tela e a escrita.
const CANAIS_DA_ESCRITA = ['email', 'telefone', 'whatsapp', 'portal'];

test("A-5 (revisão onda 2): todo canal do diálogo de contato está no IN de sgcEscContatoInserir — a tela oferecia 'outro', que a escrita recusa sem aviso nenhum (D-03)", () => {
  for (const canal of CANAIS_CONTATO) {
    assert.ok(CANAIS_DA_ESCRITA.includes(canal.value), `o canal ${canal.value} não existe no IN da escrita`);
    assert.ok(canal.label, `o canal ${canal.value} precisa de rótulo`);
  }
  assert.equal(CANAIS_CONTATO.length, CANAIS_DA_ESCRITA.length,
    'R-026: a lista é fechada nos dois lados — a tela não pode esconder um canal que a escrita aceita');
});

// R-152 / P-5: os selos 90/120 do legado, ao lado da conferência da RN-005.
import { seloDeValidade, contagemDeValidade } from '../src/lib/nf.ts';

test('C-032: validade contada de hoje — abaixo de 90 é crítica, até 120 é atenção, acima é conforme; sem data não tem selo', () => {
  const hoje = '2026-11-03';
  assert.deepEqual(seloDeValidade('2027-01-31', hoje), { selo: 'critica', dias: 89 });
  assert.deepEqual(seloDeValidade('2027-02-01', hoje), { selo: 'atencao', dias: 90 });
  assert.deepEqual(seloDeValidade('2027-03-03', hoje), { selo: 'atencao', dias: 120 });
  assert.deepEqual(seloDeValidade('2027-03-04', hoje), { selo: 'conforme', dias: 121 });
  assert.equal(seloDeValidade('2026-10-01', hoje).selo, 'critica', 'vencido é crítico');
  assert.equal(seloDeValidade('', hoje), null);
  assert.equal(seloDeValidade(null, hoje), null);
  assert.deepEqual(
    contagemDeValidade([{ DT_VALIDADE: '2027-01-01' }, { DT_VALIDADE: '2027-02-15' }, { DT_VALIDADE: '2028-01-01' }, { DT_VALIDADE: '' }], hoje),
    { critica: 1, atencao: 1, conforme: 1, semData: 1 },
  );
});
