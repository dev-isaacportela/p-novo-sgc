// O registro do envio à indústria (EN-01 a EN-04 da 002), num lugar só: a
// coluna da direita (`AcoesDoPedido`) e o bloco do Envio dentro do card
// (R-150, `abas/Envio.tsx`) chamam a MESMA função — o legado tinha o botão no
// fim do painel, o SGC 2 já o tinha à direita, e as duas portas ficam.
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { acao } from '@/lib/mitra-api';
import { marcarItensDaFase, type PedidoCapa } from '@/lib/pedido';
import { COPIA_COMPRAS } from '@/lib/quadro';
import type { DadosDoEnvio } from './DialogoEnvio';

export async function registrarEnvio(ctx: ExtensaoContexto, pedido: PedidoCapa | null, dados: DadosDoEnvio): Promise<void> {
  // D-016: o texto do pedido é montado aqui, onde os dados já estão — o JS do
  // servidor só envia, grava e registra.
  const assunto = `Pedido de compra ${dados.numped} — ${pedido?.FILIAL ?? ''}`;
  const corpo = [
    `<p>Segue o pedido de compra <strong>${dados.numped}</strong>.</p>`,
    `<p>Fornecedor: ${pedido?.FORNECEDOR ?? ''}<br>Filial: ${pedido?.FILIAL ?? ''}<br>`,
    `Período de vendas analisado: ${pedido?.PERIODO_INICIO ?? ''} a ${pedido?.PERIODO_FIM ?? ''}</p>`,
    dados.obs ? `<p>${dados.obs}</p>` : '',
    `<p>Cópia para ${COPIA_COMPRAS}.</p>`,
  ].join('');

  const resposta = await acao('sgcEnvioIndustriaRegistrar', {
    cardId: ctx.card.id, canal: dados.canal, para: dados.contato, assunto, corpo,
    dtEnvio: dados.data, numped: dados.numped, obs: dados.obs,
  });
  if (!resposta?.ok) throw new Error(String(resposta?.error ?? 'O envio não foi registrado.'));
  await marcarItensDaFase(ctx.card.id, 'enviado');
  await ctx.recarregar();
  ctx.avisar('success', 'Envio registrado no pedido.');
}
