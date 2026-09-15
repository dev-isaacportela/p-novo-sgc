// Stub — spec 002 (quadro de compras): feed de responsável novo, card
// movido, mensagem nova (UI-07 B). Ver docs/specs/002-quadro-de-compras/.
import { EmptyState, PageHeader } from '@/components/page';

export default function NotificacoesPage() {
  return (
    <>
      <PageHeader module="Compras" title="Notificações" />
      <EmptyState
        title="Em construção — spec 002"
        hint="Responsável novo, card movido e mensagem nova nos seus cards."
      />
    </>
  );
}
