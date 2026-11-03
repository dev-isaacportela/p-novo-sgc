// A aba Análise da tela ampla (R-133), no desenho do SGC legado: chips de
// filtro, busca ("/" foca; Esc limpa e, no segundo, fecha a janela), Embalagem
// mínima / Caixa cheia, ordenação por coluna em três passos, densidade, a
// faixa de grupos acima das colunas, Produto fixo à esquerda e Ação à direita
// (a rolagem horizontal fica no meio), a seleção em lote e o rodapé fixo.
//
// Nada aqui consulta: a análise já veio (RascunhoProvider) e filtrar, ordenar
// e trocar de unidade são regra pura (`lib/analise-pedido.ts`).
import * as React from 'react';
import { ArrowDown, ArrowUp, Check, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  AlternaOpcoes, Button, CaixaSelecao, ChipContagem, Dash, EmptyState, IconButton, Input, SearchInput, Status,
} from '@/components/page';
import { cn } from '@/lib/utils';
import { moeda, hojeIso } from '@/lib/formato';
import { custoPadraoDe, type TipoPreco } from '@/lib/compras';
import {
  FILTROS_ANALISE, contagemDeSaida, daUnidade, diasComCompra, filtrarAnalise, linhasDaAnalise, naUnidade, ordenarAnalise,
  naoFechaACaixa, proximaOrdem, quantidadeNoModo, rodapeDaAnalise, rotuloDias, rotuloDoComprar, segundaLinhaComprar, sugestaoNaUnidade, textoDoComprarRodape, textoDosDias, textoDoTransito,
  type ColunaAnalise, type FiltrosAnalise, type LinhaDaAnalise, type OrdemAnalise, type UnidadeExibida,
} from '@/lib/analise-pedido';
import { tabelasVigentes } from '@/lib/custo-do-item';
import { useRascunho } from './rascunho-contexto';
import { SeletorDeCusto } from './SeletorDeCusto';
import { NomeDoProduto } from './NomeDoProduto';

const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
type Densidade = 'compacta' | 'confortavel';
type Custo = { precoCusto: number; tipoPreco: TipoPreco };

const TOM_DIAS = { alert: 'alert', attention: 'attention', off: 'off' } as const;

/** Número que some quando é zero: cinza claro, como no legado. */
function Numero({ valor, className }: { valor: number; className?: string }) {
  return <span className={cn(valor === 0 ? 'text-ink-muted' : 'text-ink', className)}>{fmt(valor)}</span>;
}

export function AnaliseAmpla({
  busca,
  onBusca,
  refBusca,
}: {
  busca: string;
  onBusca: (texto: string) => void;
  refBusca: React.RefObject<HTMLInputElement | null>;
}) {
  const r = useRascunho();
  const hoje = hojeIso();
  const [filtros, setFiltros] = React.useState<FiltrosAnalise>(FILTROS_ANALISE);
  const [ordem, setOrdem] = React.useState<OrdemAnalise | null>(null);
  // R-136: abre em Caixa cheia, como o legado.
  const [unidade, setUnidade] = React.useState<UnidadeExibida>('caixa');
  const [densidade, setDensidade] = React.useState<Densidade>('compacta');
  const [qtRascunho, setQtRascunho] = React.useState<Record<number, number>>({});
  const [custoRascunho, setCustoRascunho] = React.useState<Record<number, Custo>>({});
  const [selecionados, setSelecionados] = React.useState<Set<number>>(() => new Set());

  const analise = r.analise;
  const comercial = React.useMemo(() => new Set((r.solicitacoes ?? []).map((s) => Number(s.CODPROD))), [r.solicitacoes]);
  const tabelasDe = React.useCallback((codprod: number) => tabelasVigentes(analise?.especiais ?? [], codprod, hoje), [analise, hoje]);
  const especial = React.useMemo(
    () => new Set((analise?.especiais ?? []).map((c) => Number(c.CODPROD)).filter((c) => tabelasDe(c).length > 0)),
    [analise, tabelasDe],
  );
  const linhas = React.useMemo(() => linhasDaAnalise(analise?.montados ?? [], r.itens, {
    divisao: analise?.divisao, pedidoErp: analise?.pedidoErp, kanban: analise?.kanban, comercial, especial,
  }), [analise, r.itens, comercial, especial]);

  const quantidadeDe = React.useCallback(
    // R-136: sem edição, a sugestão do modo; editada, a mesma em unidades (Caixa cheia sobe à caixa).
    (l: LinhaDaAnalise) => (l.noPedido ? l.noPedido.qtPedida : quantidadeNoModo(qtRascunho[l.codprod], l.base.qtSugerida, l.base.unPorCaixa, unidade).unidades),
    [qtRascunho, unidade],
  );
  const custoDe = (l: LinhaDaAnalise): Custo => l.noPedido ?? custoRascunho[l.codprod] ?? l.base;
  const visiveis = React.useMemo(
    () => ordenarAnalise(filtrarAnalise(linhas, filtros, busca), ordem, quantidadeDe, r.meses),
    [linhas, filtros, busca, ordem, quantidadeDe, r.meses],
  );
  const rodape = React.useMemo(() => rodapeDaAnalise(visiveis, quantidadeDe), [visiveis, quantidadeDe]);
  const saida = contagemDeSaida(linhas);
  const contaSugestao = linhas.filter((l) => l.base.qtSugerida > 0).length;
  const contaPedido = linhas.filter((l) => l.noPedido).length;
  // R-137: toda linha com a mesma altura — 44 px na compacta, 56 px na confortável —, com ou sem selo e com qualquer nome.
  const densa = densidade === 'compacta' ? 'h-11 py-0.5' : 'h-14 py-1.5';
  const campo = densidade === 'compacta' ? 'h-7' : 'h-8';

  function definirQuantidade(l: LinhaDaAnalise, unidades: number) {
    if (l.noPedido) {
      r.alterar(l.codprod, { qtPedida: unidades });
      if (unidades <= 0) setQtRascunho((atual) => ({ ...atual, [l.codprod]: 0 }));
    } else {
      setQtRascunho((atual) => ({ ...atual, [l.codprod]: unidades }));
    }
  }
  function definirCusto(l: LinhaDaAnalise, custo: Custo) {
    if (l.noPedido) r.alterar(l.codprod, custo);
    else setCustoRascunho((atual) => ({ ...atual, [l.codprod]: custo }));
  }
  function adicionar(l: LinhaDaAnalise) {
    const qt = quantidadeDe(l);
    if (qt > 0) r.adicionar(l.codprod, qt, custoRascunho[l.codprod] ?? {});
  }
  const alternarSelecao = (codprod: number) => setSelecionados((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(codprod)) proximo.delete(codprod); else proximo.add(codprod);
    return proximo;
  });
  const todosVisiveis = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.codprod));
  const selecionadas = linhas.filter((l) => selecionados.has(l.codprod));
  const unidadesSelecionadas = selecionadas.reduce((soma, l) => soma + quantidadeDe(l), 0);

  if (!analise) {
    return r.carregandoAnalise
      ? <EmptyState title="Montando a análise..." hint="Venda, estoque, trânsito, sugestão, cobertura e custos deste fornecedor nesta filial." />
      : (
        <EmptyState
          title="A análise ainda não foi montada"
          action={<Button variant="primary" onClick={() => void r.montarAnalise()}>Montar a análise</Button>}
        />
      );
  }

  const grupo = 'sticky top-0 z-20 h-7 bg-card px-3 text-[10px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink-muted uppercase';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros da análise">
          <ChipContagem ativo={filtros.saida === 'com'} onClick={() => setFiltros((f) => ({ ...f, saida: f.saida === 'com' ? 'todas' : 'com' }))}>{`Com saída ${saida.com}`}</ChipContagem>
          <ChipContagem ativo={filtros.saida === 'sem'} onClick={() => setFiltros((f) => ({ ...f, saida: f.saida === 'sem' ? 'todas' : 'sem' }))}>{`Sem saída ${saida.sem}`}</ChipContagem>
          <ChipContagem ativo={filtros.comSugestao} onClick={() => setFiltros((f) => ({ ...f, comSugestao: !f.comSugestao }))}>{`Com sugestão ${contaSugestao}`}</ChipContagem>
          <ChipContagem ativo={filtros.noPedido} onClick={() => setFiltros((f) => ({ ...f, noPedido: !f.noPedido }))}>{`No pedido ${contaPedido}`}</ChipContagem>
        </div>
        <div className="w-64">
          <SearchInput
            ref={refBusca}
            placeholder="Pesquisar produto… ( / )"
            aria-label="Pesquisar produto"
            value={busca}
            onChange={(evento) => onBusca(evento.target.value)}
          />
        </div>
        <AlternaOpcoes rotulo="Unidade exibida" valor={unidade} onValor={setUnidade} opcoes={[{ value: 'embalagem', label: 'Embalagem mínima' }, { value: 'caixa', label: 'Caixa cheia' }]} />
        <AlternaOpcoes rotulo="Densidade" valor={densidade} onValor={setDensidade} opcoes={[{ value: 'compacta', label: 'Compacta' }, { value: 'confortavel', label: 'Confortável' }]} />
        {ordem ? (
          <Button size="sm" onClick={() => setOrdem(null)} title="Voltar à ordem da análise">
            Ordenado
            <X aria-hidden />
          </Button>
        ) : null}
        <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-secondary">
          {`análise das ${analise.carregadaEm}`}
          <Button size="sm" onClick={() => void r.montarAnalise()} disabled={r.carregandoAnalise}>
            <RefreshCw aria-hidden />
            Recalcular
          </Button>
        </span>
      </div>

      {selecionados.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-accent px-3 py-2 text-[13px] text-ink">
          <span className="font-semibold">{`${selecionados.size} selecionado(s) · ${fmt(naUnidade(unidadesSelecionadas, 1, 'embalagem'))} un.`}</span>
          <Button size="sm" onClick={() => setSelecionados(new Set())}>Limpar</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={r.bloqueado || unidadesSelecionadas <= 0}
            onClick={() => {
              for (const l of selecionadas) adicionar(l);
              setSelecionados(new Set());
            }}
          >
            <Plus aria-hidden />
            Adicionar ao pedido
          </Button>
        </div>
      ) : null}

      {/* Uma rolagem só, nos dois sentidos: cabeçalho e rodapé grudam, Produto e Ação ficam fixos dos lados. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-rule-table">
        {/* h-full + a linha de preenchimento: com poucas linhas o rodapé desce até a base da área (R-133). */}
        <table className="h-full w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="colgroup" className={cn(grupo, 'left-0 z-30')} />
              <th scope="colgroup" className={grupo} />
              <th scope="colgroup" colSpan={4} className={cn(grupo, 'border-l border-rule-row text-center')}>Vendas no período</th>
              <th scope="colgroup" colSpan={2} className={cn(grupo, 'border-l border-rule-row text-center')}>Posição atual</th>
              <th scope="colgroup" colSpan={3} className={cn(grupo, 'border-l border-rule-row text-center')}>Cobertura e custo</th>
              <th scope="colgroup" className={cn(grupo, 'right-0 z-30')} />
            </tr>
            <tr>
              <th scope="col" className="sticky top-7 left-0 z-30 w-80 min-w-80 border-b border-rule-row bg-card px-3 py-2 text-left">
                <span className="flex items-center gap-2">
                  <CaixaSelecao
                    marcado={todosVisiveis}
                    parcial={!todosVisiveis && visiveis.some((l) => selecionados.has(l.codprod))}
                    label={todosVisiveis ? 'Desmarcar os produtos visíveis' : 'Marcar os produtos visíveis'}
                    onToggle={() => setSelecionados(todosVisiveis ? new Set() : new Set(visiveis.map((l) => l.codprod)))}
                  />
                  <BotaoOrdem ordem={ordem} onOrdem={setOrdem} coluna="produto">Produto</BotaoOrdem>
                </span>
              </th>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="curva">ABC</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="venda" numeric className="border-l border-rule-row">Venda</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="privado" numeric>Privado</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="pf" numeric>PF</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="publico" numeric>Público</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="estoque" numeric className="border-l border-rule-row">Est.</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="transito" numeric>Trâns.</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="comprar" numeric className="border-l border-rule-row">Comprar</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="dias" numeric>Dias</ThOrdenavel>
              <ThOrdenavel ordem={ordem} onOrdem={setOrdem} coluna="custo">Custo</ThOrdenavel>
              <th scope="col" className="sticky top-7 right-0 z-30 border-b border-l border-rule-row bg-card px-3 py-2 text-right text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr><td colSpan={13}><EmptyState title="Nenhum produto neste filtro" /></td></tr>
            ) : visiveis.map((l) => {
              const b = l.base;
              const qt = quantidadeDe(l);
              const segunda = segundaLinhaComprar(qt, sugestaoNaUnidade(b.qtSugerida, b.unPorCaixa, unidade), b.unPorCaixa, unidade);
              const arredondada = !l.noPedido && quantidadeNoModo(qtRascunho[l.codprod], b.qtSugerida, b.unPorCaixa, unidade).arredondada;
              const noCampo = rotuloDoComprar(b.unPorCaixa, unidade);
              const naoFecha = Boolean(l.noPedido) && naoFechaACaixa(qt, b.unPorCaixa, unidade);
              const dias = rotuloDias(diasComCompra(b, qt, r.meses), b.coberturaLimite);
              const custo = custoDe(l);
              const celula = cn('border-b border-rule-row px-3 align-middle', densa);
              const fixa = 'bg-card group-hover:bg-accent';
              return (
                <tr key={l.codprod} className="group transition-colors hover:bg-accent">
                  <td className={cn(celula, fixa, 'sticky left-0 z-10 w-80 min-w-80 max-w-80')}>
                    <span className="flex items-center gap-2">
                      <CaixaSelecao marcado={selecionados.has(l.codprod)} label={`Selecionar ${b.descricao}`} onToggle={() => alternarSelecao(l.codprod)} />
                      {/* Nome numa linha (o completo no title e no drill-in); selos e meta na mesma linha de baixo. */}
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <NomeDoProduto codprod={l.codprod} descricao={b.descricao} truncar />
                        <span className="flex min-w-0 items-center gap-2 text-[11px] text-ink-secondary">
                          {l.comercial ? <span className="shrink-0 text-[10px]"><Status tone="live">COMERCIAL</Status></span> : null}
                          {l.especial ? <span className="shrink-0 text-[10px]"><Status tone="attention">ESPECIAL</Status></span> : null}
                          {l.foraDaAnalise ? (
                            <span className="shrink-0 text-[10px]" title="Fora da análise deste fornecedor nesta filial — números gravados no item"><Status tone="attention">FORA DA ANÁLISE</Status></span>
                          ) : null}
                          <span className="min-w-0 truncate" title={`${b.codprod} · ${b.embalagem || '—'} · ${b.unidade || '—'}${b.unPorCaixa > 1 ? ` · cx c/ ${b.unPorCaixa}` : ''}`}>
                            {`${b.codprod} · ${b.embalagem || '—'} · ${b.unidade || '—'}${b.unPorCaixa > 1 ? ` · cx c/ ${b.unPorCaixa}` : ''}`}
                          </span>
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className={cn(celula, 'whitespace-nowrap')}>{b.curvaAbc}</td>
                  <td className={cn(celula, 'border-l text-right whitespace-nowrap')}><Numero valor={b.qtVendaTotal} /></td>
                  <td className={cn(celula, 'text-right whitespace-nowrap')}>{l.divisao ? <Numero valor={l.divisao.privado} /> : <span title="Sem divisão: o produto não veio na análise"><Dash /></span>}</td>
                  <td className={cn(celula, 'text-right whitespace-nowrap')}>{l.divisao ? <Numero valor={l.divisao.pf} /> : <span title="Sem divisão: o produto não veio na análise"><Dash /></span>}</td>
                  <td className={cn(celula, 'text-right whitespace-nowrap')}>{l.divisao ? <Numero valor={l.divisao.publico} /> : <span title="Sem divisão: o produto não veio na análise"><Dash /></span>}</td>
                  <td className={cn(celula, 'border-l text-right whitespace-nowrap')}><Numero valor={b.qtEstoque} /></td>
                  <td className={cn(celula, 'text-right whitespace-nowrap')} title={textoDoTransito(l)}>
                    <Numero valor={b.qtTransito} />
                    {l.kanban.length > 0 ? <span className="block text-[11px] leading-none text-ink-secondary">{`+${fmt(l.kanban.reduce((t, k) => t + k.quantidade, 0))} kanban`}</span> : null}
                  </td>
                  <td className={cn(celula, 'border-l text-right whitespace-nowrap')}>
                    <span className="inline-flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min={0}
                        className={cn(campo, 'w-20 text-right')}
                        aria-label={`Comprar de ${b.descricao} (${noCampo})`}
                        value={String(naUnidade(qt, b.unPorCaixa, noCampo === 'cx' ? 'caixa' : 'embalagem'))}
                        disabled={r.bloqueado}
                        onChange={(evento) => definirQuantidade(l, daUnidade(Number(evento.target.value) || 0, b.unPorCaixa, noCampo === 'cx' ? 'caixa' : 'embalagem'))}
                      />
                      <span className="w-6 text-left text-[11px] text-ink-secondary">{noCampo}</span>
                    </span>
                    {arredondada ? <span className="block text-[11px] leading-none text-attention">arredondado à caixa</span>
                      : naoFecha ? <span className="block text-[11px] leading-none text-attention">{`não fecha a caixa (${fmt(qt / b.unPorCaixa)} cx)`}</span>
                      : segunda ? <span className="block text-[11px] leading-none text-ink-secondary">{segunda}</span> : null}
                  </td>
                  <td className={cn(celula, 'text-right whitespace-nowrap')} title={textoDosDias(b)}>
                    {dias.tom === 'neutral' ? dias.texto : <Status tone={TOM_DIAS[dias.tom]}>{dias.texto}</Status>}
                  </td>
                  <td className={cn(celula, 'w-56 min-w-56 max-w-56')}>
                    <SeletorDeCusto
                      rotulo={b.descricao}
                      tipoPreco={custo.tipoPreco}
                      precoCusto={custo.precoCusto}
                      padrao={custoPadraoDe(analise.custos, l.codprod)}
                      tabelas={tabelasDe(l.codprod)}
                      disabled={r.bloqueado}
                      compacto={densidade === 'compacta'}
                      onEscolher={(c) => definirCusto(l, c)}
                    />
                  </td>
                  <td className={cn(celula, fixa, 'sticky right-0 z-10 border-l text-right whitespace-nowrap')}>
                    {l.noPedido ? (
                      <span className="inline-flex items-center gap-1">
                        <Status tone="live"><Check className="size-3" aria-hidden />{`${fmt(naUnidade(l.noPedido.qtPedida, b.unPorCaixa, noCampo === 'cx' ? 'caixa' : 'embalagem'))} ${noCampo}`}</Status>
                        <IconButton
                          label={`Tirar ${b.descricao} do pedido`}
                          tone="danger"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          disabled={r.bloqueado}
                          onClick={() => void r.remover(l.codprod)}
                        >
                          <Trash2 aria-hidden />
                        </IconButton>
                      </span>
                    ) : (
                      <Button size="sm" variant="primary" className={campo} disabled={r.bloqueado || qt <= 0} onClick={() => adicionar(l)}>
                        <Plus aria-hidden />
                        Adicionar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr aria-hidden className="h-full"><td colSpan={13} className="p-0" /></tr>
          </tbody>
          <tfoot>
            <tr className="text-[12px] font-semibold text-ink">
              <td className="sticky bottom-0 left-0 z-30 border-t border-rule-table bg-card px-3 py-2">
                {`${rodape.produtos} produtos · ${rodape.aComprar} a comprar`}
                <span className="block font-normal text-ink-secondary">{`A ${rodape.curvas.A} · B ${rodape.curvas.B} · C ${rodape.curvas.C}`}</span>
              </td>
              <td className="sticky bottom-0 z-20 border-t border-rule-table bg-card" />
              <td className="sticky bottom-0 z-20 border-t border-l border-rule-table bg-card px-3 py-2 text-right">{fmt(rodape.venda)}</td>
              <td className="sticky bottom-0 z-20 border-t border-rule-table bg-card" colSpan={3} />
              <td className="sticky bottom-0 z-20 border-t border-l border-rule-table bg-card px-3 py-2 text-right">{fmt(rodape.estoque)}</td>
              <td className="sticky bottom-0 z-20 border-t border-rule-table bg-card px-3 py-2 text-right">{fmt(rodape.transito)}</td>
              <td className="sticky bottom-0 z-20 border-t border-l border-rule-table bg-card px-3 py-2 text-right">{textoDoComprarRodape(visiveis.map((l) => ({ unidades: quantidadeDe(l), unPorCaixa: l.base.unPorCaixa })), unidade)}</td>
              <td className="sticky bottom-0 z-20 border-t border-rule-table bg-card" />
              <td className="sticky bottom-0 z-20 border-t border-rule-table bg-card px-3 py-2">{moeda(rodape.valor)}</td>
              <td className="sticky right-0 bottom-0 z-30 border-t border-l border-rule-table bg-card" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

type PropsOrdem = {
  ordem: OrdemAnalise | null;
  onOrdem: (mudar: (atual: OrdemAnalise | null) => OrdemAnalise | null) => void;
  coluna: ColunaAnalise;
  children: React.ReactNode;
};

/** O botão do cabeçalho: padrão → invertida → sem ordem (`proximaOrdem`). */
function BotaoOrdem({ ordem, onOrdem, coluna, children }: PropsOrdem) {
  const ativa = ordem?.coluna === coluna;
  return (
    <button
      type="button"
      onClick={() => onOrdem((atual) => proximaOrdem(atual, coluna))}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink-muted uppercase',
        'hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        ativa && 'text-ink',
      )}
    >
      {children}
      {ativa ? (ordem.invertida ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
    </button>
  );
}

/** A coluna ordenável da segunda linha do cabeçalho (gruda abaixo da faixa de grupos). */
function ThOrdenavel({ numeric, className, ...props }: PropsOrdem & { numeric?: boolean; className?: string }) {
  const ativa = props.ordem?.coluna === props.coluna;
  return (
    <th
      scope="col"
      aria-sort={ativa ? (props.ordem?.invertida ? 'descending' : 'ascending') : 'none'}
      className={cn('sticky top-7 z-20 border-b border-rule-row bg-card px-3 py-2', numeric ? 'text-right' : 'text-left', className)}
    >
      <BotaoOrdem {...props} />
    </th>
  );
}
