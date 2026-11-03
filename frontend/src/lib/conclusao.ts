// Faturamento em Andamento e Compras Concluídas no card (R-141, C-029 a C-031
// da 005), no molde do legado (PipeWorkspace.tsx:12262-12443 e 12490-12643):
// o saldo por item que a indústria ainda não faturou, o que falta para
// concluir e os itens faturados do pedido concluído.
//
// A trava da conclusão é a do SERVIDOR (`pendencias-conclusao-nf.sql`,
// `pendencias-conclusao-bo.sql` e `pendencias-conclusao-faturado.sql`):
// conferência de nota sem decisão, item em B.O. em aberto e, desde a R-144
// (P-6, como o legado), menos de 99,5 % do valor coberto — faturado mais o
// saldo marcado em B.O. como "não vem mais". A frase é a MESMA da SQL.
// Puro, testado em tests/conclusao.test.mjs.
import { moeda } from './formato.ts';

export interface ItemPedidoNf { CODPROD: number; DESCRICAO: string; QT_PEDIDA: number; PRECO_CUSTO: number }
export interface ItemFaturadoNf {
  ID: number; ID_NF: number; CODPROD: number; DESCRICAO: string;
  QT_FATURADA: number; PRECO_FATURADO: number; NUMLOTE: string; DT_VALIDADE: string;
}
export interface NotaNf { ID: number; NUMNOTA: number; SERIE: string }
export interface ConferenciaNf { ID_NF: number; CODPROD: number; DECISAO: string }

export type SituacaoFaturamento = 'pendente' | 'parcial' | 'faturado';

export interface SaldoDoItem {
  codprod: number;
  descricao: string;
  pedida: number;
  faturada: number;
  pendente: number;
  pct: number;
  situacao: SituacaoFaturamento;
}

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/**
 * Saldo por produto: pedida menos a soma do faturado em todas as notas.
 * Devolve só o que ainda tem saldo, o maior pendente primeiro. Faturado a
 * mais não vira saldo negativo.
 */
export function pendentesDeFaturamento(
  itensPedido: readonly ItemPedidoNf[],
  itensNf: readonly ItemFaturadoNf[],
): SaldoDoItem[] {
  const faturado = new Map<number, number>();
  for (const item of itensNf ?? []) {
    faturado.set(Number(item.CODPROD), (faturado.get(Number(item.CODPROD)) ?? 0) + numero(item.QT_FATURADA));
  }
  return (itensPedido ?? [])
    .filter((item) => numero(item.QT_PEDIDA) > 0)
    .map((item) => {
      const pedida = numero(item.QT_PEDIDA);
      const qtFaturada = faturado.get(Number(item.CODPROD)) ?? 0;
      const pendente = Math.max(0, pedida - qtFaturada);
      const situacao: SituacaoFaturamento = pendente === 0 ? 'faturado' : qtFaturada > 0 ? 'parcial' : 'pendente';
      return {
        codprod: Number(item.CODPROD),
        descricao: item.DESCRICAO,
        pedida,
        faturada: qtFaturada,
        pendente,
        pct: Math.min(100, (qtFaturada / pedida) * 100),
        situacao,
      };
    })
    .filter((saldo) => saldo.pendente > 0)
    .sort((a, b) => b.pendente - a.pendente || a.codprod - b.codprod);
}

export interface PendenciaDaConclusao { texto: string; trava: boolean }

/** RN-NF-34 do legado: 99,5 % conta como 100 % (diferença de centavos no preço faturado). */
export const MINIMO_COBERTO_PCT = 99.5;

/**
 * Quanto do valor do pedido está coberto: o faturado nas notas mais o saldo
 * que foi para o B.O. e não vem mais. Pedido sem valor não tem o que cobrir.
 */
export function coberturaDoFaturamento(e: { vlTotal: number; vlFaturado: number; vlBoCancelado: number }): {
  pct: number; falta: number; coberto: boolean;
} {
  const total = numero(e.vlTotal);
  if (total <= 0) return { pct: 100, falta: 0, coberto: true };
  const coberto = numero(e.vlFaturado) + numero(e.vlBoCancelado);
  const pct = (coberto / total) * 100;
  return { pct, falta: Math.max(0, total - coberto), coberto: coberto * 100 >= total * MINIMO_COBERTO_PCT };
}

/** A frase do servidor (PENDENCIAS_FATURADO_MOTIVO), caractere a caractere. */
export function textoFaltaFaturar(falta: number, pct: number): string {
  const r = moeda(falta).replace(/\u00a0/g, ' ');
  const p = numero(pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `Falta faturar ${r} (${p} % coberto; o mínimo para concluir é 99,5 %). Registre a nota complementar ou marque o saldo em B.O. como "não vem mais".`;
}

/**
 * "Pedido pronto para conclusão" ou a lista do que falta (PW:12402-12443).
 * As três travas são as do servidor, na mesma ordem.
 */
export function pendenciasDaConclusao(entrada: {
  conferenciasPendentes: number;
  boAbertos: number;
  vlTotal: number;
  vlFaturado: number;
  vlBoCancelado: number;
}): { pronto: boolean; pendencias: PendenciaDaConclusao[] } {
  const conferencias = Math.max(0, Math.trunc(numero(entrada.conferenciasPendentes)));
  const bo = Math.max(0, Math.trunc(numero(entrada.boAbertos)));
  const cobertura = coberturaDoFaturamento(entrada);
  const pendencias: PendenciaDaConclusao[] = [];
  if (conferencias > 0) {
    pendencias.push({
      texto: `Decida ${conferencias === 1 ? 'a conferência de nota fiscal pendente' : `as ${conferencias} conferências de nota fiscal pendentes`}.`,
      trava: true,
    });
  }
  if (bo > 0) {
    pendencias.push({ texto: `Resolva ${bo === 1 ? 'o item em B.O. em aberto' : `os ${bo} itens em B.O. em aberto`}.`, trava: true });
  }
  if (!cobertura.coberto) pendencias.push({ texto: textoFaltaFaturar(cobertura.falta, cobertura.pct), trava: true });
  return { pronto: pendencias.length === 0, pendencias };
}

export type DecisaoDoItem = 'aceito' | 'pendente' | 'recusado';

export interface ItemFaturadoDoCard {
  id: number;
  codprod: number;
  descricao: string;
  nota: string;
  quantidade: number;
  preco: number;
  subtotal: number;
  lote: string;
  validade: string;
  decisao: DecisaoDoItem;
}

/**
 * Os itens faturados, nota a nota, com a decisão das conferências daquele
 * produto naquela nota: uma recusada basta para o item contar como recusado,
 * uma pendente (sem recusa) deixa-o pendente; sem conferência é aceito.
 */
export function itensFaturados(
  itensNf: readonly ItemFaturadoNf[],
  notas: readonly NotaNf[],
  conferencias: readonly ConferenciaNf[],
): ItemFaturadoDoCard[] {
  const nota = new Map((notas ?? []).map((nf) => [Number(nf.ID), `${nf.NUMNOTA}${nf.SERIE ? `-${nf.SERIE}` : ''}`]));
  return (itensNf ?? []).map((item) => {
    const doItem = (conferencias ?? []).filter((c) => Number(c.ID_NF) === Number(item.ID_NF) && Number(c.CODPROD) === Number(item.CODPROD));
    const decisao: DecisaoDoItem = doItem.some((c) => c.DECISAO === 'recusado') ? 'recusado'
      : doItem.some((c) => c.DECISAO === 'pendente') ? 'pendente' : 'aceito';
    const quantidade = numero(item.QT_FATURADA);
    const preco = numero(item.PRECO_FATURADO);
    return {
      id: Number(item.ID),
      codprod: Number(item.CODPROD),
      descricao: item.DESCRICAO || `Produto ${item.CODPROD}`,
      nota: nota.get(Number(item.ID_NF)) ?? '',
      quantidade,
      preco,
      subtotal: quantidade * preco,
      lote: String(item.NUMLOTE ?? ''),
      validade: String(item.DT_VALIDADE ?? ''),
      decisao,
    };
  });
}
