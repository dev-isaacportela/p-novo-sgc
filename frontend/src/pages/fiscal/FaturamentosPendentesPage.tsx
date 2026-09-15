// Stub — spec 005 (notas fiscais e faturamento). Faturamentos pendentes por
// faixa de dias úteis (3/5/+5), busca, exportar CSV, registrar contato e
// enviar cobrança. A tela real chega com o agente da 005; ver
// docs/specs/005-notas-fiscais-e-faturamento/plan.md.

import { PageHeader, Panel, EmptyState } from '@/components/page';

export default function FaturamentosPendentesPage() {
  return (
    <>
      <PageHeader module="Fiscal" title="Faturamentos pendentes" description="Pedidos enviados sem faturamento completo, por dias úteis desde o envio." />
      <Panel>
        <EmptyState title="Em construção — spec 005" hint="A lista de faturamentos pendentes e a cobrança chegam com a spec 005." />
      </Panel>
    </>
  );
}
