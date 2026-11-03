// Os itens do pedido só para consulta (R-150): em Compras Canceladas o legado
// mostra a lista, sem nada editável. O bloco Itens da Análise abriria com
// "Montar a análise" e "Salvar" ativos num pedido que não anda mais.
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { EmptyState, Panel, PanelHeader } from '@/components/page';
import { itensDoEnvio } from '@/lib/envio-industria';
import { usePedido } from './pedido-contexto';
import ItensEnviados from './ItensEnviados';

export default function BlocoItensDoPedido(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const comQuantidade = itensDoEnvio(pedido.itens);
  return (
    <Panel>
      <PanelHeader title="Itens do pedido" hint="Só consulta: o pedido não anda mais." />
      {comQuantidade.length === 0
        ? <EmptyState title="Nenhum item com quantidade" hint="O pedido foi cancelado antes de ter itens." />
        : <ItensEnviados itens={pedido.itens} />}
    </Panel>
  );
}
