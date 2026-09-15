// Administração do quadro de compras (fases, campos, automações) — tela da lib.
//
// RN-016 / C-038: administrar o quadro é SÓ do administrador. A lib também
// recusa quem não é admin do quadro (ADMINS_IDS), mas a rota não deve nem
// abrir: quem chega aqui sem a persona vê o motivo e o caminho de volta.
import { useNavigate } from 'react-router-dom';
import { BoardAdmin } from '@benenutri/mitra-kanban';

import { usePersona } from '@/lib/persona';
import { QUADRO_COMPRAS } from '@/lib/quadro';
import { Alert, Button, EmptyState, PageHeader } from '@/components/page';

export default function QuadroAdminPage() {
  const navigate = useNavigate();
  const sessao = usePersona();

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.administrarQuadro) {
    return (
      <>
        <PageHeader
          module="Compras"
          title="Administração do quadro"
          actions={<Button onClick={() => navigate('/quadro')}>Voltar ao quadro</Button>}
        />
        <Alert tone="error">
          A administração do quadro (etapas, campos e avisos automáticos) é do administrador do sistema.
        </Alert>
      </>
    );
  }

  return <BoardAdmin slug={QUADRO_COMPRAS} onVoltar={() => navigate('/quadro')} />;
}
