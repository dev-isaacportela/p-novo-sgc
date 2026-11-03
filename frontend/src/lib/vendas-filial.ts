// O gráfico de vendas da filial em excesso (R-139, o showExcessBranchSales do
// legado): ao clicar no cartão da filial no alerta de excesso, as vendas desse
// produto nessa filial nos últimos 6 meses fechados, mais o mês corrente como
// parcial (o padrão do Compras × vendas), com o total, a média mensal, o
// estoque da filial e a cobertura nela. Regra pura, exercitada por
// `tests/vendas-filial.test.mjs`. A série vem do mesmo histórico mensal do
// Compras × vendas (`sgcWintProdutoHistorico`) com a `codfilial` da filial em
// excesso; o público sai quando a tela o tira (no kanban, sempre — R-131).
import { historicoSemPublico, mesesAte, rotuloMes, type PontoHistorico } from './ressuprimento-detalhe.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Meses fechados no gráfico; o corrente entra depois deles, como parcial. */
export const MESES_FECHADOS_FILIAL = 6;
/** O histórico pedido à consulta cobre os 6 fechados e o corrente. */
export const MESES_CONSULTA_FILIAL = MESES_FECHADOS_FILIAL + 1;

export interface MesDaFilial { mes: string; rotulo: string; vendas: number; parcial: boolean }

/** Os 6 meses fechados e o corrente (parcial), com zero no mês sem venda. */
export function serieDaFilial(historico: PontoHistorico[], hoje: string, semPublico: boolean): MesDaFilial[] {
  const porMes = new Map(historicoSemPublico(historico ?? [], semPublico).map((h) => [String(h.MES).slice(0, 7), h]));
  const meses = mesesAte(hoje, MESES_CONSULTA_FILIAL);
  return meses.map((mes, i) => ({
    mes, rotulo: rotuloMes(mes), vendas: numero(porMes.get(mes)?.SAIDAS), parcial: i === meses.length - 1,
  }));
}

export interface ResumoDaFilial {
  /** A venda dos 6 meses fechados (o parcial fica fora da conta). */
  total: number;
  mediaMensal: number;
  estoque: number;
  /** Dias de estoque na filial pela média; `null` = sem giro (venda zero). */
  coberturaDias: number | null;
}

export function resumoDaFilial(serie: MesDaFilial[], estoque: number): ResumoDaFilial {
  const fechados = (serie ?? []).filter((m) => !m.parcial);
  const total = fechados.reduce((t, m) => t + numero(m.vendas), 0);
  const mediaMensal = fechados.length > 0 ? total / fechados.length : 0;
  const coberturaDias = mediaMensal > 0 ? Math.round(numero(estoque) / (mediaMensal / 30)) : null;
  return { total, mediaMensal: Math.round(mediaMensal * 10) / 10, estoque: numero(estoque), coberturaDias };
}

/** A filial do alerta de excesso do card: a chave é `excesso:<codprod>:<codfilial>` (add-006). */
export function filialDaChave(chave: unknown): string {
  const partes = String(chave ?? '').split(':');
  return partes[0] === 'excesso' && partes.length >= 3 ? partes.slice(2).join(':') : '';
}
