// A trava de saída da Análise, para o `antesDeMover` do `/quadro`.
//
// UMA chamada de `sgcAnaliseSair` (D-013): ela regera os alertas, consulta as
// cinco exigências de RN-012 e, quando alguma falha, devolve `{ ok: false }`
// SEM gravar nada. Passando, a mesma execução remove os itens zerados,
// recalcula o total, limpa as reprovações e escreve o resumo no histórico — e
// só então a tela chama `ctx.mover(faseId)`.
//
// O servidor repete estas condições na regra ligada `sgcPodeMover` (002, com o
// bloco de backend/sql/pendencias-analise.sql): quem chamar por fora da tela
// recebe a mesma recusa.

import { acao } from '@/lib/mitra-api';

export interface ResultadoSaida {
  ok: boolean;
  erro?: string;
}

export async function verificarSaidaAnalise(cardId: number): Promise<ResultadoSaida> {
  try {
    const saida = await acao('sgcAnaliseSair', { cardId });
    if (saida.ok === true) return { ok: true };
    return { ok: false, erro: String(saida.erro ?? saida.error ?? 'Este pedido ainda não pode sair da Análise.') };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : 'Não foi possível verificar a saída da Análise.' };
  }
}
