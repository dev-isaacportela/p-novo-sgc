// "Compras × vendas" do painel de detalhe (layout legado da 011, R-117 / C-032):
// barras de compras e vendas por mês mais a projeção do mês seguinte como a
// última barra, SEMPRE aberto,
// com 6m | 13m, Gráfico | Tabela e o rodapé 3m / 6m / 12m / Projeção.
//
// R-116: cada barra e cada ponto da linha mostram o seu valor escrito em cima
// (`LabelList`), inclusive a projeção — regra de todo gráfico do sistema.
//
// Nenhuma consulta aqui: a série sai do histórico que a página já carregou
// para o SKU (13 meses numa chamada) por `serieComprasVendas`, e a tabela sai
// da MESMA série (§12.4).
import * as React from 'react';

import {
  AlternaOpcoes, AlternaVisao, Bar, CartesianGrid, ChartContainer, ChartLegend, ChartLegendContent,
  ChartTooltip, ChartTooltipContent, ComposedChart, Dash, EmptyState, LabelList, PainelGrafico,
  Table, Td, Th, Tr, XAxis, YAxis, corDeSerie,
} from '@/components/page';
import type { ChartConfig } from '@/components/page';
import { serieComprasVendas, totaisDoRodape } from '@/lib/ressuprimento-detalhe';
import type { JanelaGrafico, PontoHistorico } from '@/lib/ressuprimento-detalhe';

const config = {
  compras: { label: 'Compras', color: corDeSerie(0) },
  vendas: { label: 'Vendas', color: corDeSerie(1) },
  projecao: { label: 'Projeção', color: corDeSerie(2) },
} satisfies ChartConfig;

const JANELAS: { value: '6' | '13'; label: string }[] = [{ value: '6', label: '6m' }, { value: '13', label: '13m' }];

const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');
/** O rótulo em cima da marca (R-116): número inteiro; sem valor, nada. */
const rotulo = (valor: unknown) => (valor === null || valor === undefined ? '' : inteiro(Number(valor)));

export function GraficoComprasVendas({
  historico,
  hoje,
  consumoDiario,
  pronto,
}: {
  historico: PontoHistorico[];
  hoje: string;
  consumoDiario: number;
  /** As três consultas do SKU já voltaram (ou falharam). */
  pronto: boolean;
}) {
  const [janela, setJanela] = React.useState<'6' | '13'>('6');
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');

  const serie = React.useMemo(
    () => serieComprasVendas(historico, hoje, Number(janela) as JanelaGrafico, consumoDiario),
    [historico, hoje, janela, consumoDiario],
  );
  const totais = React.useMemo(() => totaisDoRodape(historico, hoje, consumoDiario), [historico, hoje, consumoDiario]);
  const semMovimento = pronto && historico.length === 0;

  const rodape = (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-secondary">
      {[
        ['3m', totais.vendas3m, totais.compras3m],
        ['6m', totais.vendas6m, totais.compras6m],
        ['12m', totais.vendas12m, totais.compras12m],
      ].map(([periodo, vendas, compras]) => (
        <div key={String(periodo)} className="flex items-baseline gap-1.5">
          <dt className="font-semibold text-ink-muted uppercase">{periodo}</dt>
          <dd>
            <span className="text-ink">{inteiro(Number(vendas))}</span> vend. · <span className="text-ink">{inteiro(Number(compras))}</span> comp.
          </dd>
        </div>
      ))}
      <div className="flex items-baseline gap-1.5">
        <dt className="font-semibold text-ink-muted uppercase">Projeção</dt>
        <dd><span className="text-ink">{inteiro(totais.projecaoMes)}</span> un./mês</dd>
      </div>
    </dl>
  );

  return (
    <PainelGrafico
      titulo="Compras × vendas"
      hint="Entradas, vendas e projeção · em unidades"
      acoes={
        <>
          <AlternaOpcoes rotulo="Janela do gráfico" opcoes={JANELAS} valor={janela} onValor={setJanela} />
          <AlternaVisao visao={visao} onVisao={setVisao} />
        </>
      }
      rodape={rodape}
    >
      {!pronto ? (
        <EmptyState title="Carregando o histórico..." />
      ) : semMovimento ? (
        <EmptyState title="Sem movimento nos últimos 13 meses" />
      ) : visao === 'tabela' ? (
        <div className="h-full overflow-auto">
          <Table>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th numeric>Compras</Th>
                <Th numeric>Vendas</Th>
                <Th numeric>Projeção</Th>
              </tr>
            </thead>
            <tbody>
              {serie.map((ponto) => (
                <Tr key={ponto.mes}>
                  <Td>{ponto.rotulo}</Td>
                  <Td numeric>{ponto.compras === null ? <Dash /> : inteiro(ponto.compras)}</Td>
                  <Td numeric>{ponto.vendas === null ? <Dash /> : inteiro(ponto.vendas)}</Td>
                  <Td numeric>{ponto.projecao === null ? <Dash /> : inteiro(ponto.projecao)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <ChartContainer config={config} className="h-full w-full">
          <ComposedChart data={serie} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval={0} className="text-[10px]" />
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="compras" fill="var(--color-compras)" radius={4}>
              <LabelList dataKey="compras" position="top" formatter={rotulo} className="fill-ink text-[10px]" />
            </Bar>
            <Bar dataKey="vendas" fill="var(--color-vendas)" radius={4}>
              <LabelList dataKey="vendas" position="top" formatter={rotulo} className="fill-ink text-[10px]" />
            </Bar>
            <Bar dataKey="projecao" fill="var(--color-projecao)" radius={4}>
              <LabelList dataKey="projecao" position="top" formatter={rotulo} className="fill-primary text-[10px] font-semibold" />
            </Bar>
          </ComposedChart>
        </ChartContainer>
      )}
    </PainelGrafico>
  );
}
