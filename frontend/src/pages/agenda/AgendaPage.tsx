// Stub — spec 004 (agenda de análises): agendamentos, recorrência,
// participantes, processamento manual. Ver docs/specs/004-agenda-de-analises/.
import { EmptyState, PageHeader } from '@/components/page';

export default function AgendaPage() {
  return (
    <>
      <PageHeader module="Compras" title="Agenda" />
      <EmptyState
        title="Em construção — spec 004"
        hint="Agendamentos de análise, recorrência e processamento manual."
      />
    </>
  );
}
