// Administração do quadro de compras (fases, campos, automações) — tela da lib.
// Só o administrador do quadro chega aqui: a própria lib recusa os demais.
import { useNavigate } from 'react-router-dom';
import { BoardAdmin } from '@benenutri/mitra-kanban';
import { QUADRO_COMPRAS } from '@/lib/quadro';

export default function QuadroAdminPage() {
  const navigate = useNavigate();
  return <BoardAdmin slug={QUADRO_COMPRAS} onVoltar={() => navigate('/quadro')} />;
}
