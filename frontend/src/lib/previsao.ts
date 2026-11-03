// Previsão de venda com escolha de modelo (spec 011, R-124): os modelos do
// sistema antigo — média móvel simples e ponderada, suavização exponencial,
// Holt e Holt-Winters aditivo — sobre a série de meses fechados do produto, o
// cap de outliers, os erros de um passo (MAD, MAPE, CE, tracking signal) e o
// Best Fit (o de menor MAD). Módulo puro, sem React e sem SDK: é o que
// `frontend/tests/previsao.test.mjs` exercita.
//
// Vale SÓ para o produto aberto no painel: a linha selecionada, a quantidade
// do simulador e o "adicionar ao carrinho" dele usam a sugestão projetada; as
// demais linhas e a Server Function seguem no consumo ponderado (RN-001).

import { arredondarPorCaixa } from './compras.ts';
import type { PontoHistorico } from './ressuprimento-detalhe.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (valor: number) => Math.round(valor * 100) / 100;
const media = (valores: number[]) => (valores.length === 0 ? 0 : valores.reduce((a, b) => a + b, 0) / valores.length);

export type ModeloPrevisao = 'bestfit' | 'mms' | 'mmp' | 'se' | 'holt' | 'hw';
export type ModeloCalculado = Exclude<ModeloPrevisao, 'bestfit'>;

export const MODELOS: { value: ModeloPrevisao; label: string; descricao: string }[] = [
  { value: 'bestfit', label: 'Best Fit', descricao: 'Compara os cinco modelos e usa o de menor MAD histórico' },
  { value: 'mms', label: 'Média móvel simples', descricao: 'Média dos últimos 3 meses' },
  { value: 'mmp', label: 'Média móvel ponderada', descricao: 'Últimos 3 meses com pesos 50/30/20, o recente pesa mais' },
  { value: 'se', label: 'Suavização exponencial', descricao: 'Nível suavizado por alpha, escolhido pelo menor erro' },
  { value: 'holt', label: 'Holt', descricao: 'Nível e tendência (alpha, beta), para série que sobe ou desce' },
  { value: 'hw', label: 'Holt-Winters', descricao: 'Nível, tendência e sazonalidade aditiva (alpha, beta, gamma)' },
];

export const MESES_SERIE = 12;
/** Abaixo disto (depois do cap) não há projeção: a tela volta ao consumo ponderado. */
export const PONTOS_MINIMOS = 3;
/** O tracking signal "sob controle" fica dentro de ±4. */
export const LIMITE_TS = 4;

/* ───────────── a série ───────────── */

export interface PontoPrevisao { mes: string; valor: number; original: number; ajustado: boolean }

/**
 * Até 12 meses FECHADOS (mês < mês de hoje), do mais antigo ao mais recente:
 * vendas do mês menos as desconsideradas dele, nunca abaixo de zero.
 */
export function serieFechada(
  historico: PontoHistorico[],
  hoje: string,
  desconsideradasPorMes?: Map<string, number>,
): PontoPrevisao[] {
  const atual = String(hoje ?? '').slice(0, 7);
  return (historico ?? [])
    .map((h) => ({ mes: String(h.MES ?? '').slice(0, 7), vendas: numero(h.SAIDAS) }))
    .filter((p) => p.mes.length === 7 && p.mes < atual)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-MESES_SERIE)
    .map((p) => {
      const valor = Math.max(0, p.vendas - numero(desconsideradasPorMes?.get(p.mes)));
      return { mes: p.mes, valor, original: valor, ajustado: false };
    });
}

export interface SerieAjustada { pontos: PontoPrevisao[]; media: number; sigma: number; outliersAjustados: number }

/**
 * Cap de outliers (n ≥ 4): média e desvio populacional; ponto acima de
 * média + 2σ vira a média. Conta os ajustados.
 */
export function ajustarOutliers(pontos: PontoPrevisao[]): SerieAjustada {
  const valores = (pontos ?? []).map((p) => numero(p.valor));
  const n = valores.length;
  const m = media(valores);
  const sigma = n === 0 ? 0 : Math.sqrt(valores.reduce((acc, v) => acc + (v - m) ** 2, 0) / n);
  if (n < 4 || !(sigma > 0)) {
    return { pontos: (pontos ?? []).map((p) => ({ ...p, ajustado: false })), media: round2(m), sigma: round2(sigma), outliersAjustados: 0 };
  }
  const teto = m + 2 * sigma;
  let ajustados = 0;
  const saida = (pontos ?? []).map((p) => {
    if (numero(p.valor) > teto) {
      ajustados += 1;
      return { ...p, valor: round2(m), ajustado: true };
    }
    return { ...p, ajustado: false };
  });
  return { pontos: saida, media: round2(m), sigma: round2(sigma), outliersAjustados: ajustados };
}

/* ───────────── métricas ───────────── */

export interface Metricas { mad: number; mape: number; ce: number; ts: number; sobControle: boolean }

/** MAD = Σ|e|/n; MAPE só sobre reais > 0; CE = Σe; TS = CE/MAD (0 sem MAD); sob controle ⇔ |TS| ≤ 4. */
export function metricas(erros: number[], reais: number[]): Metricas {
  const e = erros ?? [];
  const mad = e.length === 0 ? 0 : e.reduce((acc, v) => acc + Math.abs(v), 0) / e.length;
  const pares = e.map((v, i) => [v, numero(reais?.[i])]).filter(([, real]) => real > 0);
  const mape = pares.length === 0 ? 0 : (pares.reduce((acc, [v, real]) => acc + Math.abs(v) / Math.abs(real), 0) / pares.length) * 100;
  const ce = e.reduce((acc, v) => acc + v, 0);
  const ts = mad > 0 ? ce / mad : 0;
  return { mad: round2(mad), mape: round2(mape), ce: round2(ce), ts: round2(ts), sobControle: Math.abs(ts) <= LIMITE_TS };
}

/* ───────────── os modelos ───────────── */

export interface ResultadoModelo extends Metricas {
  modelo: ModeloCalculado;
  rotulo: string;
  /** A previsão do próximo mês, ≥ 0, com 2 casas — já com a projeção manual (spec 019), quando há. */
  previsao: number;
  /** Spec 019: a previsão do modelo antes do ajuste manual; ausente quando não há ajuste. */
  previsaoBase?: number;
  /** Os erros de um passo, real − previsto, na ordem da série. */
  erros: number[];
  parametros: { alpha?: number; beta?: number; gamma?: number };
  /** Holt-Winters sem meses para a sazonalidade: devolveu o Holt. */
  semSazonalidade?: boolean;
}

const janela = (n: number) => Math.min(3, Math.max(1, n - 1));
const PESOS_MMP = [0.5, 0.3, 0.2];
const ALPHAS_SE = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const GRADE_HOLT = [0.2, 0.4, 0.6, 0.8];
const GRADE_HW = [0.2, 0.4, 0.6];

function resultado(
  modelo: ModeloCalculado, rotulo: string, previsao: number, erros: number[], reais: number[],
  parametros: ResultadoModelo['parametros'] = {},
): ResultadoModelo {
  return { modelo, rotulo, previsao: Math.max(0, round2(previsao)), erros: erros.map(round2), parametros, ...metricas(erros, reais) };
}

/** MMS: média dos últimos w (w = min(3, n−1)); erros a partir de i = w. */
export function mms(s: number[]): ResultadoModelo {
  const w = janela(s.length);
  const prever = (ate: number) => media(s.slice(Math.max(0, ate - w), ate));
  const erros: number[] = [];
  const reais: number[] = [];
  for (let i = w; i < s.length; i += 1) { erros.push(s[i] - prever(i)); reais.push(s[i]); }
  return resultado('mms', 'Média móvel simples', prever(s.length), erros, reais);
}

/** MMP: pesos 0,5 / 0,3 / 0,2 do mais recente ao mais antigo, truncados a w e normalizados. */
export function mmp(s: number[]): ResultadoModelo {
  const w = janela(s.length);
  const pesos = PESOS_MMP.slice(0, w);
  const soma = pesos.reduce((a, b) => a + b, 0);
  const prever = (ate: number) => {
    const recorte = s.slice(Math.max(0, ate - w), ate).reverse();
    return recorte.reduce((acc, v, k) => acc + v * (pesos[k] ?? 0), 0) / soma;
  };
  const erros: number[] = [];
  const reais: number[] = [];
  for (let i = w; i < s.length; i += 1) { erros.push(s[i] - prever(i)); reais.push(s[i]); }
  return resultado('mmp', 'Média móvel ponderada', prever(s.length), erros, reais);
}

function seCom(s: number[], alpha: number): ResultadoModelo {
  let nivel = s[0] ?? 0;
  const erros: number[] = [];
  const reais: number[] = [];
  for (let i = 1; i < s.length; i += 1) {
    erros.push(s[i] - nivel);
    reais.push(s[i]);
    nivel = alpha * s[i] + (1 - alpha) * nivel;
  }
  return resultado('se', 'Suavização exponencial', nivel, erros, reais, { alpha });
}

/** SE: alpha de 0,1 a 0,9, o de menor MAD (empate: o primeiro). */
export function se(s: number[]): ResultadoModelo {
  return ALPHAS_SE.map((alpha) => seCom(s, alpha)).reduce((melhor, atual) => (atual.mad < melhor.mad ? atual : melhor));
}

function holtCom(s: number[], alpha: number, beta: number): ResultadoModelo {
  let nivel = s[0] ?? 0;
  let tendencia = (s[1] ?? s[0] ?? 0) - (s[0] ?? 0);
  const erros: number[] = [];
  const reais: number[] = [];
  for (let i = 1; i < s.length; i += 1) {
    const prev = nivel + tendencia;
    erros.push(s[i] - prev);
    reais.push(s[i]);
    const novoNivel = alpha * s[i] + (1 - alpha) * prev;
    tendencia = beta * (novoNivel - nivel) + (1 - beta) * tendencia;
    nivel = novoNivel;
  }
  return resultado('holt', 'Holt', nivel + tendencia, erros, reais, { alpha, beta });
}

/** Holt: alpha e beta em {0,2; 0,4; 0,6; 0,8}, o par de menor MAD. */
export function holt(s: number[]): ResultadoModelo {
  let melhor: ResultadoModelo | null = null;
  for (const alpha of GRADE_HOLT) {
    for (const beta of GRADE_HOLT) {
      const atual = holtCom(s, alpha, beta);
      if (!melhor || atual.mad < melhor.mad) melhor = atual;
    }
  }
  return melhor as ResultadoModelo;
}

/** A sazonalidade do Holt-Winters: 6 meses com 12 pontos, senão 4. */
export function periodoSazonal(n: number): number {
  return n >= 12 ? 6 : 4;
}

function hwCom(s: number[], m: number, alpha: number, beta: number, gamma: number): ResultadoModelo {
  let nivel = media(s.slice(0, m));
  let tendencia = (media(s.slice(m, 2 * m)) - nivel) / m;
  const sazonal = s.slice(0, m).map((v) => v - nivel);
  const erros: number[] = [];
  const reais: number[] = [];
  for (let i = m; i < s.length; i += 1) {
    const k = i % m;
    const prev = nivel + tendencia + sazonal[k];
    erros.push(s[i] - prev);
    reais.push(s[i]);
    const novoNivel = alpha * (s[i] - sazonal[k]) + (1 - alpha) * (nivel + tendencia);
    tendencia = beta * (novoNivel - nivel) + (1 - beta) * tendencia;
    sazonal[k] = gamma * (s[i] - novoNivel) + (1 - gamma) * sazonal[k];
    nivel = novoNivel;
  }
  return resultado('hw', 'Holt-Winters', nivel + tendencia + sazonal[s.length % m], erros, reais, { alpha, beta, gamma });
}

/** Holt-Winters aditivo; com menos de dois períodos, o Holt rotulado "sem sazonalidade". */
export function holtWinters(s: number[]): ResultadoModelo {
  const m = periodoSazonal(s.length);
  if (s.length < 2 * m) {
    return { ...holt(s), modelo: 'hw', rotulo: 'Holt-Winters (sem sazonalidade)', semSazonalidade: true };
  }
  let melhor: ResultadoModelo | null = null;
  for (const alpha of GRADE_HW) {
    for (const beta of GRADE_HW) {
      for (const gamma of GRADE_HW) {
        const atual = hwCom(s, m, alpha, beta, gamma);
        if (!melhor || atual.mad < melhor.mad) melhor = atual;
      }
    }
  }
  return melhor as ResultadoModelo;
}

/* ───────────── a previsão do produto ───────────── */

export interface Previsao {
  serie: SerieAjustada;
  /** Os cinco modelos, na ordem do seletor; vazio quando a série não sustenta projeção. */
  modelos: ResultadoModelo[];
  /** O vencedor do Best Fit (menor MAD; empate: o primeiro), ou `null`. */
  bestFit: ModeloCalculado | null;
  suficiente: boolean;
  medias: { m3: number; m6: number; m12: number };
}

/** As médias dos últimos 3, 6 e 12 pontos da série ajustada (RN-CI-36 do legado). */
export function mediasDaSerie(valores: number[]): Previsao['medias'] {
  const ultimos = (n: number) => round2(media((valores ?? []).slice(-n)));
  return { m3: ultimos(3), m6: ultimos(6), m12: ultimos(12) };
}

/**
 * Série fechada → cap → os cinco modelos → Best Fit. Spec 019 (RN-003): a
 * série e os erros são da venda real — o Best Fit não muda —, e só a previsão
 * do próximo mês de cada modelo é multiplicada pelo fator da projeção manual.
 */
export function preverVendas(pontos: PontoPrevisao[], fatorProjecao = 1): Previsao {
  const serie = ajustarOutliers(pontos);
  const valores = serie.pontos.map((p) => p.valor);
  const medias = mediasDaSerie(valores);
  if (valores.length < PONTOS_MINIMOS) return { serie, modelos: [], bestFit: null, suficiente: false, medias };
  const ajustados = [mms(valores), mmp(valores), se(valores), holt(valores), holtWinters(valores)];
  const melhor = ajustados.reduce((acc, atual) => (atual.mad < acc.mad ? atual : acc));
  const fator = numero(fatorProjecao) > 0 ? numero(fatorProjecao) : 1;
  const modelos = fator === 1 ? ajustados : ajustados.map((m) => ({ ...m, previsaoBase: m.previsao, previsao: round2(m.previsao * fator) }));
  return { serie, modelos, bestFit: melhor.modelo, suficiente: true, medias };
}

/** O resultado que a escolha aponta — `bestfit` resolve para o vencedor. */
export function modeloEscolhido(previsao: Previsao, escolha: ModeloPrevisao): ResultadoModelo | null {
  if (!previsao?.suficiente) return null;
  const alvo = escolha === 'bestfit' ? previsao.bestFit : escolha;
  return previsao.modelos.find((m) => m.modelo === alvo) ?? null;
}

/* ───────────── como entra na sugestão ───────────── */

export interface SugestaoProjetada {
  demandaDiaria: number;
  /** Arredondada à caixa cheia: demanda × cobertura − estoque − trânsito, nunca negativa. */
  sugestao: number;
  /** Demanda × lead time + estoque de segurança. */
  alvoLeadTime: number;
}

export function sugestaoProjetada(
  previsaoMensal: number,
  l: { coberturaDias: number; estoqueAtual: number; emTransito: number; unidadesPorCaixa: number; leadTimeDias: number; estoqueSeguranca: number },
): SugestaoProjetada {
  const demandaDiaria = Math.max(0, numero(previsaoMensal)) / 30;
  const bruta = Math.max(0, Math.ceil(demandaDiaria * numero(l.coberturaDias) - numero(l.estoqueAtual) - numero(l.emTransito)));
  return {
    demandaDiaria: Math.round(demandaDiaria * 10000) / 10000,
    sugestao: arredondarPorCaixa(bruta, numero(l.unidadesPorCaixa)),
    alvoLeadTime: round2(demandaDiaria * numero(l.leadTimeDias) + numero(l.estoqueSeguranca)),
  };
}

/** Os parâmetros escolhidos, para a tela ("α 0,4 · β 0,2"). */
export function textoDosParametros(r: ResultadoModelo | null): string {
  if (!r) return '';
  const partes: string[] = [];
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (r.parametros.alpha !== undefined) partes.push(`α ${fmt(r.parametros.alpha)}`);
  if (r.parametros.beta !== undefined) partes.push(`β ${fmt(r.parametros.beta)}`);
  if (r.parametros.gamma !== undefined) partes.push(`γ ${fmt(r.parametros.gamma)}`);
  return partes.join(' · ');
}

/**
 * O resumo de uma linha da seção recolhida (R-126): "Best Fit → Suavização
 * exponencial · 616 un./mês · sugestão 312 un. (39 cx) · TS sob controle".
 * Sem histórico, "…"; sem meses suficientes, diz isso.
 */
export function resumoVendaFutura({ previsao, modelo, projetada, unidadesPorCaixa }: {
  previsao: Previsao | null; modelo: ModeloPrevisao; projetada: SugestaoProjetada | null; unidadesPorCaixa: number;
}): string {
  if (!previsao) return '…';
  const r = modeloEscolhido(previsao, modelo);
  if (!previsao.suficiente || !r) return 'sem meses fechados suficientes · segue o consumo ponderado';
  const nome = modelo === 'bestfit' ? `Best Fit → ${r.rotulo}` : r.rotulo;
  const un = Math.round(numero(projetada?.sugestao)).toLocaleString('pt-BR');
  const cx = numero(unidadesPorCaixa) > 1 && projetada ? ` (${(projetada.sugestao / unidadesPorCaixa).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cx)` : '';
  const sugestao = projetada ? `sugestão ${un} un.${cx}` : 'sem sugestão projetada';
  return `${nome} · ${Math.round(r.previsao).toLocaleString('pt-BR')} un./mês · ${sugestao} · TS ${r.sobControle ? 'sob controle' : 'fora de controle'}`;
}
