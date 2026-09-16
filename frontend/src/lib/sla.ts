// Spec 009 — a régua de prazo DA TELA: o espelho declarado do `CASE` que
// `backend/add-012-indicadores.mjs` roda no servidor (RNF-004/RN-016).
//
// Por que existir duas vezes (D-010): o pedido expandido da aba Pedidos desenha
// as três etapas a partir dos marcos que `sgcSlaPedidosListar` JÁ devolveu —
// sem gastar execução nova. As colunas classificadas que o servidor manda
// continuam sendo a fonte dos KPIs, do filtro `soVencidos` e da ordenação; o
// teste RN-016 do smoke exige que as duas concordem em TODAS as linhas da
// listagem, que é o mesmo remédio do teste de 500 combinações da 002.
//
// Dia útil não é reimplementado aqui: vem de `lib/dias-uteis.ts` (R-025), o
// gêmeo puro de `backend/lib/dias-uteis.mjs`.

import { diasUteisEntre } from './dias-uteis.ts';
import { fmtData, hojeIso } from './formato.ts';

export type StatusEtapa =
  | 'ok' | 'estourou' | 'andamento' | 'atencao' | 'vencida' | 'nao_iniciada' | 'sem_meta';
export type StatusSla =
  | 'atrasado_compras' | 'atrasado_fornecedor' | 'atencao' | 'no_prazo' | 'concluido';
export type StatusAgenda =
  | 'no_planejado' | 'enviada_com_atraso' | 'pendente_atrasada' | 'pendente' | 'sem_agenda';

export type Tom = 'live' | 'attention' | 'alert' | 'off';

export interface MarcosEtapa {
  /** Marco de início; vazio = etapa não iniciada. */
  inicio: string;
  /** Marco de fim real; vazio = etapa aberta. */
  fimReal: string;
  /** Meta do fornecedor em dias; 0 = sem meta (só acontece na Entrega, RN-004). */
  meta: number;
  /** Só a Entrega conta em corridos, e só quando o cadastro pede (RN-003). */
  tipo?: 'uteis' | 'corridos';
  concluido?: boolean;
  dtConclusao?: string;
  hoje?: string;
}

const diasCorridos = (inicio: string, fim: string) => Math.round(
  (Date.UTC(...(fim.split('-').map(Number) as [number, number, number]))
    - Date.UTC(...(inicio.split('-').map(Number) as [number, number, number]))) / 86400000,
);

/**
 * RN-001 — enquanto o marco de fim não existe, a etapa é medida ATÉ HOJE; se o
 * pedido foi concluído sem que ela fechasse, até a conclusão, nunca até hoje.
 * `null` quando a etapa não começou.
 */
export function diasDaEtapa(m: MarcosEtapa): number | null {
  if (!m.inicio) return null;
  const hoje = m.hoje || hojeIso();
  const fim = m.fimReal || (m.concluido && m.dtConclusao ? m.dtConclusao : hoje);
  const dias = m.tipo === 'corridos' ? diasCorridos(m.inicio, fim) : diasUteisEntre(m.inicio, fim);
  return Math.max(0, dias);
}

/** RN-002 — os sete estados, na mesma ordem do `CASE` do servidor. */
export function classificarEtapa(m: MarcosEtapa): StatusEtapa {
  if (!m.inicio) return 'nao_iniciada';
  if (!m.meta) return 'sem_meta';
  const dias = diasDaEtapa(m) ?? 0;
  if (m.fimReal || m.concluido) return dias <= m.meta ? 'ok' : 'estourou';
  if (dias > m.meta) return 'vencida';
  if (dias === m.meta) return 'atencao';
  return 'andamento';
}

/** RN-005 — a precedência, nesta ordem. */
export function slaDoPedido(
  analise: StatusEtapa, faturamento: StatusEtapa, entrega: StatusEtapa, concluido: boolean,
): StatusSla {
  if (analise === 'vencida') return 'atrasado_compras';
  if (faturamento === 'vencida' || entrega === 'vencida') return 'atrasado_fornecedor';
  if (concluido) return 'concluido';
  if (analise === 'atencao' || faturamento === 'atencao' || entrega === 'atencao') return 'atencao';
  return 'no_prazo';
}

/**
 * RN-006 — média das etapas INICIADAS e COM meta. Etapa não iniciada
 * (`dias === null`) ou sem meta (`meta === 0`) fica fora da média; pedido sem
 * nenhuma etapa medida tem nota 0. `Math.max(dias, 1)` é o `GREATEST` da SQL:
 * etapa de 0 dia não divide por zero.
 */
export function notaDoPedido(etapas: { dias: number | null; meta: number }[]): number {
  const medidas = etapas.filter((e) => e.dias !== null && e.meta > 0);
  if (medidas.length === 0) return 0;
  const soma = medidas.reduce(
    (acc, e) => acc + Math.min(100, Math.round((100 * e.meta) / Math.max(e.dias as number, 1))),
    0,
  );
  return Math.round(soma / medidas.length);
}

/* ─────────────── rótulos e tons (§9.4: estado NUNCA só por cor) ─────────────── */

const ROTULO_ETAPA: Record<string, string> = {
  ok: 'No prazo',
  estourou: 'Concluída com atraso',
  andamento: 'Em andamento',
  atencao: 'Vence hoje',
  vencida: 'Prazo vencido',
  nao_iniciada: 'Não iniciada',
  sem_meta: 'Sem meta',
};
const TOM_ETAPA: Record<string, Tom> = {
  ok: 'live', estourou: 'alert', andamento: 'live', atencao: 'attention',
  vencida: 'alert', nao_iniciada: 'off', sem_meta: 'off',
};
const ROTULO_SLA: Record<string, string> = {
  atrasado_compras: 'Atrasado (compras)',
  atrasado_fornecedor: 'Atrasado (fornecedor)',
  atencao: 'Atenção',
  no_prazo: 'No prazo',
  concluido: 'Concluído',
};
const TOM_SLA: Record<string, Tom> = {
  atrasado_compras: 'alert', atrasado_fornecedor: 'alert',
  atencao: 'attention', no_prazo: 'live', concluido: 'live',
};
const ROTULO_AGENDA: Record<string, string> = {
  no_planejado: 'Na data planejada',
  enviada_com_atraso: 'Enviado com atraso',
  pendente_atrasada: 'Pendente e atrasada',
  pendente: 'Dentro do planejado',
  sem_agenda: 'Sem agenda',
};
const TOM_AGENDA: Record<string, Tom> = {
  no_planejado: 'live', enviada_com_atraso: 'alert',
  pendente_atrasada: 'alert', pendente: 'live', sem_agenda: 'off',
};

/** RN-002: estado desconhecido cai em "Sem estado" e tom `off`, sem lançar. */
export const rotuloEtapa = (s: string): string => ROTULO_ETAPA[s] ?? 'Sem estado';
export const tomEtapa = (s: string): Tom => TOM_ETAPA[s] ?? 'off';
export const rotuloSla = (s: string): string => ROTULO_SLA[s] ?? 'Sem estado';
export const tomSla = (s: string): Tom => TOM_SLA[s] ?? 'off';
export const rotuloAgenda = (s: string): string => ROTULO_AGENDA[s] ?? 'Sem estado';
export const tomAgenda = (s: string): Tom => TOM_AGENDA[s] ?? 'off';

/** Consumo da meta em 0–100, saturado: a barra nunca passa da largura. */
export function percentualDaMeta(dias: number | null, meta: number): number {
  if (dias === null || meta <= 0) return 0;
  return Math.min(100, Math.round((dias / meta) * 100));
}

/** §12.4: a barra vem SEMPRE com o rótulo escrito — "4 / 5 dias úteis". */
export function rotuloConsumo(dias: number | null, meta: number, tipo: 'uteis' | 'corridos' = 'uteis'): string {
  const unidade = tipo === 'corridos' ? 'dias corridos' : 'dias úteis';
  if (meta <= 0) return 'sem meta';
  if (dias === null) return `não iniciada · meta ${meta} ${unidade}`;
  return `${dias} / ${meta} ${unidade}`;
}

/** Faixa da nota: ≥ 90 verde, ≥ 60 atenção, o resto alerta; sem nota, `off`. */
export function faixaDoScore(score: number | null): Tom {
  if (score === null || score === undefined) return 'off';
  if (score >= 90) return 'live';
  if (score >= 60) return 'attention';
  return 'alert';
}

/* ─────────────── a linha que `sgcSlaPedidosListar` devolve ─────────────── */

export interface LinhaSla {
  CARD_ID: number; TITULO: string; FASE_CHAVE: string; FASE_NOME: string; CONCLUIDO: number;
  CODFORNEC: number; FORNECEDOR: string; CODFILIAL: string; FILIAL: string; NUMPED_WINTHOR: string;
  VL_TOTAL: number; PERC_FATURADO: number; QTD_NFS: number;
  DT_CRIACAO: string; DT_ENVIO: string; DT_PRIMEIRA_NF: string; DT_ENTREGA: string;
  DT_CONCLUSAO: string; DT_AGENDA: string;
  DIAS_ANALISE: number | null; META_ANALISE_DIAS: number; STATUS_ANALISE: StatusEtapa;
  DIAS_FATURAMENTO: number | null; META_FATURAMENTO_DIAS: number; STATUS_FATURAMENTO: StatusEtapa;
  DIAS_ENTREGA: number | null; META_ENTREGA_DIAS: number; META_ENTREGA_TIPO: 'uteis' | 'corridos';
  STATUS_ENTREGA: StatusEtapa;
  STATUS_AGENDA: StatusAgenda; DIAS_ATRASO_AGENDA: number | null;
  SLA_STATUS: StatusSla; SLA_SCORE: number | null;
}

/**
 * Os marcos de uma linha da listagem, do jeito que `classificarEtapa` os lê —
 * é esta função que liga a régua da tela ao que o servidor mandou (RN-016).
 */
export function marcosDaLinha(linha: LinhaSla, etapa: 'analise' | 'faturamento' | 'entrega', hoje: string): MarcosEtapa {
  const comum = {
    concluido: Number(linha.CONCLUIDO) === 1,
    dtConclusao: linha.DT_CONCLUSAO || '',
    hoje,
  };
  if (etapa === 'analise') {
    return { inicio: linha.DT_CRIACAO || '', fimReal: linha.DT_ENVIO || '', meta: Number(linha.META_ANALISE_DIAS || 0), tipo: 'uteis', ...comum };
  }
  if (etapa === 'faturamento') {
    return { inicio: linha.DT_ENVIO || '', fimReal: linha.DT_PRIMEIRA_NF || '', meta: Number(linha.META_FATURAMENTO_DIAS || 0), tipo: 'uteis', ...comum };
  }
  return {
    inicio: linha.DT_PRIMEIRA_NF || '', fimReal: linha.DT_ENTREGA || '',
    meta: Number(linha.META_ENTREGA_DIAS || 0),
    tipo: linha.META_ENTREGA_TIPO === 'corridos' ? 'corridos' : 'uteis',
    ...comum,
  };
}

/**
 * CSV da lista de prazos. D-013 decidiu que NENHUMA aba de `/analises` exporta
 * (o CSV é do construtor de relatórios), então estas duas ficam disponíveis
 * para o integrador ligar o botão se a decisão mudar — a régua, não a tela.
 */
export const COLUNAS_CSV_SLA = [
  'Pedido', 'Título', 'Fase', 'Fornecedor', 'Filial', 'Criado em', 'Enviado em',
  'Dias análise', 'Meta análise', 'Estado análise',
  'Dias faturamento', 'Meta faturamento', 'Estado faturamento',
  'Dias entrega', 'Meta entrega', 'Estado entrega',
  'Agenda', 'Situação', 'Nota',
];

export function linhasCsvSla(linhas: LinhaSla[]): (string | number)[][] {
  return linhas.map((l) => [
    l.NUMPED_WINTHOR || l.CARD_ID, l.TITULO, l.FASE_NOME, l.FORNECEDOR, l.FILIAL,
    fmtData(l.DT_CRIACAO), l.DT_ENVIO ? fmtData(l.DT_ENVIO) : '',
    l.DIAS_ANALISE ?? '', l.META_ANALISE_DIAS, rotuloEtapa(l.STATUS_ANALISE),
    l.DIAS_FATURAMENTO ?? '', l.META_FATURAMENTO_DIAS, rotuloEtapa(l.STATUS_FATURAMENTO),
    l.DIAS_ENTREGA ?? '', l.META_ENTREGA_DIAS || '', rotuloEtapa(l.STATUS_ENTREGA),
    rotuloAgenda(l.STATUS_AGENDA), rotuloSla(l.SLA_STATUS), l.SLA_SCORE ?? '',
  ]);
}
