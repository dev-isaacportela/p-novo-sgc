// Oportunidades de compra com custo especial (spec 011, R-125): as políticas
// de preço especial do Gestão de Custos cruzadas com a venda de cada cliente
// no período — a oportunidade por produto × cliente (RN-032), a sugestão
// segura por tabela para o produto aberto (RN-033), o agrupamento por
// política + custo e a distribuição da quantidade simulada entre as tabelas
// e a compra padrão (RN-034). Módulo puro, sem React e sem SDK — é o que
// `frontend/tests/custo-especial.test.mjs` exercita.

import { arredondarPorCaixa } from './compras.ts';
import type { PontoPrevisao } from './previsao.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (valor: number) => Math.round(valor * 100) / 100;
const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));
const media = (valores: number[]) => (valores.length === 0 ? 0 : valores.reduce((a, b) => a + b, 0) / valores.length);
const mediana = (valores: number[]) => {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
};

/** Linha de `sgcCustoEspeciaisProdutos` (UPPERCASE). CODCLI 0 = política para qualquer cliente. */
export interface CustoEspecial {
  CODPROD: number; CODCLI: number; CUSTO_ESPECIAL: number; VARIACAO_PERCENTUAL: number;
  POLITICA_ID: number; POLITICA_NOME: string; DATA_FIM: string | null;
}

/** Linha de `sgcWintVendasClientesProdutos` (UPPERCASE). */
export interface VendaCliente { CODPROD: number; CODCLI: number; CLIENTE: string; VENDA_CLIENTE_PERIODO: number }

export type Risco = 'seguro' | 'moderado' | 'arriscado' | 'monitorar';
export const ROTULO_RISCO: Record<Risco, string> = { seguro: 'Seguro', moderado: 'Moderado', arriscado: 'Arriscado', monitorar: 'Monitorar' };
const ORDEM_RISCO: Record<Risco, number> = { seguro: 0, monitorar: 1, moderado: 2, arriscado: 3 };
export const piorRisco = (a: Risco, b: Risco): Risco => (ORDEM_RISCO[a] >= ORDEM_RISCO[b] ? a : b);

export const COBERTURA_SEGURA_MAX = 45;
export const COBERTURA_PADRAO = 30;

/* ───────────── RN-032: a oportunidade por produto × cliente ───────────── */

export interface Oportunidade {
  codprod: number; codcli: number; cliente: string;
  politicaId: number; politicaNome: string; dataFim: string;
  custoEspecial: number; custoAtual: number; economiaUnit: number;
  vendaCliente: number; projecaoCliente: number;
  /** min(sugestão base, projeção do cliente). */
  qs: number;
  risco: Risco; ganho: number;
}

export interface ItemParaOportunidade {
  codprod: number; custoAtual: number; custoUltimaEntrada: number; sugerida: number; coberturaDias: number;
}

/**
 * RN-032: exige cliente, venda do cliente no período, custo especial e economia
 * unitária (custo atual, ou o da última entrada, menos o especial). A projeção
 * do cliente cobre `clamp(cobertura, 1, 45)` dias da venda diária dele.
 */
export function oportunidadesDoItem(
  item: ItemParaOportunidade,
  custos: CustoEspecial[],
  vendas: VendaCliente[],
  diasPeriodo: number,
): Oportunidade[] {
  const custoAtual = numero(item.custoAtual) > 0 ? numero(item.custoAtual) : numero(item.custoUltimaEntrada);
  const cobertura = clamp(numero(item.coberturaDias) || COBERTURA_PADRAO, 1, COBERTURA_SEGURA_MAX);
  const dias = Math.max(1, numero(diasPeriodo));
  const vendasDoProduto = (vendas ?? []).filter((v) => numero(v.CODPROD) === numero(item.codprod) && numero(v.CODCLI) > 0 && numero(v.VENDA_CLIENTE_PERIODO) > 0);
  const saida: Oportunidade[] = [];
  for (const custo of (custos ?? []).filter((c) => numero(c.CODPROD) === numero(item.codprod) && numero(c.CUSTO_ESPECIAL) > 0)) {
    const economiaUnit = Math.max(0, custoAtual - numero(custo.CUSTO_ESPECIAL));
    if (economiaUnit <= 0) continue;
    // Política de cliente certo: só a venda dele; política aberta (CODCLI 0): cada cliente que comprou.
    const alvo = numero(custo.CODCLI) > 0 ? vendasDoProduto.filter((v) => numero(v.CODCLI) === numero(custo.CODCLI)) : vendasDoProduto;
    for (const venda of alvo) {
      const vendaCliente = numero(venda.VENDA_CLIENTE_PERIODO);
      const projecaoCliente = Math.ceil((vendaCliente / dias) * cobertura);
      const qs = Math.max(0, Math.min(numero(item.sugerida), projecaoCliente));
      const risco: Risco = qs <= 0 ? 'monitorar' : vendaCliente >= 2 * qs ? 'seguro' : 'moderado';
      saida.push({
        codprod: numero(item.codprod), codcli: numero(venda.CODCLI), cliente: String(venda.CLIENTE ?? ''),
        politicaId: numero(custo.POLITICA_ID), politicaNome: String(custo.POLITICA_NOME ?? ''), dataFim: String(custo.DATA_FIM ?? '').slice(0, 10),
        custoEspecial: numero(custo.CUSTO_ESPECIAL), custoAtual, economiaUnit: round2(economiaUnit),
        vendaCliente, projecaoCliente, qs, risco, ganho: round2(qs * economiaUnit),
      });
    }
  }
  return saida.sort((a, b) => b.ganho - a.ganho || a.codcli - b.codcli);
}

/** O selo da linha: "Especial N un." quando há quantidade segura; senão "Especial N tabela(s)". */
export function seloEspecial(oportunidades: Oportunidade[]): { texto: string; tone: 'accent' | 'attention' } | null {
  const lista = oportunidades ?? [];
  if (lista.length === 0) return null;
  const unidades = lista.reduce((soma, o) => soma + o.qs, 0);
  if (unidades > 0) return { texto: `Especial ${unidades.toLocaleString('pt-BR')} un.`, tone: 'accent' };
  const tabelas = new Set(lista.map((o) => `${o.politicaId}|${o.custoEspecial}`)).size;
  return { texto: `Especial ${tabelas} ${tabelas === 1 ? 'tabela' : 'tabelas'}`, tone: 'attention' };
}

/* ───────────── RN-033: a sugestão segura por tabela no produto aberto ───────────── */

export interface ContextoSku {
  /** A quantidade simulada do painel (já em unidades). */
  quantidade: number;
  /** A previsão do modelo escolhido (R-124), ou 0 quando não há. */
  projecaoMensal: number;
  coberturaDias: number;
  consumoDiario: number;
  unidadesPorCaixa: number;
  /** Os meses fechados do SKU, do mais antigo ao mais recente (a série da previsão). */
  serie: Pick<PontoPrevisao, 'mes' | 'valor'>[];
}

export type LimitadoPor = 'ambos' | 'cliente' | 'sku';
export const ROTULO_LIMITADO: Record<LimitadoPor, string> = {
  ambos: 'menor entre histórico do cliente e comportamento recente do SKU',
  cliente: 'histórico mensal do cliente',
  sku: 'comportamento recente do SKU',
};

export interface SugestaoCliente extends Oportunidade {
  share: number;
  mediaMensal: number;
  capCliente: number;
  base: number;
  teto: number;
  projMensal: number;
  /** A quantidade segura, à caixa. */
  seguro: number;
  crescimento: number;
  riscoTabela: Risco;
  limitadoPor: LimitadoPor;
  /** As vendas mensais do cliente (venda do SKU × participação), para o gráfico. */
  mensais: { mes: string; valor: number }[];
}

/** O cap do comportamento recente do SKU: mediana dos 6 últimos meses com venda, até 25 % acima dela, nunca acima do pico. */
export function capRecenteSku(serie: ContextoSku['serie']): number {
  const comVenda = (serie ?? []).map((p) => numero(p.valor)).filter((v) => v > 0).slice(-6);
  if (comVenda.length === 0) return 0;
  const med = mediana(comVenda);
  const pico = Math.max(...comVenda);
  if (med <= 0) return pico;
  return Math.min(pico > 0 ? pico : med, med * 1.25);
}

export function sugestaoPorCliente(o: Oportunidade, sku: ContextoSku): SugestaoCliente {
  const fatorCobertura = clamp(numero(sku.coberturaDias) || COBERTURA_PADRAO, 1, COBERTURA_SEGURA_MAX) / 30;
  const vendaMensalSku = numero(sku.consumoDiario) * 30;
  const capSku = capRecenteSku(sku.serie);
  const fatorPrevisao = numero(sku.projecaoMensal) > 0 && vendaMensalSku > 0 ? numero(sku.projecaoMensal) / vendaMensalSku : 1;

  const qtdHistSegura = o.projecaoCliente;
  const mensalPeriodo = qtdHistSegura / fatorCobertura;

  const meses = (sku.serie ?? []).filter((p) => numero(p.valor) > 0).slice(-12);
  const totalMeses = meses.reduce((soma, p) => soma + numero(p.valor), 0);
  let share = totalMeses > 0 ? Math.min(1, o.vendaCliente / totalMeses) : 0;
  const mensais = meses.map((p) => ({ mes: p.mes, valor: round2(numero(p.valor) * share) }));
  const valores = mensais.map((m) => m.valor);
  const mediaMensal = media(valores);
  const capCliente = valores.length > 0 ? Math.min(Math.max(...valores), Math.max(mediaMensal, mediana(valores) * 1.25)) : 0;

  const base = mediaMensal > 0 ? mediaMensal : mensalPeriodo;
  if (!(share > 0)) share = vendaMensalSku > 0 ? Math.min(1, mensalPeriodo / vendaMensalSku) : 0;
  const tetoCliente = capCliente > 0 ? capCliente : base * 1.05;
  const tetoSku = capSku > 0 && share > 0 ? capSku * share : tetoCliente;
  const teto = Math.min(tetoCliente || tetoSku, tetoSku || tetoCliente);
  const projMensal = Math.ceil(Math.min(base * fatorPrevisao, teto || base * fatorPrevisao));
  const seguro = arredondarPorCaixa(Math.ceil(projMensal * fatorCobertura), numero(sku.unidadesPorCaixa));
  const crescimento = base > 0 ? projMensal / base : 1;
  const riscoTabela: Risco = crescimento <= 1 && seguro <= qtdHistSegura ? 'seguro' : crescimento <= 1.05 ? 'moderado' : 'arriscado';
  const limitadoPor: LimitadoPor = capCliente > 0 && capSku > 0 && share > 0 ? 'ambos' : capCliente > 0 ? 'cliente' : 'sku';
  return {
    ...o, share: round2(share), mediaMensal: round2(mediaMensal), capCliente: round2(capCliente), base: round2(base),
    teto: round2(teto), projMensal, seguro, crescimento: round2(crescimento), riscoTabela, limitadoPor, mensais,
  };
}

/* ───────────── RN-034: as tabelas e a distribuição da quantidade ───────────── */

export interface TabelaEspecial {
  chave: string;
  politicaId: number; politicaNome: string; custoEspecial: number; economiaUnit: number; dataFim: string;
  clientes: SugestaoCliente[];
  seguro: number;
  ganhoPotencial: number;
  risco: Risco;
  limitadoPor: LimitadoPor;
  /** O que da quantidade simulada vai para esta tabela, e o ganho disso. */
  quantidadeComprar: number;
  ganhoEstimado: number;
}

export interface PlanoEspecial {
  tabelas: TabelaEspecial[];
  comprarPadrao: number;
  especialTotal: number;
  ganhoEstimado: number;
}

export const chaveDaTabela = (politicaId: number, custo: number) => `${numero(politicaId)}-${numero(custo)}`;

/**
 * Agrupa por política + custo (soma dos seguros e do ganho potencial, pior
 * risco, menor validade), fica com as tabelas de seguro > 0 (maior economia,
 * depois maior seguro) e distribui a quantidade simulada: cada tabela recebe
 * min(restante, seguro); o que sobra é compra padrão.
 */
export function planoEspecial(sugestoes: SugestaoCliente[], quantidade: number): PlanoEspecial {
  const grupos = new Map<string, TabelaEspecial>();
  for (const s of sugestoes ?? []) {
    const chave = chaveDaTabela(s.politicaId, s.custoEspecial);
    const grupo = grupos.get(chave) ?? {
      chave, politicaId: s.politicaId, politicaNome: s.politicaNome, custoEspecial: s.custoEspecial, economiaUnit: s.economiaUnit,
      dataFim: s.dataFim, clientes: [], seguro: 0, ganhoPotencial: 0, risco: 'seguro' as Risco, limitadoPor: s.limitadoPor,
      quantidadeComprar: 0, ganhoEstimado: 0,
    };
    grupo.clientes.push(s);
    grupo.seguro += s.seguro;
    grupo.ganhoPotencial = round2(grupo.ganhoPotencial + s.seguro * s.economiaUnit);
    grupo.risco = piorRisco(grupo.risco, s.riscoTabela);
    if (s.dataFim && (!grupo.dataFim || s.dataFim < grupo.dataFim)) grupo.dataFim = s.dataFim;
    if (s.limitadoPor !== grupo.limitadoPor) grupo.limitadoPor = 'ambos';
    grupos.set(chave, grupo);
  }
  const tabelas = [...grupos.values()]
    .filter((t) => t.seguro > 0)
    .sort((a, b) => b.economiaUnit - a.economiaUnit || b.seguro - a.seguro);
  let restante = Math.max(0, numero(quantidade));
  for (const t of tabelas) {
    t.quantidadeComprar = Math.min(restante, t.seguro);
    t.ganhoEstimado = round2(t.quantidadeComprar * t.economiaUnit);
    restante -= t.quantidadeComprar;
  }
  const especialTotal = tabelas.reduce((soma, t) => soma + t.quantidadeComprar, 0);
  return {
    tabelas, comprarPadrao: restante, especialTotal,
    ganhoEstimado: round2(tabelas.reduce((soma, t) => soma + t.ganhoEstimado, 0)),
  };
}

/** O resumo da seção: "N tabela(s) · ganho estimado R$ X" é montado pela tela com isto. */
export function resumoDoPlano(plano: PlanoEspecial): { tabelas: number; ganho: number } {
  return { tabelas: plano?.tabelas.length ?? 0, ganho: plano?.ganhoEstimado ?? 0 };
}

/** A chave de uma linha especial no carrinho (R-125). */
export const chaveEspecial = (codprod: number, codfilial: string, politicaId: number, custo: number) =>
  `${numero(codprod)}-${String(codfilial)}-especial-${numero(politicaId)}-${numero(custo)}`;

/** Lotes de códigos para as consultas (o literal do Oracle tem teto de 4000 caracteres). */
export function lotesDeCodigos(codprods: number[], tamanho = 500): string[] {
  const lista = [...new Set((codprods ?? []).map(numero).filter((n) => n > 0))];
  const lotes: string[] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho).join(','));
  return lotes;
}

/* ───────────── as abas do card do gráfico (um gráfico por vez) ───────────── */

export type AbaGrafico = 'vendas' | 'especial';

/** A aba "Preço especial" só existe quando o produto tem oportunidade. */
export function temAbaEspecial(sugestoes: Pick<SugestaoCliente, 'seguro'>[]): boolean {
  return (sugestoes ?? []).length > 0;
}

/**
 * C-048 (decisão do usuário, "Sim, abrir expandidas"): escolher a aba "Preço
 * especial" abre a seção "Oportunidade com preço especial" já expandida; as
 * demais seções seguem recolhidas (R-126) e trocar de produto volta tudo ao padrão.
 */
export function secaoEspecialAberta(aba: AbaGrafico): boolean {
  return aba === 'especial';
}

/** A aba que vale: a escolhida, ou "Compras × vendas" quando a especial não existe. O padrão é "vendas". */
export function abaDoGrafico(escolhida: AbaGrafico, sugestoes: Pick<SugestaoCliente, 'seguro'>[]): AbaGrafico {
  return escolhida === 'especial' && temAbaEspecial(sugestoes) ? 'especial' : 'vendas';
}
