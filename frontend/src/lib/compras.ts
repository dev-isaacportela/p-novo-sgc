// Regra de compra: sugestão por cobertura de demanda, arredondamento por
// caixa, curva ABC, cobertura futura e total do pedido (spec 003, RN-001 a
// RN-004 e RN-008).
//
// Portada de `p-45547/frontend/src/features/kanban/compras.ts` sem mudança de
// comportamento. Módulo puro — sem React, sem SDK: é o que
// `frontend/tests/compras.test.mjs` exercita.

// Extensão explícita: `allowImportingTsExtensions` está ligado e é assim que o
// `node --test` de frontend/tests/ resolve o módulo sem passo de build.
import type { AlvoCobertura, Cobertura } from './cobertura.ts';
import { limiteDeCobertura } from './cobertura.ts';

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
}

export type TipoPreco = 'padrao' | 'especial';
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
  coberturaJustificativa: string;
  observacao: string;
  status: string;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Dias do período (inclusive) divididos por 30, nunca menos de 1 mês. */
export function mesesDoPeriodo(inicio: string, fim: string): number {
  const de = Date.parse(`${String(inicio).slice(0, 10)}T00:00:00Z`);
  const ate = Date.parse(`${String(fim).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(de) || !Number.isFinite(ate) || ate < de) return 1;
  const dias = (ate - de) / 86400000 + 1;
  return Math.max(1, dias / 30);
}

/**
 * RN-001. Cobertura alvo de 2 meses (2,5 no giro lento, abaixo de 5 por mês),
 * menos a posição de estoque. A base é a venda TOTAL, licitação inclusive
 * (AN-04 A): o público compra do mesmo estoque.
 */
export function sugestaoDeCompra(
  vendaTotal: number,
  estoque: number,
  transito: number,
  meses: number,
): number {
  const venda = numero(vendaTotal);
  if (venda <= 0) return 0;

  const vendaMensal = venda / Math.max(1, numero(meses));
  const alvoMeses = vendaMensal < 5 ? 2.5 : 2;
  const necessidade = Math.ceil(vendaMensal * alvoMeses);
  const posicao = Math.max(0, numero(estoque) - numero(transito));
  const sugestao = Math.max(0, necessidade - posicao);

  // RN-001, última frase: há demanda e a posição não cobre nem um mês, comprar
  // zero seria ruptura. Guarda-corpo herdado do p-45547 — com alvo de 2 ou 2,5
  // meses ele nunca dispara (a necessidade já é maior que a venda mensal); se
  // algum dia o alvo cair abaixo de 1 mês, é ele que segura a ruptura.
  if (sugestao === 0 && posicao < vendaMensal) return 1;
  return sugestao;
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
  const itens = (linhas ?? []).map((linha) => ({
    codprod: Number(linha?.CODPROD ?? 0),
    valor: Math.max(0, numero(linha?.VENDA_PERIODO)) * Math.max(0, numero(linha?.CUSTO_ULT_ENTRADA)),
  }));
  const mapa = new Map<number, CurvaAbc>();
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  if (total <= 0) {
    for (const item of itens) mapa.set(item.codprod, 'C');
    return mapa;
  }
  let acumulado = 0;
  for (const item of [...itens].sort((a, b) => b.valor - a.valor)) {
    acumulado += item.valor;
    const parte = acumulado / total;
    mapa.set(item.codprod, parte <= 0.8 ? 'A' : parte <= 0.95 ? 'B' : 'C');
  }
  return mapa;
}

/** RN-004. Sem venda diária não há cobertura a calcular — é `null`, não zero. */
export function coberturaFuturaDias(
  vendaTotal: number,
  estoque: number,
  transito: number,
  qtPedida: number,
  meses: number,
): number | null {
  const vendaDiaria = numero(vendaTotal) / Math.max(1, numero(meses)) / 30;
  if (vendaDiaria <= 0) return null;
  const estoqueFuturo = Math.max(0, numero(estoque) - numero(transito) + numero(qtPedida));
  return estoqueFuturo / vendaDiaria;
}

/** RN-008: soma de quantidade × custo dos itens que ainda estão na lista. */
export function totalDoPedido(itens: { qtPedida: number; precoCusto: number }[]): number {
  const total = (itens ?? []).reduce((soma, item) => soma + numero(item.qtPedida) * numero(item.precoCusto), 0);
  return Math.round(total * 100) / 100;
}

/** Cobertura do item com a quantidade que ele tem agora (recalculada a cada edição). */
export function coberturaDoItem(item: ItemPedido, meses: number): number | null {
  return coberturaFuturaDias(item.qtVendaTotal, item.qtEstoque, item.qtTransito, item.qtPedida, meses);
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
): ItemPedido[] {
  const meses = mesesDoPeriodo(periodo.inicio, periodo.fim);
  const curvas = curvaAbc(linhas);

  return (linhas ?? []).map((linha) => {
    const codprod = Number(linha.CODPROD);
    const unPorCaixa = unidadesPorCaixa(linha, unidadesPorCaixaPorProduto?.get(codprod));
    const sugerida = arredondarPorCaixa(
      sugestaoDeCompra(numero(linha.VENDA_PERIODO), numero(linha.ESTOQUE), numero(linha.TRANSITO), meses),
      unPorCaixa,
    );
    const alvo: AlvoCobertura = {
      codprod, codsec: numero(linha.CODSEC), codepto: numero(linha.CODEPTO), codfornec,
    };
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
      qtTransito: numero(linha.TRANSITO),
      qtSugerida: sugerida,
      qtPedida: 0,
      precoCusto: numero(linha.CUSTO_ULT_ENTRADA),
      tipoPreco: 'padrao',
      curvaAbc: curvas.get(codprod) ?? 'C',
      coberturaDias: coberturaFuturaDias(numero(linha.VENDA_PERIODO), numero(linha.ESTOQUE), numero(linha.TRANSITO), 0, meses) ?? 0,
      coberturaLimite: limiteDeCobertura(coberturas, alvo).limiteDias,
      coberturaJustificativa: '',
      observacao: '',
      status: 'montagem',
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
    tipoPreco: String(linha.TIPO_PRECO ?? 'padrao') === 'especial' ? 'especial' : 'padrao',
    curvaAbc: (['A', 'B', 'C'].includes(String(linha.CURVA_ABC)) ? String(linha.CURVA_ABC) : 'C') as CurvaAbc,
    coberturaDias: numero(linha.COBERTURA_DIAS),
    coberturaLimite: numero(linha.COBERTURA_LIMITE) || 0,
    coberturaJustificativa: String(linha.COBERTURA_JUSTIFICATIVA ?? ''),
    observacao: String(linha.OBSERVACAO ?? ''),
    status: String(linha.STATUS ?? 'montagem'),
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
    coberturaLimite: limiteDeCobertura(coberturas, {
      codprod, codsec: numero(linha.CODSEC), codepto: numero(linha.CODEPTO), codfornec,
    }).limiteDias,
    coberturaJustificativa: '',
    observacao: '',
    status: 'montagem',
  };
}
