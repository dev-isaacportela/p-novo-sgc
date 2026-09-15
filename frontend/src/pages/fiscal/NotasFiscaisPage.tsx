// Stub — spec 005 (notas fiscais e faturamento). Fila de sugestões (Pedido ·
// Fornecedor · Fase · NF · Score · Status) e busca híbrida por número. A tela
// real chega com o agente da 005; ver docs/specs/005-notas-fiscais-e-faturamento/plan.md.

import { PageHeader, Panel, EmptyState } from '@/components/page';

export default function NotasFiscaisPage() {
  return (
    <>
      <PageHeader module="Fiscal" title="Notas fiscais" description="Sugestões de NF detectadas no WinThor e busca por número." />
      <Panel>
        <EmptyState title="Em construção — spec 005" hint="Detecção automática e conferência de notas fiscais chegam com a spec 005." />
      </Panel>
    </>
  );
}
