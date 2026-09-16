// Extrato do pedido (spec 010): modelo puro, montado a partir do que
// `sgcPedidoCarregar` (002/003, R-068) e `sgcNfListar` (005) já devolvem —
// sem SF nova (R-051). Cada campo usado aqui é uma coluna que uma das duas
// leituras já publica (conferido linha a linha contra `backend/add-005-*` e
// `backend/add-008-*` no plan.md).
//
// Módulo puro, sem React e sem SDK: `frontend/tests/extrato.test.mjs` o
// exercita direto com `node --test`. `pages/quadros/extrato-html.ts` e
// `AcoesDoPedido.tsx` são os únicos consumidores.

import type { PedidoCapa } from './pedido.ts';
import { itemDeLinha, type ItemPedido } from './compras.ts';
import { compararPrazo, type ComparacaoPrazo } from './prazo-pagamento.ts';
import { fmtDataHora } from './formato.ts';
import type { ChaveFase } from './transicoes.ts';

/** RN-002 — as três fases em que o pedido ainda não foi decidido. */
export const FASES_DECISAO: readonly ChaveFase[] = ['analise', 'tecnica', 'diretoria'];

/**
 * `sgcPedidoCarregar` devolve `P.*` — mais colunas de `SGC_PEDIDO` do que
 * `PedidoCapa` (002) declara. Prazo e criador (R-068) são as que o extrato
 * usa e a 002 não precisou tipar; por isso a interseção mora aqui (D-002),
 * sem editar `lib/pedido.ts`.
 */
export type PedidoParaExtrato = PedidoCapa & {
  PRAZO_PADRAO?: string;
  PRAZO_ACORDADO?: string;
  PRAZO_JUSTIFICATIVA?: string;
  CRIADOR_NOME?: string;
};

/** Uma linha de `sgcNfListar` → `nfs` (`SELECT * FROM SGC_NF`); só o que RF-009 imprime. */
export interface NotaFiscalExtrato {
  NUMNOTA: number | string;
  SERIE?: string;
  DT_EMISSAO?: string;
  VL_TOTAL?: number;
}

export type MarcaExtrato = 'nao_aprovado' | 'cancelado' | null;

export interface CabecalhoExtrato {
  idCard: number;
  fornecedor: string;
  filial: string;
  periodoInicio: string;
  periodoFim: string;
  /** RF-010 — nome de quem criou o pedido; `''` até a base publicar R-068. */
  criador: string;
  /** RN-009 — só preenchido depois que o envio foi registrado. */
  numeroWinthor: string;
}

/** RN-005 — os dois prazos e a comparação (`compararPrazo`, 003/R-015), mais o texto livre da justificativa. */
export type PrazoExtrato = ComparacaoPrazo & {
  padrao: string;
  acordado: string;
  justificativa: string;
};

/** Uma linha de decisão já registrada (técnica, diretoria ou cancelamento). */
export interface DecisaoExtrato {
  titulo: string;
  texto: string;
}

export interface NotaDoFaturamento {
  numero: string;
  data: string;
  valor: number;
}

/** RN-008 — só existe quando há ao menos uma nota vinculada. */
export interface FaturamentoExtrato {
  temNota: boolean;
  notas: NotaDoFaturamento[];
  /** Percentual faturado em valor (soma das notas ÷ total do pedido). 0 sem nota ou com total zero. */
  percentual: number;
}

export interface ModeloExtrato {
  cabecalho: CabecalhoExtrato;
  marca: MarcaExtrato;
  /** RN-002/003/004 — só `true` nas três fases de decisão. */
  assinaturas: boolean;
  prazo: PrazoExtrato;
  /** RN-006 — só os itens com quantidade pedida > 0. */
  itens: ItemPedido[];
  /** D-003/RN-007 — `pedido.VL_TOTAL`, nunca a soma recalculada dos itens. */
  totalPedido: number;
  decisoes: DecisaoExtrato[];
  faturamento: FaturamentoExtrato;
  /** RN-010 — `extrato-pedido-<idCard>`, sem extensão (cada chamador acrescenta a dela). */
  nomeArquivo: string;
  /** RN-011 — hora de quem gera, em `dd/mm/aaaa hh:mm`. */
  geradoEm: string;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

const preenchido = (valor: unknown) => String(valor ?? '').trim() !== '';

/** RN-011 — getters LOCAIS do `Date` (nunca UTC): a hora é a de quem gera, não a gravada em outro fuso. */
function dataHoraLocal(agora: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()} ${dois(agora.getHours())}:${dois(agora.getMinutes())}`;
}

/** RN-001..004 — a FASE manda; nunca uma data de aprovação de um ciclo anterior. */
export function marcaDaFase(fase: ChaveFase): MarcaExtrato {
  if ((FASES_DECISAO as readonly ChaveFase[]).includes(fase)) return 'nao_aprovado';
  if (fase === 'cancelado') return 'cancelado';
  return null;
}

/**
 * As decisões já registradas no pedido. Aprovar limpa o motivo e grava
 * quem/quando; reprovar faz o inverso (`sgcEscPedido{Tecnica,Diretoria}{Aprovar,Reprovar}`,
 * `backend/add-005-quadro-compras.mjs`) — por isso checar `*_EM` e `*_MOTIVO`
 * já basta para saber qual dos dois aconteceu por último.
 */
function decisoesDoPedido(pedido: PedidoParaExtrato): DecisaoExtrato[] {
  const decisoes: DecisaoExtrato[] = [];
  if (preenchido(pedido.TEC_EM)) {
    decisoes.push({ titulo: 'Aprovação técnica', texto: `Aprovado por ${pedido.TEC_NOME || '—'} em ${fmtDataHora(pedido.TEC_EM)}.` });
  } else if (preenchido(pedido.TEC_MOTIVO)) {
    decisoes.push({ titulo: 'Aprovação técnica', texto: `Reprovado: ${pedido.TEC_MOTIVO}` });
  }
  if (preenchido(pedido.DIR_EM)) {
    decisoes.push({ titulo: 'Aprovação da diretoria', texto: `Aprovado por ${pedido.DIR_NOME || '—'} em ${fmtDataHora(pedido.DIR_EM)}.` });
  } else if (preenchido(pedido.DIR_MOTIVO)) {
    decisoes.push({ titulo: 'Aprovação da diretoria', texto: `Reprovado: ${pedido.DIR_MOTIVO}` });
  }
  if (preenchido(pedido.CANC_MOTIVO)) {
    decisoes.push({
      titulo: 'Cancelamento',
      texto: `Cancelado por ${pedido.CANC_NOME || '—'} em ${fmtDataHora(pedido.CANC_EM)}: ${pedido.CANC_MOTIVO}`,
    });
  }
  return decisoes;
}

/** RN-008 — a lista de notas e o percentual faturado, direto de `nfsBrutas` (sem ler `VL_FATURADO` do pedido). */
function faturamentoDoPedido(nfsBrutas: NotaFiscalExtrato[], totalPedido: number): FaturamentoExtrato {
  const notas = (nfsBrutas ?? []).map((nf) => ({
    numero: nf.SERIE ? `${nf.NUMNOTA}/${nf.SERIE}` : String(nf.NUMNOTA ?? ''),
    data: String(nf.DT_EMISSAO ?? ''),
    valor: numero(nf.VL_TOTAL),
  }));
  const somaNotas = notas.reduce((soma, nota) => soma + nota.valor, 0);
  return {
    temNota: notas.length > 0,
    notas,
    percentual: totalPedido > 0 ? Math.round((somaNotas / totalPedido) * 10000) / 100 : 0,
  };
}

/**
 * T-002 — monta o extrato. Pura: nenhuma chamada ao servidor mora aqui (quem
 * chama já buscou `pedido`/`itensBrutos`/`nfsBrutas` de novo, D-004). `agora`
 * é injetável para o teste de RN-011 (C-016) fixar a hora.
 */
export function montarExtrato(
  pedido: PedidoParaExtrato,
  itensBrutos: Record<string, unknown>[],
  fase: ChaveFase,
  nfsBrutas: NotaFiscalExtrato[],
  agora: Date = new Date(),
): ModeloExtrato {
  const marca = marcaDaFase(fase);
  const totalPedido = numero(pedido.VL_TOTAL);
  const comparacao = compararPrazo(pedido.PRAZO_PADRAO, pedido.PRAZO_ACORDADO);

  return {
    cabecalho: {
      idCard: numero(pedido.ID_CARD),
      fornecedor: String(pedido.FORNECEDOR ?? ''),
      filial: String(pedido.FILIAL ?? ''),
      periodoInicio: String(pedido.PERIODO_INICIO ?? ''),
      periodoFim: String(pedido.PERIODO_FIM ?? ''),
      criador: String(pedido.CRIADOR_NOME ?? '').trim(),
      numeroWinthor: preenchido(pedido.DT_ENVIO) ? String(pedido.NUMPED_WINTHOR ?? '').trim() : '',
    },
    marca,
    assinaturas: marca === 'nao_aprovado',
    prazo: {
      ...comparacao,
      padrao: String(pedido.PRAZO_PADRAO ?? ''),
      acordado: String(pedido.PRAZO_ACORDADO ?? ''),
      justificativa: String(pedido.PRAZO_JUSTIFICATIVA ?? '').trim(),
    },
    itens: (itensBrutos ?? []).map(itemDeLinha).filter((item) => item.qtPedida > 0),
    totalPedido,
    decisoes: decisoesDoPedido(pedido),
    faturamento: faturamentoDoPedido(nfsBrutas, totalPedido),
    nomeArquivo: `extrato-pedido-${numero(pedido.ID_CARD)}`,
    geradoEm: dataHoraLocal(agora),
  };
}

export interface LinhasCsvExtrato {
  cabecalho: string[];
  linhas: (string | number)[][];
}

/** T-003/RN-012 — as mesmas linhas de item do documento impresso, na mesma ordem. */
export function linhasCsvExtrato(modelo: ModeloExtrato): LinhasCsvExtrato {
  return {
    cabecalho: ['Código', 'Descrição', 'Embalagem', 'Quantidade', 'Custo unitário', 'Total'],
    linhas: modelo.itens.map((item) => [
      item.codprod,
      item.descricao,
      item.embalagem,
      item.qtPedida,
      item.precoCusto.toFixed(2).replace('.', ','),
      (item.qtPedida * item.precoCusto).toFixed(2).replace('.', ','),
    ]),
  };
}

/** T-004/RN-013 — `window.open` devolve `null` quando o navegador bloqueia o pop-up. */
export function popupFoiBloqueado(janela: Window | null): boolean {
  return janela === null;
}
