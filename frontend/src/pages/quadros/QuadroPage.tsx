// O quadro de compras. O pedido aberto vive na URL (?card=ID) para o link ser compartilhável.
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KanbanBoard } from '@benenutri/mitra-kanban';
import { QUADRO_COMPRAS } from '@/lib/quadro';

export default function QuadroPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const cardId = Number(params.get('card') || 0) || null;

  return (
    <KanbanBoard
      slug={QUADRO_COMPRAS}
      cardId={cardId}
      onCardChange={(id) => setParams(id ? { card: String(id) } : {}, { replace: true })}
      onAdministrar={() => navigate('/quadro/admin')}
    />
  );
}
