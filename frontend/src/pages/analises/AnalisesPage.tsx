// Spec 009 (indicadores e relatórios) — `/analises`.
//
// STUB DA BASE (S2): a rota, o item de menu e o porteiro existem desde já; as
// quatro abas (Indicadores, Compras × vendas, Pedidos/SLA, Solicitações) são do
// agente da 009 (S3). O painel abaixo é a prova de que os primitivos de gráfico
// da base (§8.7 do design.md, R-080) compilam e desenham — dados fixos de
// exemplo, nenhuma server function chamada.
import * as React from 'react';
import {
  Alert, AlternaVisao, Bar, BarChart, CartesianGrid, ChartContainer, ChartTooltip,
  ChartTooltipContent, GradeGraficos, PageHeader, PainelGrafico, Panel, Table, Td, Th, Tr,
  XAxis, type ChartConfig,
} from '@/components/page';
import { usePersona } from '@/lib/persona';

// Exemplo fixo, só para a moldura ter o que desenhar até a 009 chegar.
const EXEMPLO = [
  { fase: 'Análise', pedidos: 6 },
  { fase: 'Técnica', pedidos: 3 },
  { fase: 'Diretoria', pedidos: 2 },
  { fase: 'Envio', pedidos: 4 },
];

const CONFIG = {
  pedidos: { label: 'Pedidos', color: 'var(--data-1)' },
} satisfies ChartConfig;

export default function AnalisesPage() {
  const sessao = usePersona();
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');

  if (!sessao) return <Panel className="p-8">Carregando...</Panel>;

  // A-8 da revisão da onda 2: o comercial não chega aqui — item fora do menu E
  // porteiro na tela.
  if (!sessao.permissoes.verAnalises) {
    return (
      <>
        <PageHeader module="Gestão" title="Análises" />
        <Alert tone="error">Seu perfil não tem acesso às análises.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Gestão"
        title="Análises"
        description="Indicadores operacionais, compras × vendas, prazo dos pedidos e aderência das solicitações."
      />
      <GradeGraficos>
        <PainelGrafico
          titulo="Pedidos por fase"
          hint="Em construção — spec 009. Dados de exemplo."
          acoes={<AlternaVisao visao={visao} onVisao={setVisao} />}
        >
          {visao === 'grafico' ? (
            <ChartContainer config={CONFIG} className="h-full w-full">
              <BarChart data={EXEMPLO}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="fase" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="pedidos" fill="var(--color-pedidos)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <Table>
              <thead>
                <Tr>
                  <Th>Fase</Th>
                  <Th numeric>Pedidos</Th>
                </Tr>
              </thead>
              <tbody>
                {EXEMPLO.map((linha) => (
                  <Tr key={linha.fase}>
                    <Td>{linha.fase}</Td>
                    <Td numeric>{linha.pedidos}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </PainelGrafico>
      </GradeGraficos>
    </>
  );
}
