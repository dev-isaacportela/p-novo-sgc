// Stub — spec 006 (trânsito e recebimento). Notas vencidas dos pedidos em
// Enviado e Em Trânsito, por faixa de atraso, com "Sincronizar com o
// WinThor". A tela real chega com o agente da 006; ver
// docs/specs/006-transito-e-recebimento/plan.md.

import { PageHeader, Panel, EmptyState } from '@/components/page';

export default function NfsAtrasoPage() {
  return (
    <>
      <PageHeader module="Fiscal" title="NFs em atraso" description="Notas fiscais vencidas dos pedidos em trânsito para a Benenutri." />
      <Panel>
        <EmptyState title="Em construção — spec 006" hint="A lista de notas em atraso e a sincronização com o WinThor chegam com a spec 006." />
      </Panel>
    </>
  );
}
