// Spec 009 — regra pura de `src/lib/relatorio.ts`: a leitura tolerante do
// recorte salvo (C-018), a série do agregado (C-022) e o CSV do que está na
// tela (C-023).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUNAS, CAMPOS_AGRUPAVEIS, MEDIDAS, configPadrao, lerConfig, escreverConfig,
  filtrosDaConfig, podeEditar, tituloValido, serieDoAgregado,
  colunasCsvRelatorio, linhasCsvRelatorio,
} from '../src/lib/relatorio.ts';

test('C-018: lerConfig é tolerante — chave desconhecida é descartada, chave faltando ganha o padrão', () => {
  // A mesma forma do "Relatório antigo" do seed: sem `visao` e com uma chave
  // que a tela de hoje não conhece.
  const antigo = JSON.stringify({
    filtros: { fase: 'enviado', codfornec: 0, codfilial: '', responsavelId: 0, prioridade: '', dataInicio: '', dataFim: '' },
    colunas: ['numero', 'fornecedor', 'valor'],
    agrupamento: 'filial',
    grafico: { tipo: 'barra', eixo: 'filial', medida: 'valor' },
    zoom: 1.5,
  });
  const config = lerConfig(antigo);
  assert.equal(config.filtros.fase, 'enviado');
  assert.deepEqual(config.colunas, ['numero', 'fornecedor', 'valor']);
  assert.equal(config.agrupamento, 'filial');
  assert.equal(config.visao, configPadrao().visao, 'chave faltando volta ao padrão');
  assert.ok(!('zoom' in config), 'chave desconhecida é descartada');
});

test('C-018: valor fora do domínio volta ao padrão, e texto quebrado não derruba a tela', () => {
  const config = lerConfig(JSON.stringify({
    colunas: ['numero', 'inventada'],
    agrupamento: 'inventado',
    grafico: { tipo: 'pizza', eixo: 'inventado', medida: 'inventada' },
    visao: 'holograma',
    filtros: { prioridade: 'altíssima', codfornec: 'x' },
  }));
  assert.deepEqual(config.colunas, ['numero'], 'coluna fora da lista fechada some');
  assert.equal(config.agrupamento, 'fase');
  assert.equal(config.grafico.tipo, 'barra', 'pizza não existe aqui (R-058)');
  assert.equal(config.grafico.medida, 'contagem');
  assert.equal(config.visao, 'tabela');
  assert.equal(config.filtros.prioridade, '');
  assert.equal(config.filtros.codfornec, 0);
  assert.deepEqual(lerConfig('{{quebrado'), configPadrao());
  assert.deepEqual(lerConfig(''), configPadrao());
});

test('C-018: escreverConfig grava só as chaves conhecidas, e reler devolve o mesmo recorte campo a campo', () => {
  const config = configPadrao();
  config.filtros.codfornec = 1042;
  config.grafico = { tipo: 'linha', eixo: 'fornecedor', medida: 'valor' };
  const texto = escreverConfig(config);
  assert.deepEqual(lerConfig(texto), config);
  assert.ok(!texto.includes('zoom'));
});

test('RNF-005: filtrosDaConfig entrega os valores DESLIGADOS que a consulta espera', () => {
  const filtros = filtrosDaConfig(configPadrao());
  assert.deepEqual(filtros, {
    fase: '', codfornec: '0', codfilial: '', responsavelId: '0', prioridade: '', dataInicio: '', dataFim: '',
  });
  assert.equal(Object.values(filtros).filter((v) => v === undefined).length, 0, 'nenhum marcador vai sem valor');
});

test('RN-013: título vazio é recusado; PODE_EDITAR do servidor manda, e o par dono/admin é a queda', () => {
  assert.equal(tituloValido(''), false);
  assert.equal(tituloValido('   '), false);
  assert.equal(tituloValido('Pedidos por fase'), true);
  assert.equal(podeEditar({ CRIADO_POR: 3, PODE_EDITAR: 0 }, 3, true), false, 'o servidor tem a palavra final');
  assert.equal(podeEditar({ CRIADO_POR: 3, PODE_EDITAR: 1 }, 2, false), true);
  assert.equal(podeEditar({ CRIADO_POR: 3 }, 3, false), true);
  assert.equal(podeEditar({ CRIADO_POR: 3 }, 2, false), false);
  assert.equal(podeEditar({ CRIADO_POR: 3 }, 2, true), true, 'o administrador edita qualquer um');
});

const AGREGADO = [
  { CHAVE: 'Análise/Montagem de Pedido', QTD: 6, VL_TOTAL: 1000.5, DIAS_NA_FASE_MEDIA: 3.2 },
  { CHAVE: 'Envio para Indústria', QTD: 2, VL_TOTAL: 400, DIAS_NA_FASE_MEDIA: 1 },
];

test('C-022: serieDoAgregado troca a medida sem mudar os rótulos nem a ordem', () => {
  assert.deepEqual(serieDoAgregado(AGREGADO, 'contagem'), [
    { name: 'Análise/Montagem de Pedido', value: 6 }, { name: 'Envio para Indústria', value: 2 },
  ]);
  assert.deepEqual(serieDoAgregado(AGREGADO, 'valor').map((p) => p.value), [1000.5, 400]);
  assert.deepEqual(serieDoAgregado(AGREGADO, 'dias_na_fase').map((p) => p.value), [3.2, 1]);
  assert.deepEqual(serieDoAgregado([{ CHAVE: 'X', QTD: 1, VL_TOTAL: 0, DIAS_NA_FASE_MEDIA: null }], 'dias_na_fase'),
    [{ name: 'X', value: 0 }]);
  assert.deepEqual(MEDIDAS.map((m) => m.chave), ['contagem', 'valor', 'dias_na_fase']);
  assert.deepEqual(CAMPOS_AGRUPAVEIS.map((c) => c.chave), ['fase', 'fornecedor', 'filial', 'responsavel', 'prioridade']);
});

const PEDIDOS = [
  {
    ID_CARD: 7, TITULO: 'MATRIZ · FRESENIUS', FASE_CHAVE: 'envio', FASE_NOME: 'Envio para Indústria',
    CODFORNEC: 1015, FORNECEDOR: 'Fresenius', CODFILIAL: '1', FILIAL: 'Matriz', RESPONSAVEL: 'Ana Analista',
    PRIORIDADE: 'normal', VL_TOTAL: 1200.5, NUMPED_WINTHOR: '998901', DT_ENVIO: '2026-09-10',
    PERC_FATURADO: 0, CRIADO_EM: '2026-09-08T08:00:00', CRIADO_POR_NOME: 'Ana Analista', DIAS_NA_FASE: 3,
  },
  {
    ID_CARD: 8, TITULO: 'NORTE · NESTLÉ', FASE_CHAVE: 'analise', FASE_NOME: 'Análise/Montagem de Pedido',
    CODFORNEC: 1042, FORNECEDOR: 'Nestlé', CODFILIAL: '2', FILIAL: 'Norte', RESPONSAVEL: '',
    PRIORIDADE: 'alta', VL_TOTAL: 0, NUMPED_WINTHOR: '', DT_ENVIO: '',
    PERC_FATURADO: 0, CRIADO_EM: '2026-09-09T08:00:00', CRIADO_POR_NOME: 'Gil Gestor', DIAS_NA_FASE: 1,
  },
];

test('C-023: o CSV tem o mesmo cabeçalho, as mesmas colunas e as mesmas linhas da tela, na mesma ordem', () => {
  const colunas = ['numero', 'fornecedor', 'valor'];
  assert.deepEqual(colunasCsvRelatorio(colunas), ['Pedido', 'Fornecedor', 'Valor']);

  const linhas = linhasCsvRelatorio(PEDIDOS, colunas);
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.length === 3));
  assert.equal(linhas[0][0], '998901');
  assert.equal(linhas[1][0], 8, 'sem número do WinThor, o CSV leva o id do pedido');
  assert.ok(String(linhas[0][2]).includes('1.200,50'), 'valor formatado em pt-BR');
  assert.equal(linhas[1][1], 'Nestlé');
});

test('C-023: coluna inventada some do cabeçalho E das linhas — as duas listas continuam do mesmo tamanho', () => {
  const colunas = ['numero', 'inventada', 'criado_em'];
  assert.deepEqual(colunasCsvRelatorio(colunas), ['Pedido', 'Criado em']);
  const linhas = linhasCsvRelatorio(PEDIDOS, colunas);
  assert.ok(linhas.every((l) => l.length === 2));
  assert.equal(linhas[0][1], '08/09/2026');
  assert.equal(COLUNAS.length, 10);
});
