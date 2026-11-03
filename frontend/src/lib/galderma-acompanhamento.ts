// Regra pura do acompanhamento Galderma e da composição por filial (spec 014,
// RN-011..RN-014): o merge proposta × realizado × meta lançada, a meta e o
// semáforo, os totais pela razão das somas, a série dos gráficos, a divergência
// do estoque inicial, a composição por filial e o estoque a custo padrão.
// Porte de `features/galderma-acompanhamento/acompanhamento-{dados,calculos}.ts`
// do legado. Sem React e sem transporte.
import { custoPadraoDe } from './compras.ts';
import type { MapaCustoPadrao } from './compras.ts';
import { chave, competenciasDoPeriodo, num, recuarCompetencia } from './galderma.ts';

/* ─────────────── RN-011: meta e semáforo ─────────────── */

export const FAIXA_ABAIXO = 70;
export const FAIXA_DENTRO = 100;

export type SemaforoMeta = 'sem-meta' | 'abaixo' | 'atencao' | 'dentro';

export const ROTULO_SEMAFORO: Record<SemaforoMeta, string> = {
  'sem-meta': 'sem meta', abaixo: 'abaixo', atencao: 'atenção', dentro: 'dentro',
};

/** RN-AG-24: sem meta (0, negativa, ausente) não há percentual — nunca 0 nem infinito. */
export function percentualDaMeta(realizado: number, meta: number | null | undefined): number | null {
  const m = Number(meta);
  return Number.isFinite(m) && m > 0 ? (num(realizado) / m) * 100 : null;
}

export function semaforoDaMeta(pct: number | null): SemaforoMeta {
  if (pct === null) return 'sem-meta';
  if (pct >= FAIXA_DENTRO) return 'dentro';
  if (pct >= FAIXA_ABAIXO) return 'atencao';
  return 'abaixo';
}

export const faltaPercentual = (pct: number | null) => (pct === null ? null : Math.max(0, 100 - pct));

/* ─────────────── RN-012: o merge ─────────────── */

export interface LinhaAcompanhamento {
  codprod: number;
  competencia: string;
  descricao: string;
  temProposta: boolean;
  precoSellout: number; precoNet: number; precoListaDesc: number; precoListaCheio: number;
  estoqueInicialInformado: number;
  estoqueInicialErp: number | null;
  mediaSelloutGalderma: number;
  mediaTriErp: number;
  previsaoMesa: number;
  selloutLancado: number | null;
  lancadoPor: string;
  lancadoEm: string;
  previsaoSellout: number;
  valorSelloutProjetado: number;
  vendaRealizada: number;
  valorVenda: number;
  percentualSellout: number | null;
  semaforoSellout: SemaforoMeta;
  faltaSelloutPct: number | null;
  propostaSellin: number;
  propostaNet: number; propostaComDesconto: number; propostaSemDesconto: number;
  metaSellinValor: number;
  pedidoEnviado: number;
  realizadoNet: number; realizadoComDesconto: number; realizadoSemDesconto: number;
  compraRealizada: number;
  valorCompra: number;
  percentualSellin: number | null;
  semaforoSellin: SemaforoMeta;
  faltaSellinUn: number;
  faltaSellinValor: number;
}

interface Realizado { venda: number; valorVenda: number; compra: number; valorCompra: number }

/**
 * RN-012 / C-022 / C-024 / C-028: uma linha por produto × competência visível
 * se há proposta, realizado ou meta lançada. O realizado e o estoque somam as
 * filiais aceitas (`filiais` vazio = todas). Os meses ANTERIORES ao período só
 * alimentam a média do trimestre pelo ERP — nunca viram linha.
 */
export function juntarAcompanhamento(p: {
  historico: Record<string, unknown>[];
  realizado: Record<string, unknown>[];
  lancamentos: Record<string, unknown>[];
  estoqueInicial?: Record<string, unknown>[] | null;
  competenciaDoEstoque?: string;
  filiais?: string[];
  competencias: string[];
}): LinhaAcompanhamento[] {
  const aceita = (f: unknown) => !p.filiais?.length || p.filiais.includes(String(f));
  const visiveis = new Set(p.competencias);

  const real = new Map<string, Realizado>();
  for (const r of p.realizado) {
    if (!aceita(r.CODFILIAL)) continue;
    const k = chave(num(r.CODPROD), String(r.MES));
    const atual = real.get(k) ?? { venda: 0, valorVenda: 0, compra: 0, valorCompra: 0 };
    atual.venda += num(r.VENDA_REALIZADA); atual.valorVenda += num(r.VALOR_VENDA);
    atual.compra += num(r.COMPRA_REALIZADA); atual.valorCompra += num(r.VALOR_COMPRA);
    real.set(k, atual);
  }
  const estoque = new Map<number, number>();
  for (const e of p.estoqueInicial ?? []) {
    if (!aceita(e.CODFILIAL)) continue;
    estoque.set(num(e.CODPROD), (estoque.get(num(e.CODPROD)) ?? 0) + num(e.ESTOQUE_INICIAL));
  }
  const proposta = new Map(p.historico.map((h) => [chave(num(h.CODPROD), String(h.COMPETENCIA)), h]));
  const lancado = new Map(p.lancamentos.map((l) => [chave(num(l.CODPROD), String(l.COMPETENCIA)), l]));
  const descricoes = new Map<number, string>();
  for (const h of p.historico) if (String(h.DESCRICAO ?? '')) descricoes.set(num(h.CODPROD), String(h.DESCRICAO));

  const chaves = new Set<string>();
  for (const k of [...proposta.keys(), ...real.keys(), ...lancado.keys()]) {
    if (visiveis.has(k.split('|')[1])) chaves.add(k);
  }

  return [...chaves].map((k) => {
    const [cod, competencia] = k.split('|');
    const codprod = Number(cod);
    const h = proposta.get(k);
    const r = real.get(k) ?? { venda: 0, valorVenda: 0, compra: 0, valorCompra: 0 };
    const l = lancado.get(k);
    const precoSellout = num(h?.PRECO_SELLOUT);
    const precoNet = num(h?.PRECO_NET);
    const precoListaDesc = num(h?.PRECO_LISTA_DESC);
    const precoListaCheio = num(h?.PRECO_LISTA) || precoListaDesc;
    const previsaoMesa = num(h?.PREVISAO_SELLOUT);
    const selloutLancado = l ? num(l.PREVISAO_SELLOUT) : null;
    const previsaoSellout = selloutLancado ?? previsaoMesa;
    const propostaSellin = num(h?.PROPOSTA_SELLIN);
    const pedidoEnviado = num(h?.PEDIDO_ENVIADO);
    const percentualSellout = percentualDaMeta(r.venda, previsaoSellout);
    const percentualSellin = percentualDaMeta(pedidoEnviado, propostaSellin);
    const faltaSellinUn = Math.max(0, propostaSellin - pedidoEnviado);
    const mediaTriErp = [1, 2, 3].reduce((s, n) => s + (real.get(chave(codprod, recuarCompetencia(competencia, n)))?.venda ?? 0), 0) / 3;
    return {
      codprod, competencia, descricao: descricoes.get(codprod) ?? `Produto ${codprod}`, temProposta: Boolean(h),
      precoSellout, precoNet, precoListaDesc, precoListaCheio,
      estoqueInicialInformado: num(h?.ESTOQUE_INICIAL),
      estoqueInicialErp: p.estoqueInicial && p.competenciaDoEstoque === competencia ? (estoque.get(codprod) ?? 0) : null,
      mediaSelloutGalderma: num(h?.MEDIA_SELLOUT), mediaTriErp,
      previsaoMesa, selloutLancado, lancadoPor: String(l?.POR_NOME ?? ''), lancadoEm: String(l?.ATUALIZADO_EM ?? ''),
      previsaoSellout, valorSelloutProjetado: previsaoSellout * precoSellout,
      vendaRealizada: r.venda, valorVenda: r.valorVenda,
      percentualSellout, semaforoSellout: semaforoDaMeta(percentualSellout), faltaSelloutPct: faltaPercentual(percentualSellout),
      propostaSellin, propostaNet: propostaSellin * precoNet, propostaComDesconto: propostaSellin * precoListaDesc,
      propostaSemDesconto: propostaSellin * precoListaCheio, metaSellinValor: num(h?.META_SELLIN_VALOR),
      pedidoEnviado, realizadoNet: pedidoEnviado * precoNet, realizadoComDesconto: pedidoEnviado * precoListaDesc,
      realizadoSemDesconto: pedidoEnviado * precoListaCheio,
      compraRealizada: r.compra, valorCompra: r.valorCompra,
      percentualSellin, semaforoSellin: semaforoDaMeta(percentualSellin),
      faltaSellinUn, faltaSellinValor: faltaSellinUn * precoListaDesc,
    };
  }).sort((a, b) => (a.competencia === b.competencia ? a.codprod - b.codprod : a.competencia < b.competencia ? -1 : 1));
}

/** As competências do período e a janela esticada para a média do trimestre (RN-AG-15). */
export function janelaDoAcompanhamento(fim: string, meses: number) {
  const competencias = competenciasDoPeriodo(fim, meses);
  return { competencias, inicioComTrimestre: recuarCompetencia(competencias[0], 3) };
}

/* ─────────────── totais, série e textos ─────────────── */

export interface TotaisAcompanhamento {
  previsaoSellout: number; valorSelloutProjetado: number; vendaRealizada: number; valorVenda: number;
  propostaSellin: number; propostaComDesconto: number; pedidoEnviado: number; realizadoComDesconto: number;
  compraRealizada: number; valorCompra: number; faltaSellinUn: number; faltaSellinValor: number;
  percentualSellout: number | null; percentualSellin: number | null; faltaSelloutPct: number | null;
}

/**
 * RN-AG-33 / C-025: soma simples; o percentual do total é Σ realizado ÷ Σ meta.
 * A linha sem meta entra no numerador e não no denominador, como no legado.
 */
export function totaisAcompanhamento(linhas: LinhaAcompanhamento[]): TotaisAcompanhamento {
  const s = (f: (l: LinhaAcompanhamento) => number) => linhas.reduce((t, l) => t + f(l), 0);
  const t = {
    previsaoSellout: s((l) => l.previsaoSellout), valorSelloutProjetado: s((l) => l.valorSelloutProjetado),
    vendaRealizada: s((l) => l.vendaRealizada), valorVenda: s((l) => l.valorVenda),
    propostaSellin: s((l) => l.propostaSellin), propostaComDesconto: s((l) => l.propostaComDesconto),
    pedidoEnviado: s((l) => l.pedidoEnviado), realizadoComDesconto: s((l) => l.realizadoComDesconto),
    compraRealizada: s((l) => l.compraRealizada), valorCompra: s((l) => l.valorCompra),
    faltaSellinUn: s((l) => l.faltaSellinUn), faltaSellinValor: s((l) => l.faltaSellinValor),
  };
  const percentualSellout = percentualDaMeta(t.vendaRealizada, t.previsaoSellout);
  return { ...t, percentualSellout, percentualSellin: percentualDaMeta(t.pedidoEnviado, t.propostaSellin), faltaSelloutPct: faltaPercentual(percentualSellout) };
}

export interface PontoMensal { competencia: string; previsao: number; realizado: number; sellinProjetado: number; sellinComprado: number }

/** RN-AG-34: por competência, na ordem do período (mês sem linha = zeros). */
export function serieMensal(linhas: LinhaAcompanhamento[], competencias: string[]): PontoMensal[] {
  return competencias.map((competencia) => {
    const doMes = linhas.filter((l) => l.competencia === competencia);
    const s = (f: (l: LinhaAcompanhamento) => number) => doMes.reduce((t, l) => t + f(l), 0);
    return {
      competencia, previsao: s((l) => l.previsaoSellout), realizado: s((l) => l.vendaRealizada),
      sellinProjetado: s((l) => l.propostaSellin), sellinComprado: s((l) => l.pedidoEnviado),
    };
  });
}

/** C-026 (RN-AG-19): a diferença do estoque reconstruído contra o informado pela Galderma. */
export function textoDivergenciaEstoque(erp: number | null, informado: number): string {
  if (erp === null) return 'Estoque inicial do ERP não carregado.';
  if (!(informado > 0)) return 'A Galderma não informou estoque inicial para este produto.';
  const diferenca = Math.round(erp - informado);
  if (diferenca === 0) return 'Bate com o que a Galderma informou.';
  return `${diferenca > 0 ? '+' : '−'}${Math.abs(diferenca)} em relação ao que a Galderma informou (${Math.round(informado)})`;
}

/** C-023: o valor e a origem que o histórico grava como "antes". */
export function anteriorDoSellout(l: Pick<LinhaAcompanhamento, 'selloutLancado' | 'previsaoMesa'>) {
  return l.selloutLancado === null
    ? { antes: String(l.previsaoMesa), origemAnterior: 'mesa' as const }
    : { antes: String(l.selloutLancado), origemAnterior: 'lancado' as const };
}

/** RN-AG-37: vírgula vira ponto; vazio = remover; negativo ou não numérico = inválido. */
export function lerSellout(texto: string): { ok: true; valor: number | null } | { ok: false; erro: string } {
  const limpo = String(texto ?? '').trim().replace(',', '.');
  if (limpo === '') return { ok: true, valor: null };
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return { ok: false, erro: 'Informe um número maior ou igual a zero (vazio remove o lançamento).' };
  return { ok: true, valor: n };
}

/** RN-AG-43: o texto de uma linha do histórico do sell-out. */
export function textoDoHistorico(l: { ANTES?: unknown; DEPOIS?: unknown; ORIGEM_ANTERIOR?: unknown }): string {
  const antes = String(l.ANTES ?? '');
  const depois = String(l.DEPOIS ?? '');
  if (depois === '') return `lançamento removido (era ${antes})`;
  return `de ${antes}${String(l.ORIGEM_ANTERIOR) === 'mesa' ? ' (mesa)' : ''} para ${depois}`;
}

/* ─────────────── RN-014: composição ─────────────── */

export type Granularidade = 'filial' | 'grupo';
export type Indicador = 'valor' | 'qtd';

export interface LinhaComposicao { codfilial: string; filial: string; sellin: number; vendas: number; partSellin: number | null; partVendas: number | null }

/** C-029: por filial (ou uma linha "Grupo"), no indicador escolhido, com a participação em %. */
export function montarComposicao(rows: Record<string, unknown>[], granularidade: Granularidade, indicador: Indicador): LinhaComposicao[] {
  const base = rows.map((r) => ({
    codfilial: String(r.CODFILIAL), filial: String(r.FILIAL ?? `Filial ${r.CODFILIAL}`),
    sellin: num(indicador === 'valor' ? r.VALOR_SELLIN : r.QTD_SELLIN),
    vendas: num(indicador === 'valor' ? r.VALOR_VENDAS : r.QTD_VENDAS),
  }));
  const linhas = granularidade === 'grupo'
    ? [{ codfilial: '', filial: 'Grupo', sellin: base.reduce((s, b) => s + b.sellin, 0), vendas: base.reduce((s, b) => s + b.vendas, 0) }]
    : base;
  const totalSellin = linhas.reduce((s, l) => s + l.sellin, 0);
  const totalVendas = linhas.reduce((s, l) => s + l.vendas, 0);
  return linhas.map((l) => ({
    ...l,
    partSellin: totalSellin > 0 ? (l.sellin / totalSellin) * 100 : null,
    partVendas: totalVendas > 0 ? (l.vendas / totalVendas) * 100 : null,
  })).sort((a, b) => b.sellin - a.sellin);
}

export interface EstoqueDaFilial {
  codfilial: string; filial: string; qtDisponivel: number; qtFisico: number;
  valorDisponivel: number | null; valorFisico: number | null; semCusto: number;
}

/**
 * C-030 / R-128: o estoque de agora a custo padrão do Gestão de Custos. Produto
 * sem custo não soma (conta em `semCusto`); consulta que falhou (`null`) =
 * nenhum valor em reais — nunca parcial.
 */
export function valorizarEstoque(rows: Record<string, unknown>[], custos: MapaCustoPadrao | null, granularidade: Granularidade = 'filial'): EstoqueDaFilial[] {
  const porFilial = new Map<string, EstoqueDaFilial>();
  for (const r of rows) {
    const codfilial = granularidade === 'grupo' ? '' : String(r.CODFILIAL);
    const e = porFilial.get(codfilial) ?? {
      codfilial, filial: granularidade === 'grupo' ? 'Grupo' : String(r.FILIAL ?? `Filial ${r.CODFILIAL}`),
      qtDisponivel: 0, qtFisico: 0, valorDisponivel: custos === null ? null : 0, valorFisico: custos === null ? null : 0, semCusto: 0,
    };
    const custo = custoPadraoDe(custos, num(r.CODPROD));
    e.qtDisponivel += num(r.QT_DISPONIVEL);
    e.qtFisico += num(r.QT_FISICO);
    if (custo.origem === 'gestao' && e.valorDisponivel !== null && e.valorFisico !== null) {
      e.valorDisponivel += num(r.QT_DISPONIVEL) * custo.valor;
      e.valorFisico += num(r.QT_FISICO) * custo.valor;
    } else if (custo.origem === 'sem') e.semCusto += 1;
    porFilial.set(codfilial, e);
  }
  return [...porFilial.values()].sort((a, b) => Number(a.codfilial) - Number(b.codfilial));
}
