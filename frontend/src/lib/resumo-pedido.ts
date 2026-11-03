// O topo do card na Análise (R-133), no desenho do SGC legado: o banner de
// reprovação, os quatro números do pedido, a aderência à sugestão e as faixas
// de aviso. Regra pura — sem React, sem SDK —, exercitada por
// `frontend/tests/resumo-pedido.test.mjs`.
//
// "No pedido" é o item com quantidade: o item zerado continua na lista do
// rascunho (vem de uma análise antiga, ou saiu pela sugestão) e sai de vez na
// saída da Análise (RF-025 da 003).

import type { ItemPedido } from './compras.ts';

type Item = Pick<ItemPedido, 'codprod' | 'qtPedida' | 'qtSugerida' | 'precoCusto' | 'tipoPreco' | 'idSolicitacao'>;
type Alerta = { tipo: string; lido: boolean };

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

export const estaNoPedido = (item: Pick<ItemPedido, 'qtPedida'>): boolean => numero(item.qtPedida) > 0;

/* ─────────────── os quatro números ─────────────── */

export interface NumerosDoPedido {
  itens: number;
  unidades: number;
  valor: number;
  /** Itens com custo de tabela especial. */
  especiais: number;
  /** Alertas ainda não lidos — é o que barra a saída da Análise (RF-017 da 003). */
  alertas: number;
}

export function numerosDoPedido(itens: Item[], alertas: Alerta[]): NumerosDoPedido {
  const noPedido = (itens ?? []).filter(estaNoPedido);
  const valor = noPedido.reduce((soma, item) => soma + numero(item.qtPedida) * numero(item.precoCusto), 0);
  return {
    itens: noPedido.length,
    unidades: noPedido.reduce((soma, item) => soma + numero(item.qtPedida), 0),
    valor: Math.round(valor * 100) / 100,
    especiais: noPedido.filter((item) => item.tipoPreco === 'especial').length,
    alertas: (alertas ?? []).filter((alerta) => !alerta.lido).length,
  };
}

/* ─────────────── aderência à sugestão ─────────────── */

export type TomAderencia = 'live' | 'attention' | 'alert';

export interface Aderencia {
  /** `null` quando não há item montado pela análise no pedido. */
  pct: number | null;
  seguem: number;
  base: number;
  /** Os itens que não seguem: é neles que "Aceitar sugestão" grava. */
  alterados: number[];
  tom: TomAderencia;
}

/** Verde a partir de 80 %, âmbar a partir de 50 %, vermelho abaixo (o legado). */
export function tomDaAderencia(pct: number | null): TomAderencia {
  if (pct === null || pct >= 80) return 'live';
  return pct >= 50 ? 'attention' : 'alert';
}

/**
 * Quem segue a sugestão: o item no pedido com quantidade ≥ a sugerida e
 * sugestão > 0. O item que veio de solicitação do comercial fica fora da conta:
 * a quantidade dele é a que o comercial pediu, não a da fórmula. O item no
 * pedido com sugestão 0 é alterado — aceitar a sugestão o tira do pedido.
 */
export function aderenciaASugestao(itens: Item[]): Aderencia {
  const base = (itens ?? []).filter((item) => estaNoPedido(item) && numero(item.idSolicitacao) <= 0);
  const segue = (item: Item) => numero(item.qtSugerida) > 0 && numero(item.qtPedida) >= numero(item.qtSugerida);
  const seguem = base.filter(segue).length;
  const pct = base.length > 0 ? Math.round((seguem / base.length) * 100) : null;
  return {
    pct,
    seguem,
    base: base.length,
    alterados: base.filter((item) => !segue(item)).map((item) => item.codprod),
    tom: tomDaAderencia(pct),
  };
}

/** "X de N seguem · Y alterado(s)". */
export function textoDaAderencia(a: Pick<Aderencia, 'seguem' | 'base' | 'alterados'>): string {
  if (a.base === 0) return 'Nenhum item da análise no pedido';
  const alterados = a.alterados.length;
  return `${a.seguem} de ${a.base} seguem · ${alterados} ${alterados === 1 ? 'alterado' : 'alterados'}`;
}

/**
 * "Aceitar sugestão": a quantidade sugerida nos alterados. Sugestão 0 leva a
 * quantidade a 0 — o item sai do pedido (e o zerado sai de vez na saída da
 * Análise). Devolve só o que muda.
 */
export function aceitarSugestao(itens: Item[]): { codprod: number; qtPedida: number }[] {
  const { alterados } = aderenciaASugestao(itens);
  return (itens ?? [])
    .filter((item) => alterados.includes(item.codprod))
    .map((item) => ({ codprod: item.codprod, qtPedida: Math.max(0, numero(item.qtSugerida)) }));
}

/* ─────────────── as faixas de aviso ─────────────── */

export interface FaixasDoResumo {
  vencimento: number;
  excesso: number;
  especiais: number;
  solicitacoes: { itens: number; unidades: number };
}

export function faixasDoResumo(itens: Item[], alertas: Alerta[]): FaixasDoResumo {
  const noPedido = (itens ?? []).filter(estaNoPedido);
  const comercial = noPedido.filter((item) => numero(item.idSolicitacao) > 0);
  return {
    vencimento: (alertas ?? []).filter((alerta) => alerta.tipo === 'vencimento').length,
    excesso: (alertas ?? []).filter((alerta) => alerta.tipo === 'excesso').length,
    especiais: noPedido.filter((item) => item.tipoPreco === 'especial').length,
    solicitacoes: { itens: comercial.length, unidades: comercial.reduce((soma, item) => soma + numero(item.qtPedida), 0) },
  };
}

/** "N vencimento / N excesso — ver na seção Alertas"; vazio quando não há nenhum. */
export function textoDosAlertas(f: Pick<FaixasDoResumo, 'vencimento' | 'excesso'>): string {
  if (f.vencimento + f.excesso === 0) return '';
  const partes = [];
  if (f.vencimento > 0) partes.push(`${f.vencimento} vencimento`);
  if (f.excesso > 0) partes.push(`${f.excesso} excesso`);
  return `${partes.join(' / ')} — ver na seção Alertas`;
}

export const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

/* ─────────────── o banner de reprovação ─────────────── */

export interface Reprovacao {
  origem: 'tecnica' | 'diretoria';
  titulo: string;
  instrucao: string;
  motivo: string;
  /** Os códigos de produto que a reprovação técnica citou (texto livre do diálogo). */
  produtos: number[];
}

/** Os códigos citados no texto livre "Produtos reprovados": "5001, 5002 e 5010" → [5001, 5002, 5010]. */
export function codigosCitados(texto: unknown): number[] {
  const achados = String(texto ?? '').match(/\d+/g) ?? [];
  return [...new Set(achados.map(Number).filter((n) => n > 0))];
}

/**
 * O pedido que voltou reprovado: a técnica e a diretoria guardam o motivo em
 * colunas próprias (002), limpas quando o pedido sai de novo da Análise. A
 * diretoria vem primeiro: é a decisão mais recente quando há as duas.
 */
export function reprovacoesDoPedido(capa: Record<string, unknown> | null | undefined): Reprovacao[] {
  if (!capa) return [];
  const lista: Reprovacao[] = [];
  const dir = String(capa.DIR_MOTIVO ?? '').trim();
  if (dir) {
    lista.push({
      origem: 'diretoria',
      titulo: 'Pedido reprovado pela diretoria',
      instrucao: 'Revise o pedido conforme o motivo e envie de novo para a aprovação.',
      motivo: dir,
      produtos: [],
    });
  }
  const tec = String(capa.TEC_MOTIVO ?? '').trim();
  if (tec) {
    lista.push({
      origem: 'tecnica',
      titulo: 'Pedido reprovado na aprovação técnica',
      instrucao: 'Ajuste os produtos indicados e envie de novo para a aprovação técnica.',
      motivo: tec,
      produtos: codigosCitados(capa.TEC_PRODUTOS_REPROVADOS),
    });
  }
  return lista;
}
