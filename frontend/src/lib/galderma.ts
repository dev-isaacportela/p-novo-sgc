// Regra pura da mesa de negociação Galderma (spec 014): períodos, linha da
// filial, consolidado do produto, caixa fechada, valores em reais, montagem da
// mesa e dos pedidos por filial, cabeçalho, planilha da indústria e o arquivo.
// Sem React e sem transporte — é o que `frontend/tests/galderma.test.mjs` testa.
//
// Porte de `features/galderma/galderma-calculos.ts`, `galderma-importar.ts`,
// `galderma-modelo-planilha.ts` e `galderma-kanban.ts` do legado (p-60523),
// com os padrões provisórios das perguntas P-01..P-14 da spec.
import { textoCsv } from './csv.ts';
import type { ItemPedido } from './compras.ts';

export const GALDERMA = 1541;
export const FORNECEDOR_GALDERMA = 'GALDERMA DISTRIBUIDORA DO BRASIL LTDA';
export const COBERTURA_ALVO_PADRAO = 35;
export const MESES_TRIMESTRE = 3;
export const DIAS_TRIMESTRE = 90;

export type Situacao = 'aberta' | 'fechada' | 'convertida';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  convertida: 'Convertida em pedido',
};

export function num(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const unidades = (valor: number) => (valor > 0 ? Math.ceil(valor - 1e-9) : 0);
const dois = (n: number) => String(n).padStart(2, '0');

/* ─────────────── RN-005: períodos ─────────────── */

/** `2026-08` → { 2026-08-01, 2026-08-31 }. */
export function periodoDaCompetencia(competencia: string): { inicio: string; fim: string } {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { inicio: `${competencia}-01`, fim: `${competencia}-${dois(ultimo)}` };
}

/** `c` recuada (ou avançada, com `n` negativo) `n` meses, cruzando o ano. */
export function recuarCompetencia(competencia: string, n: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1 - n, 1));
  return `${data.getUTCFullYear()}-${dois(data.getUTCMonth() + 1)}`;
}

/** Os três meses ANTERIORES à competência: 2026-08 → 2026-05-01..2026-07-31. */
export function periodoDoTrimestre(competencia: string): { inicio: string; fim: string } {
  return {
    inicio: periodoDaCompetencia(recuarCompetencia(competencia, MESES_TRIMESTRE)).inicio,
    fim: periodoDaCompetencia(recuarCompetencia(competencia, 1)).fim,
  };
}

/** Os quatro parâmetros de data da posição do ERP (`sgcWintGaldPosicao`). */
export function periodoDaPosicao(competencia: string) {
  const mes = periodoDaCompetencia(competencia);
  const tri = periodoDoTrimestre(competencia);
  return { dataInicioTri: tri.inicio, dataFimTri: tri.fim, dataInicioMes: mes.inicio, dataFimMes: mes.fim };
}

/** N competências terminando em `fim`, da mais antiga para a mais nova. */
export function competenciasDoPeriodo(fim: string, n: number): string[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => recuarCompetencia(fim, Math.max(1, n) - 1 - i));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2026-08` → `ago/26`. */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return MESES[mes - 1] ? `${MESES[mes - 1]}/${String(ano).slice(2)}` : competencia;
}

/* ─────────────── negociação e cabeçalho ─────────────── */

export interface Negociacao {
  id: number;
  competencia: string;
  dataPedido: string;
  descricao: string;
  filiais: string[];
  coberturaAlvoDias: number;
  transitoComoCompra: boolean;
  metaSelloutValor: number;
  observacao: string;
  status: Situacao;
  idPai: number;
  criadoPor: number;
  criadoPorNome: string;
  criadoEm: string;
  complementares: number;
  cards: number;
}

/** `'1, 2,x,6'` → `['1', '2', '6']`: só códigos de dígitos, sem repetição. */
export function filiaisDoTexto(texto: string): string[] {
  return [...new Set(String(texto ?? '').split(',').map((f) => f.replace(/\D/g, '')).filter(Boolean))];
}

export function negociacaoDeLinha(l: Record<string, unknown>): Negociacao {
  const status = String(l.STATUS ?? 'aberta') as Situacao;
  return {
    id: num(l.ID),
    competencia: String(l.COMPETENCIA ?? ''),
    dataPedido: String(l.DATA_PEDIDO ?? ''),
    descricao: String(l.DESCRICAO ?? ''),
    filiais: filiaisDoTexto(String(l.FILIAIS ?? '')),
    coberturaAlvoDias: num(l.COBERTURA_ALVO_DIAS) || COBERTURA_ALVO_PADRAO,
    transitoComoCompra: num(l.TRANSITO_COMO_COMPRA) === 1,
    metaSelloutValor: num(l.META_SELLOUT_VALOR),
    observacao: String(l.OBSERVACAO ?? ''),
    status: ['aberta', 'fechada', 'convertida'].includes(status) ? status : 'aberta',
    idPai: num(l.ID_PAI),
    criadoPor: num(l.CRIADO_POR),
    criadoPorNome: String(l.CRIADO_POR_NOME ?? ''),
    criadoEm: String(l.CRIADO_EM ?? ''),
    complementares: num(l.COMPLEMENTARES),
    cards: num(l.CARDS),
  };
}

export interface Cabecalho {
  competencia: string;
  dataPedido: string;
  descricao: string;
  filiais: string[];
  coberturaAlvoDias: number;
  transitoComoCompra: boolean;
  metaSelloutValor: number;
  observacao: string;
  idPai: number;
}

/**
 * C-001: competência do mês, hoje, "Pedido Galderma AAAA-MM", 35 dias, trânsito
 * desmarcado; filiais = as da negociação mais recente, senão as três primeiras
 * do ERP (RN-PG-05 do legado).
 */
export function cabecalhoPadrao(hoje: string, ultima: Negociacao | null, filiaisDoErp: string[]): Cabecalho {
  const competencia = hoje.slice(0, 7);
  return {
    competencia,
    dataPedido: hoje,
    descricao: `Pedido Galderma ${competencia}`,
    filiais: ultima?.filiais.length ? [...ultima.filiais] : filiaisDoErp.slice(0, 3),
    coberturaAlvoDias: COBERTURA_ALVO_PADRAO,
    transitoComoCompra: false,
    metaSelloutValor: 0,
    observacao: '',
    idPai: 0,
  };
}

export function cabecalhoDe(n: Negociacao): Cabecalho {
  return {
    competencia: n.competencia, dataPedido: n.dataPedido, descricao: n.descricao, filiais: [...n.filiais],
    coberturaAlvoDias: n.coberturaAlvoDias, transitoComoCompra: n.transitoComoCompra,
    metaSelloutValor: n.metaSelloutValor, observacao: n.observacao, idPai: n.idPai,
  };
}

export const SEM_FILIAL = 'Selecione ao menos uma filial — o pedido é digitado por filial.';

/** '' quando o cabeçalho pode ser gravado; senão, a frase da tela. */
export function validarCabecalho(c: Cabecalho): string {
  if (!/^\d{4}-\d{2}$/.test(c.competencia)) return 'Informe a competência (mês e ano).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dataPedido)) return 'Informe a data do pedido.';
  if (filiaisDoTexto(c.filiais.join(',')).length === 0) return SEM_FILIAL;
  return '';
}

/** O `input` das escritas de cabeçalho (RN-PG-06: cobertura vazia ou 0 vira 35). */
export function entradaDoCabecalho(c: Cabecalho, agora: string) {
  return {
    competencia: c.competencia,
    dataPedido: c.dataPedido,
    descricao: c.descricao.trim() || `Pedido Galderma ${c.competencia}`,
    filiais: filiaisDoTexto(c.filiais.join(',')).join(','),
    coberturaAlvoDias: Math.round(num(c.coberturaAlvoDias)) > 0 ? Math.round(num(c.coberturaAlvoDias)) : COBERTURA_ALVO_PADRAO,
    transitoComoCompra: c.transitoComoCompra ? 1 : 0,
    metaSelloutValor: Math.max(0, num(c.metaSelloutValor)),
    observacao: c.observacao,
    idPai: num(c.idPai),
    agora,
  };
}

/** O nome curto da filial no topo da mesa: a UF do fim da razão social ("… LTDA - DF" → DF), senão "filial N". */
export function nomeCurtoDaFilial(codfilial: string, nomes: Map<string, string>): string {
  const uf = /\s-\s*([A-Z]{2})\s*$/.exec(nomes.get(codfilial) ?? '')?.[1];
  return uf ?? `filial ${codfilial}`;
}

/** C-018 / P-08: a origem possível é convertida, da mesma competência e sem complementar. */
export function origensPossiveis(negociacoes: Negociacao[], competencia: string): Negociacao[] {
  return negociacoes.filter((n) => n.status === 'convertida' && n.competencia === competencia && n.complementares === 0);
}

/** RN-007 / RN-015: o que a pessoa pode mexer nesta negociação. */
export function podeEditar(operar: boolean, status: Situacao) {
  return {
    cabecalho: operar && status !== 'convertida',
    itens: operar && status === 'aberta',
    situacao: operar && status !== 'convertida',
    excluir: operar && status !== 'convertida',
    gerar: operar && status !== 'convertida',
  };
}

/* ─────────────── itens da proposta ─────────────── */

export interface ItemProposta {
  id: number;
  codprod: number;
  ean: string;
  descricao: string;
  precoSellout: number;
  precoNet: number;
  precoLista: number;
  precoListaDesc: number;
  estoqueInicial: number;
  mediaSellout: number;
  previsaoSellout: number;
  propostaSellin: number;
  metaSellinValor: number;
  observacao: string;
}

export function itemDeLinha(l: Record<string, unknown>): ItemProposta {
  return {
    id: num(l.ID), codprod: num(l.CODPROD), ean: String(l.EAN ?? ''), descricao: String(l.DESCRICAO ?? ''),
    precoSellout: num(l.PRECO_SELLOUT), precoNet: num(l.PRECO_NET), precoLista: num(l.PRECO_LISTA),
    precoListaDesc: num(l.PRECO_LISTA_DESC), estoqueInicial: num(l.ESTOQUE_INICIAL),
    mediaSellout: num(l.MEDIA_SELLOUT), previsaoSellout: num(l.PREVISAO_SELLOUT),
    propostaSellin: num(l.PROPOSTA_SELLIN), metaSellinValor: num(l.META_SELLIN_VALOR),
    observacao: String(l.OBSERVACAO ?? ''),
  };
}

export interface ProdutoGalderma { codprod: number; descricao: string; ean: string; embalagem: string; unPorCaixaErp: number }

export function produtoDeLinha(l: Record<string, unknown>): ProdutoGalderma {
  return {
    codprod: num(l.CODPROD), descricao: String(l.DESCRICAO ?? ''), ean: String(l.EAN ?? '').replace(/\D/g, ''),
    embalagem: String(l.EMBALAGEM ?? ''), unPorCaixaErp: num(l.UN_POR_CAIXA_ERP),
  };
}

/** C-012 / RN-PG-15: a lista de escolha tira os produtos que já estão na negociação (menos o que se edita). */
export function produtosDisponiveis(catalogo: ProdutoGalderma[], itens: Pick<ItemProposta, 'codprod'>[], editando = 0): ProdutoGalderma[] {
  const usados = new Set(itens.map((i) => i.codprod).filter((c) => c !== editando));
  return catalogo.filter((p) => !usados.has(p.codprod));
}

export const SEM_PRODUTO = 'Selecione o produto no cadastro do ERP — todo item precisa de código.';

export function entradaDoItem(idNegociacao: number, item: ItemProposta, agora: string) {
  return {
    idNegociacao, codprod: item.codprod, ean: item.ean.replace(/\D/g, ''), descricao: item.descricao.slice(0, 200),
    precoSellout: num(item.precoSellout), precoNet: num(item.precoNet), precoLista: num(item.precoLista),
    precoListaDesc: num(item.precoListaDesc), estoqueInicial: num(item.estoqueInicial),
    mediaSellout: num(item.mediaSellout), previsaoSellout: num(item.previsaoSellout),
    propostaSellin: num(item.propostaSellin), metaSellinValor: num(item.metaSellinValor),
    observacao: item.observacao.slice(0, 500), agora,
  };
}

/* ─────────────── posição do ERP ─────────────── */

export interface PosicaoWinthor {
  CODPROD: number; CODFILIAL: string; FILIAL?: string;
  QTEST: number; QTEST_FISICO?: number; QTBLOQUEADA: number; QTRESERV: number;
  EM_TRANSITO: number; VENDA_MES: number; VENDA_TRIMESTRE: number; COMPRA_MES: number;
}

export const chave = (a: number | string, b: number | string) => `${a}|${b}`;

/** Fragmento numérico da posição: só dígitos; vazio vira `0` (não casa nada). */
export function listaDeCodigos(valores: (number | string)[]): string {
  const limpos = [...new Set(valores.map((v) => String(v).replace(/\D/g, '')).filter(Boolean))];
  return limpos.length ? limpos.join(',') : '0';
}

/** Fragmento de filiais entre aspas (`'1','2'`); vazio vira `'-1'`. */
export function listaDeFiliais(filiais: string[]): string {
  const limpas = filiaisDoTexto(filiais.join(','));
  return limpas.length ? limpas.map((f) => `'${f}'`).join(',') : "'-1'";
}

/* ─────────────── RN-001..RN-004: linha, grupo, caixa, semáforo ─────────────── */

export interface LinhaFilial {
  codfilial: string; filial: string;
  qtest: number; qtestFisico: number; qtBloqueada: number; qtReservada: number;
  emTransito: number; estoqueTotal: number; vendaMes: number; vendaTrimestre: number; compraMes: number;
  mediaTrimestre: number; mediaDiaria: number; difProjecaoVenda: number; estoqueLiquido: number;
  coberturaDias: number | null; sugestaoCobertura: number; pedido: number; pedidoGravado: number;
  custoPedido: number; coberturaFuturaDias: number | null; qtdHerdada: number;
}

export function calcularLinhaFilial(p: {
  posicao?: Partial<PosicaoWinthor>; codfilial: string; filial: string; coberturaAlvoDias: number;
  pedido: number; pedidoGravado?: number; precoListaDesc?: number; qtdHerdada?: number;
}): LinhaFilial {
  const qtest = num(p.posicao?.QTEST);
  const qtBloqueada = num(p.posicao?.QTBLOQUEADA);
  const qtReservada = num(p.posicao?.QTRESERV);
  // RN-PG-24: sem o físico na resposta, ele é o disponível + bloqueado + reservado.
  const qtestFisico = p.posicao?.QTEST_FISICO === undefined ? qtest + qtBloqueada + qtReservada : num(p.posicao.QTEST_FISICO);
  const emTransito = num(p.posicao?.EM_TRANSITO);
  const estoqueTotal = qtest + emTransito;
  const vendaMes = Math.abs(num(p.posicao?.VENDA_MES));
  const vendaTrimestre = Math.abs(num(p.posicao?.VENDA_TRIMESTRE));
  const mediaTrimestre = vendaTrimestre / MESES_TRIMESTRE;
  const mediaDiaria = vendaTrimestre / DIAS_TRIMESTRE;
  const difProjecaoVenda = mediaTrimestre - vendaMes;
  const qtdHerdada = num(p.qtdHerdada);
  const pedido = num(p.pedido);
  return {
    codfilial: p.codfilial, filial: p.filial, qtest, qtestFisico, qtBloqueada, qtReservada, emTransito, estoqueTotal,
    vendaMes, vendaTrimestre, compraMes: num(p.posicao?.COMPRA_MES), mediaTrimestre, mediaDiaria, difProjecaoVenda,
    estoqueLiquido: estoqueTotal - difProjecaoVenda,
    coberturaDias: mediaDiaria > 0 ? estoqueTotal / mediaDiaria : null,
    sugestaoCobertura: Math.max(0, unidades(mediaDiaria * num(p.coberturaAlvoDias) - estoqueTotal) - qtdHerdada),
    pedido, pedidoGravado: num(p.pedidoGravado ?? pedido),
    custoPedido: num(p.precoListaDesc) * pedido,
    coberturaFuturaDias: mediaDiaria > 0 ? (estoqueTotal + pedido) / mediaDiaria : null,
    qtdHerdada,
  };
}

export interface LinhaGrupo {
  qtest: number; emTransito: number; estoqueTotal: number; vendaMes: number; vendaTrimestre: number;
  compraMes: number; mediaTrimestre: number; difProjecaoVenda: number; estoqueLiquido: number;
  sugestaoCobertura: number; saldoAComprar: number; saldoAComprarSimulado: number;
  coberturaDias: number | null; coberturaFuturaDias: number | null; pedidoTotal: number;
  desvioProposta: number; custoPedidoTotal: number;
}

/** RN-002: soma das filiais, exceto a falta vender (previsão de sell-out − venda do mês do grupo). */
export function consolidarGrupo(p: {
  filiais: LinhaFilial[]; propostaSellin: number; previsaoSellout: number; considerarTransitoComoCompra?: boolean;
}): LinhaGrupo {
  const soma = (f: (l: LinhaFilial) => number) => p.filiais.reduce((t, l) => t + f(l), 0);
  const vendaMes = soma((l) => l.vendaMes);
  const estoqueTotal = soma((l) => l.estoqueTotal);
  const emTransito = soma((l) => l.emTransito);
  const compraMes = soma((l) => l.compraMes);
  const pedidoTotal = soma((l) => l.pedido);
  const vendaTrimestre = soma((l) => l.vendaTrimestre);
  const mediaDiaria = vendaTrimestre / DIAS_TRIMESTRE;
  const difProjecaoVenda = num(p.previsaoSellout) - vendaMes;
  const saldoAComprar = num(p.propostaSellin) - (compraMes + (p.considerarTransitoComoCompra ? emTransito : 0)) - soma((l) => l.qtdHerdada);
  return {
    qtest: soma((l) => l.qtest), emTransito, estoqueTotal, vendaMes, vendaTrimestre, compraMes,
    mediaTrimestre: soma((l) => l.mediaTrimestre), difProjecaoVenda, estoqueLiquido: estoqueTotal - difProjecaoVenda,
    sugestaoCobertura: soma((l) => l.sugestaoCobertura), saldoAComprar, saldoAComprarSimulado: saldoAComprar - pedidoTotal,
    coberturaDias: mediaDiaria > 0 ? estoqueTotal / mediaDiaria : null,
    coberturaFuturaDias: mediaDiaria > 0 ? (estoqueTotal + pedidoTotal) / mediaDiaria : null,
    pedidoTotal, desvioProposta: pedidoTotal - saldoAComprar, custoPedidoTotal: soma((l) => l.custoPedido),
  };
}

const caixa = (unidadesPorCaixa: number) => (unidadesPorCaixa > 1 ? Math.ceil(unidadesPorCaixa) : 1);

/** RN-003: múltiplo da caixa (caixa ≤ 1 = avulso). */
export function ehMultiploCaixa(quantidade: number, unidadesPorCaixa: number): boolean {
  return num(quantidade) % caixa(unidadesPorCaixa) === 0;
}

/** RN-003: o múltiplo mais próximo, nunca abaixo de uma caixa (25/12 → 24; 31/12 → 36; 3/12 → 12; 0 → 0). */
export function proximoMultiploCaixa(quantidade: number, unidadesPorCaixa: number): number {
  const un = caixa(unidadesPorCaixa);
  const q = num(quantidade);
  return q <= 0 ? 0 : Math.max(un, Math.round(q / un) * un);
}

/** C-008 / P-04: "usar sugestão" grava a caixa fechada logo acima (218/12 → 228). */
export function sugestaoEmCaixa(sugestao: number, unidadesPorCaixa: number): number {
  const un = caixa(unidadesPorCaixa);
  return num(sugestao) <= 0 ? 0 : Math.ceil(num(sugestao) / un) * un;
}

/** C-006: '' quando a quantidade grava; senão "múltiplo de N · use M". */
export function avisoDeCaixa(quantidade: number, unidadesPorCaixa: number): string {
  if (num(quantidade) <= 0 || ehMultiploCaixa(quantidade, unidadesPorCaixa)) return '';
  return `múltiplo de ${caixa(unidadesPorCaixa)} · use ${proximoMultiploCaixa(quantidade, unidadesPorCaixa)}`;
}

/** O texto digitado no campo de pedido: não numérico ou ≤ 0 vira 0 (RN-PG-49/50). */
export function quantidadeDigitada(texto: string): number {
  const n = Number(String(texto ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type TomCobertura = 'sem-giro' | 'ruptura' | 'atencao' | 'adequado' | 'excesso';

/** RN-004 / C-020. */
export function tomCobertura(coberturaDias: number | null, alvoDias: number): TomCobertura {
  if (coberturaDias === null) return 'sem-giro';
  if (coberturaDias <= 0) return 'ruptura';
  if (coberturaDias < alvoDias * 0.5) return 'atencao';
  if (coberturaDias > alvoDias * 2) return 'excesso';
  return 'adequado';
}

export const ROTULO_TOM: Record<TomCobertura, string> = {
  'sem-giro': 'sem giro', ruptura: 'ruptura', atencao: 'atenção', adequado: 'adequado', excesso: 'excesso',
};

/* ─────────────── RN-006: valores em reais ─────────────── */

export function metaSellinDoItem(i: Pick<ItemProposta, 'metaSellinValor' | 'propostaSellin' | 'precoListaDesc' | 'precoNet'>): number {
  return num(i.metaSellinValor) > 0 ? num(i.metaSellinValor) : num(i.propostaSellin) * (num(i.precoListaDesc) || num(i.precoNet));
}

export function precoListaCheio(i: Pick<ItemProposta, 'precoLista' | 'precoListaDesc'>): number {
  return num(i.precoLista) || num(i.precoListaDesc);
}

export interface ValoresNegociacao {
  metaSellin: number; pedidoUnidades: number; pedidoNet: number; pedidoListaCheio: number;
  pedidoListaDesc: number; compradoNoMes: number; vendidoNoMes: number; faltaComprar: number;
}

export function somarValores(itens: (Pick<ItemProposta, 'metaSellinValor' | 'propostaSellin' | 'precoListaDesc' | 'precoNet' | 'precoLista' | 'precoSellout'> & {
  pedidoTotal: number; compraMes: number; vendaMes: number;
})[]): ValoresNegociacao {
  const v = itens.reduce((acc, i) => ({
    metaSellin: acc.metaSellin + metaSellinDoItem(i),
    pedidoUnidades: acc.pedidoUnidades + num(i.pedidoTotal),
    pedidoNet: acc.pedidoNet + num(i.pedidoTotal) * num(i.precoNet),
    pedidoListaCheio: acc.pedidoListaCheio + num(i.pedidoTotal) * precoListaCheio(i),
    pedidoListaDesc: acc.pedidoListaDesc + num(i.pedidoTotal) * num(i.precoListaDesc),
    compradoNoMes: acc.compradoNoMes + num(i.compraMes) * num(i.precoListaDesc),
    vendidoNoMes: acc.vendidoNoMes + num(i.vendaMes) * num(i.precoSellout),
    faltaComprar: 0,
  }), { metaSellin: 0, pedidoUnidades: 0, pedidoNet: 0, pedidoListaCheio: 0, pedidoListaDesc: 0, compradoNoMes: 0, vendidoNoMes: 0, faltaComprar: 0 });
  return { ...v, faltaComprar: v.metaSellin - v.compradoNoMes };
}

/* ─────────────── a mesa ─────────────── */

export interface LinhaMesa {
  item: ItemProposta;
  unidadesPorCaixa: number;
  filiais: LinhaFilial[];
  grupo: LinhaGrupo;
}

/** O que muda a mesa: a negociação, os itens, os pedidos gravados, a posição, o herdado e a simulação da tela. */
export function montarMesa(p: {
  negociacao: Pick<Negociacao, 'filiais' | 'coberturaAlvoDias' | 'transitoComoCompra'>;
  itens: ItemProposta[];
  pedidos: Map<string, number>;
  posicoes: PosicaoWinthor[];
  herdado?: Map<string, number>;
  simulacao?: Map<string, number>;
  caixas?: Map<number, number>;
  nomesFiliais?: Map<string, string>;
}): LinhaMesa[] {
  const porChave = new Map(p.posicoes.map((x) => [chave(num(x.CODPROD), String(x.CODFILIAL)), x]));
  return p.itens.map((item) => {
    const filiais = p.negociacao.filiais.map((codfilial) => {
      const k = chave(item.id, codfilial);
      const gravado = p.pedidos.get(k) ?? 0;
      const posicao = porChave.get(chave(item.codprod, codfilial));
      return calcularLinhaFilial({
        posicao, codfilial, filial: p.nomesFiliais?.get(codfilial) ?? posicao?.FILIAL ?? `Filial ${codfilial}`,
        coberturaAlvoDias: p.negociacao.coberturaAlvoDias, pedido: p.simulacao?.get(k) ?? gravado,
        pedidoGravado: gravado, precoListaDesc: item.precoListaDesc,
        qtdHerdada: p.herdado?.get(chave(item.codprod, codfilial)) ?? 0,
      });
    });
    return {
      item, unidadesPorCaixa: p.caixas?.get(item.codprod) ?? 1, filiais,
      grupo: consolidarGrupo({
        filiais, propostaSellin: item.propostaSellin, previsaoSellout: item.previsaoSellout,
        considerarTransitoComoCompra: p.negociacao.transitoComoCompra,
      }),
    };
  });
}

/** Os KPIs do topo e os cards em reais (RN-PG-76/77/79), com a simulação. */
export function resumoDaMesa(linhas: LinhaMesa[]) {
  const soma = (f: (l: LinhaMesa) => number) => linhas.reduce((t, l) => t + f(l), 0);
  return {
    produtos: linhas.length,
    propostaSellin: soma((l) => l.item.propostaSellin),
    compraMes: soma((l) => l.grupo.compraMes),
    // O topo da mesa mostra também a sugestão em caixa fechada (P-04: é o que a varinha grava).
    sugestaoEmCaixa: soma((l) => l.filiais.reduce((t, f) => t + sugestaoEmCaixa(f.sugestaoCobertura, l.unidadesPorCaixa), 0)),
    saldoAComprar: soma((l) => l.grupo.saldoAComprar),
    saldoAComprarSimulado: soma((l) => l.grupo.saldoAComprarSimulado),
    sugestao: soma((l) => l.grupo.sugestaoCobertura),
    pedido: soma((l) => l.grupo.pedidoTotal),
    valores: somarValores(linhas.map((l) => ({
      ...l.item, pedidoTotal: l.grupo.pedidoTotal, compraMes: l.grupo.compraMes, vendaMes: l.grupo.vendaMes,
    }))),
  };
}

/* ─────────────── RN-009: pedidos por filial e geração ─────────────── */

export interface ProdutoDoPedido {
  codprod: number; descricao: string; qtdPedida: number; precoCusto: number; valor: number;
  qtEstoque: number; qtTransito: number; vendaTrimestre: number; coberturaFuturaDias: number | null; unPorCaixa: number;
}
export interface PedidoDaFilial { codfilial: string; filial: string; produtos: ProdutoDoPedido[]; unidades: number; valor: number }

/** C-014 / C-015: só o pedido GRAVADO > 0 vira pedido (a simulação não entra); produtos por código, filiais numéricas. */
export function montarPedidosPorFilial(linhas: LinhaMesa[]): PedidoDaFilial[] {
  const porFilial = new Map<string, PedidoDaFilial>();
  for (const l of linhas) {
    for (const f of l.filiais) {
      if (!(f.pedidoGravado > 0)) continue;
      const grupo = porFilial.get(f.codfilial) ?? { codfilial: f.codfilial, filial: f.filial, produtos: [], unidades: 0, valor: 0 };
      const valor = f.pedidoGravado * l.item.precoListaDesc;
      grupo.produtos.push({
        codprod: l.item.codprod, descricao: l.item.descricao, qtdPedida: f.pedidoGravado, precoCusto: l.item.precoListaDesc, valor,
        qtEstoque: Math.max(0, Math.round(f.qtest)), qtTransito: Math.max(0, Math.round(f.emTransito)),
        vendaTrimestre: f.vendaTrimestre,
        coberturaFuturaDias: f.mediaDiaria > 0 ? (f.estoqueTotal + f.pedidoGravado) / f.mediaDiaria : null,
        unPorCaixa: l.unidadesPorCaixa,
      });
      grupo.unidades += f.pedidoGravado;
      grupo.valor += valor;
      porFilial.set(f.codfilial, grupo);
    }
  }
  return [...porFilial.values()]
    .map((g) => ({ ...g, produtos: g.produtos.sort((a, b) => a.codprod - b.codprod) }))
    .sort((a, b) => Number(a.codfilial) - Number(b.codfilial));
}

/** O item INTEIRO da 003 (R-112): preço negociado como custo especial (P-01). */
export function itemDoPedidoGalderma(p: ProdutoDoPedido, coberturaAlvoDias: number): ItemPedido {
  return {
    codprod: p.codprod, descricao: p.descricao.slice(0, 200), embalagem: '', unidade: 'UN', codepto: 0, codsec: 0,
    unPorCaixa: p.unPorCaixa, qtVendaTotal: p.vendaTrimestre, qtVendaLicitacao: 0, qtEstoque: p.qtEstoque,
    qtTransito: p.qtTransito, qtSugerida: p.qtdPedida, qtPedida: p.qtdPedida, precoCusto: p.precoCusto,
    tipoPreco: 'especial', curvaAbc: 'C', coberturaDias: p.coberturaFuturaDias === null ? 0 : Math.round(p.coberturaFuturaDias * 100) / 100,
    coberturaLimite: coberturaAlvoDias, coberturaJustificativa: '', observacao: 'Pedido da mesa de negociação Galderma',
    status: 'montagem', idSolicitacao: 0, solicitacaoDe: '',
  };
}

export const tituloDoPedidoGalderma = (filial: string, competencia: string) => `Galderma · ${filial} · ${competencia}`;

/** RN-009: o período da capa — os três meses anteriores até hoje (RN-PG-90 do legado). */
export function periodoDoPedido(hoje: string): { inicio: string; fim: string } {
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1 - 3, 1));
  const ultimo = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0)).getUTCDate();
  return { inicio: `${inicio.getUTCFullYear()}-${dois(inicio.getUTCMonth() + 1)}-${dois(Math.min(dia, ultimo))}`, fim: hoje };
}

export interface CardGerado { codfilial: string; cardId: number; temCapa: boolean }

/** C-016: o que falta — filial sem vínculo gera tudo; com vínculo sem capa, completa o mesmo card; com capa, já foi. */
export function planoDeGeracao(pedidos: PedidoDaFilial[], cards: CardGerado[]) {
  const porFilial = new Map(cards.map((c) => [c.codfilial, c]));
  return {
    aGerar: pedidos.filter((p) => !porFilial.has(p.codfilial)),
    aCompletar: pedidos.filter((p) => porFilial.has(p.codfilial) && !porFilial.get(p.codfilial)!.temCapa)
      .map((p) => ({ pedido: p, cardId: porFilial.get(p.codfilial)!.cardId })),
    jaGeradas: pedidos.filter((p) => porFilial.get(p.codfilial)?.temCapa),
  };
}

/* ─────────────── RN-010: planilha da indústria ─────────────── */

export const LINHAS_CABECALHO = 2;
/** RN-PG-64: as colunas por posição (0, 8, 11 e 12 são ignoradas). */
export const COL = { ean: 1, sku: 2, precoSellout: 3, precoNet: 4, precoListaDesc: 5, estoqueInicial: 6, mediaSellout: 7, previsaoSellout: 9, propostaSellin: 10 } as const;

/** RN-PG-66: formato americano — "R$", espaços e vírgula de milhar saem; vazio e traço viram 0. */
export function numeroDaPlanilha(valor: unknown): number {
  const texto = String(valor ?? '').replace(/R\$/g, '').replace(/\s/g, '').replace(/,/g, '');
  if (texto === '' || texto === '-') return 0;
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/** Lê CSV com `;` (o padrão do Excel em pt-BR) ou `,`, com aspas e aspas dobradas. */
export function lerCsv(texto: string): string[][] {
  const limpo = String(texto ?? '').replace(/^\uFEFF/, '');
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i += 1; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i += 1;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

export interface LinhaPlanilha {
  ean: string; sku: string; precoSellout: number; precoNet: number; precoListaDesc: number;
  estoqueInicial: number; mediaSellout: number; previsaoSellout: number; propostaSellin: number;
}

/** RN-010 / C-009: descarta as duas linhas de cabeçalho; linha válida = EAN com 8 ou mais dígitos. */
export function parsearPlanilha(texto: string): LinhaPlanilha[] {
  return lerCsv(texto).slice(LINHAS_CABECALHO)
    .filter((l) => String(l[COL.ean] ?? '').replace(/\D/g, '').length >= 8)
    .map((l) => ({
      ean: String(l[COL.ean]).replace(/\D/g, ''), sku: String(l[COL.sku] ?? '').trim(),
      precoSellout: numeroDaPlanilha(l[COL.precoSellout]), precoNet: numeroDaPlanilha(l[COL.precoNet]),
      precoListaDesc: numeroDaPlanilha(l[COL.precoListaDesc]), estoqueInicial: numeroDaPlanilha(l[COL.estoqueInicial]),
      mediaSellout: numeroDaPlanilha(l[COL.mediaSellout]), previsaoSellout: numeroDaPlanilha(l[COL.previsaoSellout]),
      propostaSellin: numeroDaPlanilha(l[COL.propostaSellin]),
    }));
}

/** RN-PG-67: casa pelo EAN contra o catálogo; o que não casa vai para o relatório, sem bloquear as demais. */
export function casarPlanilha(linhas: LinhaPlanilha[], catalogo: ProdutoGalderma[]) {
  const porEan = new Map(catalogo.filter((p) => p.ean).map((p) => [p.ean, p]));
  const casadas: { linha: LinhaPlanilha; produto: ProdutoGalderma }[] = [];
  const semProduto: { ean: string; sku: string }[] = [];
  for (const linha of linhas) {
    const produto = porEan.get(linha.ean);
    if (produto) casadas.push({ linha, produto });
    else semProduto.push({ ean: linha.ean, sku: linha.sku });
  }
  return { lidas: linhas.length, casadas, semProduto };
}

/** O `input` de `sgcEscGaldItemImportar` para uma linha casada (P-05: lista, meta e observação ficam). */
export function entradaDaImportacao(idNegociacao: number, c: { linha: LinhaPlanilha; produto: ProdutoGalderma }, agora: string) {
  const { linha, produto } = c;
  return {
    idNegociacao, codprod: produto.codprod, ean: linha.ean, descricao: produto.descricao.slice(0, 200),
    precoSellout: linha.precoSellout, precoNet: linha.precoNet, precoListaDesc: linha.precoListaDesc,
    estoqueInicial: linha.estoqueInicial, mediaSellout: linha.mediaSellout, previsaoSellout: linha.previsaoSellout,
    propostaSellin: linha.propostaSellin, agora,
  };
}

/** RN-PG-71 (P-03): o modelo da competência, 13 colunas, lido de volta por `parsearPlanilha`. */
export function textoDoModelo(competencia: string, catalogo: ProdutoGalderma[]): string {
  const mes = rotuloCompetencia(competencia);
  const tri = [3, 2, 1].map((n) => rotuloCompetencia(recuarCompetencia(competencia, n))).join('/');
  const cabecalho = ['Produto', 'EAN', 'SKU', 'Preço sell-out', 'Preço net', 'Preço lista c/ desc', `Estoque inicial ${mes}`,
    `Média Sellout TRI (${tri})`, 'Sell-out mês anterior', `Previsão Sellout ${mes} (und)`, 'Proposta sell-in', 'Observação', 'Distribuidor'];
  const instrucao = ['Preencha a partir da linha 3 — EAN na 2ª coluna; números no formato 1,234.56', '', 'TOTAL', '', '', '', '', '', '', '', '', '', ''];
  const produtos = catalogo.filter((p) => p.ean.length >= 8)
    .map((p, i) => [p.descricao, p.ean, '', '', '', '', '', '', '', '', '', '', i === 0 ? 'BENENUTRI' : '']);
  return textoCsv(instrucao, [cabecalho, ...produtos]);
}

/* ─────────────── extrato e arquivo ─────────────── */

const n2 = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
const n0 = (v: number) => String(Math.round(v));

/** RN-PG-81: uma linha por produto × filial, com as colunas do legado. */
export const COLUNAS_CSV_MESA = ['CODPROD', 'DESCRICAO', 'FILIAL', 'ESTOQUE', 'TRANSITO', 'ESTOQUE_TOTAL', 'VENDA_MES',
  'PREVISAO_SELLOUT', 'MEDIA_TRIMESTRE', 'COBERTURA_DIAS', 'COBERTURA_FUTURA_DIAS', 'SUGESTAO', 'PEDIDO',
  'PROPOSTA_SELLIN', 'SALDO_A_COMPRAR', 'SALDO_A_COMPRAR_SIMULADO', 'PEDIDO_TOTAL_GRUPO'];

export function linhasCsvMesa(linhas: LinhaMesa[]): string[][] {
  return linhas.flatMap((l) => l.filiais.map((f) => [
    String(l.item.codprod), l.item.descricao, f.filial, n0(f.qtest), n0(f.emTransito), n0(f.estoqueTotal), n0(f.vendaMes),
    n0(l.item.previsaoSellout), n2(f.mediaTrimestre), n2(f.coberturaDias), n2(f.coberturaFuturaDias), n0(f.sugestaoCobertura),
    n0(f.pedido), n0(l.item.propostaSellin), n0(l.grupo.saldoAComprar), n0(l.grupo.saldoAComprarSimulado), n0(l.grupo.pedidoTotal),
  ]));
}

export const nomeArquivoMesa = (n: Pick<Negociacao, 'competencia' | 'dataPedido'>) => `pedido-galderma-${n.competencia}-${n.dataPedido}.csv`;
