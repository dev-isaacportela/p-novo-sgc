// Regra pura da spec 006 (trânsito e recebimento): situação → rótulo e tom,
// faixa de atraso, resumo do pedido e as colunas do CSV de /nfs-em-atraso.
//
// O que este módulo NÃO faz é calcular previsão (D-003): a aritmética de data
// vive uma vez só, no SQL de `add-009-transito.mjs` (RF-004), e a tela recebe
// `DT_PREVISAO`, `SITUACAO` e `DIAS_ATRASO` prontos. Duas implementações da
// mesma contagem de dias úteis seria a dívida que R-025 foi criada para
// evitar. O rótulo do prazo ("7 dias úteis") vem de `rotuloPrazoEntrega` da
// 001 e o texto do CSV, de `textoCsv`/`baixarCsv` de `lib/csv.ts` (R-037):
// aqui só se decide QUAIS colunas vão.

export type SituacaoNf = 'recebida' | 'atrasada' | 'em_transito' | 'dentro_prazo' | 'sem_prazo';
export type FaixaAtraso = 'ate3' | '4a7' | 'mais7';

export interface NotaRecebimento {
  id: number;
  idCard: number;
  titulo: string;
  fase: string;
  numnota: number;
  serie: string;
  codfornec: number;
  fornecedor: string;
  codfilial: string;
  filial: string;
  numpedWinthor: string;
  dtEmissao: string;
  dtPrevisao: string;
  dtRecebimento: string;
  diasAtraso: number;
  prazoDias: number;
  prazoTipo: string;
  vlTotal: number;
  situacao: SituacaoNf;
}

const SITUACOES: readonly SituacaoNf[] = ['recebida', 'atrasada', 'em_transito', 'dentro_prazo', 'sem_prazo'];

const ROTULOS: Record<SituacaoNf, string> = {
  recebida: 'Recebida',
  atrasada: 'Em atraso',
  em_transito: 'Chegando',
  dentro_prazo: 'Dentro do prazo',
  sem_prazo: 'Sem prazo parametrizado',
};

// D-009: os cinco estados cabem nos quatro tons do design system. Cor literal
// em componente é anti-padrão (§14), e estado só por cor reprova por
// acessibilidade — por isso `Status` (ponto + TEXTO), nunca só o ponto.
const TONS: Record<SituacaoNf, 'live' | 'alert' | 'attention' | 'off'> = {
  recebida: 'live',
  atrasada: 'alert',
  em_transito: 'attention',
  dentro_prazo: 'off',
  sem_prazo: 'off',
};

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);
const texto = (valor: unknown) => String(valor ?? '');

/** Situação desconhecida (coluna nova, valor velho) cai em `sem_prazo`: nunca
 * inventa atraso para um dado que a tela não entendeu. */
export function situacaoDeTexto(bruto: unknown): SituacaoNf {
  const valor = texto(bruto);
  return (SITUACOES as readonly string[]).includes(valor) ? (valor as SituacaoNf) : 'sem_prazo';
}

export function rotuloSituacao(situacao: SituacaoNf): string {
  return ROTULOS[situacao];
}

export function tomSituacao(situacao: SituacaoNf): 'live' | 'alert' | 'attention' | 'off' {
  return TONS[situacao];
}

/** Uma linha de `sgcNfsRecebimentoCard` ou de `sgcNfsEmAtraso` (colunas em
 * UPPERCASE) vira a nota que a tela desenha. */
export function notaDeLinha(linha: Record<string, unknown>): NotaRecebimento {
  return {
    id: numero(linha.ID),
    idCard: numero(linha.ID_CARD),
    titulo: texto(linha.TITULO),
    fase: texto(linha.FASE),
    numnota: numero(linha.NUMNOTA),
    serie: texto(linha.SERIE),
    codfornec: numero(linha.CODFORNEC),
    fornecedor: texto(linha.FORNECEDOR),
    codfilial: texto(linha.CODFILIAL),
    filial: texto(linha.FILIAL),
    numpedWinthor: texto(linha.NUMPED_WINTHOR),
    dtEmissao: texto(linha.DT_EMISSAO),
    dtPrevisao: texto(linha.DT_PREVISAO),
    dtRecebimento: texto(linha.DT_RECEBIMENTO),
    diasAtraso: numero(linha.DIAS_ATRASO),
    prazoDias: numero(linha.PRAZO_ENTREGA_DIAS),
    prazoTipo: texto(linha.PRAZO_ENTREGA_TIPO),
    vlTotal: numero(linha.VL_TOTAL),
    situacao: situacaoDeTexto(linha.SITUACAO),
  };
}

/** '' quando a nota não atrasou — a coluna vira `Dash()`, nunca um zero. */
export function rotuloAtraso(nota: NotaRecebimento): string {
  if (nota.situacao !== 'atrasada' || nota.diasAtraso <= 0) return '';
  return `${nota.diasAtraso} ${nota.diasAtraso === 1 ? 'dia de atraso' : 'dias de atraso'}`;
}

/** RN-005: até 3, de 4 a 7, mais de 7 — em dias CORRIDOS (D-010). */
export function faixaDeAtraso(dias: number): FaixaAtraso {
  const n = numero(dias);
  if (n <= 3) return 'ate3';
  if (n <= 7) return '4a7';
  return 'mais7';
}

export interface ResumoRecebimento {
  total: number;
  recebidas: number;
  pendentes: number;
  atrasadas: number;
  semPrazo: number;
  completo: boolean;
}

/** O "2 de 3 notas recebidas" do cabeçalho da aba. `completo` é a condição de
 * RN-006 vista da tela: toda nota recebida E ao menos uma nota. */
export function resumoRecebimento(notas: NotaRecebimento[]): ResumoRecebimento {
  const recebidas = notas.filter((nota) => nota.situacao === 'recebida').length;
  return {
    total: notas.length,
    recebidas,
    pendentes: notas.length - recebidas,
    atrasadas: notas.filter((nota) => nota.situacao === 'atrasada').length,
    semPrazo: notas.filter((nota) => nota.situacao === 'sem_prazo').length,
    completo: notas.length > 0 && recebidas === notas.length,
  };
}

/* ── CSV de /nfs-em-atraso (RF-020, D-012): as MESMAS colunas da tabela, sobre
 *    as linhas já carregadas do filtro atual — zero execução nova. ── */

export const COLUNAS_CSV_ATRASO: string[] = [
  'Nota', 'Série', 'Fornecedor', 'Filial', 'Pedido no ERP', 'Fase',
  'Faturamento', 'Previsão', 'Dias de atraso', 'Valor',
];

const FASES_LEGIVEIS: Record<string, string> = {
  enviado: 'Enviado para Indústria',
  transito: 'Em Trânsito para BN',
};

/** Vírgula decimal e duas casas: é o que o Excel em pt-BR lê sem configurar
 * nada. Quem escapa e junta é `textoCsv` de `lib/csv.ts`. */
const valorBr = (valor: number) => valor.toFixed(2).replace('.', ',');

export function linhasCsv(notas: NotaRecebimento[]): (string | number)[][] {
  return notas.map((nota) => [
    nota.numnota,
    nota.serie,
    nota.fornecedor,
    nota.filial,
    nota.numpedWinthor,
    FASES_LEGIVEIS[nota.fase] ?? nota.fase,
    nota.dtEmissao,
    nota.dtPrevisao,
    nota.diasAtraso,
    valorBr(nota.vlTotal),
  ]);
}
