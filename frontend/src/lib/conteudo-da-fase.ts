// O que a aba "Nesta fase" do card mostra em cada fase (spec 015 da lib,
// R-050): a mesma regra do SGC legado — o card muda de assunto conforme anda,
// em vez de uma aba por assunto. A ordem da lista é a ordem na tela. Puro,
// testado em tests/conteudo-da-fase.test.mjs; quem desenha é
// pages/quadros/abas/ConteudoDaFase.tsx.
//
// Cada bloco continua decidindo sozinho o que é editável (persona, fase e
// RESTRICTED, espelhando o servidor): nas aprovações os itens aparecem em
// leitura; em Concluído tudo é consulta.
import type { ChaveFase } from '@/lib/transicoes';

export type Bloco = 'itens' | 'alertas' | 'notas-fiscais' | 'recebimento' | 'bo';

export const BLOCOS_POR_FASE: Record<ChaveFase, readonly Bloco[]> = {
  analise: ['itens', 'alertas'],
  tecnica: ['itens', 'alertas'],
  diretoria: ['itens', 'alertas'],
  envio: ['itens'],
  enviado: ['notas-fiscais', 'recebimento'],
  transito: ['recebimento', 'notas-fiscais'],
  faturamento: ['notas-fiscais', 'bo'],
  bo: ['bo', 'notas-fiscais'],
  concluido: ['itens', 'notas-fiscais', 'bo'],
  cancelado: ['itens'],
};

/** Fase desconhecida (mapa ainda carregando) = nada além dos campos do motor. */
export function blocosDaFase(chave: ChaveFase | null): readonly Bloco[] {
  return chave ? BLOCOS_POR_FASE[chave] : [];
}
