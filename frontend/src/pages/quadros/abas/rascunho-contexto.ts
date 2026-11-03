// O rascunho do pedido aberto na fase (R-133): a lista de itens como a tela a
// edita, a análise de produtos (carregada só quando montada, recalculada ou
// quando a tela ampla abre) e as solicitações do comercial. É um contexto
// porque quatro blocos da Análise leem e mexem na MESMA lista — o resumo
// (aderência, "Aceitar sugestão"), os itens, a tela ampla e os cartões de
// solicitação —, e o que um muda os outros mostram sem gravar nada.
//
// O componente `RascunhoProvider` mora em `RascunhoProvider.tsx` (a regra de
// fast refresh não deixa um arquivo exportar componente e hook juntos).

import * as React from 'react';
import type { ItemPedido, MapaCustoPadrao } from '@/lib/compras';
import type { CustoEspecial } from '@/lib/custo-especial';
import type { Cobertura } from '@/lib/cobertura';
import type { DivisaoVenda, TransitoKanban } from '@/lib/analise-pedido';
import type { CapaPedido } from './pedido-contexto';

/** Uma linha de `sgcSolicitacoesDaMontagem`. */
export interface SolicitacaoDaMontagem {
  ID: number; CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string;
  QUANTIDADE: number; JUSTIFICATIVA: string; CODCLI: number; CLIENTE: string;
  PRIORIDADE: string; STATUS: string; CRIADO_POR: number; CRIADO_POR_NOME: string;
  CRIADO_EM: string; QT_NO_PEDIDO: number;
  /** R-133: 1 = já incluída NESTE pedido. */
  VINCULADA: number;
}

/** O que a análise de produtos trouxe — tudo leitura, nada gravado (D-014 da 003). */
export interface AnaliseCarregada {
  /** Os produtos do fornecedor na filial, com sugestão e cobertura já calculadas (RN-001/RN-004). */
  montados: ItemPedido[];
  divisao: Map<number, DivisaoVenda>;
  pedidoErp: Map<number, number>;
  kanban: Map<number, TransitoKanban[]>;
  /** O custo padrão do Gestão de Custos (R-128); `null` = a consulta falhou. */
  custos: MapaCustoPadrao | null;
  especiais: CustoEspecial[];
  /** A parametrização da 012, que serve também ao produto acrescentado pela busca (D-32). */
  coberturas: Cobertura[];
  carregadaEm: string;
}

export type CampoDeTexto = 'justificativa' | 'observacao';

export interface ContextoRascunho {
  cardId: number;
  capa: CapaPedido | null;
  carregando: boolean;
  /** A lista de itens da tela: a do servidor com as edições por cima. */
  itens: ItemPedido[];
  alterados: number[];
  /** Os codprods já gravados no servidor (remover um deles é uma escrita). */
  salvos: number[];
  meses: number;
  total: number;
  bloqueado: boolean;
  podeEditar: boolean;
  ocupado: boolean;
  erro: string;
  avisoCusto: string;
  salvoEm: string;
  analise: AnaliseCarregada | null;
  carregandoAnalise: boolean;
  solicitacoes: SolicitacaoDaMontagem[] | null;
  erroSolicitacoes: string;
  /** Muda um item da lista (quantidade, custo, texto); a cobertura é recalculada. */
  alterar: (codprod: number, mudanca: Partial<ItemPedido>) => void;
  /** Põe o produto da análise no pedido (ou atualiza a quantidade, se já está). */
  adicionar: (codprod: number, quantidade: number, mudanca?: Partial<ItemPedido>) => void;
  adicionarItem: (item: ItemPedido) => void;
  remover: (codprod: number) => Promise<void>;
  montarAnalise: () => Promise<void>;
  aceitarSugestao: () => void;
  salvar: () => Promise<boolean>;
  recarregarSolicitacoes: () => Promise<void>;
  /** Uma ação no servidor que recarrega o pedido (incluir solicitação): as edições pendentes sobrevivem. */
  comRecarga: (passos: () => Promise<void>) => Promise<void>;
  /** Uma edição a aplicar no item quando o pedido recarregar (o custo escolhido antes de incluir a solicitação). */
  agendar: (codprod: number, mudanca: Partial<ItemPedido>) => void;
  abrirTexto: (codprod: number, campo: CampoDeTexto) => void;
  /** O drill-in: a Análise do Produto da 011, com o item do pedido no topo. */
  abrirProduto: (codprod: number) => void;
  setErro: (erro: string) => void;
}

export const RascunhoContexto = React.createContext<ContextoRascunho | null>(null);

export function useRascunho(): ContextoRascunho {
  const contexto = React.useContext(RascunhoContexto);
  if (!contexto) throw new Error('useRascunho precisa do <RascunhoProvider> em volta dos blocos da fase.');
  return contexto;
}
