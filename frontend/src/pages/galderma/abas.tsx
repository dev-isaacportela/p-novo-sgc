// Spec 014 — o que as três telas Galderma repetem: a navegação entre a mesa,
// o acompanhamento e a composição (RN-AG-02 do legado) e o porteiro de persona
// (RN-015 / C-031: o comercial não entra, quem só lê vê com a escrita desabilitada;
// a regra mora em `acesso.ts`).
import { useLocation, useNavigate } from 'react-router-dom';
import { AlternaOpcoes, EmptyState, Panel } from '@/components/page';

const TELAS = [
  { value: '/galderma', label: 'Mesa de negociação' },
  { value: '/galderma/acompanhamento', label: 'Acompanhamento' },
  { value: '/galderma/composicao', label: 'Composição por filial' },
];

export function NavegacaoGalderma() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // A mais específica primeiro: '/galderma/composicao' também começa com '/galderma'.
  const atual = [...TELAS].reverse().find((t) => pathname.endsWith(t.value) || pathname.includes(`${t.value}/`))?.value ?? '/galderma';
  return <AlternaOpcoes rotulo="Telas do pedido Galderma" opcoes={TELAS} valor={atual} onValor={(destino) => navigate(destino)} />;
}

export function SemAcessoGalderma() {
  return (
    <Panel>
      <EmptyState title="Sem acesso ao pedido Galderma" hint="Este módulo é da equipe de compras e da diretoria. Procure a gerência de compras se precisar dele." />
    </Panel>
  );
}
