// O contrato do pedido aberto: tipos, o contexto React e o `usePedido` que as
// abas Itens e Alertas usam. O componente `PedidoProvider` mora ao lado, em
// `PedidoProvider.tsx` — a regra de fast refresh do ESLint não deixa um arquivo
// exportar componente e função no mesmo lugar.
//
// UMA execução de `sgcPedidoCarregar` por card aberto (D-003; RNF-002): trocar
// de aba não recarrega nada, porque o estado é do provedor e não da aba.

import * as React from 'react';
import type { ItemPedido } from '@/lib/compras';
import { reprovacoesDoPedido, type Reprovacao } from '@/lib/resumo-pedido';

export interface CapaPedido {
  idCard: number;
  codfornec: number;
  fornecedor: string;
  codfilial: string;
  filial: string;
  periodoInicio: string;
  periodoFim: string;
  vlTotal: number;
  prazoPadrao: string;
  prazoAcordado: string;
  prazoJustificativa: string;
  /** R-133: o pedido voltou reprovado (técnica e/ou diretoria) — o banner do topo da Análise. */
  reprovacoes: Reprovacao[];
}

export interface AlertaPedido {
  id: number;
  codprod: number;
  tipo: string;
  /** `excesso:<codprod>:<codfilial>` ou `vencimento:…` (add-006). */
  chave: string;
  mensagem: string;
  lido: boolean;
  lidoEm: string;
  justificativa: string;
}

export interface EstadoPedido {
  cardId: number;
  carregando: boolean;
  erro: string;
  capa: CapaPedido | null;
  itens: ItemPedido[];
  alertas: AlertaPedido[];
}

export interface ContextoPedido extends EstadoPedido {
  persona: string;
  podeEditar: boolean;
  /** P-08 B: RESTRICTED opera só os pedidos que criou. */
  somenteProprios: boolean;
  usuarioId: number;
  recarregar: (cardId: number) => Promise<void>;
  definirCapa: (capa: CapaPedido) => void;
}

export const ESTADO_VAZIO: EstadoPedido = {
  cardId: 0, carregando: false, erro: '', capa: null, itens: [], alertas: [],
};

export const PedidoContexto = React.createContext<ContextoPedido | null>(null);

type Linha = Record<string, unknown>;

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

export function capaDeLinha(linha: Linha): CapaPedido {
  return {
    idCard: numero(linha.ID_CARD),
    codfornec: numero(linha.CODFORNEC),
    fornecedor: String(linha.FORNECEDOR ?? ''),
    codfilial: String(linha.CODFILIAL ?? ''),
    filial: String(linha.FILIAL ?? ''),
    periodoInicio: String(linha.PERIODO_INICIO ?? ''),
    periodoFim: String(linha.PERIODO_FIM ?? ''),
    vlTotal: numero(linha.VL_TOTAL),
    prazoPadrao: String(linha.PRAZO_PADRAO ?? ''),
    prazoAcordado: String(linha.PRAZO_ACORDADO ?? ''),
    prazoJustificativa: String(linha.PRAZO_JUSTIFICATIVA ?? ''),
    reprovacoes: reprovacoesDoPedido(linha),
  };
}

export function alertaDeLinha(linha: Linha): AlertaPedido {
  return {
    id: numero(linha.ID),
    codprod: numero(linha.CODPROD),
    tipo: String(linha.TIPO ?? ''),
    chave: String(linha.CHAVE ?? ''),
    mensagem: String(linha.MENSAGEM ?? ''),
    lido: numero(linha.LIDO) === 1,
    lidoEm: String(linha.LIDO_EM ?? ''),
    justificativa: String(linha.JUSTIFICATIVA ?? ''),
  };
}

/**
 * Lê o pedido do card aberto, carregando-o na primeira vez que este card
 * aparece. Card já carregado não gera execução nenhuma.
 *
 * `criadoPor` é o dono do card (`ctx.card.criadoPor`): com ele o `podeEditar`
 * espelha na tela a guarda que o `pedidoEmAnalise` do add-006 faz no servidor
 * — RESTRICTED só edita o que criou (P-08 B).
 */
export function usePedido(cardId: number, criadoPor?: number | null): ContextoPedido {
  const contexto = React.useContext(PedidoContexto);
  if (!contexto) throw new Error('usePedido precisa do <PedidoProvider> em volta do quadro.');
  const { cardId: carregado, carregando, recarregar } = contexto;

  React.useEffect(() => {
    if (cardId && cardId !== carregado && !carregando) void recarregar(cardId);
  }, [cardId, carregado, carregando, recarregar]);

  const alheio = contexto.somenteProprios && Number(criadoPor ?? 0) !== contexto.usuarioId;
  return React.useMemo(
    () => (alheio ? { ...contexto, podeEditar: false } : contexto),
    [contexto, alheio],
  );
}
