// Stub — spec 007 (produtos em B.O.). Painel consolidado dos produtos em
// B.O., visível a todas as personas (O2-06), inclusive comercial. A tela real
// chega com o agente da 007; ver docs/specs/007-produtos-em-bo/plan.md.

import { PageHeader, Panel, EmptyState } from '@/components/page';

export default function BoPage() {
  return (
    <>
      <PageHeader module="Compras" title="Produtos em B.O." description="Itens indisponíveis, previsão de liberação e clientes impactados." />
      <Panel>
        <EmptyState title="Em construção — spec 007" hint="O painel consolidado de produtos em B.O. chega com a spec 007." />
      </Panel>
    </>
  );
}
