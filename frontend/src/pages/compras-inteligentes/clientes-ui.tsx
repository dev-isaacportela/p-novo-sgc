// "Clientes que compraram" (R-135, o legado PW:16044-16590): na Análise do
// Produto aberta do pedido, logo depois do gráfico, aberta. Meses em pílulas
// (os 6 do gráfico e "Todos"), a tabela por cliente do mês — top 10 com "Ver
// todos" e as notas de cada um ao expandir — ou a matriz cliente × mês com o
// total por mês. Sem o público (ramos 11 a 15), sempre. A regra é de
// `lib/clientes-produto.ts`; as notas chegam prontas (uma consulta ao abrir).
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { AlternaOpcoes, ChipContagem, Code, EmptyState, Panel, TextLink } from '@/components/page';
import { cn } from '@/lib/utils';
import { fmtData, moeda } from '@/lib/formato';
import { rotuloMes } from '@/lib/ressuprimento-detalhe';
import {
  clientesDoMes, janelaDosClientes, matrizClienteMes, semPublico, topClientes, type NotaDoProduto,
} from '@/lib/clientes-produto';

type Visao = 'cliente' | 'matriz';
const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function ClientesQueCompraram({
  notas,
  erro,
  hoje,
  unidadesPorCaixa,
}: {
  /** `null` = carregando. */
  notas: NotaDoProduto[] | null;
  erro?: string;
  hoje: string;
  unidadesPorCaixa: number;
}) {
  const { meses } = React.useMemo(() => janelaDosClientes(hoje), [hoje]);
  const [mes, setMes] = React.useState('');
  const [visao, setVisao] = React.useState<Visao>('cliente');
  const [todos, setTodos] = React.useState(false);
  const [abertos, setAbertos] = React.useState<Set<number>>(() => new Set());
  const validas = React.useMemo(() => semPublico(notas ?? []), [notas]);
  const clientes = React.useMemo(() => clientesDoMes(validas, mes, meses), [validas, mes, meses]);
  const matriz = React.useMemo(() => matrizClienteMes(validas, meses), [validas, meses]);
  const caixa = unidadesPorCaixa > 1 ? unidadesPorCaixa : 0;
  const qtd = (un: number) => (caixa ? `${fmt(un)} un. · ${fmt(un / caixa)} cx` : `${fmt(un)} un.`);
  const cel = 'border-b border-rule-row px-3 py-2 align-top';
  const cab = 'border-b border-rule-row bg-card px-3 py-2 text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink-muted uppercase';

  const alternar = (codcli: number) => setAbertos((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(codcli)) proximo.delete(codcli); else proximo.add(codcli);
    return proximo;
  });

  return (
    <Panel>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-title text-[15px] font-bold text-ink">Clientes que compraram</span>
          <span className="text-[12px] text-ink-secondary">venda válida, sem órgão público</span>
          <span className="ml-auto">
            <AlternaOpcoes rotulo="Visão dos clientes" valor={visao} onValor={setVisao} opcoes={[{ value: 'cliente', label: 'Por cliente' }, { value: 'matriz', label: 'Cliente × mês' }]} />
          </span>
        </div>

        {visao === 'cliente' ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mês das vendas">
            <ChipContagem ativo={mes === ''} onClick={() => setMes('')}>Todos</ChipContagem>
            {meses.map((m, i) => (
              <ChipContagem key={m} ativo={mes === m} onClick={() => setMes(m)}>
                {`${rotuloMes(m)}${i === meses.length - 1 ? ' (parcial)' : ''} · ${fmt(matriz.totalPorMes[i])}`}
              </ChipContagem>
            ))}
          </div>
        ) : null}

        {erro ? (
          <EmptyState title={erro} />
        ) : notas === null ? (
          <EmptyState title="Carregando os clientes..." />
        ) : validas.length === 0 ? (
          <EmptyState title="Nenhuma venda a cliente privado nos 6 meses" />
        ) : visao === 'cliente' ? (
          <div className="overflow-x-auto rounded-xl border border-rule-table">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={cn(cab, 'text-left')}>Cliente</th>
                  <th scope="col" className={cn(cab, 'text-left')}>Ramo</th>
                  <th scope="col" className={cn(cab, 'text-right')}>Qtd.</th>
                  <th scope="col" className={cn(cab, 'text-right')}>Valor</th>
                  <th scope="col" className={cn(cab, 'text-right')}>Notas</th>
                  <th scope="col" className={cn(cab, 'text-right')}>Última compra</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="Nenhuma venda neste mês" /></td></tr>
                ) : topClientes(clientes, todos).map((c) => {
                  const aberto = abertos.has(c.codcli);
                  return (
                    <React.Fragment key={c.codcli}>
                      <tr className="transition-colors hover:bg-accent">
                        <td className={cel}>
                          <button
                            type="button"
                            aria-expanded={aberto}
                            onClick={() => alternar(c.codcli)}
                            className="flex min-w-0 items-start gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                          >
                            <ChevronDown className={cn('mt-0.5 size-3.5 shrink-0 text-ink-muted transition-transform', aberto && 'rotate-180')} aria-hidden />
                            <span className="min-w-0">
                              <Code>{c.codcli}</Code>
                              <span className="ml-1.5 font-semibold text-ink">{c.cliente}</span>
                            </span>
                          </button>
                        </td>
                        <td className={cn(cel, 'text-[12px] text-ink-secondary')}>{c.ramo}</td>
                        <td className={cn(cel, 'text-right whitespace-nowrap')}>{qtd(c.quantidade)}</td>
                        <td className={cn(cel, 'text-right whitespace-nowrap')}>{moeda(c.valor)}</td>
                        <td className={cn(cel, 'text-right')}>{c.notas.length}</td>
                        <td className={cn(cel, 'text-right whitespace-nowrap')}>{fmtData(c.ultimaCompra)}</td>
                      </tr>
                      {aberto ? c.notas.map((n) => (
                        <tr key={`${c.codcli}-${n.NUMTRANSVENDA}-${n.NUMNOTA}-${n.DTMOV}`} className="bg-muted text-[12px] text-ink-secondary">
                          <td className={cn(cel, 'pl-9')} colSpan={2}>{`${fmtData(String(n.DTMOV))} · nota ${Number(n.NUMNOTA) || '—'}`}</td>
                          <td className={cn(cel, 'text-right whitespace-nowrap')}>{qtd(Number(n.QUANTIDADE))}</td>
                          <td className={cn(cel, 'text-right whitespace-nowrap')}>{moeda(Number(n.VALOR_TOTAL))}</td>
                          <td className={cel} colSpan={2} />
                        </tr>
                      )) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-rule-table">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={cn(cab, 'text-left')}>Cliente</th>
                  {meses.map((m, i) => (
                    <th key={m} scope="col" className={cn(cab, 'text-right')}>{`${rotuloMes(m)}${i === meses.length - 1 ? '*' : ''}`}</th>
                  ))}
                  <th scope="col" className={cn(cab, 'text-right')}>Total</th>
                </tr>
              </thead>
              <tbody>
                {topClientes(matriz.linhas, todos).map((l) => (
                  <tr key={l.codcli} className="transition-colors hover:bg-accent">
                    <td className={cel}>
                      <Code>{l.codcli}</Code>
                      <span className="ml-1.5 font-semibold text-ink">{l.cliente}</span>
                      <span className="block text-[11px] text-ink-secondary">{l.ramo}</span>
                    </td>
                    {l.porMes.map((v, i) => (
                      <td key={meses[i]} className={cn(cel, 'text-right whitespace-nowrap', v === 0 ? 'text-ink-muted' : 'text-ink')}>{fmt(v)}</td>
                    ))}
                    <td className={cn(cel, 'text-right font-semibold whitespace-nowrap')}>{fmt(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[12px] font-semibold text-ink">
                  <td className="border-t border-rule-table px-3 py-2">Total do mês</td>
                  {matriz.totalPorMes.map((v, i) => <td key={meses[i]} className="border-t border-rule-table px-3 py-2 text-right whitespace-nowrap">{fmt(v)}</td>)}
                  <td className="border-t border-rule-table px-3 py-2 text-right whitespace-nowrap">{fmt(matriz.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-secondary">
          <span>{visao === 'matriz' ? '* mês corrente, parcial · os totais por mês são as barras de Vendas do gráfico' : 'Clique no cliente para ver as notas dele no recorte.'}</span>
          {(visao === 'cliente' ? clientes.length : matriz.linhas.length) > 10 ? (
            <TextLink onClick={() => setTodos((atual) => !atual)}>
              {todos ? 'Ver só os 10 primeiros' : `Ver todos (${visao === 'cliente' ? clientes.length : matriz.linhas.length})`}
            </TextLink>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
