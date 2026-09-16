// Regra pura da spec 008 (solicitações do comercial) — sem React, sem
// transporte. Testada em frontend/tests/solicitacoes.test.mjs.
//
// Duas coisas moram aqui: os rótulos (situação própria, situação de
// atendimento, prioridade) e o RASTREIO pós-aprovação — a classificação nos
// dois eixos independentes (o cliente comprou? o estoque encalhou?) a partir
// das linhas que `sgcWintRastreioSolicitacoes` devolve.
//
// O rastreio é regra de TELA de propósito (R-055): os três limites são
// parâmetros que quem opera ajusta, e mudar um deles reclassifica o que já
// está na tela sem nenhuma consulta nova (RNF-004). Por isso a classificação
// é uma função pura sobre a linha, e não uma coluna do SQL.

export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada' | 'cancelada';
export type SituacaoAtendimento =
  | 'sem_pedido' | 'em_analise' | 'em_aprovacao' | 'em_envio' | 'enviada'
  | 'em_transito' | 'em_faturamento' | 'nao_atendida' | 'atendida';
export type Prioridade = 'normal' | 'alta' | 'urgente';
export type VendaCliente =
  | 'comprou' | 'comprou_outra_filial' | 'nao_comprou' | 'sem_cliente' | 'carencia' | 'sem_dado';
export type SituacaoEstoque = 'parado' | 'excesso' | 'girando' | 'sem_estoque' | 'sem_dado';

/** Os tons de `Status` e de `Badge` de components/page.tsx (design.md §8.4). */
export type TomStatus = 'live' | 'off' | 'attention' | 'alert';
export type TomBadge = 'neutral' | 'accent' | 'attention' | 'alert';

export interface LimitesRastreio {
  /** Dias desde a aprovação em que ainda não se cobra resultado. */
  carenciaDias: number;
  /** Dias sem saída a partir dos quais o estoque está parado. */
  paradoDias: number;
  /** Dias de cobertura acima dos quais o estoque está em excesso. */
  coberturaDias: number;
}

/** RN-016 — os padrões que a área calibrou no p-45547. */
export const LIMITES_PADRAO: LimitesRastreio = { carenciaDias: 30, paradoDias: 60, coberturaDias: 90 };

/** R-055/RNF-003: 120 pares por execução, dentro do teto do literal Oracle. */
export const PARES_POR_LOTE = 120;
export const RASTREIO_MAX_CARACTERES = 4000;

/* ─────────────── prioridade, status e situação ─────────────── */

const PRIORIDADES: readonly Prioridade[] = ['normal', 'alta', 'urgente'];

/** RN-017 — prioridade desconhecida vale normal; é o mesmo default da coluna. */
export function prioridadeDe(bruto: unknown): Prioridade {
  const valor = String(bruto ?? '').toLowerCase();
  return (PRIORIDADES as readonly string[]).includes(valor) ? (valor as Prioridade) : 'normal';
}

/** Urgente primeiro, normal por último — a ordem da fila e do bloco (RN-012). */
export function ordemDaPrioridade(prioridade: Prioridade): number {
  return prioridade === 'urgente' ? 0 : prioridade === 'alta' ? 1 : 2;
}

const ROTULO_STATUS: Record<StatusSolicitacao, { label: string; tom: TomBadge }> = {
  pendente: { label: 'Pendente', tom: 'attention' },
  aprovada: { label: 'Aprovada', tom: 'accent' },
  recusada: { label: 'Recusada', tom: 'alert' },
  cancelada: { label: 'Cancelada', tom: 'neutral' },
};

export function rotuloStatus(status: string): { label: string; tom: TomBadge } {
  return ROTULO_STATUS[status as StatusSolicitacao] ?? { label: String(status || '—'), tom: 'neutral' };
}

// design.md §9.1: estado nunca só por cor — todo tom vem com o texto escrito.
const ROTULO_SITUACAO: Record<SituacaoAtendimento, { label: string; tom: TomStatus }> = {
  sem_pedido: { label: 'Sem pedido', tom: 'off' },
  em_analise: { label: 'Em análise', tom: 'attention' },
  em_aprovacao: { label: 'Em aprovação', tom: 'attention' },
  em_envio: { label: 'Em envio', tom: 'attention' },
  enviada: { label: 'Enviada', tom: 'attention' },
  em_transito: { label: 'Em trânsito', tom: 'attention' },
  em_faturamento: { label: 'Em faturamento', tom: 'attention' },
  atendida: { label: 'Atendida', tom: 'live' },
  nao_atendida: { label: 'Não atendida', tom: 'alert' },
};

export function rotuloSituacao(situacao: string): { label: string; tom: TomStatus } {
  return ROTULO_SITUACAO[situacao as SituacaoAtendimento] ?? ROTULO_SITUACAO.sem_pedido;
}

// RN-003: "sem cliente informado" NUNCA é "cliente não comprou". Inativo é
// cinza, nunca vermelho: o vermelho está reservado para o cliente que não
// comprou e para o estoque parado.
const ROTULO_VENDA: Record<VendaCliente, { label: string; tom: TomStatus }> = {
  comprou: { label: 'Cliente comprou', tom: 'live' },
  comprou_outra_filial: { label: 'Comprou em outra filial', tom: 'live' },
  nao_comprou: { label: 'Cliente não comprou', tom: 'alert' },
  carencia: { label: 'Aguardando giro', tom: 'off' },
  sem_cliente: { label: 'Sem cliente informado', tom: 'off' },
  sem_dado: { label: 'Sem dado', tom: 'off' },
};

export function rotuloVenda(venda: VendaCliente): { label: string; tom: TomStatus } {
  return ROTULO_VENDA[venda] ?? ROTULO_VENDA.sem_dado;
}

const ROTULO_ESTOQUE: Record<SituacaoEstoque, { label: string; tom: TomStatus }> = {
  parado: { label: 'Parado na filial', tom: 'alert' },
  excesso: { label: 'Em excesso', tom: 'attention' },
  girando: { label: 'Girando', tom: 'live' },
  sem_estoque: { label: 'Sem estoque', tom: 'off' },
  sem_dado: { label: 'Sem dado', tom: 'off' },
};

export function rotuloEstoque(estoque: SituacaoEstoque): { label: string; tom: TomStatus } {
  return ROTULO_ESTOQUE[estoque] ?? ROTULO_ESTOQUE.sem_dado;
}

/* ─────────────── registro ─────────────── */

/**
 * RN-001 — a MESMA validação que o `WHERE` de `sgcEscSolicitacaoInserir`
 * aplica, aqui para a tela apontar os campos de uma vez e não gastar a
 * chamada. Lista vazia = válida.
 */
export function validarSolicitacao(entrada: {
  codprod: number; quantidade: number; codfilial: string; justificativa: string;
}): string[] {
  const erros: string[] = [];
  if (!(Number(entrada.codprod) > 0)) erros.push('Escolha o produto no cadastro do ERP.');
  if (!(Number(entrada.quantidade) > 0)) erros.push('Informe uma quantidade maior que zero.');
  if (String(entrada.codfilial ?? '').trim() === '') erros.push('Escolha a filial da solicitação.');
  if (String(entrada.justificativa ?? '').trim().length < 10) {
    erros.push('Escreva uma justificativa com pelo menos 10 caracteres.');
  }
  return erros;
}

/**
 * C-018 — o texto digitado vira `{ codcli, busca }` para `sgcWintClienteBuscar`.
 * Código é número curto (o WinThor não tem cliente com 8 dígitos); o que
 * parece CNPJ perde a pontuação, porque é assim que `CGCENT` é comparado.
 */
export function buscaDeCliente(texto: string): { codcli: number; busca: string } {
  const bruto = String(texto ?? '').trim();
  const digitos = bruto.replace(/\D/g, '');
  if (/^\d+$/.test(bruto) && bruto.length <= 7) return { codcli: Number(bruto), busca: bruto };
  if (digitos.length >= 8 && /^[\d./\s-]+$/.test(bruto)) return { codcli: 0, busca: digitos };
  return { codcli: 0, busca: bruto };
}

/* ─────────────── rastreio: pares, lotes e classificação ─────────────── */

export interface AlvoRastreio {
  CODPROD?: number | string | null;
  CODFILIAL?: string | null;
  CODCLI?: number | string | null;
  AVALIADO_EM?: string | null;
  STATUS?: string | null;
}

export interface RastreioRow {
  CODPROD?: number | string | null;
  CODFILIAL?: string | null;
  DT_REFERENCIA?: string | null;
  CODCLI?: number | string | null;
  QT_ESTOQUE?: number | string | null;
  DT_ULT_SAIDA?: string | null;
  QT_VENDA_90D?: number | string | null;
  QT_VENDIDA_POS?: number | string | null;
  DT_VENDA_POS?: string | null;
  QT_VENDIDA_CLIENTE?: number | string | null;
  QT_VENDIDA_CLIENTE_GERAL?: number | string | null;
  DT_VENDA_CLIENTE?: string | null;
}

export interface RastreioSolicitacao {
  chave: string;
  venda: VendaCliente;
  estoque: SituacaoEstoque;
  qtVendidaCliente: number;
  qtVendidaClienteGeral: number;
  /** Venda do produto na filial no período — contexto ao lado, nunca a resposta (RN-013). */
  qtVendidaFilial: number;
  qtEstoque: number;
  diasDesdeReferencia: number;
  /** `null` = sem saída registrada. */
  diasSemSaida: number | null;
  /** `null` = giro zero, cobertura infinita. */
  diasCobertura: number | null;
  giroDiario: number;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Diferença em dias entre duas datas AAAA-MM-DD, sem fuso (a mesma do backend). */
function diasEntre(aIso: string, bIso: string): number {
  const a = aIso.split('-').map(Number);
  const b = bIso.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

/** A chave que liga a linha do rastreio à solicitação: o próprio par enviado. */
export function chaveRastreio(codprod: unknown, codfilial: unknown, dtRef: unknown, codcli: unknown): string {
  return `${Math.trunc(numero(codprod))}:${String(codfilial ?? '')}:${String(dtRef ?? '').slice(0, 10)}:${Math.trunc(numero(codcli))}`;
}

/** RN-015 — a referência é a data de APROVAÇÃO; sem ela a solicitação fica fora. */
export function dataReferencia(alvo: AlvoRastreio): string {
  const data = String(alvo?.AVALIADO_EM ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : '';
}

/**
 * RN-015 — quem entra no rastreio pós-aprovação. A data não basta: `recusada` e
 * `cancelada-depois-de-avaliada` também têm AVALIADO_EM, e o painel perguntaria
 * "o cliente comprou o que aprovamos?" sobre uma compra que nunca foi aprovada.
 */
export function alvoDeRastreio(alvo: AlvoRastreio): boolean {
  return String(alvo?.STATUS ?? '') === 'aprovada' && dataReferencia(alvo) !== '';
}

/**
 * Os pares `CODPROD:CODFILIAL:AAAA-MM-DD:CODCLI` das solicitações que estão na
 * tela. Cada campo é reconstruído a partir de número e data validada — nada que
 * veio do banco entra cru no `{{pares}}`, que é substituído por texto no SQL.
 * Par repetido entra uma vez só (a mesma linha responde pelas duas).
 */
export function montarPares(alvos: AlvoRastreio[]): string[] {
  const pares: string[] = [];
  const vistos = new Set<string>();
  for (const alvo of alvos ?? []) {
    const codprod = Math.trunc(numero(alvo?.CODPROD));
    const codfilial = String(alvo?.CODFILIAL ?? '').trim();
    const dtRef = dataReferencia(alvo);
    if (codprod <= 0 || codfilial === '' || dtRef === '') continue;
    const par = chaveRastreio(codprod, codfilial, dtRef, alvo?.CODCLI);
    if (vistos.has(par)) continue;
    vistos.add(par);
    pares.push(par);
  }
  return pares;
}

/** RN-016 — 120 pares por lote E, antes disso, o teto de 4000 caracteres. */
export function lotesDePares(pares: string[]): string[] {
  const lotes: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  const fechar = () => {
    if (atual.length > 0) lotes.push(atual.join(','));
    atual = [];
    tamanho = 0;
  };
  for (const par of pares ?? []) {
    const custo = par.length + (atual.length > 0 ? 1 : 0);
    if (atual.length >= PARES_POR_LOTE || tamanho + custo > RASTREIO_MAX_CARACTERES) fechar();
    atual.push(par);
    tamanho += custo;
  }
  fechar();
  return lotes;
}

/**
 * RN-013 e RN-014 — os dois eixos, independentes: nenhum anula o outro.
 * `row` nulo é lote que falhou (ou solicitação fora do rastreio): `sem_dado`
 * nos dois, NUNCA "cliente não comprou" nem "estoque normal" (RF-017/C-016).
 */
export function classificarRastreio(
  row: RastreioRow | null | undefined,
  hojeIso: string,
  limites: LimitesRastreio = LIMITES_PADRAO,
): RastreioSolicitacao {
  if (!row) {
    return {
      chave: '', venda: 'sem_dado', estoque: 'sem_dado',
      qtVendidaCliente: 0, qtVendidaClienteGeral: 0, qtVendidaFilial: 0, qtEstoque: 0,
      diasDesdeReferencia: 0, diasSemSaida: null, diasCobertura: null, giroDiario: 0,
    };
  }

  const dtReferencia = String(row.DT_REFERENCIA ?? '').slice(0, 10);
  const diasDesdeReferencia = dtReferencia ? Math.max(0, diasEntre(dtReferencia, hojeIso)) : 0;
  const codcli = Math.trunc(numero(row.CODCLI));
  const qtVendidaCliente = numero(row.QT_VENDIDA_CLIENTE);
  const qtVendidaClienteGeral = numero(row.QT_VENDIDA_CLIENTE_GERAL);
  const qtVendidaFilial = numero(row.QT_VENDIDA_POS);
  const qtEstoque = numero(row.QT_ESTOQUE);

  let venda: VendaCliente;
  if (codcli <= 0) venda = 'sem_cliente';
  else if (qtVendidaCliente > 0) venda = 'comprou';
  else if (qtVendidaClienteGeral > 0) venda = 'comprou_outra_filial';
  else if (diasDesdeReferencia < limites.carenciaDias) venda = 'carencia';
  else venda = 'nao_comprou';

  // O giro por dois caminhos, valendo o maior: os contadores de PCEST cobrem os
  // três meses fechados e ficam zerados para o item que voltou a vender agora.
  const giroRegistrado = numero(row.QT_VENDA_90D) / 90;
  const giroObservado = qtVendidaFilial / Math.max(1, diasDesdeReferencia);
  const giroDiario = Math.max(giroRegistrado, giroObservado);
  const diasCobertura = giroDiario > 0 ? qtEstoque / giroDiario : null;

  // A última saída vem de dois lugares: PCEST.DTULTSAIDA cobre um período maior
  // que a janela consultada em PCMOV.
  const saidas = [String(row.DT_ULT_SAIDA ?? ''), String(row.DT_VENDA_POS ?? '')]
    .filter((data) => /^\d{4}-\d{2}-\d{2}$/.test(data.slice(0, 10)))
    .map((data) => data.slice(0, 10))
    .sort();
  const ultimaSaida = saidas.length > 0 ? saidas[saidas.length - 1] : '';
  const diasSemSaida = ultimaSaida ? Math.max(0, diasEntre(ultimaSaida, hojeIso)) : null;

  let estoque: SituacaoEstoque;
  if (qtEstoque <= 0) estoque = 'sem_estoque';
  else if (diasDesdeReferencia < limites.carenciaDias) estoque = 'girando';
  else if (diasSemSaida === null || diasSemSaida >= limites.paradoDias) estoque = 'parado';
  else if (diasCobertura === null || diasCobertura > limites.coberturaDias) estoque = 'excesso';
  else estoque = 'girando';

  return {
    chave: chaveRastreio(row.CODPROD, row.CODFILIAL, dtReferencia, codcli),
    venda,
    estoque,
    qtVendidaCliente,
    qtVendidaClienteGeral,
    qtVendidaFilial,
    qtEstoque,
    diasDesdeReferencia,
    diasSemSaida,
    diasCobertura,
    giroDiario,
  };
}

/** As linhas de todos os lotes viram um mapa por par — o que a tela consulta. */
export function indexarRastreio(
  rows: RastreioRow[],
  hojeIso: string,
  limites: LimitesRastreio = LIMITES_PADRAO,
): Map<string, RastreioSolicitacao> {
  const mapa = new Map<string, RastreioSolicitacao>();
  for (const row of rows ?? []) {
    const classificada = classificarRastreio(row, hojeIso, limites);
    if (classificada.chave) mapa.set(classificada.chave, classificada);
  }
  return mapa;
}

/**
 * A contagem por classe que abre o painel. `sem_dado` conta UMA vez por
 * solicitação (o lote que falha zera os dois eixos de uma vez): é o número que
 * o aviso de RF-017 mostra.
 */
export function resumoRastreio(itens: RastreioSolicitacao[]): Record<string, number> {
  const resumo: Record<string, number> = {};
  const somar = (chave: string) => { resumo[chave] = (resumo[chave] ?? 0) + 1; };
  for (const item of itens ?? []) {
    const semDado = item.venda === 'sem_dado' || item.estoque === 'sem_dado';
    if (semDado) {
      somar('sem_dado');
      continue;
    }
    somar(item.venda);
    somar(item.estoque);
  }
  return resumo;
}

/* ─────────────── CSV do rastreio (C-023, R-037) ─────────────── */

/** Uma linha de `sgcSolicitacoesListar` — o contrato que a tela inteira consome. */
export interface LinhaSolicitacao {
  ID: number;
  CODPROD: number;
  DESCRICAO: string;
  EMBALAGEM: string;
  UNIDADE: string;
  CODFORNEC: number;
  FORNECEDOR: string;
  CODFILIAL: string;
  FILIAL: string;
  QUANTIDADE: number;
  JUSTIFICATIVA: string;
  CODCLI: number;
  CLIENTE: string;
  CNPJ_CLIENTE: string;
  PRIORIDADE: string;
  STATUS: string;
  SITUACAO: string;
  MOTIVO: string;
  ID_CARD: number;
  TITULO_CARD: string;
  ID_ITEM: number;
  AVALIADO_POR_NOME: string;
  AVALIADO_EM: string;
  CRIADO_POR: number;
  CRIADO_POR_NOME: string;
  CRIADO_EM: string;
}

/** As MESMAS colunas da tabela do painel, na mesma ordem. */
export function colunasDoCsv(): string[] {
  return [
    'Produto', 'Cliente', 'Filial', 'Aprovada em', 'Situação do cliente',
    'Situação do estoque', 'Vendido ao cliente', 'Estoque atual', 'Dias de cobertura',
  ];
}

/** Vírgula decimal: o que o Excel em pt-BR lê sem configurar nada. */
const numeroBr = (valor: number) => valor.toFixed(2).replace('.', ',');

export function linhaDoCsv(
  linha: LinhaSolicitacao,
  detalhe: RastreioSolicitacao | null,
): (string | number)[] {
  const cliente = Number(linha.CODCLI) > 0
    ? `${linha.CODCLI} · ${linha.CLIENTE || ''}`.trim()
    : 'Sem cliente informado';
  return [
    linha.DESCRICAO,
    cliente,
    linha.FILIAL || linha.CODFILIAL,
    String(linha.AVALIADO_EM ?? '').slice(0, 10),
    rotuloVenda(detalhe ? detalhe.venda : 'sem_dado').label,
    rotuloEstoque(detalhe ? detalhe.estoque : 'sem_dado').label,
    detalhe ? numeroBr(detalhe.qtVendidaCliente) : '',
    detalhe ? numeroBr(detalhe.qtEstoque) : '',
    detalhe && detalhe.diasCobertura !== null ? String(Math.round(detalhe.diasCobertura)) : '',
  ];
}
