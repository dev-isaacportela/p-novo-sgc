// O painel de detalhe do produto no layout legado da spec 011 (R-117): a
// série "Compras × vendas" com projeção, os totais do rodapé, as filiais com
// excesso e a simulação de compra. Módulo puro, sem React e sem SDK — é o que
// `frontend/tests/ressuprimento-detalhe.test.mjs` exercita.
//
// Tudo aqui sai do que a tela JÁ carregou para o SKU selecionado (histórico,
// posição por filial e a linha de ressuprimento): nenhuma consulta a mais.

import { arredondarPorCaixa } from './compras.ts';
import { coberturaFuturaComCompra, nivelDeCobertura } from './ressuprimento.ts';
import type { LinhaRessuprimento } from './ressuprimento.ts';

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
): PontoSerie[] {
  const porMes = new Map((historico ?? []).map((h) => [String(h.MES).slice(0, 7), h]));
  const medidos: PontoSerie[] = mesesAte(hoje, janela).map((mes) => {
    const h = porMes.get(mes);
    return {
      mes, rotulo: rotuloMes(mes),
      compras: numero(h?.ENTRADAS),
      vendas: numero(h?.SAIDAS),
      projecao: null,
    };
  });
  const atual = String(hoje).slice(0, 7);
  const consumo = Math.max(0, numero(consumoDiario));
  const projetados: PontoSerie[] = Array.from({ length: MESES_PROJECAO }, (_, i) => {
    const mes = somarMeses(atual, i + 1);
    return {
      mes, rotulo: rotuloMes(mes),
      compras: null, vendas: null,
      projecao: Math.round(consumo * diasDoMes(mes)),
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
export function totaisDoRodape(historico: PontoHistorico[], hoje: string, consumoDiario: number): TotaisRodape {
  const porMes = new Map((historico ?? []).map((h) => [String(h.MES).slice(0, 7), h]));
  const soma = (n: number, campo: 'SAIDAS' | 'ENTRADAS') => mesesAte(hoje, n)
    .reduce((acc, mes) => acc + numero(porMes.get(mes)?.[campo]), 0);
  const proximo = somarMeses(String(hoje).slice(0, 7), 1);
  return {
    vendas3m: soma(3, 'SAIDAS'), vendas6m: soma(6, 'SAIDAS'), vendas12m: soma(12, 'SAIDAS'),
    compras3m: soma(3, 'ENTRADAS'), compras6m: soma(6, 'ENTRADAS'), compras12m: soma(12, 'ENTRADAS'),
    projecaoMes: Math.round(Math.max(0, numero(consumoDiario)) * diasDoMes(proximo)),
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
  const total = Math.round(quantidade * numero(l.medida.CUSTO_ULT_ENTRADA) * 100) / 100;
  return {
    quantidade, caixas, total,
    coberturaFuturaDias: coberturaFuturaComCompra(l, quantidade),
    nivelFuturoPct: nivelDeCobertura({ estoqueAtual: l.estoqueAtual + l.emTransito + quantidade, estoqueMaximo: l.estoqueMaximo }),
  };
}
