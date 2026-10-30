// O painel de detalhe do produto no layout legado da spec 011 (R-117): a
// série "Compras × vendas" com projeção, os totais do rodapé, as filiais com
// excesso e a simulação de compra. Módulo puro, sem React e sem SDK — é o que
// `frontend/tests/ressuprimento-detalhe.test.mjs` exercita.
//
// Tudo aqui sai do que a tela JÁ carregou para o SKU selecionado (histórico,
// posição por filial e a linha de ressuprimento): nenhuma consulta a mais.

import { arredondarPorCaixa } from './compras.ts';
import { coberturaFuturaComCompra, nivelDeCobertura } from './ressuprimento.ts';
import type { LinhaRessuprimento, Ressuprimento } from './ressuprimento.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Linha de `sgcWintProdutoHistorico` (colunas UPPERCASE). */
export interface PontoHistorico {
  MES: string; SAIDAS: number; ENTRADAS: number; SAIDAS_PUBLICAS: number;
}

/** Um mês da série do gráfico: compras e vendas medidas, ou a projeção. */
export interface PontoSerie {
  mes: string;
  rotulo: string;
  compras: number | null;
  vendas: number | null;
  projecao: number | null;
  /** R-123: vendas desconsideradas no mês; `null` quando a série não foi pedida. */
  desconsideradas: number | null;
}

export type JanelaGrafico = 6 | 13;
/** O mockup (R-117) projeta só o mês seguinte, como a última barra do gráfico. */
export const MESES_PROJECAO = 1;

const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2026-09` → `set/26`. */
export function rotuloMes(mes: string): string {
  const [ano, m] = String(mes ?? '').split('-');
  const indice = Number(m) - 1;
  if (!ano || !(indice >= 0 && indice < 12)) return String(mes ?? '');
  return `${NOME_MES[indice]}/${ano.slice(2)}`;
}

/** Soma `n` meses a `AAAA-MM` (n pode ser negativo). */
export function somarMeses(mes: string, n: number): string {
  const [ano, m] = String(mes).split('-').map(Number);
  const total = ano * 12 + (m - 1) + n;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`;
}

/** Dias do mês `AAAA-MM`. */
export function diasDoMes(mes: string): number {
  const [ano, m] = String(mes).split('-').map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/** Os últimos `n` meses terminando no mês de `hoje`, do mais antigo ao atual. */
export function mesesAte(hoje: string, n: number): string[] {
  const atual = String(hoje).slice(0, 7);
  return Array.from({ length: n }, (_, i) => somarMeses(atual, i - (n - 1)));
}

/**
 * C-032: a série do gráfico. Mês sem movimento entra com zero (barra de altura
 * zero afirma "zero", e aqui zero é verdade); a projeção é o mês seguinte a
 * consumo diário × dias do mês, só na série própria — a última barra.
 */
export function serieComprasVendas(
  historico: PontoHistorico[],
  hoje: string,
  janela: JanelaGrafico,
  consumoDiario: number,
  desconsideradas?: Map<string, number>,
  /** R-124: a projeção do modelo escolhido, no lugar de consumo × dias do mês. */
  projecaoMes?: number | null,
): PontoSerie[] {
  const porMes = new Map((historico ?? []).map((h) => [String(h.MES).slice(0, 7), h]));
  const medidos: PontoSerie[] = mesesAte(hoje, janela).map((mes) => {
    const h = porMes.get(mes);
    return {
      mes, rotulo: rotuloMes(mes),
      compras: numero(h?.ENTRADAS),
      vendas: numero(h?.SAIDAS),
      projecao: null,
      desconsideradas: desconsideradas ? numero(desconsideradas.get(mes)) : null,
    };
  });
  const atual = String(hoje).slice(0, 7);
  const consumo = Math.max(0, numero(consumoDiario));
  const projetados: PontoSerie[] = Array.from({ length: MESES_PROJECAO }, (_, i) => {
    const mes = somarMeses(atual, i + 1);
    return {
      mes, rotulo: rotuloMes(mes),
      compras: null, vendas: null,
      projecao: Math.round(typeof projecaoMes === 'number' ? Math.max(0, projecaoMes) : consumo * diasDoMes(mes)),
      desconsideradas: null,
    };
  });
  return [...medidos, ...projetados];
}

export interface TotaisRodape {
  vendas3m: number; vendas6m: number; vendas12m: number;
  compras3m: number; compras6m: number; compras12m: number;
  projecaoMes: number;
}

/** O rodapé "3m / 6m / 12m / Projeção": somas dos últimos meses e a projeção do próximo mês. */
export function totaisDoRodape(historico: PontoHistorico[], hoje: string, consumoDiario: number, projecaoMes?: number | null): TotaisRodape {
  const porMes = new Map((historico ?? []).map((h) => [String(h.MES).slice(0, 7), h]));
  const soma = (n: number, campo: 'SAIDAS' | 'ENTRADAS') => mesesAte(hoje, n)
    .reduce((acc, mes) => acc + numero(porMes.get(mes)?.[campo]), 0);
  const proximo = somarMeses(String(hoje).slice(0, 7), 1);
  return {
    vendas3m: soma(3, 'SAIDAS'), vendas6m: soma(6, 'SAIDAS'), vendas12m: soma(12, 'SAIDAS'),
    compras3m: soma(3, 'ENTRADAS'), compras6m: soma(6, 'ENTRADAS'), compras12m: soma(12, 'ENTRADAS'),
    projecaoMes: Math.round(typeof projecaoMes === 'number' ? Math.max(0, projecaoMes) : Math.max(0, numero(consumoDiario)) * diasDoMes(proximo)),
  };
}

/** Linha de `sgcWintProdutoEstoqueFiliais` (colunas UPPERCASE). */
export interface PosicaoFilial {
  CODFILIAL: string; FILIAL: string;
  ESTOQUE_TOTAL: number; ESTOQUE_ATUAL: number; ESTOQUE_EM_TRANSITO: number;
  VENDA_3_MESES: number; DT_ULT_SAIDA: string | null;
}

export interface FilialComExcesso {
  codfilial: string; filial: string; estoque: number; coberturaDias: number | null;
}

/**
 * RN-025 / C-033: uma filial tem excesso quando o estoque disponível dela
 * cobre mais que o teto de dias (cobertura = disponível ÷ venda diária dos
 * últimos 3 meses) — ou quando tem estoque e giro nenhum (cobertura "sem
 * giro", que é excesso por definição). A filial da tela fica de fora.
 */
export function filiaisComExcesso(
  posicoes: PosicaoFilial[],
  codfilialAtual: string,
  tetoDias: number,
): FilialComExcesso[] {
  return (posicoes ?? [])
    .filter((p) => String(p.CODFILIAL) !== String(codfilialAtual) && numero(p.ESTOQUE_ATUAL) > 0)
    .map((p) => {
      const vendaDiaria = numero(p.VENDA_3_MESES) / 90;
      const coberturaDias = vendaDiaria > 0 ? numero(p.ESTOQUE_ATUAL) / vendaDiaria : null;
      return { codfilial: String(p.CODFILIAL), filial: String(p.FILIAL ?? p.CODFILIAL), estoque: numero(p.ESTOQUE_ATUAL), coberturaDias };
    })
    .filter((f) => f.coberturaDias === null || f.coberturaDias > numero(tetoDias))
    .sort((a, b) => (b.coberturaDias ?? Number.POSITIVE_INFINITY) - (a.coberturaDias ?? Number.POSITIVE_INFINITY));
}

/** O que a página carrega por SKU (3 execuções, uma vez por SKU) e o painel desenha. */
export interface DadosDoSku {
  historico: PontoHistorico[];
  compras: Record<string, unknown>[];
  filiais: PosicaoFilial[];
  pronto: boolean;
  erro: string;
}

export const DADOS_VAZIOS: DadosDoSku = { historico: [], compras: [], filiais: [], pronto: false, erro: '' };

export interface SimulacaoCompra {
  quantidade: number; caixas: number; total: number;
  coberturaFuturaDias: number | null; nivelFuturoPct: number | null;
}

/** C-034: o que acontece com a cobertura e o nível se comprar `quantidade` (arredondada à caixa). */
export function simularCompra(l: LinhaRessuprimento, quantidadeDigitada: number): SimulacaoCompra {
  const quantidade = arredondarPorCaixa(Math.max(0, numero(quantidadeDigitada)), l.unidadesPorCaixa);
  const caixas = l.unidadesPorCaixa > 1 ? quantidade / l.unidadesPorCaixa : quantidade;
  // R-128: ao custo padrão do Gestão de Custos (o mesmo do carrinho).
  const total = Math.round(quantidade * numero(l.custo?.valor) * 100) / 100;
  return {
    quantidade, caixas, total,
    coberturaFuturaDias: coberturaFuturaComCompra(l, quantidade),
    nivelFuturoPct: nivelDeCobertura({ estoqueAtual: l.estoqueAtual + l.emTransito + quantidade, estoqueMaximo: l.estoqueMaximo }),
  };
}

/* ─────────────── R-123: a janela "Análise do Produto" ─────────────── */

/** Linha de `sgcWintProdutoVendas` (colunas UPPERCASE). */
export interface VendaDoProduto {
  NUMTRANSITEM: number; DTMOV: string; QUANTIDADE: number; PRECO_VENDA: number; VALOR_TOTAL: number;
  CODCLI: number; CLIENTE: string; CODUSUR?: number; VENDEDOR?: string; PUBLICO: number;
}

/** Linha de `sgcWintProdutoUltimasCompras` (colunas UPPERCASE); o pedido casado é opcional. */
export interface CompraDoProduto {
  DT_ENTRADA: string; NUMTRANSENT: number; NUMNOTA: number; CODFILIAL: string;
  QUANTIDADE: number; PRECO_UNITARIO: number; VALOR_TOTAL: number;
  NUMPED?: number; DT_SOLICITACAO?: string; DT_PREVISAO?: string;
}

/** Uma venda desconsiderada como a página a guarda (do que VOLTOU do banco, D-03). */
export interface VendaDesconsiderada {
  numtransitem: number; codprod: number; dtmov: string; quantidade: number;
}

const NOME_MES_LONGO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** `2026-10` → `Outubro de 2026` (a pílula de mês da aba Vendas). */
export function rotuloMesLongo(mes: string): string {
  const [ano, m] = String(mes ?? '').split('-');
  const indice = Number(m) - 1;
  if (!ano || !(indice >= 0 && indice < 12)) return String(mes ?? '');
  return `${NOME_MES_LONGO[indice]} de ${ano}`;
}

export interface MesDeVendas { mes: string; rotulo: string; vendas: number; valor: number }

/** Os meses com venda na lista, do mais recente ao mais antigo, com contagem e valor. */
export function mesesDeVendas(vendas: VendaDoProduto[]): MesDeVendas[] {
  const porMes = new Map<string, MesDeVendas>();
  for (const v of vendas ?? []) {
    const mes = String(v.DTMOV ?? '').slice(0, 7);
    if (!mes) continue;
    const atual = porMes.get(mes) ?? { mes, rotulo: rotuloMesLongo(mes), vendas: 0, valor: 0 };
    atual.vendas += 1;
    atual.valor = Math.round((atual.valor + numero(v.VALOR_TOTAL)) * 100) / 100;
    porMes.set(mes, atual);
  }
  return [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

/** As vendas de um mês (`''` = todas), na ordem em que vieram. */
export function vendasDoMes(vendas: VendaDoProduto[], mes: string): VendaDoProduto[] {
  if (!mes) return vendas ?? [];
  return (vendas ?? []).filter((v) => String(v.DTMOV ?? '').slice(0, 7) === mes);
}

export interface ResumoVendas { listadas: number; quantidadeDesconsiderada: number; valorDesconsiderado: number }

/** As três métricas da aba Vendas: quantas listadas, e quanto (un. e R$) está fora da demanda. */
export function resumoDeVendas(vendas: VendaDoProduto[], desconsideradas: number[]): ResumoVendas {
  const fora = new Set((desconsideradas ?? []).map(Number));
  let quantidade = 0;
  let valor = 0;
  for (const v of vendas ?? []) {
    if (!fora.has(Number(v.NUMTRANSITEM))) continue;
    quantidade += numero(v.QUANTIDADE);
    valor += numero(v.VALOR_TOTAL);
  }
  return { listadas: (vendas ?? []).length, quantidadeDesconsiderada: quantidade, valorDesconsiderado: Math.round(valor * 100) / 100 };
}

/** As desconsideradas por mês (`AAAA-MM` → unidades), a série "Desconsideradas" do gráfico. */
export function desconsideradasPorMes(lista: Pick<VendaDesconsiderada, 'dtmov' | 'quantidade'>[]): Map<string, number> {
  const porMes = new Map<string, number>();
  for (const v of lista ?? []) {
    const mes = String(v.dtmov ?? '').slice(0, 7);
    if (!mes) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + numero(v.quantidade));
  }
  return porMes;
}

/** A série em caixas: cada valor medido dividido pelas unidades por caixa (1 decimal). `null` segue `null`. */
export function serieEmCaixas(serie: PontoSerie[], unidadesPorCaixa: number): PontoSerie[] {
  const divisor = numero(unidadesPorCaixa);
  if (!(divisor > 1)) return serie ?? [];
  const cx = (valor: number | null) => (valor === null ? null : Math.round((valor / divisor) * 10) / 10);
  return (serie ?? []).map((p) => ({
    ...p, compras: cx(p.compras), vendas: cx(p.vendas), projecao: cx(p.projecao), desconsideradas: cx(p.desconsideradas),
  }));
}

/** Abaixo disto o histórico não sustenta leitura: a janela avisa em vez de desenhar. */
export const MESES_MINIMOS_HISTORICO = 3;

/** Quantos meses do histórico tiveram saída ou entrada. */
export function mesesComMovimento(historico: PontoHistorico[]): number {
  return (historico ?? []).filter((h) => numero(h.SAIDAS) > 0 || numero(h.ENTRADAS) > 0).length;
}

export function historicoSuficiente(historico: PontoHistorico[]): boolean {
  return mesesComMovimento(historico) >= MESES_MINIMOS_HISTORICO;
}

/** A entrada chegou depois da previsão do pedido (previsão em atenção). Sem previsão, não. */
export function entradaAtrasou(compra: Pick<CompraDoProduto, 'DT_ENTRADA' | 'DT_PREVISAO'>): boolean {
  const previsao = String(compra?.DT_PREVISAO ?? '').slice(0, 10);
  const entrada = String(compra?.DT_ENTRADA ?? '').slice(0, 10);
  return previsao.length === 10 && entrada.length === 10 && entrada > previsao;
}

/** Quantas entradas o histórico mostra antes de "Ver todas". */
export const ENTRADAS_VISIVEIS = 5;

/**
 * A necessidade bruta: o que falta para o estoque máximo depois do disponível
 * e do trânsito, inteiro para cima, nunca negativa — a sugestão (RN-007) é ela
 * arredondada à caixa e zerada quando há trânsito.
 */
export function necessidade(l: Pick<Ressuprimento, 'estoqueMaximo' | 'estoqueAtual' | 'emTransito'>): number {
  return Math.max(0, Math.ceil(numero(l.estoqueMaximo) - numero(l.estoqueAtual) - numero(l.emTransito)));
}
