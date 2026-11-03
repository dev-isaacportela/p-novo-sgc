// Regra pura da spec 018 (fornecedores: exportar a parametrização e excluí-la
// guardando uma cópia) — testada por tests/fornecedores-exportar-excluir.test.mjs.
//
// Planilha (RN-PAR-12 do legado): o legado gerava `.xlsx` com uma aba por
// fornecedor; o SGC 2 exporta CSV (R-094, P-01), então cada aba vira um bloco do
// mesmo arquivo, com as mesmas seções, na mesma ordem. Quem monta o texto e
// baixa é o `lib/csv.ts`; aqui só as linhas.
//
// Exclusão (RN-PAR-08): a ordem das sete escritas e a cópia que a primeira
// guarda. A tela chama as escritas nesta ordem (pages/fornecedores/exportar-excluir.ts).

import { textoCsv } from './csv.ts';
import { fmtData, fmtDataHora } from './formato.ts';
import { formatarCnpj } from './fornecedor.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

/** A resposta de `sgcFornecedorExportar` (uma página ou várias juntadas). */
export interface DadosExportacao {
  fornecedores: Linha[];
  filiais: Linha[];
  linhas: Linha[];
  contatos: Linha[];
  faixas: Linha[];
  documentos: Linha[];
}

const PARTES = ['fornecedores', 'filiais', 'linhas', 'contatos', 'faixas', 'documentos'] as const;

/** Junta as páginas de `sgcFornecedorExportar` (blocos de 100, RNF-001) numa resposta só. */
export function juntarPaginas(paginas: Partial<DadosExportacao>[]): DadosExportacao {
  const saida = { fornecedores: [], filiais: [], linhas: [], contatos: [], faixas: [], documentos: [] } as DadosExportacao;
  for (const pagina of paginas) {
    for (const parte of PARTES) saida[parte].push(...(Array.isArray(pagina[parte]) ? pagina[parte] : []));
  }
  return saida;
}

/** Vírgula decimal e duas casas — o que o Excel em pt-BR lê sem configurar nada (o `valorBr` do bo.ts). */
const valorBr = (valor: unknown) => (Number(valor) || 0).toFixed(2).replace('.', ',');
const texto = (valor: unknown) => String(valor ?? '');

/** RN-003: SLA não preenchido (0) é o padrão do sistema, escrito como no legado. */
function sla(valor: unknown, padrao: number): string | number {
  const dias = Number(valor) || 0;
  return dias > 0 ? dias : `Padrão do sistema (${padrao})`;
}

/** Título, cabeçalho e linhas — ou "Sem dados" —, e a linha em branco que separa da próxima seção. */
function secao(titulo: string, cabecalho: string[], linhas: (string | number)[][]): (string | number)[][] {
  return [[titulo], cabecalho, ...(linhas.length ? linhas : [['Sem dados']]), []];
}

/** RN-002: o bloco de um fornecedor, na ordem das seções da aba do legado. */
function blocoDoFornecedor(f: Linha, dados: DadosExportacao): (string | number)[][] {
  const id = Number(f.ID);
  const linhasDele = dados.linhas.filter((l) => Number(l.FORNECEDOR_ID) === id);
  const nomeDaLinha = new Map(linhasDele.map((l) => [Number(l.ID), texto(l.NOME)]));
  const daLinha = (r: Linha) => nomeDaLinha.has(Number(r.LINHA_ID));

  return [
    [`${texto(f.CODFORNEC)} ${texto(f.FORNECEDOR)}`.trim()],
    [],
    ...secao('Dados gerais', ['Campo', 'Valor'], [
      ['Código do fornecedor', texto(f.CODFORNEC)],
      ['Fornecedor', texto(f.FORNECEDOR)],
      ['CNPJ', texto(f.CNPJ_FORMATADO) || formatarCnpj(texto(f.CNPJ))],
      ['Situação', Number(f.ATIVO) === 0 ? 'Inativo' : 'Ativo'],
      ['Prazo de entrega em dias', Number(f.PRAZO_ENTREGA_DIAS) || 0],
      ['Tipo de prazo', f.PRAZO_ENTREGA_TIPO === 'corridos' ? 'corridos' : 'úteis'],
      ['Prazo de análise em dias úteis (meta SLA)', sla(f.SLA_ANALISE_DIAS, 1)],
      ['Prazo de faturamento em dias úteis (meta SLA)', sla(f.SLA_FATURAMENTO_DIAS, 5)],
      ['Pedido mínimo', valorBr(f.PEDIDO_MINIMO)],
      ['Fechamento — dia inicial', Number(f.FECHAMENTO_DIA_INICIO) || ''],
      ['Fechamento — dia final', Number(f.FECHAMENTO_DIA_FIM) || ''],
      ['Link da plataforma', texto(f.LINK_PLATAFORMA)],
      ['Validade mínima na NF em dias', Number(f.VALIDADE_MINIMA_DIAS) || 0],
      ['Atualizado em', fmtDataHora(texto(f.ATUALIZADO_EM))],
    ]),
    ...secao('Filiais atendidas', ['Código da filial', 'Nome da filial'],
      dados.filiais.filter((x) => Number(x.FORNECEDOR_ID) === id).map((x) => [texto(x.CODFILIAL), texto(x.FILIAL)])),
    ...secao('Linhas de produto', ['Nome da linha'], linhasDele.map((l) => [texto(l.NOME)])),
    ...secao('Contatos', ['Linha', 'Nome do contato', 'E-mail'],
      dados.contatos.filter(daLinha).map((c) => [nomeDaLinha.get(Number(c.LINHA_ID)) ?? '', texto(c.NOME), texto(c.EMAIL)])),
    ...secao('Prazos de pagamento', ['Linha', 'Valor de', 'Valor até', 'Opção', 'Parcelas (dias)'],
      dados.faixas.filter(daLinha).map((x) => [
        nomeDaLinha.get(Number(x.LINHA_ID)) ?? '',
        valorBr(x.VALOR_DE),
        (Number(x.VALOR_ATE) || 0) === 0 ? 'sem teto' : valorBr(x.VALOR_ATE),
        texto(x.ROTULO),
        texto(x.PARCELAS),
      ])),
    ...secao('Documentos', ['Tipo', 'Arquivo', 'Vencimento', 'Link'],
      dados.documentos.filter((d) => Number(d.FORNECEDOR_ID) === id)
        .map((d) => [texto(d.TIPO), texto(d.NOME), fmtData(texto(d.VENCIMENTO)), texto(d.ENDERECO)])),
  ];
}

/** RN-002: um bloco por fornecedor, na ordem em que vieram (a SF já ordena pelo nome). Vazio sem fornecedor (C-004). */
export function linhasPlanilha(dados: DadosExportacao): (string | number)[][] {
  return dados.fornecedores.flatMap((f) => blocoDoFornecedor(f, dados));
}

/** O texto do arquivo, pelo `textoCsv` (a primeira linha faz o papel de cabeçalho). Vazio sem fornecedor. */
export function textoPlanilha(dados: DadosExportacao): string {
  const [primeira, ...resto] = linhasPlanilha(dados);
  return primeira ? textoCsv(primeira.map(String), resto) : '';
}

/** C-001/C-002: nome do arquivo de todos ou de um fornecedor. */
export function nomeArquivoPlanilha(hoje: string, codfornec = 0): string {
  return codfornec > 0
    ? `parametrizacao-fornecedor-${codfornec}-${hoje}.csv`
    : `parametrizacoes-fornecedores-${hoje}.csv`;
}

/* ── exclusão (RN-PAR-08) ── */

/** RF-008: a cópia primeiro; depois as filhas da linha, as linhas, filiais, documentos e o pai por último. O histórico fica (P-04). */
export const ESCRITAS_EXCLUSAO = [
  'sgcEscFornecedorExclusaoRegistrar',
  'sgcEscFornecedorExclusaoContatos',
  'sgcEscFornecedorExclusaoFaixas',
  'sgcEscFornecedorExclusaoLinhas',
  'sgcEscFornecedorExclusaoFiliais',
  'sgcEscFornecedorExclusaoDocumentos',
  'sgcEscFornecedorExclusaoFornecedor',
] as const;

/** A cópia guardada: o que `sgcFornecedorCarregar` devolve, menos o histórico (que não é apagado, P-04). */
export function copiaParaExclusao(dados: Linha): Linha {
  const copia: Linha = { ...(dados ?? {}) };
  delete copia.log;
  return copia;
}

/** RN-007/C-010: o que a confirmação diz antes de excluir. */
export const AVISO_EXCLUSAO = 'Filiais, linhas de produto, contatos, faixas de prazo e documentos desta parametrização serão apagados. '
  + 'Antes, uma cópia de tudo fica guardada com o seu nome e a data. O histórico de alterações e o cadastro do fornecedor no ERP não mudam. '
  + 'Pedidos e agendamentos deste fornecedor continuam; até ele ser parametrizado de novo, o envio desses pedidos fica sem contato '
  + 'cadastrado e o prazo de pagamento fica sem faixa para comparar.';
