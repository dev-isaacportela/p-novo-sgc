// Spec 014 — o gráfico de barras agrupadas das telas Galderma (acompanhamento e
// composição). R-116 / RF-023: cada barra mostra o seu valor escrito em cima;
// sem valor, nada. O par Gráfico/Tabela é a versão acessível (§12.4) e a tabela
// sai da MESMA série, nunca de outra consulta. Cor por `corDeSerie` (índice do
// contrato, nunca da série filtrada).
import * as React from 'react';
import {
  AlternaVisao, Bar, BarChart, CartesianGrid, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  Dash, EmptyState, LabelList, PainelGrafico, Table, Td, Th, Tr, XAxis, YAxis, corDeSerie, type ChartConfig,
} from '@/components/page';

export interface SerieDoGrafico { chave: string; rotulo: string; indice: number }

export function GraficoBarras({
  titulo, hint, dados, series, formatar, rotular, formatarEixo, largura,
}: {
  titulo: string;
  hint?: React.ReactNode;
  dados: Record<string, string | number | null>[];
  series: SerieDoGrafico[];
  /** O número da tabela e do tooltip. */
  formatar: (valor: number) => string;
  /** O texto em cima da barra (R-116); padrão = `formatar`. */
  rotular?: (valor: number, ponto: Record<string, string | number | null>) => string;
  /** O número do eixo Y, curto para caber (padrão = `formatar`). */
  formatarEixo?: (valor: number) => string;
  largura?: 'padrao' | 'total';
}) {
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');
  const config = Object.fromEntries(series.map((s) => [s.chave, { label: s.rotulo, color: corDeSerie(s.indice) }])) satisfies ChartConfig;
  const vazio = dados.length === 0 || dados.every((d) => series.every((s) => !Number(d[s.chave])));

  return (
    <PainelGrafico titulo={titulo} hint={hint} largura={largura} altura="alta" acoes={<AlternaVisao visao={visao} onVisao={setVisao} />}>
      {vazio ? (
        <EmptyState title="Sem dados no período." />
      ) : visao === 'tabela' ? (
        <div className="h-full overflow-auto">
          <Table>
            <thead>
              <Tr><Th>{titulo}</Th>{series.map((s) => <Th key={s.chave} numeric>{s.rotulo}</Th>)}</Tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <Tr key={String(d.name)}>
                  <Td>{String(d.name)}</Td>
                  {series.map((s) => <Td key={s.chave} numeric>{Number(d[s.chave]) ? formatar(Number(d[s.chave])) : <Dash />}</Td>)}
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <ChartContainer config={config} className="h-full w-full">
          <BarChart data={dados} margin={{ top: 20 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
            <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => (formatarEixo ?? formatar)(v)} />
            <ChartTooltip content={<ChartTooltipContent formatter={(valor) => formatar(Number(valor))} />} />
            {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
            {series.map((s) => (
              <Bar key={s.chave} dataKey={s.chave} fill={`var(--color-${s.chave})`} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey={s.chave}
                  position="top"
                  className="fill-ink text-[10px]"
                  content={(props) => {
                    const { x, y, width, value, index } = props as { x: number; y: number; width: number; value: unknown; index: number };
                    if (!Number(value)) return null;
                    const texto = rotular ? rotular(Number(value), dados[index]) : formatar(Number(value));
                    return <text x={x + width / 2} y={y - 4} textAnchor="middle" className="fill-ink text-[10px]">{texto}</text>;
                  }}
                />
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </PainelGrafico>
  );
}
