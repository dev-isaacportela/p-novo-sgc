// As vendas do produto na filial em excesso (R-139, o showExcessBranchSales do
// legado): abre ao clicar no cartão da filial, dentro do alerta de excesso, em
// todo o SGC (painel e janela das Compras inteligentes, drill-in e alertas do
// card). UMA `sgcWintProdutoHistorico` por (produto, filial) no clique, guardada
// enquanto a página estiver aberta; nada ao carregar a tela (teto de 300/min).
// A regra (meses, total, média, cobertura) é de `lib/vendas-filial.ts`.
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyState, LabelList, XAxis, YAxis, corDeSerie } from '@/components/page';
import type { ChartConfig } from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { hojeIso } from '@/lib/formato';
import type { PontoHistorico } from '@/lib/ressuprimento-detalhe';
import type { ReferenciaSugestao } from '@/lib/ressuprimento';
import { MESES_CONSULTA_FILIAL, resumoDaFilial, serieDaFilial } from '@/lib/vendas-filial';

const config = { vendas: { label: 'Vendas', color: corDeSerie(1) } } satisfies ChartConfig;
const decimal = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// Uma consulta por (produto, filial) enquanto a página estiver aberta.
const historicos = new Map<string, Promise<PontoHistorico[]>>();
function historicoDaFilial(codprod: number, codfilial: string): Promise<PontoHistorico[]> {
  const chave = `${codprod}|${codfilial}`;
  let pedido = historicos.get(chave);
  if (!pedido) {
    pedido = linhas('sgcWintProdutoHistorico', { codprod, codfilial, meses: MESES_CONSULTA_FILIAL })
      .then((rows) => rows as unknown as PontoHistorico[]);
    pedido.catch(() => historicos.delete(chave));
    historicos.set(chave, pedido);
  }
  return pedido;
}

export function VendasNaFilial({
  codprod,
  codfilial,
  filial,
  estoque,
  semPublico,
  unidadesPorCaixa = 1,
  referencia = 'unidades',
}: {
  codprod: number;
  codfilial: string;
  filial: string;
  /** O estoque da filial; `null` quando a tela não o tem (alerta do card). */
  estoque: number | null;
  /** O mesmo recorte da tela: na 011, o seletor de público; no kanban, sempre fora. */
  semPublico: boolean;
  unidadesPorCaixa?: number;
  referencia?: ReferenciaSugestao;
}) {
  const [estado, setEstado] = React.useState<{ chave: string; historico: PontoHistorico[] | null; erro: string } | null>(null);
  const chave = `${codprod}|${codfilial}`;
  React.useEffect(() => {
    let vivo = true;
    historicoDaFilial(codprod, codfilial).then(
      (historico) => { if (vivo) setEstado({ chave, historico, erro: '' }); },
      () => { if (vivo) setEstado({ chave, historico: null, erro: 'Não foi possível carregar as vendas desta filial.' }); },
    );
    return () => { vivo = false; };
  }, [codprod, codfilial, chave]);
  const atual = estado && estado.chave === chave ? estado : null;

  const caixa = referencia === 'caixas' && unidadesPorCaixa > 1 ? unidadesPorCaixa : 1;
  const unidade = caixa > 1 ? 'cx' : 'un.';
  const serie = atual?.historico ? serieDaFilial(atual.historico, hojeIso(), semPublico) : [];
  const resumo = resumoDaFilial(serie, estoque ?? 0);
  const dados = serie.map((m) => ({ rotulo: m.parcial ? `${m.rotulo}*` : m.rotulo, vendas: Math.round((m.vendas / caixa) * 10) / 10 }));

  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-xl border border-rule-row bg-card px-3 py-2 text-ink">
      <span className="text-[12px] font-semibold">{`Vendas em ${filial} · últimos 6 meses`}</span>
      {atual?.erro ? (
        <EmptyState title={atual.erro} />
      ) : !atual ? (
        <EmptyState title="Carregando as vendas da filial..." />
      ) : (
        <>
          <ChartContainer config={config} className="h-40 w-full">
            <BarChart data={dados} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval={0} className="text-[10px]" />
              <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={caixa > 1} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="vendas" fill="var(--color-vendas)" radius={4}>
                {/* R-116: o valor escrito em cada barra. */}
                <LabelList dataKey="vendas" position="top" formatter={(v: unknown) => decimal(Number(v))} className="fill-ink text-[10px]" />
              </Bar>
            </BarChart>
          </ChartContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
            <span><span className="font-semibold text-ink">{`${decimal(resumo.total / caixa)} ${unidade}`}</span> nos 6 meses</span>
            <span><span className="font-semibold text-ink">{`${decimal(resumo.mediaMensal / caixa)} ${unidade}`}</span> por mês</span>
            <span>{estoque === null ? 'estoque na filial: ver o alerta' : <>estoque <span className="font-semibold text-ink">{`${decimal(resumo.estoque / caixa)} ${unidade}`}</span></>}</span>
            {estoque === null ? null : (
              <span>{resumo.coberturaDias === null ? 'sem giro' : <>cobre <span className="font-semibold text-ink">{`${resumo.coberturaDias} d`}</span></>}</span>
            )}
            <span>* mês corrente, parcial{semPublico ? ' · sem órgão público' : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}
