// Espelho do pedido na capa do cartão do quadro: `valor_total` e
// `alertas_pendentes` (campos criados pelo add-005 da 002).
//
// Uma execução de `kbCardAtualizar` com os DOIS campos juntos — é a terceira e
// última chamada do RNF-001, e só acontece quando algum dos dois muda. O
// título, os responsáveis e o prazo vão junto porque `kbCardAtualizar` limpa a
// lista de responsáveis quando ela não é enviada.

import type { Card } from '@benenutri/mitra-kanban';
import { acao } from '@/lib/mitra-api';

export async function atualizarCapaDoQuadro(
  card: Card,
  valores: Record<string, string | number>,
): Promise<void> {
  await acao('kbCardAtualizar', {
    cardId: card.id,
    titulo: card.titulo,
    valoresJson: JSON.stringify(valores),
    responsaveisIds: (card.responsaveisIds ?? []).join(','),
    prazo: card.prazo ?? '',
  });
}

/** O que o cartão mostra hoje, para a tela só gravar quando mudou. */
export function capaMudou(card: Card, valores: Record<string, string | number>): boolean {
  return Object.entries(valores).some(([chave, valor]) => {
    const atual = (card.valores as Record<string, unknown>)?.[chave];
    return String(atual ?? '') !== String(valor);
  });
}
