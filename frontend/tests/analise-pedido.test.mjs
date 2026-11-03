// R-133: a tela ampla da análise do pedido (src/lib/analise-pedido.ts) —
// linhas, chips, busca, unidade exibida, coluna Dias, ordenação em três
// passos, rodapé, diferença e o título do trânsito.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linhasDaAnalise, contagemDeSaida, filtrarAnalise, FILTROS_ANALISE, naUnidade, daUnidade, segundaLinhaComprar,
  rotuloDias, proximaOrdem, ordenarAnalise, rodapeDaAnalise, diferencaDoItem, rodapeDosItens, textoDoTransito,
} from '../src/lib/analise-pedido.ts';

const base = (codprod, descricao, venda, sugerida, extra = {}) => ({
  codprod, descricao, embalagem: 'CX 12', unidade: 'UN', codepto: 2, codsec: 21, unPorCaixa: 12,
  qtVendaTotal: venda, qtVendaLicitacao: 0, qtEstoque: 10, qtTransito: 0, qtSugerida: sugerida, qtPedida: 0,
  precoCusto: 2, tipoPreco: 'padrao', curvaAbc: 'C', coberturaDias: 0, coberturaLimite: 45, coberturaJustificativa: '',
  observacao: '', status: 'montagem', idSolicitacao: 0, solicitacaoDe: '', ...extra,
});

const montados = [
  base(1, 'Água de coco', 30, 24, { curvaAbc: 'A' }),
  base(2, 'Bolacha', 0, 0, { curvaAbc: 'C' }),
  base(3, 'Café', 90, 36, { curvaAbc: 'B', qtEstoque: 50 }),
];

test('R-133: as linhas — o produto montado com o item do pedido por cima, e o item da busca que a análise não trouxe no fim', () => {
  const itens = [base(3, 'Café', 90, 36, { qtPedida: 48, precoCusto: 3 }), base(9, 'Extra da busca', 0, 0, { qtPedida: 6 }), base(2, 'Bolacha', 0, 0, { qtPedida: 0 })];
  const linhas = linhasDaAnalise(montados, itens, { divisao: new Map([[1, { privado: 20, pf: 7, publico: 3 }]]), comercial: new Set([2]) });
  assert.deepEqual(linhas.map((l) => l.codprod), [1, 2, 3, 9]);
  assert.equal(linhas[0].noPedido, null);
  assert.equal(linhas[1].noPedido, null, 'item zerado não está no pedido');
  assert.equal(linhas[2].noPedido.qtPedida, 48);
  assert.deepEqual(linhas[0].divisao, { privado: 20, pf: 7, publico: 3 });
  assert.equal(linhas[1].comercial, true);
  assert.deepEqual(contagemDeSaida(linhas), { com: 2, sem: 2 });
});

test('R-133: chips somam e a busca casa nome sem acento ou código', () => {
  const linhas = linhasDaAnalise(montados, [base(3, 'Café', 90, 36, { qtPedida: 48 })]);
  assert.deepEqual(filtrarAnalise(linhas, { ...FILTROS_ANALISE, saida: 'com' }).map((l) => l.codprod), [1, 3]);
  assert.deepEqual(filtrarAnalise(linhas, { ...FILTROS_ANALISE, saida: 'sem' }).map((l) => l.codprod), [2]);
  assert.deepEqual(filtrarAnalise(linhas, { saida: 'com', comSugestao: true, noPedido: true }).map((l) => l.codprod), [3]);
  assert.deepEqual(filtrarAnalise(linhas, FILTROS_ANALISE, 'agua').map((l) => l.codprod), [1]);
  assert.deepEqual(filtrarAnalise(linhas, FILTROS_ANALISE, '3').map((l) => l.codprod), [3]);
});

test('R-133: Embalagem mínima / Caixa cheia — 36 un. são 3 cx; 2 cx digitadas são 24 un.; a 2ª linha só quando foge da sugestão', () => {
  assert.equal(naUnidade(36, 12, 'caixa'), 3);
  assert.equal(naUnidade(36, 12, 'embalagem'), 36);
  assert.equal(naUnidade(5, 1, 'caixa'), 5, 'avulso: a caixa é 1');
  assert.equal(daUnidade(2, 12, 'caixa'), 24);
  assert.equal(daUnidade(-3, 12, 'embalagem'), 0);
  assert.equal(segundaLinhaComprar(36, 36, 12, 'embalagem'), null);
  assert.equal(segundaLinhaComprar(48, 36, 12, 'embalagem'), '4 cx · sug. 36');
  assert.equal(segundaLinhaComprar(48, 36, 12, 'caixa'), '48 un · sug. 3 cx');
  assert.equal(segundaLinhaComprar(5, 3, 1, 'embalagem'), 'sug. 3');
});

test('R-133: a coluna Dias — perigo abaixo de 30, atenção acima do teto, "s/ venda" sem venda, "> 365 d" no topo', () => {
  assert.deepEqual(rotuloDias(null, 45), { texto: 's/ venda', tom: 'off' });
  assert.deepEqual(rotuloDias(12.4, 45), { texto: '12 d', tom: 'alert' });
  assert.deepEqual(rotuloDias(40, 45), { texto: '40 d', tom: 'neutral' });
  assert.deepEqual(rotuloDias(50, 45), { texto: '50 d', tom: 'attention' });
  assert.equal(rotuloDias(900, 45).texto, '> 365 d');
});

test('R-133: ordenação em três passos — padrão, invertida, sem ordem; outra coluna recomeça', () => {
  let ordem = proximaOrdem(null, 'venda');
  assert.deepEqual(ordem, { coluna: 'venda', invertida: false });
  ordem = proximaOrdem(ordem, 'venda');
  assert.deepEqual(ordem, { coluna: 'venda', invertida: true });
  assert.equal(proximaOrdem(ordem, 'venda'), null);
  assert.deepEqual(proximaOrdem(ordem, 'produto'), { coluna: 'produto', invertida: false });

  const linhas = linhasDaAnalise(montados, []);
  const qt = (l) => l.base.qtSugerida;
  assert.deepEqual(ordenarAnalise(linhas, { coluna: 'venda', invertida: false }, qt, 1.5).map((l) => l.codprod), [3, 1, 2], 'número: maior primeiro');
  assert.deepEqual(ordenarAnalise(linhas, { coluna: 'venda', invertida: true }, qt, 1.5).map((l) => l.codprod), [2, 1, 3]);
  assert.deepEqual(ordenarAnalise(linhas, { coluna: 'produto', invertida: false }, qt, 1.5).map((l) => l.codprod), [1, 2, 3], 'texto: A a Z, sem acento');
  assert.deepEqual(ordenarAnalise(linhas, { coluna: 'curva', invertida: false }, qt, 1.5).map((l) => l.codprod), [1, 3, 2], 'curva: A antes de C');
  assert.deepEqual(ordenarAnalise(linhas, { coluna: 'dias', invertida: false }, qt, 1.5).map((l) => l.codprod), [3, 1, 2], 'dias: quem acaba primeiro (43 d antes de 51 d); sem venda por último');
  assert.equal(ordenarAnalise(linhas, null, qt, 1.5), linhas, 'sem ordem: a da análise');
});

test('R-133: o rodapé soma as linhas visíveis — 3 produtos, 2 a comprar, A/B/C, Comprar 60 e o valor', () => {
  const linhas = linhasDaAnalise(montados, [base(3, 'Café', 90, 36, { qtPedida: 36, precoCusto: 3 })]);
  const r = rodapeDaAnalise(linhas, (l) => (l.noPedido ? l.noPedido.qtPedida : l.base.qtSugerida));
  assert.equal(r.produtos, 3);
  assert.equal(r.aComprar, 2);
  assert.deepEqual(r.curvas, { A: 1, B: 1, C: 1 });
  assert.equal(r.venda, 120);
  assert.equal(r.estoque, 70);
  assert.equal(r.comprar, 60);
  assert.equal(r.valor, 24 * 2 + 36 * 3);
});

test('R-133: aba Itens — diferença negativa é perigo e positiva atenção; o rodapé conta especiais e manuais', () => {
  assert.deepEqual(diferencaDoItem({ qtPedida: 10, qtSugerida: 12 }), { valor: -2, tom: 'alert' });
  assert.deepEqual(diferencaDoItem({ qtPedida: 14, qtSugerida: 12 }), { valor: 2, tom: 'attention' });
  assert.deepEqual(diferencaDoItem({ qtPedida: 12, qtSugerida: 12 }), { valor: 0, tom: 'neutral' });
  assert.deepEqual(rodapeDosItens([
    { qtPedida: 10, precoCusto: 2, tipoPreco: 'padrao' }, { qtPedida: 5, precoCusto: 4, tipoPreco: 'especial' },
    { qtPedida: 1, precoCusto: 1.5, tipoPreco: 'manual' }, { qtPedida: 0, precoCusto: 9, tipoPreco: 'especial' },
  ]), { unidades: 16, custos: '1 esp. · 1 man.', total: 41.5 });
  assert.equal(rodapeDosItens([{ qtPedida: 1, precoCusto: 1, tipoPreco: 'padrao' }]).custos, 'todos padrão');
});

test('R-133: o título do Trâns. separa o WinThor dos outros pedidos abertos do Kanban', () => {
  const [l] = linhasDaAnalise([base(1, 'Água', 30, 24, { qtTransito: 12 })], [], {
    pedidoErp: new Map([[1, 6]]), kanban: new Map([[1, [{ idCard: 7, titulo: 'Fresenius · Filial 1', fase: 'tecnica', quantidade: 24 }]]]),
  });
  assert.equal(textoDoTransito(l), 'WinThor: 12 un. em trânsito · pedido ao ERP 6 un. (fora da conta) · Kanban: 24 un. em 1 pedido (Fresenius · Filial 1 · 24)');
  const [sem] = linhasDaAnalise([base(1, 'Água', 30, 24)], []);
  assert.equal(textoDoTransito(sem), 'WinThor: 0 un. em trânsito · Kanban: nenhum outro pedido aberto');
});
