// Spec 009 (indicadores e relatórios) — `/relatorios`.
//
// STUB DA BASE (S2): a rota, o item de menu e o porteiro existem desde já; a
// galeria de relatórios salvos e o construtor (filtros, colunas, agrupamento,
// gráfico, tabela paginada, CSV, compartilhar) são do agente da 009 (S3).
import { Alert, EmptyState, PageHeader, Panel } from '@/components/page';
import { usePersona } from '@/lib/persona';

export default function RelatoriosPage() {
  const sessao = usePersona();

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.verRelatorios) {
    return (
      <>
        <PageHeader module="Gestão" title="Relatórios" />
        <Alert tone="error">Seu perfil não tem acesso aos relatórios.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Gestão"
        title="Relatórios"
        description="Relatórios salvos sobre os pedidos: filtros, colunas, agrupamento, gráfico e CSV."
      />
      <Panel className="p-8">
        <EmptyState title="Em construção — spec 009" hint="A galeria e o construtor chegam com os relatórios salvos." />
      </Panel>
    </>
  );
}
