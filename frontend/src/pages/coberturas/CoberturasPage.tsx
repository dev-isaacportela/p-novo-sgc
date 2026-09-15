// Stub — spec 003 (itens do pedido): limites de cobertura futura por
// fornecedor/departamento/seção/SKU. Ver docs/specs/003-itens-do-pedido/.
import { EmptyState, PageHeader } from '@/components/page';

export default function CoberturasPage() {
  return (
    <>
      <PageHeader module="Cadastros" title="Coberturas" />
      <EmptyState
        title="Em construção — spec 003"
        hint="Limites de cobertura futura por fornecedor, departamento, seção e SKU."
      />
    </>
  );
}
