// Stub — spec 002 (quadro de compras): personas por usuário (admin e
// diretoria). Ver docs/specs/002-quadro-de-compras/.
import { EmptyState, PageHeader } from '@/components/page';

export default function SegurancaPage() {
  return (
    <>
      <PageHeader module="Administração" title="Segurança" />
      <EmptyState
        title="Em construção — spec 002"
        hint="Persona por usuário: admin, analista, gestor, diretoria, comercial."
      />
    </>
  );
}
