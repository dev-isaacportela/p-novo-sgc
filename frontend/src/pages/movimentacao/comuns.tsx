// Spec 013 — o que mais de uma aba usa: o gráfico por filial de Ruptura e
// Perdas (RF-015) e a célula do plano de ação de Sem venda e A vencer (RF-011).
import * as React from 'react';
import {
  AlternaVisao, Bar, BarChart, CartesianGrid, ChartContainer, ChartTooltip, ChartTooltipContent, Dash, LabelList,
  PainelGrafico, RowMeta, Status, Table, Td, TextLink, Th, Tr, XAxis, YAxis, corDeSerie, type ChartConfig,
} from '@/components/page';
import { fmtData } from '@/lib/formato';
import { planoAtrasado, rotuloStatusPlano, type PlanoAcao } from '@/lib/movimentacao';

export interface PontoFilial {
  codfilial: string;
  nome: string;
  valor: number;
}

/**
 * Barras por filial com o valor escrito em cada barra (R-116), o par
 * Gráfico/Tabela (§12.4) e o clique que filtra a lista (C-030, C-035). A filial
 * filtrada é dita no `hint` — nunca só pela cor.
 */
export function GraficoFiliais({
  titulo, rotulo, pontos, formatar, formatarEixo = formatar, filialAtiva, onFilial, indiceSerie,
}: {
  titulo: string;
  rotulo: string;
  pontos: PontoFilial[];
  formatar: (valor: number) => string;
  /** O eixo tem pouco espaço: valor compacto ("R$ 60 mil"); a barra leva o valor inteiro. */
  formatarEixo?: (valor: number) => string;
  filialAtiva: string;
  onFilial: (codfilial: string) => void;
  indiceSerie: number;
}) {
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');
  const config = { valor: { label: rotulo, color: corDeSerie(indiceSerie) } } satisfies ChartConfig;
  const ativa = pontos.find((p) => p.codfilial === filialAtiva);
  const hint = ativa
    ? `Lista filtrada pela filial ${ativa.codfilial} — clique de novo na barra para ver todas.`
    : 'Clique numa barra para filtrar a lista pela filial. O resumo ignora a filial escolhida.';

  return (
    <PainelGrafico titulo={titulo} hint={hint} acoes={<AlternaVisao visao={visao} onVisao={setVisao} />} largura="total">
      {visao === 'tabela' ? (
        <div className="h-full overflow-auto">
          <Table>
            <thead><Tr><Th>Filial</Th><Th numeric>{rotulo}</Th></Tr></thead>
            <tbody>
              {pontos.map((p) => (
                <Tr key={p.codfilial}>
                  <Td><TextLink onClick={() => onFilial(p.codfilial)}>{p.codfilial} · {p.nome}</TextLink></Td>
                  <Td numeric>{formatar(p.valor)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <ChartContainer config={config} className="h-full w-full">
          <BarChart data={pontos.map((p) => ({ ...p, nomeCurto: `Filial ${p.codfilial}` }))} margin={{ top: 20 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="nomeCurto" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={84} tickFormatter={(v: number) => formatarEixo(v)} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, itens) => String(itens?.[0]?.payload?.nome ?? '')} />} />
            <Bar
              dataKey="valor"
              fill="var(--color-valor)"
              radius={4}
              cursor="pointer"
              onClick={(dado: { payload?: PontoFilial }) => dado?.payload && onFilial(dado.payload.codfilial)}
            >
              <LabelList dataKey="valor" position="top" formatter={(v: unknown) => formatar(Number(v))} className="fill-ink text-[10px]" />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </PainelGrafico>
  );
}

/** Situação do plano na linha, ou o convite para registrar — o mesmo botão abre os dois. */
export function CelulaPlano({ plano, hoje, onAbrir }: { plano: PlanoAcao | undefined; hoje: string; onAbrir: () => void }) {
  if (!plano) return <TextLink onClick={onAbrir}>Registrar plano</TextLink>;
  const atrasado = planoAtrasado(plano, hoje);
  return (
    <>
      <TextLink onClick={onAbrir}>
        <Status tone={plano.status === 'concluido' ? 'live' : atrasado ? 'alert' : 'attention'}>{rotuloStatusPlano(plano.status)}</Status>
      </TextLink>
      {plano.dataAcompanhamento ? (
        <RowMeta>{atrasado ? 'Atrasado desde ' : 'Acompanhar em '}{fmtData(plano.dataAcompanhamento)}</RowMeta>
      ) : <RowMeta><Dash /></RowMeta>}
    </>
  );
}
