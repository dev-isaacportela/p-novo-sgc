// "Compras × vendas" do painel de detalhe (layout legado da 011, R-117 / C-032):
// barras de compras e vendas por mês mais a projeção do mês seguinte como a
// última barra, SEMPRE aberto,
// com 6m | 13m, Gráfico | Tabela e o rodapé 3m / 6m / 12m / Projeção.
//
// R-123: na janela "Análise do Produto" (`expandido`) o mesmo gráfico ganha
// Caixas | Unidades (só com caixa > 1), a série "Desconsideradas" (as vendas
// fora da demanda, por mês), a legenda que ESCONDE a série ao clicar e o aviso
// de histórico curto (menos de 3 meses com movimento).
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
import { cn } from '@/lib/utils';
import { historicoSuficiente, serieComprasVendas, serieEmCaixas, totaisDoRodape } from '@/lib/ressuprimento-detalhe';
import type { JanelaGrafico, PontoHistorico } from '@/lib/ressuprimento-detalhe';

const config = {
  compras: { label: 'Compras', color: corDeSerie(0) },
  vendas: { label: 'Vendas', color: corDeSerie(1) },
  desconsideradas: { label: 'Desconsideradas', color: corDeSerie(3) },
  projecao: { label: 'Projeção', color: corDeSerie(2) },
} satisfies ChartConfig;

type Serie = keyof typeof config;

// A cor de cada série é a variável que o ChartContainer publica (`--color-<chave>`);
// classe fechada, porque o Tailwind só gera o que está escrito no código (§1.4).
const COR_LEGENDA: Record<Serie, string> = {
  compras: 'bg-[var(--color-compras)]',
  vendas: 'bg-[var(--color-vendas)]',
  desconsideradas: 'bg-[var(--color-desconsideradas)]',
  projecao: 'bg-[var(--color-projecao)]',
};

const JANELAS: { value: '6' | '13'; label: string }[] = [{ value: '6', label: '6m' }, { value: '13', label: '13m' }];
const REFERENCIAS: { value: 'caixas' | 'unidades'; label: string }[] = [{ value: 'caixas', label: 'Caixas' }, { value: 'unidades', label: 'Unidades' }];

const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');
const decimal = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
/** O rótulo em cima da marca (R-116): número; sem valor, nada. */
const rotulo = (valor: unknown) => (valor === null || valor === undefined ? '' : decimal(Number(valor)));

/** A legenda que esconde a série ao clicar (`aria-pressed` = visível). Vive dentro do ChartContainer para ler as cores. */
function LegendaAlternavel({ series, ocultas, onAlternar }: { series: Serie[]; ocultas: Set<Serie>; onAlternar: (serie: Serie) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2" role="group" aria-label="Séries do gráfico">
      {series.map((serie) => {
        const visivel = !ocultas.has(serie);
        return (
          <button
            key={serie}
            type="button"
            aria-pressed={visivel}
            onClick={() => onAlternar(serie)}
            title={visivel ? 'Esconder esta série' : 'Mostrar esta série'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[12px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
              visivel ? 'text-ink' : 'text-ink-muted line-through',
            )}
          >
            <span className={cn('size-2 rounded-sm', COR_LEGENDA[serie], !visivel && 'opacity-40')} aria-hidden />
            {config[serie].label}
          </button>
        );
      })}
    </div>
  );
}

export function GraficoComprasVendas({
  historico,
  hoje,
  consumoDiario,
  pronto,
  expandido = false,
  unidadesPorCaixa = 1,
  desconsideradas,
}: {
  historico: PontoHistorico[];
  hoje: string;
  consumoDiario: number;
  /** As três consultas do SKU já voltaram (ou falharam). */
  pronto: boolean;
  /** R-123: a versão da janela "Análise do Produto" — mais alta, com caixas, desconsideradas e legenda clicável. */
  expandido?: boolean;
  unidadesPorCaixa?: number;
  /** As vendas fora da demanda por mês (`AAAA-MM` → un.); só a janela expandida as passa. */
  desconsideradas?: Map<string, number>;
}) {
  const [janela, setJanela] = React.useState<'6' | '13'>('6');
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');
  const [referencia, setReferencia] = React.useState<'caixas' | 'unidades'>('unidades');
  const [ocultas, setOcultas] = React.useState<Set<Serie>>(() => new Set());

  const comCaixas = expandido && unidadesPorCaixa > 1;
  const emCaixas = comCaixas && referencia === 'caixas';
  const serie = React.useMemo(() => {
    const base = serieComprasVendas(historico, hoje, Number(janela) as JanelaGrafico, consumoDiario, expandido ? desconsideradas : undefined);
    return emCaixas ? serieEmCaixas(base, unidadesPorCaixa) : base;
  }, [historico, hoje, janela, consumoDiario, expandido, desconsideradas, emCaixas, unidadesPorCaixa]);
  const totais = React.useMemo(() => totaisDoRodape(historico, hoje, consumoDiario), [historico, hoje, consumoDiario]);
  const semMovimento = pronto && historico.length === 0;
  const historicoCurto = expandido && pronto && !semMovimento && !historicoSuficiente(historico);
  const series: Serie[] = expandido && desconsideradas ? ['compras', 'vendas', 'desconsideradas', 'projecao'] : ['compras', 'vendas', 'projecao'];
  const unidade = emCaixas ? 'cx' : 'un.';

  const alternar = (chave: Serie) => setOcultas((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave);
    return proximo;
  });

  const rodape = (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-secondary">
      {[
        ['3 meses', totais.vendas3m, totais.compras3m],
        ['6 meses', totais.vendas6m, totais.compras6m],
        ['12 meses', totais.vendas12m, totais.compras12m],
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
      hint={`Entradas, vendas e projeção · em ${emCaixas ? 'caixas' : 'unidades'}`}
      altura={expandido ? 'alta' : 'padrao'}
      acoes={
        <>
          <AlternaOpcoes rotulo="Janela do gráfico" opcoes={JANELAS} valor={janela} onValor={setJanela} />
          {comCaixas ? <AlternaOpcoes rotulo="Referência" opcoes={REFERENCIAS} valor={referencia} onValor={setReferencia} /> : null}
          <AlternaVisao visao={visao} onVisao={setVisao} />
        </>
      }
      rodape={rodape}
    >
      {!pronto ? (
        <EmptyState title="Carregando…" />
      ) : semMovimento ? (
        <EmptyState title="Sem movimento nos últimos 13 meses" />
      ) : historicoCurto ? (
        <EmptyState title="Ainda não há dados suficientes para análise histórica consistente." hint="São precisos ao menos 3 meses com movimento." />
      ) : visao === 'tabela' ? (
        <div className="h-full overflow-auto">
          <Table>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th numeric>{`Compras (${unidade})`}</Th>
                <Th numeric>{`Vendas (${unidade})`}</Th>
                {series.includes('desconsideradas') ? <Th numeric>{`Desconsideradas (${unidade})`}</Th> : null}
                <Th numeric>{`Projeção (${unidade})`}</Th>
              </tr>
            </thead>
            <tbody>
              {serie.map((ponto) => (
                <Tr key={ponto.mes}>
                  <Td>{ponto.rotulo}</Td>
                  <Td numeric>{ponto.compras === null ? <Dash /> : decimal(ponto.compras)}</Td>
                  <Td numeric>{ponto.vendas === null ? <Dash /> : decimal(ponto.vendas)}</Td>
                  {series.includes('desconsideradas') ? <Td numeric>{ponto.desconsideradas === null ? <Dash /> : decimal(ponto.desconsideradas)}</Td> : null}
                  <Td numeric>{ponto.projecao === null ? <Dash /> : decimal(ponto.projecao)}</Td>
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
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={emCaixas} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {expandido
              ? <ChartLegend content={<LegendaAlternavel series={series} ocultas={ocultas} onAlternar={alternar} />} />
              : <ChartLegend content={<ChartLegendContent />} />}
            <Bar dataKey="compras" fill="var(--color-compras)" radius={4} hide={ocultas.has('compras')}>
              <LabelList dataKey="compras" position="top" formatter={rotulo} className="fill-ink text-[10px]" />
            </Bar>
            <Bar dataKey="vendas" fill="var(--color-vendas)" radius={4} hide={ocultas.has('vendas')}>
              <LabelList dataKey="vendas" position="top" formatter={rotulo} className="fill-ink text-[10px]" />
            </Bar>
            {series.includes('desconsideradas') ? (
              <Bar dataKey="desconsideradas" fill="var(--color-desconsideradas)" radius={4} hide={ocultas.has('desconsideradas')}>
                <LabelList dataKey="desconsideradas" position="top" formatter={rotulo} className="fill-ink text-[10px]" />
              </Bar>
            ) : null}
            <Bar dataKey="projecao" fill="var(--color-projecao)" radius={4} hide={ocultas.has('projecao')}>
              <LabelList dataKey="projecao" position="top" formatter={rotulo} className="fill-primary text-[10px] font-semibold" />
            </Bar>
          </ComposedChart>
        </ChartContainer>
      )}
    </PainelGrafico>
  );
}
