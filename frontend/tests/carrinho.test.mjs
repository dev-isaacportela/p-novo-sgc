// O carrinho do layout legado da spec 011 (src/lib/carrinho.ts): persistência e
// retomada, resumo, pedido mínimo, economia e variação de custo, busca e o
// arquivo de importação do WinThor. Sem React, sem DOM, sem SDK.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarRessuprimento } from '../src/lib/ressuprimento.ts';
import {
  CHAVE_CARRINHO, carrinhoDeTexto, economiaNoCusto, faltaParaMinimo, filtrarCarrinho, nomeArquivoWinthor,
  pedidoMinimoDoGrupo, resumoDoCarrinho, textoDoCarrinho, textoImportacaoWinthor, variacaoDePreco,
} from '../src/lib/carrinho.ts';
import { agruparCarrinho } from '../src/lib/ressuprimento.ts';

const medida = (extra = {}) => ({
  CODPROD: 5401, DESCRICAO: 'WHEY CONCENTRADO MORANGO 900 G', EMBALAGEM: 'CX 12', UNIDADE: 'UN',
  CODEPTO: 2, CODSEC: 21, UN_POR_CAIXA_ERP: 12,
  CUSTO_ULT_ENTRADA: 10, CUSTO_ATUAL: 11, CODFAB: 'FAB-5401', DT_ULT_ENTRADA: '2026-09-01', DT_ULT_SAIDA: '2026-09-15',
  ESTOQUE_TOTAL: 50, QT_BLOQUEADA: 0, QT_INDENIZ: 0, QT_RESERV: 0,
  ESTOQUE_ATUAL: 50, QT_PEDIDA_ERP: 0, QT_TRANSITO: 0, ESTOQUE_EM_TRANSITO: 0,
  LEAD_TIME_MEDIDO: 0, VENDA_PERIODO: 306, VENDA_PUBLICA: 0,
  CONSUMO_DIARIO: 2, CONSUMO_DIARIO_PUBLICO: 0, VOLATILIDADE_DIARIA: 0, ...extra,
});
// R-128: o custo de compra vem do Gestão de Custos; aqui, o mesmo valor da última entrada de cada medida.
const custosDe = (medidas) => new Map(medidas.map((m) => [m.CODPROD, { custo: m.CUSTO_ULT_ENTRADA, dataRef: '2026-01-01' }]));
const linhas = (medidas) => montarRessuprimento(medidas, [], () => 35, new Map(), {
  codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false,
}, custosDe(medidas));
const [l5401, l5402, l5403] = linhas([
  medida(),
  medida({ CODPROD: 5402, DESCRICAO: 'BARRA DE PROTEINA CACAU 45 G', CODFAB: 'FAB-5402', ESTOQUE_ATUAL: 0, CUSTO_ULT_ENTRADA: 12, CUSTO_ATUAL: 12 }),
  medida({ CODPROD: 5403, DESCRICAO: 'SHAKE SUBSTITUTO BAUNILHA 400 G', CODFAB: 'FAB-5403', CUSTO_ULT_ENTRADA: 10, CUSTO_ATUAL: 10.5 }),
]);
const item = (linha, quantidade, codfilial = '1', extra = {}) => ({
  linha, quantidade, codfornec: 1042, codfilial, fornecedor: 'NESTLE', filial: `Filial ${codfilial}`,
  motivo: 'Ruptura', pedidoMinimo: 1000, ...extra,
});

test('RN-021 / C-028: o carrinho salvo volta do texto só quando tem a versão certa e ao menos um item com quantidade; o texto vai e volta sem perder nada', () => {
  assert.equal(carrinhoDeTexto(null), null);
  assert.equal(carrinhoDeTexto('{nao e json'), null);
  assert.equal(carrinhoDeTexto(JSON.stringify({ versao: 2, itens: [item(l5401, 24)] })), null);
  assert.equal(carrinhoDeTexto(JSON.stringify({ versao: 1, itens: [item(l5401, 0)] })), null, 'quantidade zero não é item');
  const salvo = { versao: 1, abertoEm: '2026-09-16T10:00:00', abertoPor: 'Ana Analista', salvoEm: '2026-09-16T10:05:00', itens: [item(l5401, 24), item(l5402, 72)] };
  const lido = carrinhoDeTexto(textoDoCarrinho(salvo));
  assert.deepEqual(lido, salvo);
  assert.equal(CHAVE_CARRINHO(7), 'sgc2.compras-inteligentes.carrinho.7');
});

test('C-028: o resumo do aviso — 3 itens em 2 filiais são 3 itens, 2 pedidos e o total das quantidades × custo da última entrada', () => {
  const itens = [item(l5401, 24), item(l5402, 72), item(l5403, 12, '2')];
  assert.deepEqual(resumoDoCarrinho(itens), { itens: 3, pedidos: 2, total: 24 * 10 + 72 * 12 + 12 * 10 });
});

test('RN-027 / C-039: a variação é do custo atual contra o da última entrada — de 12 para 11 cai 8,3 %, de 10 para 10,50 sobe 5 %, sem custo não há variação; a economia só conta o que caiu', () => {
  assert.equal(Math.round(variacaoDePreco(12, 11) * 10) / 10, -8.3);
  assert.equal(variacaoDePreco(10, 10.5), 5);
  assert.equal(variacaoDePreco(0, 5), null);
  assert.equal(variacaoDePreco(5, 0), null);
  assert.equal(economiaNoCusto([
    { quantidade: 24, ultimo: 12, atual: 11 },
    { quantidade: 10, ultimo: 10, atual: 10.5 },
    { quantidade: 10, ultimo: 10, atual: 0 },
  ]), 24);
});

test('RN-022 / C-029: pedido mínimo de R$ 1.000 — com R$ 300 faltam R$ 700 (30 %); com R$ 1.200 está atingido; sem mínimo está sempre atingido; o mínimo do grupo é o maior informado entre os itens', () => {
  assert.deepEqual(faltaParaMinimo(300, 1000), { atingido: false, falta: 700, pct: 30 });
  assert.deepEqual(faltaParaMinimo(1200, 1000), { atingido: true, falta: 0, pct: 100 });
  assert.deepEqual(faltaParaMinimo(10, 0), { atingido: true, falta: 0, pct: 100 });
  const itens = [item(l5401, 24, '1', { pedidoMinimo: 800 }), item(l5402, 72, '1', { pedidoMinimo: 1000 }), item(l5403, 12, '2', { pedidoMinimo: 50 })];
  const grupos = agruparCarrinho(itens);
  assert.equal(pedidoMinimoDoGrupo(itens, grupos.find((g) => g.codfilial === '1')), 1000);
  assert.equal(pedidoMinimoDoGrupo(itens, grupos.find((g) => g.codfilial === '2')), 50);
});

test('a busca do carrinho acha por código, por parte do nome e pelo código de fábrica', () => {
  const itens = [item(l5401, 24), item(l5402, 72), item(l5403, 12)];
  assert.deepEqual(filtrarCarrinho(itens, '5402').map((i) => i.linha.medida.CODPROD), [5402]);
  assert.deepEqual(filtrarCarrinho(itens, 'shake').map((i) => i.linha.medida.CODPROD), [5403]);
  assert.deepEqual(filtrarCarrinho(itens, 'fab-5401').map((i) => i.linha.medida.CODPROD), [5401]);
  assert.equal(filtrarCarrinho(itens, '  ').length, 3);
});

test('RN-023 / C-030: o arquivo do WinThor é CODPROD;PRECO;QTD por linha, sem cabeçalho, preço com ponto e duas casas, quantidade inteira, item sem quantidade fora; um arquivo por fornecedor e filial', () => {
  const texto = textoImportacaoWinthor([
    { codprod: 5401, preco: 12, quantidade: 24 },
    { codprod: 5402, preco: 9.5, quantidade: 0 },
    { codprod: 5403, preco: 10.456, quantidade: 12 },
  ]);
  assert.equal(texto, '5401;12.00;24\r\n5403;10.46;12');
  assert.equal(nomeArquivoWinthor(1042, '1', '2026-09-16'), 'winthor-1042-filial-1-2026-09-16.txt');
});
