// Movimentação de produtos (spec 013) — regra pura da tela: as abas e a filial
// que cada uma exige, os tons e rótulos de prazo, bloqueio, severidade e
// operação do lote, a classificação do excedente (curva + régua única de
// cobertura), o plano de ação e o CSV do alerta de ruptura. Sem React, sem SDK:
// é o que `frontend/tests/movimentacao.test.mjs` exercita.
//
// Quem detecta a ruptura e monta o rastro da perda é o SQL (add-015); aqui só
// se lê o que ele devolveu.

import { curvaPorValor } from './compras.ts';
import type { CurvaAbc } from './compras.ts';
import { limiteDeCobertura, ROTULO_NIVEL } from './cobertura.ts';
import type { Cobertura, NivelCobertura } from './cobertura.ts';

type Linha = Record<string, unknown>;

const num = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const numOuNulo = (valor: unknown): number | null =>
  valor === null || valor === undefined || String(valor).trim() === '' || !Number.isFinite(Number(valor)) ? null : Number(valor);
const arred = (valor: number, casas: number) => Math.round(valor * 10 ** casas) / 10 ** casas;

/* ── As abas (C-002, C-003) ─────────────────────────────────────────────── */

export type AbaMovimentacao = 'sem-venda' | 'excedentes' | 'a-vencer' | 'ruptura' | 'perdas';

/** `exigeFilial`: a consulta casa o estoque por filial — sem filial não há linha (RF-004). */
export const ABAS_MOVIMENTACAO: readonly { value: AbaMovimentacao; label: string; hint: string; exigeFilial: boolean }[] = [
  { value: 'sem-venda', label: 'Sem venda', hint: 'Estoque parado', exigeFilial: true },
  { value: 'excedentes', label: 'Excedentes', hint: 'Acima da cobertura', exigeFilial: true },
  { value: 'a-vencer', label: 'A vencer', hint: 'Validade do lote', exigeFilial: true },
  { value: 'ruptura', label: 'Alerta de ruptura', hint: 'Venda fora da curva', exigeFilial: false },
  { value: 'perdas', label: 'Perdas', hint: 'Venceu com saldo', exigeFilial: false },
];

/** C-002: aba desconhecida (ou ausente) abre em Sem venda. */
export function abaDaUrl(valor: string | null | undefined): AbaMovimentacao {
  return ABAS_MOVIMENTACAO.find((aba) => aba.value === valor)?.value ?? 'sem-venda';
}

export function abaExigeFilial(aba: AbaMovimentacao): boolean {
  return ABAS_MOVIMENTACAO.find((item) => item.value === aba)?.exigeFilial ?? true;
}

/** C-003: sem escolha, a aba que exige filial usa a primeira da lista; as outras abrem em todas (''). */
export function filialEfetiva(aba: AbaMovimentacao, escolhida: string, filiais: { CODFILIAL: string }[]): string {
  if (escolhida) return escolhida;
  return abaExigeFilial(aba) ? String(filiais[0]?.CODFILIAL ?? '') : '';
}

/** C-030/C-035: clicar na filial já filtrada volta a todas. */
export function alternarFilial(atual: string, clicada: string): string {
  return atual === clicada ? '' : clicada;
}

/* ── Paginação (RN-020) ─────────────────────────────────────────────────── */

export const TAMANHO_PAGINA = 50;

export function ultimaPagina(total: number, tamanho = TAMANHO_PAGINA): number {
  return Math.max(1, Math.ceil(num(total) / tamanho));
}

/** A página `pagina` (1-based) de uma lista já em memória — Excedentes (D-006 da 011). */
export function paginaLocal<T>(lista: T[], pagina: number, tamanho = TAMANHO_PAGINA): T[] {
  const inicio = (Math.max(1, Math.trunc(pagina)) - 1) * tamanho;
  return (lista ?? []).slice(inicio, inicio + tamanho);
}

/** O total que vem repetido em toda linha (COUNT(*) OVER ()); página vazia = 0. */
export function totalDe(linhas: Linha[], coluna = 'TOTAL_REGISTROS'): number {
  return num(linhas?.[0]?.[coluna]);
}

/** O fragmento `codprods` de sgcMovPlanosListar: só inteiros positivos, sem repetir; `0` sem nenhum. */
export function listaCodprods(linhas: Linha[]): string {
  const codigos = [...new Set((linhas ?? []).map((l) => Math.trunc(Number(l.CODPROD))).filter((n) => Number.isFinite(n) && n > 0))];
  return codigos.length ? codigos.join(',') : '0';
}

export type TomMov = 'alert' | 'attention' | 'off' | 'live';

/** `n dias`, `1 dia`. */
export function dias(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
}

/* ── Sem venda (C-006, C-007) ───────────────────────────────────────────── */

export const CORTES_SEM_VENDA = [30, 60, 90, 180, 365] as const;
export const JANELA_MOVIMENTACAO_DIAS = 720;

/** Sem venda na janela ou 180+ dias: alerta; 90+: atenção (RN-MOV-09 do legado). */
export function tomDiasSemVenda(diasSemVenda: number | null): TomMov {
  if (diasSemVenda === null || diasSemVenda >= 180) return 'alert';
  return diasSemVenda >= 90 ? 'attention' : 'off';
}

export function rotuloDiasSemVenda(diasSemVenda: number | null, janela = JANELA_MOVIMENTACAO_DIAS): string {
  return diasSemVenda === null ? `Sem venda em ${janela} dias` : dias(diasSemVenda);
}

/* ── Excedentes (RN-004..RN-006, C-011, C-012, C-015) ───────────────────── */

export const PERIODOS_CONSUMO = [30, 60, 90, 180] as const;
export const TETO_EXCEDENTES = 3000;

export interface LinhaExcedente {
  codprod: number;
  descricao: string;
  embalagem: string;
  fornecedor: string;
  codfornec: number;
  codepto: number;
  codsec: number;
  estoqueAtual: number;
  estoqueTransito: number;
  custo: number;
  vendaPeriodo: number;
  faturamento: number;
  consumoDiario: number;
  coberturaDias: number | null;
}

export interface Excedente extends LinhaExcedente {
  curva: CurvaAbc;
  alvoDias: number;
  tetoDias: number;
  nivel: NivelCobertura | 'padrao';
  /** "Departamento", "Produto"… ou "Padrão do sistema" (C-012). */
  origemRegra: string;
  excedente: boolean;
  quantidadeExcedente: number;
  valorExcedente: number;
  diasAcimaDoTeto: number | null;
}

export function linhaExcedenteDe(l: Linha): LinhaExcedente {
  return {
    codprod: num(l.CODPROD),
    descricao: String(l.DESCRICAO ?? ''),
    embalagem: String(l.EMBALAGEM ?? ''),
    fornecedor: String(l.FORNECEDOR ?? ''),
    codfornec: num(l.CODFORNEC),
    codepto: num(l.CODEPTO),
    codsec: num(l.CODSEC),
    estoqueAtual: num(l.ESTOQUE_ATUAL),
    estoqueTransito: num(l.ESTOQUE_EM_TRANSITO),
    custo: num(l.CUSTO_ULT_ENTRADA),
    vendaPeriodo: num(l.VENDA_PERIODO),
    faturamento: num(l.FATURAMENTO_PERIODO),
    consumoDiario: num(l.CONSUMO_MEDIO_DIARIO),
    coberturaDias: numOuNulo(l.COBERTURA_ATUAL_DIAS),
  };
}

/**
 * RN-005/RN-006. A curva sai do faturamento da POPULAÇÃO inteira (por isso a
 * consulta não pagina); alvo e teto da régua única (R-089, P-03). Excedente =
 * cobertura acima do teto; a quantidade acima do ALVO = estoque total − consumo
 * × alvo, nunca negativa; o valor, pelo custo da última entrada (P-07).
 */
export function classificarExcedentes(linhas: LinhaExcedente[], coberturas: Cobertura[]): Excedente[] {
  const curvas = curvaPorValor((linhas ?? []).map((l) => ({ codprod: l.codprod, valor: l.faturamento })));
  return (linhas ?? []).map((linha) => {
    const curva = curvas.get(linha.codprod) ?? 'C';
    const regra = limiteDeCobertura(coberturas ?? [], {
      codprod: linha.codprod, codsec: linha.codsec, codepto: linha.codepto, codfornec: linha.codfornec,
    }, curva);
    const estoqueTotal = linha.estoqueAtual + linha.estoqueTransito;
    const estoqueAlvo = linha.consumoDiario > 0 ? linha.consumoDiario * regra.alvoDias : estoqueTotal;
    const quantidadeExcedente = Math.max(0, arred(estoqueTotal - estoqueAlvo, 3));
    const excedente = linha.coberturaDias !== null && linha.coberturaDias > regra.limiteDias;
    return {
      ...linha,
      curva,
      alvoDias: regra.alvoDias,
      tetoDias: regra.limiteDias,
      nivel: regra.nivel,
      origemRegra: regra.nivel === 'padrao' ? 'Padrão do sistema' : ROTULO_NIVEL[regra.nivel],
      excedente,
      quantidadeExcedente,
      valorExcedente: arred(quantidadeExcedente * linha.custo, 2),
      diasAcimaDoTeto: linha.coberturaDias === null ? null : arred(linha.coberturaDias - regra.limiteDias, 2),
    };
  });
}

/** C-015: os números do topo são sempre dos excedentes da população inteira, qualquer que seja a visão. */
export function resumoExcedentes(lista: Excedente[]) {
  const excedentes = (lista ?? []).filter((e) => e.excedente);
  const coberturas = excedentes.map((e) => e.coberturaDias).filter((c): c is number => c !== null);
  return {
    comGiro: (lista ?? []).length,
    itens: excedentes.length,
    valor: arred(excedentes.reduce((soma, e) => soma + e.valorExcedente, 0), 2),
    coberturaMedia: coberturas.length ? arred(coberturas.reduce((a, b) => a + b, 0) / coberturas.length, 1) : null,
    semRegra: excedentes.filter((e) => e.nivel === 'padrao').length,
  };
}

/* ── A vencer (C-016, C-017; RN-008) ────────────────────────────────────── */

export const HORIZONTES_VALIDADE = [30, 60, 90, 180, 365] as const;

/** RN-MOV-34 do legado: vencido ou até 30 dias, alerta; até 90, atenção. */
export function tomPrazo(diasParaVencer: number | null): TomMov {
  if (diasParaVencer === null) return 'off';
  if (diasParaVencer <= 30) return 'alert';
  return diasParaVencer <= 90 ? 'attention' : 'off';
}

export function rotuloPrazo(diasParaVencer: number | null): string {
  if (diasParaVencer === null) return '—';
  if (diasParaVencer < 0) return `Vencido há ${dias(-diasParaVencer)}`;
  if (diasParaVencer === 0) return 'Vence hoje';
  return `Vence em ${dias(diasParaVencer)}`;
}

/** RN-008: o rótulo do bloqueio — nunca um motivo (o ERP não registra). */
export function rotuloBloqueio(l: Linha): { tom: TomMov; texto: string } | null {
  const situacao = String(l.SITUACAO_BLOQUEIO ?? 'LIVRE');
  if (situacao === 'TOTAL') return { tom: 'alert', texto: 'Bloqueado' };
  if (situacao === 'PARCIAL') return { tom: 'attention', texto: `${num(l.QT_BLOQUEADA)} de ${num(l.QT_LOTE)} bloqueadas` };
  return null;
}

/** Quem, quando e por qual rotina — o que o log do lote diz. Vazio quando não há o que dizer. */
export function textoResponsavelBloqueio(l: Linha, fmtData: (iso: string) => string): string {
  const partes = [
    l.BLOQUEIO_RESPONSAVEL ? String(l.BLOQUEIO_RESPONSAVEL) : l.BLOQUEIO_MATRICULA ? `matrícula ${l.BLOQUEIO_MATRICULA}` : '',
    l.BLOQUEIO_DATA ? fmtData(String(l.BLOQUEIO_DATA)) : '',
    l.BLOQUEIO_ROTINA ? `rotina ${String(l.BLOQUEIO_ROTINA).trim()}` : '',
  ].filter(Boolean);
  return partes.join(' · ');
}

/* ── Plano de ação (RN-010, C-021..C-024) ───────────────────────────────── */

export type OrigemPlano = 'sem_venda' | 'a_vencer';
export type StatusPlano = 'aberto' | 'em_andamento' | 'concluido';

export const STATUS_PLANO: readonly { value: StatusPlano; label: string }[] = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
];

export function rotuloStatusPlano(status: string): string {
  return STATUS_PLANO.find((s) => s.value === status)?.label ?? 'Aberto';
}

export interface PlanoAcao {
  id: number;
  codprod: number;
  codfilial: string;
  fato: string;
  causa: string;
  acao: string;
  responsavelId: number;
  responsavelNome: string;
  dataAcompanhamento: string;
  status: StatusPlano;
  atualizadoPorNome: string;
  atualizadoEm: string;
}

/** Chave do plano dentro da aba: os lotes do mesmo produto dividem o plano (C-022). */
export function chavePlano(codprod: unknown, codfilial: unknown): string {
  return `${num(codprod)}|${String(codfilial ?? '')}`;
}

export function planoDeLinha(l: Linha): PlanoAcao {
  const status = String(l.STATUS ?? 'aberto');
  return {
    id: num(l.ID),
    codprod: num(l.CODPROD),
    codfilial: String(l.CODFILIAL ?? ''),
    fato: String(l.FATO ?? ''),
    causa: String(l.CAUSA ?? ''),
    acao: String(l.ACAO ?? ''),
    responsavelId: num(l.RESPONSAVEL_ID),
    responsavelNome: String(l.RESPONSAVEL_NOME ?? ''),
    dataAcompanhamento: String(l.DATA_ACOMPANHAMENTO ?? ''),
    status: (STATUS_PLANO.some((s) => s.value === status) ? status : 'aberto') as StatusPlano,
    atualizadoPorNome: String(l.ATUALIZADO_POR_NOME ?? ''),
    atualizadoEm: String(l.ATUALIZADO_EM ?? ''),
  };
}

/** Os planos da página, por `chavePlano`. */
export function mapaDePlanos(linhas: Linha[]): Map<string, PlanoAcao> {
  const mapa = new Map<string, PlanoAcao>();
  for (const l of linhas ?? []) mapa.set(chavePlano(l.CODPROD, l.CODFILIAL), planoDeLinha(l));
  return mapa;
}

/** RN-010: fato, causa ou ação — pelo menos um, sem contar espaço. `null` = pode salvar. */
export function validarPlano(plano: Pick<PlanoAcao, 'fato' | 'causa' | 'acao' | 'dataAcompanhamento'>): string | null {
  if (![plano.fato, plano.causa, plano.acao].some((campo) => String(campo ?? '').trim() !== '')) {
    return 'Preencha o fato, a causa ou a ação.';
  }
  const data = String(plano.dataAcompanhamento ?? '');
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'A data de acompanhamento precisa ser uma data válida.';
  return null;
}

/** C-023: acompanhamento vencido = data antes de hoje e situação diferente de concluído. */
export function planoAtrasado(plano: Pick<PlanoAcao, 'dataAcompanhamento' | 'status'> | null | undefined, hoje: string): boolean {
  return Boolean(plano && plano.status !== 'concluido' && plano.dataAcompanhamento && plano.dataAcompanhamento < hoje);
}

/**
 * C-024: a escrita guardada devolve 0 linhas quando recusa (D-03) — a tela relê
 * e compara. Gravou se o relido existe com o que foi enviado; senão, não gravou.
 */
export function resultadoDoSalvamento(
  enviado: Pick<PlanoAcao, 'fato' | 'causa' | 'acao' | 'status'>,
  relido: PlanoAcao | null | undefined,
): { ok: boolean; mensagem: string } {
  const igual = relido && relido.status === enviado.status
    && relido.fato === enviado.fato && relido.causa === enviado.causa && relido.acao === enviado.acao;
  return igual
    ? { ok: true, mensagem: 'Plano de ação salvo.' }
    : { ok: false, mensagem: 'O plano não foi gravado: seu perfil não pode registrar plano de ação.' };
}

/* ── Alerta de ruptura (RN-012..RN-014, C-026..C-032) ───────────────────── */

export type Severidade = 'RUPTURA' | 'CRITICO' | 'ALTO' | 'MEDIO';

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  RUPTURA: 'Ruptura',
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Monitorar',
};

/** Só normaliza o que o SQL decidiu (RN-013): desconhecido → MEDIO; vazio → '' (filtro desligado). */
export function severidadeDe(valor: unknown): Severidade | '' {
  const texto = String(valor ?? '').toUpperCase();
  if (texto === '') return '';
  return (Object.keys(ROTULO_SEVERIDADE) as Severidade[]).includes(texto as Severidade) ? (texto as Severidade) : 'MEDIO';
}

export function tomSeveridade(severidade: unknown): TomMov {
  const s = severidadeDe(severidade);
  if (s === 'RUPTURA' || s === 'CRITICO') return 'alert';
  return s === 'ALTO' ? 'attention' : 'off';
}

/** A cobertura no ritmo novo contra o prazo de reposição. */
export function tomCoberturaRitmo(cobertura: number | null, prazo: number): TomMov {
  if (cobertura === null) return 'off';
  if (cobertura <= prazo) return 'alert';
  return cobertura <= 2 * prazo ? 'attention' : 'live';
}

/** Dias com fração: `—`, `hoje`, `1 dia`, `4,7 dias`. */
export function rotuloDias(d: number | null): string {
  if (d === null) return '—';
  if (d <= 0) return 'hoje';
  if (d === 1) return '1 dia';
  return `${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

export const OPCOES_RUPTURA = {
  diasJanela: [7, 15, 30],
  diasBase: [60, 90, 180, 365],
  limiarPerc: [30, 40, 50, 70, 90],
  fatorMinimo: [1.2, 1.5, 2, 3],
  prazoReposicao: [7, 15, 30, 45],
  vendaMinima: [1, 5, 10, 30],
} as const;

export interface EscolhasRuptura {
  diasJanela: number;
  diasBase: number;
  limiarPerc: number;
  fatorMinimo: number;
  prazoReposicao: number;
  vendaMinima: number;
  incluirSemHistorico: boolean;
  incluirExcecoes: boolean;
}

/** RN-RUP-01 do legado: os padrões da tela. */
export const PADRAO_RUPTURA: EscolhasRuptura = {
  diasJanela: 7, diasBase: 90, limiarPerc: 50, fatorMinimo: 1.5, prazoReposicao: 15, vendaMinima: 5,
  incluirSemHistorico: true, incluirExcecoes: false,
};

export const COBERTURA_ALVO_REPOSICAO_DIAS = 30;

/** O input das SFs de ruptura; `diasTotal` vem pronto porque o SQL não soma dentro de `TRUNC(SYSDATE) - n` (D-001 c). */
export function parametrosRuptura(escolhas: EscolhasRuptura) {
  return {
    diasJanela: escolhas.diasJanela,
    diasBase: escolhas.diasBase,
    diasTotal: escolhas.diasJanela + escolhas.diasBase,
    limiarPerc: escolhas.limiarPerc,
    fatorMinimo: escolhas.fatorMinimo,
    prazoReposicao: escolhas.prazoReposicao,
    vendaMinima: escolhas.vendaMinima,
    incluirSemHistorico: escolhas.incluirSemHistorico ? 1 : 0,
    incluirExcecoes: escolhas.incluirExcecoes ? 1 : 0,
    diasCoberturaAlvo: COBERTURA_ALVO_REPOSICAO_DIAS,
  };
}

export const LIMITE_EXPORTACAO = 5000;

const COLUNAS_CSV_RUPTURA: readonly [string, string][] = [
  ['Filial', 'CODFILIAL'], ['Nome da filial', 'FILIAL'], ['Código', 'CODPROD'], ['Produto', 'DESCRICAO'],
  ['Embalagem', 'EMBALAGEM'], ['Fornecedor', 'FORNECEDOR'], ['Situação', 'SEVERIDADE'],
  ['Estoque no início da janela', 'ESTOQUE_INICIAL'], ['Vendido na janela', 'QT_VENDA_JANELA'],
  ['% do estoque consumido', 'PERC_CONSUMIDO'], ['Maior saída única', 'QT_MAIOR_SAIDA'],
  ['Dias com venda', 'DIAS_COM_VENDA'], ['Clientes na janela', 'CLIENTES_JANELA'],
  ['Tempo real', 'DIAS_CONSUMO_REAL'], ['Tempo esperado', 'DIAS_ESPERADOS'], ['Fator de aceleração', 'FATOR_ACELERACAO'],
  ['Consumo diário atual', 'CONSUMO_DIARIO_JANELA'], ['Consumo diário histórico', 'CONSUMO_DIARIO_BASE'],
  ['Estoque hoje', 'ESTOQUE_ATUAL'], ['Em trânsito', 'QT_TRANSITO'],
  ['Cobertura no ritmo atual', 'COBERTURA_RITMO_ATUAL'], ['Cobertura com trânsito', 'COBERTURA_COM_TRANSITO'],
  ['Repor sugerido', 'QT_REPOR_SUGERIDA'], ['Custo unitário', 'CUSTO_UNITARIO'], ['Valor do estoque', 'VALOR_ESTOQUE'],
  ['Primeira venda da janela', 'PRIMEIRA_VENDA'], ['Última venda da janela', 'ULTIMA_VENDA'],
];

export const CABECALHO_CSV_RUPTURA: string[] = COLUNAS_CSV_RUPTURA.map(([rotulo]) => rotulo);

/**
 * C-032: as linhas do arquivo. Sem histórico, a célula fica vazia — nunca 0
 * (RN-RUP-07 do legado). A última linha registra os parâmetros usados.
 */
export function linhasCsvRuptura(linhas: Linha[], escolhas: EscolhasRuptura, recorte: string): (string | number)[][] {
  const corpo = (linhas ?? []).map((l) => COLUNAS_CSV_RUPTURA.map(([, coluna]) => {
    const valor = l[coluna];
    if (coluna === 'SEVERIDADE') return ROTULO_SEVERIDADE[severidadeDe(valor) || 'MEDIO'];
    return valor === null || valor === undefined ? '' : (valor as string | number);
  }));
  if (!corpo.length) return [];
  const parametros = [`Parâmetros: ${recorte}`, `janela ${escolhas.diasJanela} d`, `base ${escolhas.diasBase} d`,
    `gatilho ${escolhas.limiarPerc}%`, `desvio ${escolhas.fatorMinimo}x`, `prazo ${escolhas.prazoReposicao} d`,
    `reposição ${COBERTURA_ALVO_REPOSICAO_DIAS} d`, `venda mínima ${escolhas.vendaMinima}`,
    escolhas.incluirSemHistorico ? 'inclui sem histórico' : 'sem os sem histórico'];
  return [...corpo, parametros];
}

/* ── Perdas e o rastro do lote (RN-017, RN-018, C-034, C-037) ───────────── */

export const JANELAS_PERDA = [0, 90, 180, 365] as const;

const ROTULO_OPERACAO: Record<string, string> = {
  E: 'Entrada por compra', EA: 'Entrada avulsa', EB: 'Entrada por bonificação', ED: 'Entrada por devolução',
  EI: 'Entrada por inventário', ER: 'Entrada por retorno', ET: 'Entrada por transferência',
  S: 'Venda', SA: 'Saída avulsa', SB: 'Saída por bonificação', SD: 'Saída por devolução',
  SI: 'Saída por inventário', ST: 'Saída por transferência',
};

/** RN-018; a remessa de entrega futura nunca aparece como uma segunda "Venda" (P-02). */
export function rotuloOperacao(codoper: unknown, sentido: unknown, remessa = false): string {
  const codigo = String(codoper ?? '').trim().toUpperCase();
  if (remessa && codigo.startsWith('S')) return 'Remessa de entrega futura';
  return ROTULO_OPERACAO[codigo] ?? `${String(sentido) === 'ENTRADA' ? 'Entrada' : 'Saída'} (${codigo})`;
}

export function ehTransferencia(codoper: unknown): boolean {
  const codigo = String(codoper ?? '').trim().toUpperCase();
  return codigo === 'ET' || codigo === 'ST';
}

/** RN-018: a rota sem inventar ponta. */
export function rotaTransferencia(origem: unknown, destino: unknown): string {
  const a = String(origem ?? '').trim();
  const b = String(destino ?? '').trim();
  if (a && b) return `${a} → ${b}`;
  if (b) return `→ ${b}`;
  if (a) return `${a} →`;
  return '';
}

/** "Parado sem venda" (RN-PER-17 do legado): nunca vendido ou 180+ dias, alerta; 90+, atenção. */
export function tomParadoSemVenda(diasSemVenda: number | null, nuncaVendido: boolean): TomMov {
  if (nuncaVendido || (diasSemVenda !== null && diasSemVenda >= 180)) return 'alert';
  return diasSemVenda !== null && diasSemVenda >= 90 ? 'attention' : 'off';
}

export function rotuloParadoSemVenda(diasSemVenda: number | null): string {
  if (diasSemVenda === null) return '—';
  return diasSemVenda <= 0 ? 'no mesmo dia' : dias(diasSemVenda);
}
