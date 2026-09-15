// Stub — spec 001 (fornecedores): listagem paginada, busca, filtro por filial
// e situação. Ver docs/specs/001-fornecedores/.
import { EmptyState, PageHeader } from '@/components/page';

export default function FornecedoresPage() {
  return (
    <>
      <PageHeader module="Cadastros" title="Fornecedores" />
      <EmptyState
        title="Em construção — spec 001"
        hint="Cadastro do ERP e parametrização de compra por fornecedor."
      />
    </>
  );
}
