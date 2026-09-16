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
import type { ItemPedido } from '@/lib/compras';

export interface ResultadoSaida {
  ok: boolean;
  erro?: string;
}

const agora = () => new Date().toISOString().slice(0, 19);

/**
 * R-063/R-066 — item que sai do pedido devolve a solicitação à fila. O par é
 * sempre nesta ordem: o histórico PRIMEIRO, porque ele casa pelo `ID_CARD` que
 * o desvínculo vai zerar. Nenhum id vai daqui — as duas escritas usam o mesmo
 * critério do servidor ("não existe mais item vivo do produto"), então servem
 * tanto ao item removido a dedo quanto aos zerados que o `sgcAnaliseSair`
 * apagou de uma vez.
 *
 * `removido` só existe no primeiro caso; com ele, e só quando o item tinha
 * origem em solicitação, sai a nota do card (R-063). A nota é registro, não
 * fluxo: falhar nela não desfaz nada.
 */
export async function devolverSolicitacoes(cardId: number, removido?: ItemPedido): Promise<void> {
  const em = agora();
  await acao('sgcEscSolicitacaoHistoricoInserir', {
    id: 0, idCard: cardId, evento: 'desvinculada', detalhe: 'Item removido do pedido.', em,
  });
  await acao('sgcEscSolicitacaoDesvincular', { idCard: cardId, atualizadoEm: em });
  if (removido && removido.idSolicitacao > 0) {
    try {
      await acao('kbNotaRegistrar', {
        cardId,
        texto: `Solicitação de ${removido.solicitacaoDe || 'comercial'} devolvida à fila: ${removido.descricao} saiu do pedido.`,
        usuarioId: 0,
      });
    } catch { /* a nota é registro, não fluxo */ }
  }
}

export async function verificarSaidaAnalise(cardId: number): Promise<ResultadoSaida> {
  try {
    const saida = await acao('sgcAnaliseSair', { cardId });
    if (saida.ok === true) {
      // Os itens zerados já foram removidos pela mesma execução: o par corre
      // sobre o que sobrou. Falhar aqui não transforma uma saída que o servidor
      // já concedeu em recusa — a solicitação fica vinculada e o próximo
      // desvínculo (ou a próxima remoção) a devolve.
      await devolverSolicitacoes(cardId).catch(() => null);
      return { ok: true };
    }
    return { ok: false, erro: String(saida.erro ?? saida.error ?? 'Este pedido ainda não pode sair da Análise.') };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : 'Não foi possível verificar a saída da Análise.' };
  }
}
