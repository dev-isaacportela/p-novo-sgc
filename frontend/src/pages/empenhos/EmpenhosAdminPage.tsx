// Administração do quadro de empenhos (fases, campos, automações) — tela da lib,
// só do administrador, como a do quadro de compras.
import { useNavigate } from 'react-router-dom';
import { BoardAdmin } from '@benenutri/mitra-kanban';

import { usePersona } from '@/lib/persona';
import { QUADRO_EMPENHOS } from '@/lib/quadro';
import { Alert, Button, EmptyState, PageHeader } from '@/components/page';

export default function EmpenhosAdminPage() {
  const navigate = useNavigate();
  const sessao = usePersona();

  if (!sessao) return <EmptyState title="Carregando..." />;
  if (!sessao.permissoes.administrarQuadro) {
    return (
      <>
        <PageHeader module="Empenhos" title="Administração do quadro" actions={<Button onClick={() => navigate('/empenhos')}>Voltar ao quadro</Button>} />
        <Alert tone="error">A administração do quadro (etapas, campos e avisos automáticos) é do administrador do sistema.</Alert>
      </>
    );
  }
  return <BoardAdmin slug={QUADRO_EMPENHOS} onVoltar={() => navigate('/empenhos')} />;
}
