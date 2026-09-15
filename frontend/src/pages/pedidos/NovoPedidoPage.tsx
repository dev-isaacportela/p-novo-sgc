// Stub — spec 002 (quadro de compras): criação manual de pedido (fornecedor,
// filial, período, prioridade — C-05). Ver docs/specs/002-quadro-de-compras/.
import { EmptyState, PageHeader } from '@/components/page';

export default function NovoPedidoPage() {
  return (
    <>
      <PageHeader module="Compras" title="Novo pedido" />
      <EmptyState
        title="Em construção — spec 002"
        hint="Criação manual de pedido: fornecedor, filial, período e prioridade."
      />
    </>
  );
}
