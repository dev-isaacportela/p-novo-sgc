// Regra pura da spec 018 (fornecedores: exportar a parametrização e excluí-la
// com cópia) — `src/lib/fornecedor-planilha.ts`. A outra metade (o que o
// servidor grava, devolve e recusa) está em
// backend/simulator/smoke/018-fornecedores-exportar-excluir.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linhasPlanilha, textoPlanilha, nomeArquivoPlanilha, juntarPaginas, copiaParaExclusao,
  ESCRITAS_EXCLUSAO, AVISO_EXCLUSAO,
} from '../src/lib/fornecedor-planilha.ts';
import { permissoesDe } from '../src/lib/permissoes.ts';

/** Duas páginas da sgcFornecedorExportar: 1015 completo, 1042 sem contato, documento nem SLA. */
const pagina1 = {
  fornecedores: [{
    ID: 1, CODFORNEC: 1015, FORNECEDOR: 'FRESENIUS KABI BRASIL LTDA', CNPJ: '49324221000104', CNPJ_FORMATADO: '49.324.221/0001-04',
    ATIVO: 1, PRAZO_ENTREGA_DIAS: 7, PRAZO_ENTREGA_TIPO: 'uteis', SLA_ANALISE_DIAS: 2, SLA_FATURAMENTO_DIAS: 0,
    PEDIDO_MINIMO: 5000, FECHAMENTO_DIA_INICIO: 7, FECHAMENTO_DIA_FIM: 15, LINK_PLATAFORMA: 'https://pedidos.fresenius.com',
    VALIDADE_MINIMA_DIAS: 120, ATUALIZADO_EM: '2026-11-03T09:30:00',
  }],
  filiais: [{ FORNECEDOR_ID: 1, CODFILIAL: '1', FILIAL: 'Benenutri Matriz' }, { FORNECEDOR_ID: 1, CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte' }],
  linhas: [{ ID: 10, FORNECEDOR_ID: 1, NOME: 'Nutrição Enteral' }, { ID: 11, FORNECEDOR_ID: 1, NOME: 'Nutrição Parenteral' }],
  contatos: [{ LINHA_ID: 10, NOME: 'Mônica', EMAIL: 'captacao.pedidos@fresenius-kabi.com' }],
  faixas: [
    { LINHA_ID: 11, VALOR_DE: 0, VALOR_ATE: 20000, ROTULO: 'Opção única', PARCELAS: '30' },
    { LINHA_ID: 11, VALOR_DE: 45000, VALOR_ATE: 0, ROTULO: 'Opção A', PARCELAS: '30/45/60' },
  ],
  documentos: [{ FORNECEDOR_ID: 1, TIPO: 'Documento', NOME: 'Contrato; 2026', VENCIMENTO: '2027-03-31', ENDERECO: 'https://arq/c.pdf' }],
};
const pagina2 = {
  fornecedores: [{
    ID: 2, CODFORNEC: 1042, FORNECEDOR: 'NESTLE BRASIL LTDA', CNPJ: '60409075000132', CNPJ_FORMATADO: '',
    ATIVO: 0, PRAZO_ENTREGA_DIAS: 3, PRAZO_ENTREGA_TIPO: 'corridos', SLA_ANALISE_DIAS: 0, SLA_FATURAMENTO_DIAS: 0,
    PEDIDO_MINIMO: 1234.5, FECHAMENTO_DIA_INICIO: 28, FECHAMENTO_DIA_FIM: 5, LINK_PLATAFORMA: null, VALIDADE_MINIMA_DIAS: 0, ATUALIZADO_EM: null,
  }],
  filiais: [{ FORNECEDOR_ID: 2, CODFILIAL: '1', FILIAL: 'Benenutri Matriz' }],
  linhas: [{ ID: 20, FORNECEDOR_ID: 2, NOME: 'Infantil' }],
  contatos: [], faixas: [], documentos: [],
};
const dados = juntarPaginas([pagina1, pagina2]);

/** As linhas de uma seção de um bloco: do título até a linha em branco. */
function secao(linhas, titulo, aPartirDe = 0) {
  const inicio = linhas.findIndex((l, i) => i >= aPartirDe && l.length === 1 && l[0] === titulo);
  assert.ok(inicio >= 0, `seção ${titulo}`);
  const fim = linhas.findIndex((l, i) => i > inicio && l.length === 0);
  return linhas.slice(inicio + 1, fim);
}
const valorDe = (linhas, campo) => linhas.find((l) => l[0] === campo)?.[1];

test('C-001: as páginas da exportação se juntam numa resposta só, na ordem em que vieram', () => {
  assert.deepEqual(dados.fornecedores.map((f) => f.CODFORNEC), [1015, 1042]);
  assert.equal(dados.filiais.length, 3);
  assert.equal(dados.linhas.length, 3);
  assert.deepEqual(juntarPaginas([]).fornecedores, []);
  assert.deepEqual(juntarPaginas([{ fornecedores: undefined }]).linhas, [], 'página sem parte não quebra');
});

test('RN-002: um bloco por fornecedor, as seções na ordem do legado, com os cabeçalhos exatos', () => {
  const linhas = linhasPlanilha(dados);
  assert.deepEqual(linhas[0], ['1015 FRESENIUS KABI BRASIL LTDA']);
  const titulos = linhas.filter((l) => l.length === 1 && ['Dados gerais', 'Filiais atendidas', 'Linhas de produto', 'Contatos', 'Prazos de pagamento', 'Documentos'].includes(l[0])).map((l) => l[0]);
  assert.deepEqual(titulos.slice(0, 6), ['Dados gerais', 'Filiais atendidas', 'Linhas de produto', 'Contatos', 'Prazos de pagamento', 'Documentos']);
  assert.equal(titulos.length, 12, 'seis seções por fornecedor');

  const cabecalho = (titulo) => linhas[linhas.findIndex((l) => l[0] === titulo && l.length === 1) + 1];
  assert.deepEqual(cabecalho('Dados gerais'), ['Campo', 'Valor']);
  assert.deepEqual(cabecalho('Filiais atendidas'), ['Código da filial', 'Nome da filial']);
  assert.deepEqual(cabecalho('Linhas de produto'), ['Nome da linha']);
  assert.deepEqual(cabecalho('Contatos'), ['Linha', 'Nome do contato', 'E-mail']);
  assert.deepEqual(cabecalho('Prazos de pagamento'), ['Linha', 'Valor de', 'Valor até', 'Opção', 'Parcelas (dias)']);
  assert.deepEqual(cabecalho('Documentos'), ['Tipo', 'Arquivo', 'Vencimento', 'Link']);

  // O bloco do 1042 começa depois da linha em branco que fecha o último bloco do 1015.
  const inicio1042 = linhas.findIndex((l) => l[0] === '1042 NESTLE BRASIL LTDA');
  assert.ok(inicio1042 > 0);
  assert.deepEqual(linhas[inicio1042 - 1], [], 'blocos separados por linha em branco');
});

test('C-003/RN-003: dados gerais, sem teto, padrão do sistema, vírgula decimal e "Sem dados"', () => {
  const linhas = linhasPlanilha(dados);
  const gerais = secao(linhas, 'Dados gerais').slice(1);
  assert.equal(valorDe(gerais, 'Código do fornecedor'), '1015');
  assert.equal(valorDe(gerais, 'CNPJ'), '49.324.221/0001-04');
  assert.equal(valorDe(gerais, 'Situação'), 'Ativo');
  assert.equal(valorDe(gerais, 'Tipo de prazo'), 'úteis');
  assert.equal(valorDe(gerais, 'Prazo de análise em dias úteis (meta SLA)'), 2, 'parametrizado sai o número');
  assert.equal(valorDe(gerais, 'Prazo de faturamento em dias úteis (meta SLA)'), 'Padrão do sistema (5)');
  assert.equal(valorDe(gerais, 'Pedido mínimo'), '5000,00');
  assert.equal(valorDe(gerais, 'Fechamento — dia inicial'), 7);
  assert.equal(valorDe(gerais, 'Fechamento — dia final'), 15);
  assert.equal(valorDe(gerais, 'Atualizado em'), '03/11/2026 09:30');

  assert.deepEqual(secao(linhas, 'Filiais atendidas').slice(1), [['1', 'Benenutri Matriz'], ['2', 'Benenutri Filial Norte']]);
  assert.deepEqual(secao(linhas, 'Contatos').slice(1), [['Nutrição Enteral', 'Mônica', 'captacao.pedidos@fresenius-kabi.com']]);
  assert.deepEqual(secao(linhas, 'Prazos de pagamento').slice(1), [
    ['Nutrição Parenteral', '0,00', '20000,00', 'Opção única', '30'],
    ['Nutrição Parenteral', '45000,00', 'sem teto', 'Opção A', '30/45/60'],
  ]);
  assert.deepEqual(secao(linhas, 'Documentos').slice(1), [['Documento', 'Contrato; 2026', '31/03/2027', 'https://arq/c.pdf']]);

  const de1042 = linhas.findIndex((l) => l[0] === '1042 NESTLE BRASIL LTDA');
  const gerais1042 = secao(linhas, 'Dados gerais', de1042).slice(1);
  assert.equal(valorDe(gerais1042, 'Situação'), 'Inativo', 'o inativo entra, marcado');
  assert.equal(valorDe(gerais1042, 'CNPJ'), '60.409.075/0001-32', 'sem o formatado gravado, formata o CNPJ');
  assert.equal(valorDe(gerais1042, 'Tipo de prazo'), 'corridos');
  assert.equal(valorDe(gerais1042, 'Prazo de análise em dias úteis (meta SLA)'), 'Padrão do sistema (1)');
  assert.equal(valorDe(gerais1042, 'Prazo de faturamento em dias úteis (meta SLA)'), 'Padrão do sistema (5)');
  assert.equal(valorDe(gerais1042, 'Pedido mínimo'), '1234,50');
  assert.equal(valorDe(gerais1042, 'Fechamento — dia inicial'), 28, 'a janela que vira o mês sai como está');
  assert.equal(valorDe(gerais1042, 'Link da plataforma'), '', 'vazio fica vazio');
  assert.equal(valorDe(gerais1042, 'Atualizado em'), '');
  assert.deepEqual(secao(linhas, 'Contatos', de1042).slice(1), [['Sem dados']]);
  assert.deepEqual(secao(linhas, 'Prazos de pagamento', de1042).slice(1), [['Sem dados']]);
  assert.deepEqual(secao(linhas, 'Documentos', de1042).slice(1), [['Sem dados']]);
  // As linhas de um fornecedor não vazam para o outro.
  assert.deepEqual(secao(linhas, 'Linhas de produto', de1042).slice(1), [['Infantil']]);
});

test('RN-001: o texto do arquivo usa ; e \\r\\n, com aspas só onde o CSV exige', () => {
  const texto = textoPlanilha(dados);
  const linhas = texto.split('\r\n');
  assert.equal(linhas[0], '1015 FRESENIUS KABI BRASIL LTDA');
  assert.ok(linhas.includes('Pedido mínimo;5000,00'));
  assert.ok(linhas.includes('Documento;"Contrato; 2026";31/03/2027;https://arq/c.pdf'), 'campo com ; entre aspas');
  assert.ok(linhas.includes(''), 'linha em branco entre as seções');
});

test('C-004: zero fornecedores é arquivo vazio (a tela avisa e não baixa)', () => {
  const vazio = juntarPaginas([{ fornecedores: [], filiais: [], linhas: [], contatos: [], faixas: [], documentos: [] }]);
  assert.deepEqual(linhasPlanilha(vazio), []);
  assert.equal(textoPlanilha(vazio), '');
});

test('C-001/C-002: nome do arquivo de todos e de um fornecedor', () => {
  assert.equal(nomeArquivoPlanilha('2026-11-03'), 'parametrizacoes-fornecedores-2026-11-03.csv');
  assert.equal(nomeArquivoPlanilha('2026-11-03', 1015), 'parametrizacao-fornecedor-1015-2026-11-03.csv');
});

test('RF-010/RN-006: a exclusão guarda a cópia primeiro e apaga o fornecedor por último; o histórico não está na lista', () => {
  assert.equal(ESCRITAS_EXCLUSAO[0], 'sgcEscFornecedorExclusaoRegistrar');
  assert.equal(ESCRITAS_EXCLUSAO.at(-1), 'sgcEscFornecedorExclusaoFornecedor');
  const pos = (nome) => ESCRITAS_EXCLUSAO.indexOf(nome);
  assert.ok(pos('sgcEscFornecedorExclusaoContatos') < pos('sgcEscFornecedorExclusaoLinhas'), 'contato pende da linha');
  assert.ok(pos('sgcEscFornecedorExclusaoFaixas') < pos('sgcEscFornecedorExclusaoLinhas'), 'faixa pende da linha');
  assert.equal(ESCRITAS_EXCLUSAO.length, 7);
  assert.ok(!ESCRITAS_EXCLUSAO.some((n) => /Log/i.test(n)), 'P-04: o histórico fica');
});

test('RF-010/P-04: a cópia é a abertura inteira, menos o histórico — e não altera a resposta original', () => {
  const aberto = { fornecedor: { ID: 9 }, filiais: [1], linhas: [2], contatos: [3], faixas: [4, 5], documentos: [6], log: [7, 8] };
  const copia = copiaParaExclusao(aberto);
  assert.deepEqual(Object.keys(copia).sort(), ['contatos', 'documentos', 'faixas', 'filiais', 'fornecedor', 'linhas']);
  assert.deepEqual(copia.faixas, [4, 5]);
  assert.deepEqual(aberto.log, [7, 8], 'a resposta da tela continua com o histórico');
});

test('C-006/RN-005: excluem admin, gestor e diretoria; analista, comercial e somente leitura não', () => {
  for (const persona of ['admin', 'gestor', 'diretoria']) assert.equal(permissoesDe(persona, 'MEMBER').editarFornecedor, true, persona);
  for (const persona of ['analista', 'comercial']) assert.equal(permissoesDe(persona, 'MEMBER').editarFornecedor, false, persona);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').editarFornecedor, false, 'o nível da plataforma vale além da persona');
});

test('C-010/RN-007: a confirmação diz o que é apagado, o que fica e o que pedidos e agendamentos perdem', () => {
  for (const termo of ['cópia', 'ERP', 'histórico', 'Pedidos', 'agendamentos', 'contato', 'faixa']) {
    assert.ok(AVISO_EXCLUSAO.includes(termo), termo);
  }
});
