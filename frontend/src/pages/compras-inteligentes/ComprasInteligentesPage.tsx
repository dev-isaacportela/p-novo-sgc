// Spec 011 (compras inteligentes) — `/compras-inteligentes`.
//
// STUB DA BASE (S2): a rota, o item de menu e o porteiro existem desde já; o
// seletor de fornecedor e filial, os KPIs, as três abas, a grade de
// ressuprimento, o seletor de licitação, os parâmetros, o carrinho e o CSV são
// do agente da 011 (S3), junto da regra pura de `lib/ressuprimento.ts`.
import { Alert, EmptyState, PageHeader, Panel } from '@/components/page';
import { usePersona } from '@/lib/persona';

export default function ComprasInteligentesPage() {
  const sessao = usePersona();

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.verComprasInteligentes) {
    return (
      <>
        <PageHeader module="Compras" title="Compras inteligentes" />
        <Alert tone="error">Seu perfil não tem acesso às compras inteligentes.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Compras"
        title="Compras inteligentes"
        description="O que comprar hoje, por fornecedor e filial: sugestão, cobertura, gatilho e carrinho."
      />
      <Panel className="p-8">
        <EmptyState title="Em construção — spec 011" hint="A grade de ressuprimento e o carrinho chegam com a sugestão de compra." />
      </Panel>
    </>
  );
}
