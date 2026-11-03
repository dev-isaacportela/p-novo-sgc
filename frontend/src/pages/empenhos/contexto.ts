// O card aberto do quadro de empenhos, uma carga só (RNF-001: abrir card =
// kbCardDetalhe do motor + sgcEmpCarregar). A página carrega e embrulha o
// quadro; ações, conteúdo da fase e aba Pregão leem daqui.
import * as React from 'react';

import type { CargaEmpenho, ChaveEmpenho } from '@/lib/empenhos';
import type { SessaoPersona } from '@/lib/persona';

export interface MapaEmpenho {
  chaveDe: (faseId: number) => ChaveEmpenho | null;
  faseIdDe: (chave: ChaveEmpenho) => number;
  boardId: number;
}

export interface EmpenhoContextoValor {
  cardId: number | null;
  carga: CargaEmpenho | null;
  fases: MapaEmpenho;
  sessao: SessaoPersona;
  recarregar: () => Promise<void>;
}

export const EmpenhoContexto = React.createContext<EmpenhoContextoValor | null>(null);

export function useEmpenho(): EmpenhoContextoValor {
  const valor = React.useContext(EmpenhoContexto);
  if (!valor) throw new Error('useEmpenho fora do quadro de empenhos.');
  return valor;
}

/** A carga só vale para o card que a pediu. */
export const cargaDoCard = (valor: EmpenhoContextoValor, cardId: number) =>
  valor.carga && valor.cardId === cardId ? valor.carga : null;
