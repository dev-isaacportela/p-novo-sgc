// Stub — spec 001 (fornecedores): parametrização em painéis (identificação,
// filiais, linhas de produto, documentos, histórico). Ver
// docs/specs/001-fornecedores/. Rota /fornecedores/:codfornec.
import { EmptyState, PageHeader } from '@/components/page';

export default function FornecedorPage() {
  return (
    <>
      <PageHeader module="Cadastros" title="Fornecedor" />
      <EmptyState
        title="Em construção — spec 001"
        hint="Parametrização do fornecedor: prazos, filiais, linhas de produto e documentos."
      />
    </>
  );
}
