// Visões agrupadas da fila de solicitações (spec 017, RN-SOL-16 do legado):
// Detalhada (a lista da 008), Por vendedor, Por fornecedor e Por filial. Quem
// agrupa é o servidor (`sgcSolicitacoesAgrupar`, P-08); aqui ficam a leitura da
// linha, o filtro que abrir um grupo aplica na lista (P-07) e a conferência da
// partição em seis situações (RN-07). Regra pura, exercitada por
// `tests/solicitacoes-visoes.test.mjs`.

export type Dimensao = 'vendedor' | 'fornecedor' | 'filial';
export type Visao = 'detalhe' | Dimensao;

export const DIMENSOES: Dimensao[] = ['vendedor', 'fornecedor', 'filial'];

export const OPCOES_VISAO: { value: Visao; label: string }[] = [
  { value: 'detalhe', label: 'Detalhada' },
  { value: 'vendedor', label: 'Por vendedor' },
  { value: 'fornecedor', label: 'Por fornecedor' },
  { value: 'filial', label: 'Por filial' },
];

export const ROTULO_DIMENSAO: Record<Dimensao, string> = { vendedor: 'Vendedor', fornecedor: 'Fornecedor', filial: 'Filial' };

/** RN-07: as seis situações, na ordem das colunas — somam o total do grupo. */
export const COLUNAS_SITUACAO = [
  { campo: 'pendentes', label: 'Pendentes' },
  { campo: 'naFila', label: 'Na fila' },
  { campo: 'emCompra', label: 'Em compra' },
  { campo: 'atendidas', label: 'Atendidas' },
  { campo: 'naoAtendidas', label: 'Não atendidas' },
  { campo: 'encerradas', label: 'Recusadas ou canceladas' },
] as const;

export interface GrupoDeSolicitacoes {
  chave: string;
  rotulo: string;
  total: number;
  produtos: number;
  pendentes: number;
  naFila: number;
  emCompra: number;
  atendidas: number;
  naoAtendidas: number;
  encerradas: number;
  ultima: string;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

const SEM_ROTULO: Record<Dimensao, string> = { vendedor: 'Sem vendedor', fornecedor: 'Sem fornecedor', filial: '' };

/** Uma linha de `sgcSolicitacoesAgrupar` (UPPERCASE) → o grupo. RN-08: rótulo vazio vira "Sem …" (a filial, o código). */
export function linhaDoGrupo(dimensao: Dimensao, linha: Record<string, unknown>): GrupoDeSolicitacoes {
  const chave = String(linha.CHAVE ?? '');
  const rotulo = String(linha.ROTULO ?? '').trim();
  return {
    chave,
    rotulo: rotulo || SEM_ROTULO[dimensao] || chave,
    total: numero(linha.TOTAL),
    produtos: numero(linha.PRODUTOS),
    pendentes: numero(linha.PENDENTES),
    naFila: numero(linha.NA_FILA),
    emCompra: numero(linha.EM_COMPRA),
    atendidas: numero(linha.ATENDIDAS),
    naoAtendidas: numero(linha.NAO_ATENDIDAS),
    encerradas: numero(linha.ENCERRADAS),
    ultima: String(linha.ULTIMA ?? ''),
  };
}

/** RN-07: as seis colunas somam o total — a tela avisa se o servidor devolver outra coisa. */
export function particaoConfere(grupo: GrupoDeSolicitacoes): boolean {
  return COLUNAS_SITUACAO.reduce((soma, c) => soma + grupo[c.campo], 0) === grupo.total;
}

export type FiltroDoGrupo =
  | { campo: 'vendedor'; vendedor: { id: number; nome: string } }
  | { campo: 'codfornec'; valor: string; rotulo: string }
  | { campo: 'codfilial'; valor: string; rotulo: string };

/** RN-11 (P-07): abrir o grupo é filtrar a lista detalhada por ele. */
export function filtroDoGrupo(dimensao: Dimensao, grupo: GrupoDeSolicitacoes): FiltroDoGrupo {
  if (dimensao === 'vendedor') return { campo: 'vendedor', vendedor: { id: numero(grupo.chave), nome: grupo.rotulo } };
  if (dimensao === 'fornecedor') return { campo: 'codfornec', valor: grupo.chave, rotulo: grupo.rotulo };
  return { campo: 'codfilial', valor: grupo.chave, rotulo: grupo.rotulo };
}

/** O `{ value, label }` de um seletor ganha a opção do grupo aberto quando ela não está na página à vista. */
export function comOpcao(opcoes: { value: string; label: string }[], valor: string, rotulo: string): { value: string; label: string }[] {
  if (!valor || (opcoes ?? []).some((o) => o.value === valor)) return opcoes ?? [];
  return [...(opcoes ?? []), { value: valor, label: rotulo || valor }];
}
