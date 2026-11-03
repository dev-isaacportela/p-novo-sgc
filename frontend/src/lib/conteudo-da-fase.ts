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

// `solicitacoes` (008, R-054) entra em `analise` ANTES de Itens: a fila do
// comercial é o que se lê para montar o pedido, e nas outras fases ela não
// aparece. Ligado na integração da onda 3 (S4).
//
// Depois da Análise (R-150) o card segue o molde do legado
// (docs/specs/000-visao-geral/legado-fases-do-card.md): `resumo` abre toda
// fase (fornecedor, valor, % faturado, selos de aprovação, envio e
// cancelamento); cada fase tem o seu bloco de assunto — `aprovacao`, `envio`,
// `enviado`, `acompanhamento`, `conclusao`, `concluido` — antes dos blocos de
// trabalho que já existiam. `itens-pedido` é a lista só de consulta do
// cancelado (o bloco Itens da Análise abriria editável).
export type Bloco =
  | 'itens' | 'alertas' | 'notas-fiscais' | 'recebimento' | 'bo' | 'solicitacoes'
  | 'resumo' | 'aprovacao' | 'envio' | 'enviado' | 'acompanhamento';

export const BLOCOS_POR_FASE: Record<ChaveFase, readonly Bloco[]> = {
  analise: ['solicitacoes', 'itens', 'alertas'],
  tecnica: ['resumo', 'aprovacao', 'itens', 'alertas'],
  diretoria: ['resumo', 'aprovacao', 'itens', 'alertas'],
  envio: ['resumo', 'envio'],
  enviado: ['resumo', 'enviado', 'notas-fiscais', 'recebimento'],
  transito: ['resumo', 'acompanhamento', 'recebimento', 'notas-fiscais'],
  faturamento: ['resumo', 'notas-fiscais', 'bo'],
  bo: ['resumo', 'bo', 'notas-fiscais'],
  concluido: ['resumo', 'itens', 'notas-fiscais', 'bo'],
  cancelado: ['resumo', 'itens'],
};

/** Fase desconhecida (mapa ainda carregando) = nada além dos campos do motor. */
export function blocosDaFase(chave: ChaveFase | null): readonly Bloco[] {
  return chave ? BLOCOS_POR_FASE[chave] : [];
}
