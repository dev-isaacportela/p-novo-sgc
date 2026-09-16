// Spec 009 — a forma do recorte salvo (`SGC_RELATORIO.CONFIG_JSON`), a lista
// FECHADA de colunas, campos e medidas, e as linhas do CSV.
//
// RNF-005: nenhum texto de consulta é montado na tela — o recorte é um conjunto
// fechado de filtros, e `filtrosDaConfig` só traduz o que a pessoa escolheu para
// os parâmetros que `sgcRelatorioPedidos` espera, já com os valores desligados
// (`''` no texto, `0` no número).

import { fmtData, moeda } from './formato.ts';

export type Medida = 'contagem' | 'valor' | 'dias_na_fase';
export type TipoGrafico = 'barra' | 'linha';
export type Visao = 'grafico' | 'tabela';
export type CampoAgrupavel = '' | 'fase' | 'fornecedor' | 'filial' | 'responsavel' | 'prioridade';

export interface FiltrosRelatorio {
  fase: string;
  codfornec: number;
  codfilial: string;
  responsavelId: number;
  prioridade: string;
  /** Período de CRIAÇÃO do pedido — o ÚNICO filtro de data desligável (D-014). */
  dataInicio: string;
  dataFim: string;
}

export interface ConfigRelatorio {
  filtros: FiltrosRelatorio;
  colunas: string[];
  agrupamento: CampoAgrupavel;
  grafico: { tipo: TipoGrafico; eixo: CampoAgrupavel; medida: Medida };
  visao: Visao;
}

/** Lista FECHADA: `colunas` é sempre um subconjunto ordenado desta. */
export const COLUNAS: { chave: string; label: string; numerica?: boolean }[] = [
  { chave: 'numero', label: 'Pedido' },
  { chave: 'titulo', label: 'Título' },
  { chave: 'fase', label: 'Fase' },
  { chave: 'fornecedor', label: 'Fornecedor' },
  { chave: 'filial', label: 'Filial' },
  { chave: 'responsavel', label: 'Responsável' },
  { chave: 'prioridade', label: 'Prioridade' },
  { chave: 'valor', label: 'Valor', numerica: true },
  { chave: 'criado_em', label: 'Criado em' },
  { chave: 'dias_na_fase', label: 'Dias na fase', numerica: true },
];

export const CAMPOS_AGRUPAVEIS: { chave: Exclude<CampoAgrupavel, ''>; label: string }[] = [
  { chave: 'fase', label: 'Fase' },
  { chave: 'fornecedor', label: 'Fornecedor' },
  { chave: 'filial', label: 'Filial' },
  { chave: 'responsavel', label: 'Responsável' },
  { chave: 'prioridade', label: 'Prioridade' },
];

export const MEDIDAS: { chave: Medida; label: string }[] = [
  { chave: 'contagem', label: 'Quantidade de pedidos' },
  { chave: 'valor', label: 'Valor total' },
  { chave: 'dias_na_fase', label: 'Média de dias na fase' },
];

export const PRIORIDADES = ['normal', 'alta', 'urgente'];

const CHAVES_COLUNA = COLUNAS.map((c) => c.chave);
const CHAVES_AGRUPAMENTO = CAMPOS_AGRUPAVEIS.map((c) => c.chave);
const CHAVES_MEDIDA = MEDIDAS.map((m) => m.chave);

export function configPadrao(): ConfigRelatorio {
  return {
    filtros: { fase: '', codfornec: 0, codfilial: '', responsavelId: 0, prioridade: '', dataInicio: '', dataFim: '' },
    colunas: [...CHAVES_COLUNA],
    agrupamento: 'fase',
    grafico: { tipo: 'barra', eixo: 'fase', medida: 'contagem' },
    visao: 'tabela',
  };
}

// Chave AUSENTE ganha o padrão; chave presente fora do domínio volta ao padrão.
// As duas coisas são diferentes: `''` é valor legítimo em quase todo filtro, e
// tratá-lo como "faltando" faria o agrupamento padrão nunca entrar.
const texto = (valor: unknown, permitidos?: string[], padrao = ''): string => {
  if (typeof valor !== 'string') return padrao;
  if (permitidos && !permitidos.includes(valor)) return padrao;
  return valor;
};
const inteiro = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/**
 * C-018 — leitura TOLERANTE: chave desconhecida é descartada, chave faltando
 * ganha o padrão e valor fora do domínio volta ao padrão. Relatório salvo antes
 * de uma mudança de forma ABRE, não quebra.
 */
export function lerConfig(bruto: string): ConfigRelatorio {
  const padrao = configPadrao();
  let lido: Record<string, unknown> = {};
  try {
    const parseado = JSON.parse(String(bruto || '{}'));
    if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) lido = parseado as Record<string, unknown>;
  } catch {
    return padrao;
  }
  const filtros = (lido.filtros && typeof lido.filtros === 'object' ? lido.filtros : {}) as Record<string, unknown>;
  const grafico = (lido.grafico && typeof lido.grafico === 'object' ? lido.grafico : {}) as Record<string, unknown>;
  const colunas = Array.isArray(lido.colunas)
    ? (lido.colunas as unknown[]).map(String).filter((c) => CHAVES_COLUNA.includes(c))
    : [];
  const agrupamento = texto(lido.agrupamento, ['', ...CHAVES_AGRUPAMENTO], padrao.agrupamento) as CampoAgrupavel;
  return {
    filtros: {
      fase: texto(filtros.fase),
      codfornec: inteiro(filtros.codfornec),
      codfilial: texto(filtros.codfilial),
      responsavelId: inteiro(filtros.responsavelId),
      prioridade: texto(filtros.prioridade, ['', ...PRIORIDADES], ''),
      dataInicio: texto(filtros.dataInicio),
      dataFim: texto(filtros.dataFim),
    },
    colunas: colunas.length ? colunas : padrao.colunas,
    agrupamento,
    grafico: {
      tipo: texto(grafico.tipo, ['barra', 'linha'], 'barra') as TipoGrafico,
      eixo: texto(grafico.eixo, ['', ...CHAVES_AGRUPAMENTO], agrupamento || 'fase') as CampoAgrupavel,
      medida: texto(grafico.medida, CHAVES_MEDIDA, 'contagem') as Medida,
    },
    visao: texto(lido.visao, ['grafico', 'tabela'], padrao.visao) as Visao,
  };
}

/** Grava só as chaves conhecidas: o que entrou desconhecido não volta ao banco. */
export function escreverConfig(config: ConfigRelatorio): string {
  return JSON.stringify(lerConfig(JSON.stringify(config)));
}

/** RN-013 — título vazio é recusado (o servidor também recusa; aqui é o aviso). */
export function tituloValido(titulo: string): boolean {
  return String(titulo || '').trim().length > 0;
}

/** Os parâmetros de `sgcRelatorioPedidos`, já com os valores desligados. */
export function filtrosDaConfig(config: ConfigRelatorio): Record<string, string> {
  const f = config.filtros;
  return {
    fase: f.fase,
    codfornec: String(f.codfornec || 0),
    codfilial: f.codfilial,
    responsavelId: String(f.responsavelId || 0),
    prioridade: f.prioridade,
    dataInicio: f.dataInicio,
    dataFim: f.dataFim,
  };
}

/**
 * RN-013 — quem edita e quem exclui. `PODE_EDITAR` vem RESOLVIDO do servidor;
 * a tela só desabilita o botão com esse valor em vez de reimplementar a regra.
 * O par `usuarioId`/`ehAdmin` é a queda quando a coluna não veio.
 */
export function podeEditar(
  relatorio: { CRIADO_POR: number; PODE_EDITAR?: number }, usuarioId: number, ehAdmin: boolean,
): boolean {
  if (relatorio.PODE_EDITAR !== undefined && relatorio.PODE_EDITAR !== null) return Number(relatorio.PODE_EDITAR) === 1;
  return ehAdmin || Number(relatorio.CRIADO_POR) === Number(usuarioId);
}

/* ─────────────── agregado e CSV ─────────────── */

export interface AgregadoRow {
  CHAVE: string; QTD: number; VL_TOTAL: number; DIAS_NA_FASE_MEDIA: number | null;
}
export interface PedidoRow {
  ID_CARD: number; TITULO: string; FASE_CHAVE: string; FASE_NOME: string;
  CODFORNEC: number; FORNECEDOR: string; CODFILIAL: string; FILIAL: string;
  RESPONSAVEL: string; PRIORIDADE: string; VL_TOTAL: number; NUMPED_WINTHOR: string;
  DT_ENVIO: string; PERC_FATURADO: number; CRIADO_EM: string; CRIADO_POR_NOME: string;
  DIAS_NA_FASE: number;
}

const numero = (valor: unknown) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** C-022 — a mesma lista para o gráfico e para a tabela alternativa. */
export function serieDoAgregado(linhas: AgregadoRow[], medida: Medida): { name: string; value: number }[] {
  const coluna = medida === 'valor' ? 'VL_TOTAL' : medida === 'dias_na_fase' ? 'DIAS_NA_FASE_MEDIA' : 'QTD';
  return linhas.map((linha) => ({
    name: String(linha.CHAVE ?? ''),
    value: numero((linha as unknown as Record<string, unknown>)[coluna]),
  }));
}

/** C-023 — o cabeçalho das colunas escolhidas, na ordem em que estão na tela. */
export function colunasCsvRelatorio(colunas: string[]): string[] {
  return colunas
    .map((chave) => COLUNAS.find((c) => c.chave === chave))
    .filter((c): c is { chave: string; label: string; numerica?: boolean } => Boolean(c))
    .map((c) => c.label);
}

function celula(linha: PedidoRow, chave: string): string | number {
  switch (chave) {
    case 'numero': return linha.NUMPED_WINTHOR || linha.ID_CARD;
    case 'titulo': return linha.TITULO ?? '';
    case 'fase': return linha.FASE_NOME ?? '';
    case 'fornecedor': return linha.FORNECEDOR ?? '';
    case 'filial': return linha.FILIAL ?? '';
    case 'responsavel': return linha.RESPONSAVEL ?? '';
    case 'prioridade': return linha.PRIORIDADE ?? '';
    case 'valor': return moeda(linha.VL_TOTAL);
    case 'criado_em': return fmtData(linha.CRIADO_EM);
    case 'dias_na_fase': return numero(linha.DIAS_NA_FASE);
    default: return '';
  }
}

/** Uma linha por linha da tela, nas mesmas colunas e na mesma ordem (C-023). */
export function linhasCsvRelatorio(linhas: PedidoRow[], colunas: string[]): (string | number)[][] {
  const validas = colunas.filter((chave) => COLUNAS.some((c) => c.chave === chave));
  return linhas.map((linha) => validas.map((chave) => celula(linha, chave)));
}
