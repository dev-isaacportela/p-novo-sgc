// Spec 008 (solicitações do comercial) — `/solicitacoes`.
//
// STUB DA BASE (S2): a rota, o item de menu e o porteiro existem desde já para
// a onda 3 ter onde pousar; a tela é do agente da 008 (S3) — lista com filtros,
// "Nova solicitação", avaliar (aprovar / recusar com motivo), detalhe com
// histórico e o painel de rastreio pós-aprovação.
import { Alert, EmptyState, PageHeader, Panel } from '@/components/page';
import { usePersona } from '@/lib/persona';

export default function SolicitacoesPage() {
  const sessao = usePersona();

  if (!sessao) return <EmptyState title="Carregando..." />;

  // A-8 da revisão da onda 2: sem porteiro de rota, o endereço direto abriria a
  // tela para quem está fora do menu — mesmo padrão de QuadroPage/NfsAtrasoPage.
  if (!sessao.permissoes.verSolicitacoes) {
    return (
      <>
        <PageHeader module="Compras" title="Solicitações" />
        <Alert tone="error">Seu perfil não tem acesso às solicitações do comercial.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Compras"
        title="Solicitações"
        description="Pedidos de compra registrados pelo comercial, com a avaliação e a situação de atendimento."
      />
      <Panel className="p-8">
        <EmptyState title="Em construção — spec 008" hint="A tela chega com as solicitações do comercial." />
      </Panel>
    </>
  );
}
