// Regra pura da spec 007 (produtos em B.O.) — sem React, sem transporte.
// Testada em frontend/tests/bo.test.mjs.
//
// G-8: o texto de entrada em B.O. (Faturamento -> B.O.) tem UM dono, o
// `MOTIVOS` de transicoes.ts — é o que entra no teste de 500 combinações
// (RNF-005 da 002). Aqui só se reexporta, para a aba e o teste o lerem de um
// lugar só. Não existe `motivoConclusaoBo`: a frase da conclusão tem
// contagem (singular/plural), `MOTIVOS` (Record<string,string>) não a
// comporta, e R-046 tirou o espelho de tela dos pares da onda 2 — ela vive
// só na coluna PENDENCIAS_BO_MOTIVO de sqlPodeMover e é testada no smoke
// (backend/simulator/smoke/007-bo.mjs, RN-008).
import { MOTIVOS } from './transicoes.ts';
import { fmtData } from './formato.ts';

export { MOTIVOS } from './transicoes.ts';
export const MOTIVO_ENTRADA_BO = MOTIVOS.boEntrada;

export type SituacaoPrevisao = 'sem_previsao' | 'vencida' | 'hoje' | 'no_prazo';
export type StatusBoItem = 'aberto' | 'liberado' | 'cancelado';

/** RN-005 — comparação de texto AAAA-MM-DD, sem fuso: a mesma do SQL. */
export function situacaoDaPrevisao(dtPrevisao: string, hoje: string): SituacaoPrevisao {
  if (!dtPrevisao) return 'sem_previsao';
  if (dtPrevisao < hoje) return 'vencida';
  if (dtPrevisao === hoje) return 'hoje';
  return 'no_prazo';
}

/** `dias` é sempre positivo (diasEntre(dtPrevisao, hoje)) — quem chama calcula. */
export function rotuloSituacaoPrevisao(situacao: SituacaoPrevisao, dias: number): string {
  switch (situacao) {
    case 'sem_previsao': return 'Sem previsão';
    case 'vencida': return `Vencida há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    case 'hoje': return 'Vence hoje';
    case 'no_prazo': return 'No prazo';
    default: return '';
  }
}

/** Mesma conta do `diasEntre` do backend (add-010-bo.mjs) — UTC, sem fuso. */
function diasEntre(aIso: string, bIso: string): number {
  const a = aIso.split('-').map(Number);
  const b = bIso.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

/**
 * RN-001 — valida a marcação ANTES de gravar: produto fora do pedido, ou
 * quantidade pendente <= 0 ou acima da quantidade pedida. Mesmo texto que o
 * `sgcBoMarcar` devolve (add-010-bo.mjs) — uma regra, dois lugares.
 */
export function validarMarcacaoBo(
  marcacoes: { codprod: number; qtPendente: number; observacao?: string }[],
  itensDoPedido: { CODPROD: number; DESCRICAO: string; QT_PEDIDA: number; STATUS: string }[],
): string | null {
  const porCodigo = new Map(
    itensDoPedido.filter((item) => item.STATUS !== 'removido').map((item) => [Number(item.CODPROD), item]),
  );
  for (const marcacao of marcacoes) {
    const item = porCodigo.get(Number(marcacao.codprod));
    if (!item) return `O produto ${marcacao.codprod} não está neste pedido.`;
    if (marcacao.qtPendente <= 0 || marcacao.qtPendente > Number(item.QT_PEDIDA)) {
      return `Quantidade pendente inválida para ${item.DESCRICAO}.`;
    }
  }
  return null;
}

/**
 * RN-006 — o texto do aviso diário. Copiado literalmente para dentro do
 * corpo JS do cron (`textoAvisoBo` em add-010-bo.mjs) — uma SF da plataforma
 * não importa módulo do frontend; este teste puro é o que garante que os
 * dois dizem a mesma coisa.
 */
export function textoAvisoBo(e: { titulo: string; dtPrevisao: string; hoje: string; abertos: number }): string {
  const dias = diasEntre(e.dtPrevisao, e.hoje);
  const situacaoTexto = e.dtPrevisao === e.hoje ? 'vence hoje' : `venceu há ${dias}${dias === 1 ? ' dia' : ' dias'}`;
  const itensTexto = e.abertos === 1 ? '1 item' : `${e.abertos} itens`;
  return `Produtos em B.O. do pedido ${e.titulo}: a previsão de liberação era ${fmtData(e.dtPrevisao)}`
    + ` (${situacaoTexto}) e ${itensTexto} continuam em aberto. Reavalie com o fornecedor e registre uma previsão nova.`;
}

export function resumoBo(itens: { STATUS: string }[]): { abertos: number; liberados: number } {
  return {
    abertos: itens.filter((item) => item.STATUS === 'aberto').length,
    liberados: itens.filter((item) => item.STATUS === 'liberado').length,
  };
}

/**
 * O topo da fase B.O. no card (R-150, C-018), no molde do `BoFasePanel` do
 * legado: o total pendente dos itens em aberto, a carta de falta (a mais
 * recente, ou "pendente" quando não há) e o aviso de previsão vencida, que
 * fica até registrarem previsão nova — o mesmo critério de `situacaoDaPrevisao`.
 */
export function topoDoBo(e: {
  itens: { STATUS: string; VL_PENDENTE: number }[];
  documentos: { TIPO: string; ENVIADO_EM: string }[];
  dtPrevisao: string;
  hoje: string;
}): { totalPendente: number; cartaEm: string; avisoVencida: string } {
  const totalPendente = e.itens
    .filter((item) => item.STATUS === 'aberto')
    .reduce((soma, item) => soma + (Number(item.VL_PENDENTE) || 0), 0);
  const cartaEm = e.documentos
    .filter((d) => d.TIPO === 'carta_falta')
    .map((d) => String(d.ENVIADO_EM ?? ''))
    .sort()
    .at(-1) ?? '';
  const situacao = situacaoDaPrevisao(e.dtPrevisao, e.hoje);
  const dias = situacao === 'vencida' ? diasEntre(e.dtPrevisao, e.hoje) : 0;
  const avisoVencida = situacao === 'vencida'
    ? `Previsão de liberação vencida há ${dias} ${dias === 1 ? 'dia' : 'dias'}. Reavalie com o fornecedor e registre uma previsão nova.`
    : '';
  return { totalPendente, cartaEm, avisoVencida };
}

/* ── CSV de /bo (A-15, R-037): as MESMAS colunas da tabela do painel, sobre
 *    as linhas já carregadas do filtro atual — zero execução nova. ── */

export interface PainelBoLinha {
  ID: number; TITULO: string; FORNECEDOR: string; FILIAL: string;
  CODPROD: number; DESCRICAO: string; QT_PENDENTE: number; VL_PENDENTE: number;
  CLIENTES_IMPACTADOS: number; DT_PREVISAO_BO: string; STATUS: string;
}

export const COLUNAS_CSV_BO: string[] = [
  'Produto', 'Código', 'Pedido', 'Fornecedor', 'Filial',
  'Pendente', 'Valor', 'Clientes impactados', 'Previsão', 'Status',
];

/** Vírgula decimal e duas casas — o que o Excel em pt-BR lê sem configurar nada. */
const valorBr = (valor: number) => valor.toFixed(2).replace('.', ',');

export function linhasCsvBo(linhas: PainelBoLinha[]): (string | number)[][] {
  return linhas.map((l) => [
    l.DESCRICAO,
    l.CODPROD,
    l.TITULO,
    l.FORNECEDOR,
    l.FILIAL,
    l.QT_PENDENTE,
    valorBr(l.VL_PENDENTE),
    l.CLIENTES_IMPACTADOS,
    l.DT_PREVISAO_BO,
    l.STATUS,
  ]);
}
