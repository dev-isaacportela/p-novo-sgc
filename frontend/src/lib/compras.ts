// Regra de compra: sugestão por cobertura de demanda, arredondamento por
// caixa, curva ABC, cobertura futura e total do pedido (spec 003, RN-001 a
// RN-004 e RN-008).
//
// R-134: a sugestão, a cobertura futura e os meses do período seguem a
// fórmula do legado (`p-60523/features/kanban/compras.ts`), sobre a venda
// válida sem o público — o mesmo recorte das Compras inteligentes. Módulo puro — sem React, sem SDK: é o que
// `frontend/tests/compras.test.mjs` exercita.

// Extensão explícita: `allowImportingTsExtensions` está ligado e é assim que o
// `node --test` de frontend/tests/ resolve o módulo sem passo de build.
import type { Cobertura } from './cobertura.ts';
import { ALVO_COBERTURA_PADRAO_DIAS, ROTULO_NIVEL, limiteDeCobertura } from './cobertura.ts';
import type { ResolucaoCobertura } from './cobertura.ts';

/** Uma linha de `sgcWintAnaliseMontagem` (colunas UPPERCASE do ERP). */
export interface LinhaAnalise {
  CODPROD: number;
  DESCRICAO: string;
  EMBALAGEM: string;
  UNIDADE: string;
  CODEPTO: number;
  CODSEC: number;
  UN_POR_CAIXA_ERP: number;
  ESTOQUE: number;
  TRANSITO: number;
  VENDA_PERIODO: number;
  VENDA_LICITACAO: number;
  CUSTO_ULT_ENTRADA: number;
  /** R-133: a venda válida dividida (R-131) e o pedido ao ERP — só para mostrar, fora da fórmula. */
  VENDA_PRIVADO?: number;
  VENDA_PF?: number;
  VENDA_PUBLICO?: number;
  QT_PEDIDA_ERP?: number;
}

/** R-133: `manual` = custo digitado no seletor de custo do item. */
export type TipoPreco = 'padrao' | 'especial' | 'manual';
export type CurvaAbc = 'A' | 'B' | 'C';

/** Item do pedido como a aba o edita e como o `sgcItensGravar` o recebe. */
export interface ItemPedido {
  codprod: number;
  descricao: string;
  embalagem: string;
  unidade: string;
  codepto: number;
  codsec: number;
  unPorCaixa: number;
  qtVendaTotal: number;
  qtVendaLicitacao: number;
  qtEstoque: number;
  qtTransito: number;
  qtSugerida: number;
  qtPedida: number;
  precoCusto: number;
  tipoPreco: TipoPreco;
  curvaAbc: CurvaAbc;
  coberturaDias: number;
  coberturaLimite: number;
  /** R-134: a cobertura-alvo resolvida (012) e de onde veio — o `title` da coluna Dias; só na análise carregada. */
  coberturaAlvo?: number;
  coberturaOrigem?: string;
  coberturaJustificativa: string;
  observacao: string;
  status: string;
  /** Origem do item (008, R-054/R-068): 0 = item montado pela análise. */
  idSolicitacao: number;
  /** Vendedor que pediu o produto; vazio quando o item não veio de solicitação. */
  solicitacaoDe: string;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** R-134: o mês médio do legado (365,25 ÷ 12). */
export const DIAS_POR_MES = 30.44;
/** R-134: período ausente ou inválido vale 3 meses, como no legado. */
export const MESES_SEM_PERIODO = 3;

/**
 * R-134 (fórmula do legado): (fim − início) ÷ 30,44 dias, com duas casas e no
 * mínimo 1 mês; período ausente ou invertido vale 3 meses.
 */
export function mesesDoPeriodo(inicio: string, fim: string): number {
  const de = Date.parse(`${String(inicio).slice(0, 10)}T00:00:00Z`);
  const ate = Date.parse(`${String(fim).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(de) || !Number.isFinite(ate) || ate < de) return MESES_SEM_PERIODO;
  const meses = Math.round(((ate - de) / 86400000 / DIAS_POR_MES) * 100) / 100;
  return Math.max(1, meses);
}

/** Venda diária da base da sugestão: a venda válida sem o público ÷ meses ÷ 30. */
export function vendaDiaria(vendaBase: number, meses: number): number {
  return Math.max(0, numero(vendaBase)) / Math.max(1, numero(meses)) / 30;
}

/**
 * RN-001 (R-134, fórmula do legado). Necessidade = venda diária × alvo de
 * cobertura (a cobertura-alvo resolvida do item; sem regra, 35 dias),
 * arredondada para cima — com o produto arredondado a 6 casas antes, para que
 * 4/dia × 35 dê 140 e não 141 por resíduo de ponto flutuante. Posição =
 * estoque + trânsito (que SOMA: pedido ao ERP mais o trânsito do WinThor).
 * Sugestão = necessidade − posição, nunca negativa. A base é a venda VÁLIDA da
 * R-131 SEM o público — o mesmo recorte das Compras inteligentes.
 */
export function sugestaoDeCompra(
  vendaBase: number,
  estoque: number,
  transito: number,
  meses: number,
  alvoDias: number = ALVO_COBERTURA_PADRAO_DIAS,
): number {
  const diaria = vendaDiaria(vendaBase, meses);
  if (diaria <= 0) return 0;
  const alvo = numero(alvoDias) > 0 ? numero(alvoDias) : ALVO_COBERTURA_PADRAO_DIAS;
  const necessidade = Math.ceil(Math.round(diaria * alvo * 1e6) / 1e6);
  const posicao = Math.max(0, numero(estoque) + Math.max(0, numero(transito)));
  return Math.max(0, necessidade - posicao);
}

// "CX 12", "CAIXA COM 24", "C/ 6", "20 UN" — o que o cadastro do ERP escreve.
const EMBALAGEM_EM_CAIXA = /(?:CX|CAIXA|C\/|COM|C\s*)\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:UN|UND|UNID|UNIDADES)\b/;

/**
 * RN-002: gestão de custos > cadastro do ERP > embalagem > 1. Sempre inteiro
 * para cima — meia caixa não existe.
 */
export function unidadesPorCaixa(
  linha: Pick<LinhaAnalise, 'EMBALAGEM' | 'UN_POR_CAIXA_ERP'>,
  daGestaoDeCustos?: number,
): number {
  for (const candidato of [daGestaoDeCustos, linha?.UN_POR_CAIXA_ERP]) {
    const valor = Number(String(candidato ?? '').replace(',', '.'));
    if (Number.isFinite(valor) && valor > 1) return Math.ceil(valor);
  }
  const achado = EMBALAGEM_EM_CAIXA.exec(String(linha?.EMBALAGEM ?? '').toUpperCase());
  if (achado) {
    const valor = Number(achado[1] ?? achado[2]);
    if (Number.isFinite(valor) && valor > 1) return Math.ceil(valor);
  }
  return 1;
}

/** De onde veio a caixa (RN-002): a mesma cadeia de `unidadesPorCaixa`, nomeada para a tela (R-120). */
export type OrigemUnidadesPorCaixa = 'gestao' | 'erp' | 'embalagem' | 'avulso';

export const ROTULO_ORIGEM_CAIXA: Record<OrigemUnidadesPorCaixa, string> = {
  gestao: 'Gestão de Custos',
  erp: 'cadastro do ERP',
  embalagem: 'embalagem',
  avulso: 'avulso',
};

export function origemUnidadesPorCaixa(
  linha: Pick<LinhaAnalise, 'EMBALAGEM' | 'UN_POR_CAIXA_ERP'>,
  daGestaoDeCustos?: number,
): OrigemUnidadesPorCaixa {
  const gestao = Number(String(daGestaoDeCustos ?? '').replace(',', '.'));
  if (Number.isFinite(gestao) && gestao > 1) return 'gestao';
  const erp = Number(String(linha?.UN_POR_CAIXA_ERP ?? '').replace(',', '.'));
  if (Number.isFinite(erp) && erp > 1) return 'erp';
  const achado = EMBALAGEM_EM_CAIXA.exec(String(linha?.EMBALAGEM ?? '').toUpperCase());
  if (achado) {
    const valor = Number(achado[1] ?? achado[2]);
    if (Number.isFinite(valor) && valor > 1) return 'embalagem';
  }
  return 'avulso';
}

/** RN-002: sobe para o próximo múltiplo da caixa. */
export function arredondarPorCaixa(sugestao: number, unidades: number): number {
  if (numero(sugestao) <= 0 || numero(unidades) <= 1) return numero(sugestao);
  return Math.ceil(sugestao / unidades) * unidades;
}

/**
 * RN-003: valor = venda do período × custo da última entrada; acumulado até
 * 80 % é A, até 95 % é B, o resto é C. Sem valor total, todos são C.
 *
 * R-110: a régua é uma só (R-088) e a 011 a reusa sobre as medidas dela — daí
 * o `Pick<>`: só as três colunas que a curva lê, para a 011 não ter de montar
 * um `LinhaAnalise` inteiro nem duplicar o tipo da 003.
 */
export function curvaAbc(
  linhas: Pick<LinhaAnalise, 'CODPROD' | 'VENDA_PERIODO' | 'CUSTO_ULT_ENTRADA'>[],
): Map<number, CurvaAbc> {
  return curvaPorValor((linhas ?? []).map((linha) => ({
    codprod: Number(linha?.CODPROD ?? 0),
    valor: Math.max(0, numero(linha?.VENDA_PERIODO)) * Math.max(0, numero(linha?.CUSTO_ULT_ENTRADA)),
  })));
}

/**
 * R-122: a MESMA régua (80 % / 95 %) sobre qualquer valor por produto — é o que
 * a 011 usa duas vezes, com o faturamento e com a rentabilidade da janela.
 * Valor negativo (margem abaixo de zero) conta como zero.
 */
export function curvaPorValor(itens: { codprod: number; valor: number }[]): Map<number, CurvaAbc> {
  const mapa = new Map<number, CurvaAbc>();
  const itensValidos = (itens ?? []).map((item) => ({ codprod: Number(item.codprod), valor: Math.max(0, numero(item.valor)) }));
  const total = itensValidos.reduce((soma, item) => soma + item.valor, 0);
  if (total <= 0) {
    for (const item of itensValidos) mapa.set(item.codprod, 'C');
    return mapa;
  }
  let acumulado = 0;
  for (const item of [...itensValidos].sort((a, b) => b.valor - a.valor)) {
    acumulado += item.valor;
    const parte = acumulado / total;
    mapa.set(item.codprod, parte <= 0.8 ? 'A' : parte <= 0.95 ? 'B' : 'C');
  }
  return mapa;
}

const ORDEM_CURVA: Record<CurvaAbc, number> = { A: 0, B: 1, C: 2 };

/** R-122: "a pior das duas" — a letra mais ao fim do alfabeto (A < B < C). */
export function piorCurva(a: CurvaAbc, b: CurvaAbc): CurvaAbc {
  return ORDEM_CURVA[a] >= ORDEM_CURVA[b] ? a : b;
}

/**
 * RN-004 (R-134). Cobertura futura com a MESMA base da sugestão (a venda
 * válida sem o público): estoque futuro = estoque + trânsito + quantidade
 * pedida; dias = estoque futuro ÷ venda diária. Sem venda não há cobertura a
 * calcular — é `null`, não zero. Com a mesma base dos dois lados, comprar a
 * sugestão leva exatamente ao alvo.
 */
export function coberturaFuturaDias(
  vendaBase: number,
  estoque: number,
  transito: number,
  qtPedida: number,
  meses: number,
): number | null {
  const diaria = vendaDiaria(vendaBase, meses);
  if (diaria <= 0) return null;
  const estoqueFuturo = Math.max(0, numero(estoque) + Math.max(0, numero(transito)) + numero(qtPedida));
  return estoqueFuturo / diaria;
}

/** RN-008: soma de quantidade × custo dos itens que ainda estão na lista. */
export function totalDoPedido(itens: { qtPedida: number; precoCusto: number }[]): number {
  const total = (itens ?? []).reduce((soma, item) => soma + numero(item.qtPedida) * numero(item.precoCusto), 0);
  return Math.round(total * 100) / 100;
}

/** R-134: a base da sugestão e da cobertura do item — a venda válida menos a parte pública. */
export function vendaBaseDoItem(item: Pick<ItemPedido, 'qtVendaTotal' | 'qtVendaLicitacao'>): number {
  return Math.max(0, numero(item.qtVendaTotal) - numero(item.qtVendaLicitacao));
}

/** Cobertura do item com a quantidade que ele tem agora (recalculada a cada edição). */
export function coberturaDoItem(item: ItemPedido, meses: number): number | null {
  return coberturaFuturaDias(vendaBaseDoItem(item), item.qtEstoque, item.qtTransito, item.qtPedida, meses);
}

/** "Fornecedor · curva B", "Produto · curva A", "padrão do sistema" — o `title` da coluna Dias. */
export function origemDaCobertura(r: Pick<ResolucaoCobertura, 'nivel' | 'curva'>): string {
  return r.nivel === 'padrao' ? 'padrão do sistema' : `${ROTULO_NIVEL[r.nivel]} · curva ${r.curva}`;
}

/**
 * Orquestra as regras acima: é o que a aba Itens chama UMA vez por análise.
 * Nada é gravado aqui (D-014) — a quantidade nasce zerada e a sugestão fica à
 * vista para a compradora aceitar ou não.
 */
export function montarItens(
  linhas: LinhaAnalise[],
  coberturas: Cobertura[],
  unidadesPorCaixaPorProduto: Map<number, number>,
  periodo: { inicio: string; fim: string },
  codfornec: number,
  /** R-128: o custo padrão do Gestão de Custos; sem o mapa, o custo da última entrada (só o legado de teste). */
  custos?: MapaCustoPadrao | null,
): ItemPedido[] {
  const meses = mesesDoPeriodo(periodo.inicio, periodo.fim);
  const custoDe = (linha: LinhaAnalise) => (custos === undefined ? numero(linha.CUSTO_ULT_ENTRADA) : custoPadraoDe(custos, Number(linha.CODPROD)).valor);
  // R-134: a base é a venda válida sem o público (VENDA_LICITACAO é a parte pública dela).
  const baseDe = (linha: LinhaAnalise) => Math.max(0, numero(linha.VENDA_PERIODO) - numero(linha.VENDA_LICITACAO));
  // A curva pesa venda × custo: com o mapa, o custo padrão (R-128); a venda é a mesma base da sugestão.
  const curvas = curvaAbc((linhas ?? []).map((l) => ({ ...l, VENDA_PERIODO: baseDe(l), CUSTO_ULT_ENTRADA: custoDe(l) })));

  return (linhas ?? []).map((linha) => {
    const codprod = Number(linha.CODPROD);
    const unPorCaixa = unidadesPorCaixa(linha, unidadesPorCaixaPorProduto?.get(codprod));
    const curva = curvas.get(codprod) ?? 'C';
    const resolucao = limiteDeCobertura(coberturas, {
      codprod, codsec: numero(linha.CODSEC), codepto: numero(linha.CODEPTO), codfornec,
    }, curva);
    // R-134: o trânsito SOMA — o pedido ao ERP e o trânsito do WinThor, como nas Compras inteligentes.
    const transito = Math.max(0, numero(linha.TRANSITO)) + Math.max(0, numero(linha.QT_PEDIDA_ERP));
    // Em unidades (Embalagem mínima): a caixa cheia arredonda na tela (`sugestaoNaUnidade`).
    const sugerida = sugestaoDeCompra(baseDe(linha), numero(linha.ESTOQUE), transito, meses, resolucao.alvoDias);
    return {
      codprod,
      descricao: String(linha.DESCRICAO ?? ''),
      embalagem: String(linha.EMBALAGEM ?? ''),
      unidade: String(linha.UNIDADE ?? ''),
      codepto: numero(linha.CODEPTO),
      codsec: numero(linha.CODSEC),
      unPorCaixa,
      qtVendaTotal: numero(linha.VENDA_PERIODO),
      qtVendaLicitacao: numero(linha.VENDA_LICITACAO),
      qtEstoque: numero(linha.ESTOQUE),
      qtTransito: transito,
      qtSugerida: sugerida,
      qtPedida: 0,
      precoCusto: custoDe(linha),
      tipoPreco: 'padrao',
      curvaAbc: curva,
      coberturaDias: coberturaFuturaDias(baseDe(linha), numero(linha.ESTOQUE), transito, 0, meses) ?? 0,
      coberturaLimite: resolucao.limiteDias,
      coberturaAlvo: resolucao.alvoDias,
      coberturaOrigem: origemDaCobertura(resolucao),
      coberturaJustificativa: '',
      observacao: '',
      status: 'montagem',
      idSolicitacao: 0,
      solicitacaoDe: '',
    };
  });
}

/** Linha de `sgcPedidoCarregar` (colunas UPPERCASE) -> o item que a aba edita. */
export function itemDeLinha(linha: Record<string, unknown>): ItemPedido {
  return {
    codprod: numero(linha.CODPROD),
    descricao: String(linha.DESCRICAO ?? ''),
    embalagem: String(linha.EMBALAGEM ?? ''),
    unidade: String(linha.UNIDADE ?? ''),
    codepto: numero(linha.CODEPTO),
    codsec: numero(linha.CODSEC),
    unPorCaixa: numero(linha.UN_POR_CAIXA) || 1,
    qtVendaTotal: numero(linha.QT_VENDA_TOTAL),
    qtVendaLicitacao: numero(linha.QT_VENDA_LICITACAO),
    qtEstoque: numero(linha.QT_ESTOQUE),
    qtTransito: numero(linha.QT_TRANSITO),
    qtSugerida: numero(linha.QT_SUGERIDA),
    qtPedida: numero(linha.QT_PEDIDA),
    precoCusto: numero(linha.PRECO_CUSTO),
    tipoPreco: (['especial', 'manual'].includes(String(linha.TIPO_PRECO)) ? String(linha.TIPO_PRECO) : 'padrao') as TipoPreco,
    curvaAbc: (['A', 'B', 'C'].includes(String(linha.CURVA_ABC)) ? String(linha.CURVA_ABC) : 'C') as CurvaAbc,
    coberturaDias: numero(linha.COBERTURA_DIAS),
    coberturaLimite: numero(linha.COBERTURA_LIMITE) || 0,
    coberturaJustificativa: String(linha.COBERTURA_JUSTIFICATIVA ?? ''),
    observacao: String(linha.OBSERVACAO ?? ''),
    status: String(linha.STATUS ?? 'montagem'),
    idSolicitacao: numero(linha.ID_SOLICITACAO),
    solicitacaoDe: String(linha.SOLICITACAO_VENDEDOR ?? ''),
  };
}

/** Linha de `sgcWintBuscarProduto` -> item novo, com quantidade zero (C-009). */
export function itemDeProdutoBuscado(
  linha: Record<string, unknown>,
  coberturas: Cobertura[],
  codfornec: number,
): ItemPedido {
  const codprod = numero(linha.CODPROD);
  const embalagem = String(linha.EMBALAGEM ?? '');
  return {
    codprod,
    descricao: String(linha.DESCRICAO ?? ''),
    embalagem,
    unidade: String(linha.UNIDADE ?? ''),
    codepto: numero(linha.CODEPTO),
    codsec: numero(linha.CODSEC),
    unPorCaixa: unidadesPorCaixa({ EMBALAGEM: embalagem, UN_POR_CAIXA_ERP: numero(linha.UN_POR_CAIXA_ERP) }),
    qtVendaTotal: 0,
    qtVendaLicitacao: 0,
    qtEstoque: numero(linha.ESTOQUE),
    qtTransito: 0,
    qtSugerida: 0,
    qtPedida: 0,
    precoCusto: numero(linha.CUSTO_ULT_ENTRADA),
    tipoPreco: 'padrao',
    curvaAbc: 'C',
    coberturaDias: 0,
    // O item nasce sem curva classificada: vale a coluna C, a mais tolerante (RN-003).
    coberturaLimite: limiteDeCobertura(coberturas, {
      codprod, codsec: numero(linha.CODSEC), codepto: numero(linha.CODEPTO), codfornec,
    }, 'C').limiteDias,
    coberturaJustificativa: '',
    observacao: '',
    status: 'montagem',
    idSolicitacao: 0,
    solicitacaoDe: '',
  };
}

/* ─────────────── R-128: o custo de compra é o custo padrão do Gestão de Custos ─────────────── */

/** De onde veio o custo: o Gestão de Custos; produto sem linha lá; consulta que falhou; ainda carregando. */
export type OrigemCusto = 'gestao' | 'sem' | 'erro' | 'carregando';

export interface CustoPadrao { valor: number; dataRef: string; origem: OrigemCusto }

/** O mapa por CODPROD que a tela monta com `sgcCustoPadraoAtual`; `null` = a consulta falhou; `undefined` = ainda não veio. */
export type MapaCustoPadrao = Map<number, { custo: number; dataRef: string }>;

/** As linhas de `sgcCustoPadraoAtual` → o mapa (a data mais recente vence, se vierem duas). */
export function mapaDeCustoPadrao(linhas: Record<string, unknown>[]): MapaCustoPadrao {
  const mapa: MapaCustoPadrao = new Map();
  for (const l of linhas ?? []) {
    const codprod = numero(l.CODPROD);
    if (!(codprod > 0)) continue;
    const dataRef = String(l.DATA_REF ?? '').slice(0, 10);
    const atual = mapa.get(codprod);
    if (!atual || dataRef >= atual.dataRef) mapa.set(codprod, { custo: numero(l.CUSTO), dataRef });
  }
  return mapa;
}

/**
 * O custo de um produto: o do Gestão de Custos; sem linha lá, 0 e "Sem custo";
 * com a consulta falhando, 0 e "Erro custo" em TODOS — nunca custo parcial,
 * que seria indistinguível de "produto sem custo". Sem fallback para o ERP.
 */
export function custoPadraoDe(mapa: MapaCustoPadrao | null | undefined, codprod: number): CustoPadrao {
  if (mapa === undefined) return { valor: 0, dataRef: '', origem: 'carregando' };
  if (mapa === null) return { valor: 0, dataRef: '', origem: 'erro' };
  const achado = mapa.get(numero(codprod));
  if (!achado || !(achado.custo > 0)) return { valor: 0, dataRef: '', origem: 'sem' };
  return { valor: achado.custo, dataRef: achado.dataRef, origem: 'gestao' };
}

/** O texto de um custo que não tem valor; `null` quando há valor (a tela formata em reais). */
export function rotuloSemCusto(c: Pick<CustoPadrao, 'origem'> | null | undefined): string | null {
  if (!c || c.origem === 'gestao') return null;
  return c.origem === 'erro' ? 'Erro custo' : c.origem === 'carregando' ? '…' : 'Sem custo';
}
