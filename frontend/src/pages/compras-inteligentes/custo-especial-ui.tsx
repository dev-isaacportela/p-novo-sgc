// A seção "Oportunidade com preço especial" (spec 011, R-125): resumo, os
// três KPIs, as tabelas em pílula, o card de cada tabela (política, clientes,
// risco, barra do limite seguro, gráfico da venda do cliente, os 5 clientes,
// rodapé) e o carrinho especial. Vive no painel de detalhe e na janela Análise
// do Produto, sobre as sugestões que a página já calculou para o produto
// aberto — nenhuma consulta aqui.
//
// R-116: valor escrito em cima de cada barra, inclusive a projeção.
import * as React from 'react';
import { ShoppingCart } from 'lucide-react';

import {
  AlternaOpcoes, Badge, Bar, BarraConsumo, Button, CartesianGrid, ChartContainer, ChartTooltip, ChartTooltipContent,
  ChipContagem, ComposedChart, GradeMini, Input, LabelList, MiniCartao, Panel, PanelHeader, RowMeta, SecaoRecolhivel, Status,
  XAxis, YAxis, corDeSerie,
} from '@/components/page';
import type { ChartConfig } from '@/components/page';
import { arredondarPorCaixa } from '@/lib/compras';
import { ROTULO_LIMITADO, ROTULO_RISCO, planoEspecial, secaoEspecialAberta } from '@/lib/custo-especial';
import type { AbaGrafico, Risco, SugestaoCliente, TabelaEspecial } from '@/lib/custo-especial';
import { fmtData, moeda } from '@/lib/formato';
import { quantidadeNaReferencia, rotuloDaQuantidade, textoDaSugestao, unidadesDaDigitada } from '@/lib/ressuprimento';
import type { LinhaRessuprimento, ReferenciaSugestao } from '@/lib/ressuprimento';
import { rotuloMes, somarMeses } from '@/lib/ressuprimento-detalhe';

const TOM_RISCO: Record<Risco, 'live' | 'attention' | 'alert' | 'off'> = { seguro: 'live', moderado: 'attention', arriscado: 'alert', monitorar: 'off' };
const config = {
  venda: { label: 'Venda do cliente', color: corDeSerie(1) },
  projecao: { label: 'Projeção segura', color: corDeSerie(2) },
} satisfies ChartConfig;
const JANELAS: { value: '6' | '12'; label: string }[] = [{ value: '6', label: '6m' }, { value: '12', label: '12m' }];

const quantidade = (valor: number) => Math.round(valor).toLocaleString('pt-BR');
const rotulo = (valor: unknown) => (valor === null || valor === undefined ? '' : Math.round(Number(valor)).toLocaleString('pt-BR'));
const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)} %` : '—');

/** A venda mensal dos clientes da tabela (soma das participações) mais a projeção segura no mês seguinte. */
function serieDaTabela(tabela: TabelaEspecial, meses: 6 | 12) {
  const porMes = new Map<string, number>();
  for (const c of tabela.clientes) for (const m of c.mensais) porMes.set(m.mes, (porMes.get(m.mes) ?? 0) + m.valor);
  const ordenados = [...porMes.keys()].sort().slice(-meses);
  const ultimo = ordenados[ordenados.length - 1];
  const serie = ordenados.map((mes) => ({ mes, rotulo: rotuloMes(mes), venda: Math.round(porMes.get(mes) ?? 0), projecao: null as number | null }));
  const proximo = ultimo ? somarMeses(ultimo, 1) : '';
  serie.push({ mes: proximo, rotulo: proximo ? rotuloMes(proximo) : 'próx.', venda: null as unknown as number, projecao: tabela.clientes.reduce((s, c) => s + c.projMensal, 0) });
  return serie;
}

function CardTabela({
  tabela, indice, linha, referencia, podeOperar, motivoBloqueio, onAdicionarEspecial,
}: {
  tabela: TabelaEspecial; indice: number; linha: LinhaRessuprimento; referencia: ReferenciaSugestao;
  podeOperar: boolean; motivoBloqueio: string; onAdicionarEspecial: (tabela: TabelaEspecial, quantidade: number) => void;
}) {
  const [meses, setMeses] = React.useState<'6' | '12'>('6');
  const [digitada, setDigitada] = React.useState('');
  const [chaveAnterior, setChaveAnterior] = React.useState(`${tabela.chave}|${tabela.quantidadeComprar}|${referencia}`);
  const chaveAtual = `${tabela.chave}|${tabela.quantidadeComprar}|${referencia}`;
  if (chaveAtual !== chaveAnterior) {
    setChaveAnterior(chaveAtual);
    setDigitada('');
  }
  const cx = linha.unidadesPorCaixa;
  const quantidadeEspecial = digitada === '' ? tabela.quantidadeComprar : unidadesDaDigitada(Number(digitada) || 0, cx, referencia);
  const serie = React.useMemo(() => serieDaTabela(tabela, Number(meses) as 6 | 12), [tabela, meses]);
  const folga = Math.max(0, tabela.seguro - tabela.quantidadeComprar);
  const nomes = tabela.clientes.map((c) => c.cliente || `cliente ${c.codcli}`);
  const clientes = nomes.length > 2 ? `${nomes.slice(0, 2).join(', ')} +${nomes.length - 2}` : nomes.join(', ');

  return (
    <Panel>
      <PanelHeader
        title={`Tabela ${indice + 1} · ${tabela.politicaNome || `política ${tabela.politicaId}`}`}
        hint={`${clientes} · comprar ${textoDaSugestao(tabela.quantidadeComprar, cx, referencia)} a ${moeda(tabela.custoEspecial)}`}
      >
        <Status tone={TOM_RISCO[tabela.risco]}>{ROTULO_RISCO[tabela.risco]}</Status>
      </PanelHeader>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <BarraConsumo pct={tabela.seguro > 0 ? (tabela.quantidadeComprar / tabela.seguro) * 100 : 0} tone={TOM_RISCO[tabela.risco]} rotulo={`Uso do limite seguro: ${quantidade(tabela.quantidadeComprar)} de ${quantidade(tabela.seguro)} un.`} />
          <RowMeta>{`Compra especial ${quantidade(tabela.quantidadeComprar)} un. (${pct(tabela.quantidadeComprar, tabela.seguro)}) · folga segura ${quantidade(folga)} un. (${pct(folga, tabela.seguro)})`}</RowMeta>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RowMeta>Venda do cliente por mês e projeção</RowMeta>
            <AlternaOpcoes rotulo="Meses do gráfico" opcoes={JANELAS} valor={meses} onValor={setMeses} />
          </div>
          <div className="h-[180px] w-full min-w-0">
            <ChartContainer config={config} className="h-full w-full">
              <ComposedChart data={serie} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval={0} className="text-[10px]" />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="venda" fill="var(--color-venda)" radius={4}>
                  <LabelList dataKey="venda" position="top" formatter={rotulo} className="fill-ink text-[10px]" />
                </Bar>
                <Bar dataKey="projecao" fill="var(--color-projecao)" radius={4}>
                  <LabelList dataKey="projecao" position="top" formatter={rotulo} className="fill-primary text-[10px] font-semibold" />
                </Bar>
              </ComposedChart>
            </ChartContainer>
          </div>
        </div>

        <ul className="flex flex-col gap-0.5 text-[12px] text-ink-secondary">
          {tabela.clientes.slice(0, 5).map((c) => (
            <li key={`${c.codcli}`} className="flex flex-wrap justify-between gap-2">
              <span className="truncate text-ink">{c.cliente || `cliente ${c.codcli}`}</span>
              <span>{`Média ${quantidade(c.mediaMensal)} · Teto ${quantidade(c.teto)} · Proj. ${quantidade(c.projMensal)}`}</span>
            </li>
          ))}
        </ul>

        <GradeMini colunas={3}>
          <MiniCartao rotulo="Limite seguro" valor={`${quantidade(tabela.seguro)} un.`} />
          <MiniCartao rotulo="Custo" valor={moeda(tabela.custoEspecial)} hint={`economia ${moeda(tabela.economiaUnit)} por un.`} />
          <MiniCartao rotulo="Ganho da compra" valor={moeda(tabela.ganhoEstimado)} />
          <MiniCartao rotulo="Limitado por" valor={ROTULO_LIMITADO[tabela.limitadoPor]} />
          <MiniCartao rotulo="Ganho potencial restante" valor={moeda(Math.max(0, tabela.ganhoPotencial - tabela.ganhoEstimado))} />
          <MiniCartao rotulo="Validade" valor={tabela.dataFim ? fmtData(tabela.dataFim) : 'sem data'} />
        </GradeMini>
        <RowMeta>A sugestão especial usa o menor valor entre projeção do cliente, histórico mensal, comportamento recente do SKU, compra base e cobertura segura.</RowMeta>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-52 flex-col gap-1 text-[12px] text-ink-secondary">
            {`Quantidade para o carrinho especial (${rotuloDaQuantidade(cx, referencia) === 'cx' ? 'caixas' : 'unidades'})`}
            <Input
              type="number"
              min={0}
              step={rotuloDaQuantidade(cx, referencia) === 'cx' ? 1 : cx}
              value={digitada === '' ? String(quantidadeNaReferencia(tabela.quantidadeComprar, cx, referencia)) : digitada}
              onChange={(e) => setDigitada(e.target.value)}
              onBlur={(e) => setDigitada(String(quantidadeNaReferencia(arredondarPorCaixa(unidadesDaDigitada(Number(e.target.value) || 0, cx, referencia), cx), cx, referencia)))}
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={!podeOperar || quantidadeEspecial <= 0}
            title={podeOperar ? undefined : motivoBloqueio}
            onClick={() => onAdicionarEspecial(tabela, arredondarPorCaixa(quantidadeEspecial, cx))}
          >
            <ShoppingCart aria-hidden />
            Adicionar especial
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function OportunidadeEspecial({
  linha, sugestoes, quantidade: quantidadeSimulada, referencia, podeOperar, motivoBloqueio, onAdicionarEspecial, abaGrafico = 'vendas',
}: {
  linha: LinhaRessuprimento;
  /** A aba do gráfico em que a seção aparece: na "Preço especial" ela já nasce expandida (C-048). */
  abaGrafico?: AbaGrafico;
  /** As sugestões por cliente do produto aberto (RN-033), já calculadas pela página. */
  sugestoes: SugestaoCliente[];
  /** A quantidade simulada do painel, já à caixa. */
  quantidade: number;
  referencia: ReferenciaSugestao;
  podeOperar: boolean;
  motivoBloqueio: string;
  onAdicionarEspecial: (tabela: TabelaEspecial, quantidade: number) => void;
}) {
  const plano = React.useMemo(() => planoEspecial(sugestoes, quantidadeSimulada), [sugestoes, quantidadeSimulada]);
  const [aba, setAba] = React.useState(0);
  // R-126: as seções nascem recolhidas — esta, escolhida pela aba "Preço especial", nasce
  // expandida (C-048); trocar de produto volta ao padrão.
  const [aberta, setAberta] = React.useState(() => secaoEspecialAberta(abaGrafico));
  const codprod = Number(linha.medida.CODPROD);
  const [ultimoCodprod, setUltimoCodprod] = React.useState(codprod);
  if (codprod !== ultimoCodprod) {
    setUltimoCodprod(codprod);
    setAberta(secaoEspecialAberta(abaGrafico));
    setAba(0);
  }
  const indice = Math.min(aba, Math.max(0, plano.tabelas.length - 1));
  const cx = linha.unidadesPorCaixa;
  if (plano.tabelas.length === 0) return null;
  const tabela = plano.tabelas[indice];

  return (
    <SecaoRecolhivel
      titulo="Oportunidade com preço especial"
      resumo={`${plano.tabelas.length} ${plano.tabelas.length === 1 ? 'tabela' : 'tabelas'} · ganho estimado ${moeda(plano.ganhoEstimado)}`}
      extra={<Badge tone="accent">{`Especial ${quantidade(plano.especialTotal)} un.`}</Badge>}
      aberta={aberta}
      onToggle={() => setAberta((atual) => !atual)}
    >
      <div className="flex flex-col gap-3">
        <GradeMini colunas={3}>
          <MiniCartao rotulo="Comprar padrão" valor={textoDaSugestao(plano.comprarPadrao, cx, referencia)} hint="O que fica no custo padrão" />
          <MiniCartao rotulo="Tabelas especiais" valor={String(plano.tabelas.length)} />
          <MiniCartao rotulo="Especial total" valor={textoDaSugestao(plano.especialTotal, cx, referencia)} hint={`ganho estimado ${moeda(plano.ganhoEstimado)}`} />
        </GradeMini>
        {plano.tabelas.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tabelas especiais">
            {plano.tabelas.map((t, i) => (
              <ChipContagem key={t.chave} ativo={i === indice} onClick={() => setAba(i)}>
                {`Tabela ${i + 1} · ${textoDaSugestao(t.quantidadeComprar, cx, referencia)}`}
              </ChipContagem>
            ))}
          </div>
        ) : null}
        <CardTabela
          tabela={tabela}
          indice={indice}
          linha={linha}
          referencia={referencia}
          podeOperar={podeOperar}
          motivoBloqueio={motivoBloqueio}
          onAdicionarEspecial={onAdicionarEspecial}
        />
        <RowMeta>O saldo acima do limite seguro, ou acima da quantidade simulada, fica como compra padrão.</RowMeta>
      </div>
    </SecaoRecolhivel>
  );
}
