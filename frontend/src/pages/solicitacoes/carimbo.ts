// A prova de que uma escrita guardada da spec 008 realmente rodou.
//
// D-03: escrita guardada que RECUSA devolve 0 linhas, sem erro — o `await`
// passa e a tela seguia gravando a linha de histórico de uma alteração que não
// aconteceu (achados 4 e 25 da revisão da onda 3). O carimbo é a prova: relê a
// solicitação e confere, no campo que aquela escrita grava, o mesmo instante
// que foi enviado.
//
// Arquivo próprio (e não dentro de SolicitacoesPage/solicitacoes-dialogos)
// porque os dois só exportam componentes — é a mesma separação de
// `quadros/abas/verificar-saida.ts`.
import { acao } from '@/lib/mitra-api';

export async function carimboGravado(
  id: number,
  campo: 'AVALIADO_EM' | 'ATUALIZADO_EM',
  carimbo: string,
): Promise<boolean> {
  // A leitura por id que existe, e que leva o mesmo recorte do servidor.
  const relida = await acao('sgcSolicitacaoCarregar', { id });
  if (relida.ok !== true) return false;
  const solicitacao = relida.solicitacao as Record<string, unknown> | undefined;
  return String(solicitacao?.[campo] ?? '') === carimbo;
}
