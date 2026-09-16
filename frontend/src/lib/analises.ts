// Spec 009 — regra pura da tela `/analises`: os períodos derivados de hoje
// (RN-011), a filial assumida da comparação compras × vendas (RN-012), o
// resultado de cada bloco carregado em paralelo (RF-002/RF-003) e as séries que
// alimentam ao mesmo tempo o gráfico e a tabela alternativa (C-024).
//
// Nada aqui chama server function: é o que `node --test` roda sobre
// `frontend/tests/analises.test.mjs`.

/* ─────────────── períodos (RN-011) ─────────────── */

export interface OpcaoPeriodo { value: string; label: string }

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const dois = (n: number) => String(n).padStart(2, '0');
const iso = (ano: number, mes: number, dia: number) => `${ano}-${dois(mes)}-${dois(dia)}`;

/** Último dia do mês (1–12), sem biblioteca de datas. */
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** `AAAA-MM` do mês corrente. */
export function periodoCorrente(hoje: Date = new Date()): string {
  return `${hoje.getUTCFullYear()}-${dois(hoje.getUTCMonth() + 1)}`;
}

/**
 * RN-011/C-004 — a lista NUNCA envelhece: os doze meses terminados no mês
 * corrente (o corrente no topo) e os trimestres JÁ INICIADOS do ano, sempre
 * derivados de hoje. Nada é escrito à mão.
 */
export function listarPeriodos(hoje: Date = new Date()): OpcaoPeriodo[] {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth() + 1;
  const opcoes: OpcaoPeriodo[] = [];
  for (let atras = 0; atras < 12; atras += 1) {
    const total = ano * 12 + (mes - 1) - atras;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    opcoes.push({ value: `${a}-${dois(m)}`, label: `${MESES[m - 1]} de ${a}` });
  }
  const trimestres = Math.ceil(mes / 3);
  for (let t = trimestres; t >= 1; t -= 1) {
    opcoes.push({ value: `${ano}-Q${t}`, label: `${t}º trimestre de ${ano}` });
  }
  return opcoes;
}

/** `2026-09` → 01/09 a 30/09; `2026-Q3` → 01/07 a 30/09. */
export function periodoRange(periodo: string): { dataInicio: string; dataFim: string } {
  const trimestre = /^(\d{4})-Q([1-4])$/.exec(periodo);
  if (trimestre) {
    const ano = Number(trimestre[1]);
    const primeiro = (Number(trimestre[2]) - 1) * 3 + 1;
    return { dataInicio: iso(ano, primeiro, 1), dataFim: iso(ano, primeiro + 2, ultimoDia(ano, primeiro + 2)) };
  }
  const mensal = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!mensal) return { dataInicio: '', dataFim: '' };
  const ano = Number(mensal[1]);
  const mes = Number(mensal[2]);
  return { dataInicio: iso(ano, mes, 1), dataFim: iso(ano, mes, ultimoDia(ano, mes)) };
}

/** RN-011 — o painel de indicadores usa intervalo livre: 90 dias até hoje. */
export function intervaloPadrao(hoje: Date = new Date()): { dataInicio: string; dataFim: string } {
  const fim = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return {
    dataInicio: new Date(fim - 90 * 86400000).toISOString().slice(0, 10),
    dataFim: new Date(fim).toISOString().slice(0, 10),
  };
}

/* ─────────────── filial da comparação (RN-012) ─────────────── */

export interface FilialErp { CODFILIAL: string; FILIAL: string }

/**
 * RN-012/C-005 — compras × vendas casa entrada com saída por filial e não
 * existe consolidada: sem escolha, vale a PRIMEIRA da lista e a tela DIZ qual,
 * em vez de mostrar um número consolidado que não existe.
 */
export function filialDoRecorte(filiais: FilialErp[], escolhida: string): { codfilial: string; aviso: string } {
  if (escolhida) return { codfilial: escolhida, aviso: '' };
  const primeira = filiais[0];
  if (!primeira) return { codfilial: '', aviso: 'Nenhuma filial disponível no ERP.' };
  return { codfilial: primeira.CODFILIAL, aviso: `Filial: ${primeira.FILIAL}` };
}

/* ─────────────── blocos em paralelo (RF-002/RF-003) ─────────────── */

export type EstadoBloco = 'ok' | 'vazio' | 'erro';
export interface Bloco<T> { estado: EstadoBloco; linhas: T[]; erro: string }

/**
 * RF-002/RF-003/C-002 — cada bloco vira `{ estado, linhas, erro }` a partir do
 * `Promise.allSettled` da aba: a falha de um NÃO derruba os outros, e "sem
 * dados no período" (`vazio`) é uma leitura diferente de "não foi possível
 * carregar" (`erro`).
 */
export function resultadosDosBlocos<T>(
  nomes: string[], resultados: PromiseSettledResult<T[]>[],
): Record<string, Bloco<T>> {
  const saida: Record<string, Bloco<T>> = {};
  nomes.forEach((nome, indice) => {
    const resultado = resultados[indice];
    if (!resultado || resultado.status === 'rejected') {
      const motivo = resultado && 'reason' in resultado ? resultado.reason : null;
      saida[nome] = {
        estado: 'erro',
        linhas: [],
        erro: String((motivo && (motivo as Error).message) || motivo || 'Não foi possível carregar este bloco.'),
      };
      return;
    }
    const linhas = Array.isArray(resultado.value) ? resultado.value : [];
    saida[nome] = { estado: linhas.length ? 'ok' : 'vazio', linhas, erro: '' };
  });
  return saida;
}

/* ─────────────── séries (C-024: gráfico e tabela, uma função só) ─────────────── */

export interface PontoSerie { name: string; value: number }
export interface PontoComparativo { name: string; a: number; b: number }

const numero = (valor: unknown) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** A MESMA lista que o gráfico desenha e a tabela alternativa imprime (C-024). */
export function serieSimples(
  linhas: Record<string, unknown>[], chave: string, valor: string,
): PontoSerie[] {
  return linhas.map((linha) => ({ name: String(linha[chave] ?? ''), value: numero(linha[valor]) }));
}

export function serieComparativa(
  linhas: Record<string, unknown>[], chave: string, a: string, b: string,
): PontoComparativo[] {
  return linhas.map((linha) => ({ name: String(linha[chave] ?? ''), a: numero(linha[a]), b: numero(linha[b]) }));
}

/* ─────────────── funil das solicitações (RN-009, R-076) ─────────────── */

/** Uma linha por PAR `STATUS × SITUACAO` — R-076/D-015. */
export interface FunilRow {
  STATUS: string;
  SITUACAO: string;
  QTD: number;
  QTD_AVALIADAS: number;
  TEMPO_MEDIO_AVALIACAO_DIAS: number | null;
}

export interface ResumoSolicitacoes {
  total: number; pendentes: number; recusadas: number;
  atendidas: number; naoAtendidas: number; emFluxo: number;
  aderenciaGeralPct: number | null; aderenciaFluxoPct: number | null;
  tempoMedioAvaliacaoDias: number | null;
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;

/**
 * RN-009/C-016 — as duas aderências, lidas nas DUAS dimensões: `pendentes` e
 * `recusadas` saem da DECISÃO (`STATUS`), `atendidas`/`naoAtendidas`/`emFluxo`
 * saem da SITUAÇÃO de atendimento. Uma dimensão só não separaria as três: a
 * régua da 008 devolve `sem_pedido` para pendente, recusada, cancelada E
 * aprovada-na-fila (R-076).
 *
 * Sem solicitação no período as duas aderências são `null`, não 0 — "vazio" e
 * "zero por cento" são leituras diferentes.
 *
 * D-009: é derivado do funil JÁ agregado, na tela — uma execução a menos por
 * carga, e a conta fica testável.
 */
export function resumoSolicitacoes(funil: FunilRow[]): ResumoSolicitacoes {
  const soma = (fn: (linha: FunilRow) => boolean) => funil.reduce(
    (acc, linha) => acc + (fn(linha) ? numero(linha.QTD) : 0), 0,
  );
  const total = soma(() => true);
  const pendentes = soma((l) => l.STATUS === 'pendente');
  const recusadas = soma((l) => l.STATUS === 'recusada');
  const atendidas = soma((l) => l.SITUACAO === 'atendida');
  const naoAtendidas = soma((l) => l.SITUACAO === 'nao_atendida');
  const emFluxo = soma((l) => !['atendida', 'nao_atendida', 'sem_pedido'].includes(l.SITUACAO));

  const denominadorFluxo = total - pendentes - recusadas;
  const avaliadas = funil.reduce((acc, l) => acc + numero(l.QTD_AVALIADAS), 0);
  const somaTempo = funil.reduce(
    (acc, l) => acc + (l.TEMPO_MEDIO_AVALIACAO_DIAS === null ? 0 : numero(l.TEMPO_MEDIO_AVALIACAO_DIAS) * numero(l.QTD_AVALIADAS)),
    0,
  );

  return {
    total, pendentes, recusadas, atendidas, naoAtendidas, emFluxo,
    aderenciaGeralPct: total > 0 ? umaCasa((100 * atendidas) / total) : null,
    aderenciaFluxoPct: denominadorFluxo > 0 ? umaCasa((100 * atendidas) / denominadorFluxo) : null,
    tempoMedioAvaliacaoDias: avaliadas > 0 ? umaCasa(somaTempo / avaliadas) : null,
  };
}

const ROTULO_SITUACAO: Record<string, string> = {
  sem_pedido: 'Sem pedido',
  em_analise: 'Em análise',
  em_aprovacao: 'Em aprovação',
  em_envio: 'Em envio',
  enviada: 'Enviada',
  em_transito: 'Em trânsito',
  em_faturamento: 'Em faturamento',
  atendida: 'Atendida',
  nao_atendida: 'Não atendida',
};
export const rotuloSituacaoSolicitacao = (s: string): string => ROTULO_SITUACAO[s] ?? 'Sem situação';

const ROTULO_DECISAO: Record<string, string> = {
  pendente: 'Esperando avaliação',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};
export const rotuloDecisaoSolicitacao = (s: string): string => ROTULO_DECISAO[s] ?? 'Sem decisão';

/** O gráfico do funil é por SITUAÇÃO: soma os pares de volta numa dimensão só. */
export function serieDoFunil(funil: FunilRow[]): PontoSerie[] {
  const porSituacao = new Map<string, number>();
  for (const linha of funil) {
    const chave = String(linha.SITUACAO ?? '');
    porSituacao.set(chave, (porSituacao.get(chave) ?? 0) + numero(linha.QTD));
  }
  return [...porSituacao.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([situacao, value]) => ({ name: rotuloSituacaoSolicitacao(situacao), value }));
}

/** C-016 — as que ainda não viraram pedido, separadas pela DECISÃO. */
export function serieDasPendentes(funil: FunilRow[]): PontoSerie[] {
  const porDecisao = new Map<string, number>();
  for (const linha of funil) {
    if (linha.SITUACAO !== 'sem_pedido') continue;
    const chave = String(linha.STATUS ?? '');
    porDecisao.set(chave, (porDecisao.get(chave) ?? 0) + numero(linha.QTD));
  }
  return [...porDecisao.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([decisao, value]) => ({ name: rotuloDecisaoSolicitacao(decisao), value }));
}
