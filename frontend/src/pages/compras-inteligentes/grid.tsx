// A lista de produtos do layout legado da 011 (R-117): cabeçalho com o
// subtítulo e o botão do carrinho, a linha de chips (sugestão, rupturas,
// silenciados, ordem, movimentação, situação), a tabela com a linha
// selecionável e a paginação.
//
// Tudo aqui é local: filtrar, ordenar, trocar de visão e selecionar não custam
// nenhuma execução (RNF-005). A linha já chega calculada por
// `montarRessuprimento`; esta camada só desenha, seleciona e coleta a quantidade.
import * as React from 'react';
import { Download, RotateCcw, ShoppingCart, VolumeX } from 'lucide-react';

import {
  Button, CheckRow, ChipContagem, Code, Dash, IconButton, Input, Pagination, Panel, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { arredondarPorCaixa, rotuloSemCusto } from '@/lib/compras';
import { fmtData, moeda } from '@/lib/formato';
import {
  OPCOES_MOVIMENTACAO, OPCOES_ORDEM, ROTULO_STATUS, precoDeCompra, quantidadeNaReferencia, quantidadeParaCompletar,
  rotuloDaQuantidade, textoDaSugestao, unidadesDaDigitada,
} from '@/lib/ressuprimento';
import { textoDoSelo } from '@/lib/projecao-manual';
import { resumoExcesso, seloBloqueado, seloExcesso } from '@/lib/avisos-produto';
import type { FilialComExcesso } from '@/lib/ressuprimento-detalhe';
import { listaCompacta, listaMinima } from '@/lib/largura-painel';
import { rotuloCobertura, textoChegada } from '@/lib/transito';
import { cn } from '@/lib/utils';
import type {
  FiltroMovimentacao, FiltrosLista, LinhaRessuprimento, OrdemLista, ReferenciaSugestao, StatusRessuprimento,
  VisaoRessuprimento,
} from '@/lib/ressuprimento';

const POR_PAGINA = 25;

// R-129 (correção): a lista nunca rola nem corta para o lado. Medida abaixo de
// 900 px ela fica compacta: tabela de colunas fixas e justas, curvas numa coluna
// só ("F/R"), a situação embaixo do nome e menos respiro nas células — o nome
// do produto quebra em linhas, a quantidade e as ações cabem sempre.
/** Card da lista mais baixo que isto: os filtros rolam com as linhas. */
const CARD_BAIXO = 520;
const COMPACTA = 'table-fixed [&_td]:px-2 [&_th]:px-2 [&_td]:break-words';

/** §8.4: estado dentro de tabela é ponto + texto, nunca só a cor. */
const TOM_STATUS: Record<StatusRessuprimento, 'alert' | 'attention' | 'live'> = {
  ruptura: 'alert', elevada_exposicao: 'alert', baixa_exposicao: 'attention', excesso: 'attention', adequado: 'live',
};

const OPCOES_SITUACAO: { value: string; label: string }[] = [
  { value: '', label: 'Qualquer situação' },
  ...(Object.keys(ROTULO_STATUS) as StatusRessuprimento[]).map((s) => ({ value: s, label: ROTULO_STATUS[s] })),
];

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export interface PedidoAbertoDoItem { idCard: number; titulo: string }

export interface AcoesDaLista {
  onAdicionar: (linha: LinhaRessuprimento, quantidade: number) => void;
  onSilenciar: (linha: LinhaRessuprimento) => void;
  onRestaurar: (linha: LinhaRessuprimento) => void;
  /** C-012: o chip "Silenciados" — liga o filtro e leva a lista para "todos" (regra em `alternarSilenciados`). */
  onAlternarSilenciados: () => void;
  onExportar: () => void;
  onAbrirCarrinho: () => void;
}

/**
 * R-122: a letra de uma das duas curvas; a que vale para a cobertura (a pior
 * das duas, ou ambas quando iguais) sai em destaque, com o alvo no título.
 */
function LetraCurva({ letra, linha }: { letra: LinhaRessuprimento['curva']; linha: LinhaRessuprimento }) {
  const alvo = `Alvo de cobertura: ${linha.coberturaDias} dias (${linha.parametros.origemCobertura})`;
  return letra === linha.curva
    ? <strong title={`Vale para a cobertura (a pior das duas). ${alvo}`}>{letra}</strong>
    : <span title={`Não é a pior das duas; a cobertura segue a curva ${linha.curva}. ${alvo}`}>{letra}</span>;
}

export function ListaProdutos({
  visao,
  linhas,
  todas,
  selecionado,
  onSelecionar,
  quantidades,
  onQuantidade,
  referencia,
  filtros,
  onFiltros,
  busca,
  onBusca,
  desconsiderarLicitacao,
  onLicitacao,
  emPedidoAberto,
  excessos,
  contagemAvisos,
  especiais,
  sugestaoProjetada,
  sugestaoTotal,
  carrinho,
  podeOperar,
  podeParametrizar,
  motivoBloqueio,
  acoes,
}: {
  visao: VisaoRessuprimento;
  /** As linhas da visão, já filtradas e ordenadas pela página. */
  linhas: LinhaRessuprimento[];
  /** Todas as linhas do fornecedor na filial — é de onde saem as contagens dos chips. */
  todas: LinhaRessuprimento[];
  selecionado: number;
  onSelecionar: (linha: LinhaRessuprimento) => void;
  quantidades: Record<number, number>;
  onQuantidade: (codprod: number, valor: number) => void;
  referencia: ReferenciaSugestao;
  filtros: FiltrosLista;
  onFiltros: (parcial: Partial<FiltrosLista>) => void;
  busca: string;
  onBusca: (texto: string) => void;
  desconsiderarLicitacao: boolean;
  onLicitacao: () => void;
  /** Produtos que já estão num pedido aberto do fornecedor nesta filial (C-035). */
  emPedidoAberto: Map<number, PedidoAbertoDoItem>;
  /** R-130: as filiais com excesso de cada produto (RN-037) e as contagens dos chips no recorte da visão. */
  excessos: Map<number, FilialComExcesso[]>;
  contagemAvisos: { bloqueados: number; excesso: number };
  /** R-125: o selo "Especial N un." / "Especial N tabelas" por produto com oportunidade. */
  especiais: Map<number, { texto: string; tone: 'accent' | 'attention' }>;
  /** R-124: a sugestão projetada pelo modelo escolhido, só para o produto aberto no painel. */
  sugestaoProjetada: { codprod: number; sugestao: number } | null;
  /** Soma da sugestão do recorte ao custo da última entrada (R$). */
  sugestaoTotal: number;
  carrinho: { itens: number; pedidos: number };
  podeOperar: boolean;
  podeParametrizar: boolean;
  /** Por que os controles estão desabilitados — vai no `title`, nunca escondido (§9.4). */
  motivoBloqueio: string;
  acoes: AcoesDaLista;
}) {
  const [pagina, setPagina] = React.useState(1);
  const rolagem = React.useRef<HTMLDivElement>(null);
  const [larguraLista, setLarguraLista] = React.useState(0);
  React.useEffect(() => {
    const no = rolagem.current;
    if (!no || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([e]) => setLarguraLista(Math.round(e.contentRect.width)));
    observador.observe(no);
    return () => observador.disconnect();
  }, []);
  const [alturaCard, setAlturaCard] = React.useState(0);
  React.useEffect(() => {
    const card = rolagem.current?.parentElement;
    if (!card || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([e]) => setAlturaCard(Math.round(e.contentRect.height)));
    observador.observe(card);
    return () => observador.disconnect();
  }, []);
  const compacta = listaCompacta(larguraLista);
  // Mais estreita ainda (tela pequena, zoom, menu aberto): só produto, quantidade e ações em coluna.
  const minima = listaMinima(larguraLista);
  const curvasNumaColuna = compacta;
  const filtrosRolam = minima || (alturaCard > 0 && alturaCard < CARD_BAIXO);
  const ultima = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, ultima);
  const visiveis = linhas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // A lista mudou de tamanho (filtro, visão, seletor de licitação): volta à primeira.
  const [tamanho, setTamanho] = React.useState(linhas.length);
  if (tamanho !== linhas.length) {
    setTamanho(linhas.length);
    setPagina(1);
  }

  const sugestaoUnidades = linhas.reduce((soma, l) => soma + l.sugerida, 0);
  const rupturas = todas.filter((l) => l.status === 'ruptura').length;
  const silenciados = todas.filter((l) => l.silenciado).length;

  /** A quantidade pré-carregada: a sugestão, ou uma caixa na visão "completar". */
  const projetadaDe = (l: LinhaRessuprimento) => (sugestaoProjetada && sugestaoProjetada.codprod === Number(l.medida.CODPROD) ? sugestaoProjetada.sugestao : null);
  const quantidadeInicial = (l: LinhaRessuprimento) => {
    const projetada = projetadaDe(l);
    if (projetada !== null) return projetada;
    return visao === 'completar' && l.sugerida <= 0 ? quantidadeParaCompletar(l) : l.sugerida;
  };

  // R-129: a barra de filtros fica fixa sobre as linhas; com o card baixo (menos de 520 px) ou a
  // lista mínima, ela rola junto com as linhas — senão não sobraria linha nenhuma à vista.
  const barra = (
    <>
      {/* R-129: em tela baixa a barra aperta (menos linhas) para sobrar altura às linhas da lista. */}
      <Toolbar className="[@media(max-height:760px)]:gap-2 [@media(max-height:760px)]:py-2">
        <ChipContagem title="Soma da sugestão das linhas do recorte, em unidades">
          {`Sugestão ${quantidade(sugestaoUnidades)} un.`}
        </ChipContagem>
        <ChipContagem tone="alert" title="Produtos sem estoque disponível nesta filial">{`Rupturas ${rupturas}`}</ChipContagem>
        <ChipContagem
          tone="attention"
          ativo={filtros.soSilenciados}
          onClick={silenciados > 0 || filtros.soSilenciados ? acoes.onAlternarSilenciados : undefined}
          title={filtros.soSilenciados ? 'Mostrando só os silenciados, em "Todos" — clique para voltar' : silenciados > 0 ? 'Clique para ver só os silenciados (em "Todos")' : 'Nenhum produto silenciado'}
        >
          {`Silenciados ${silenciados}`}
        </ChipContagem>
        {/* R-130: os dois avisos viram filtro — no recorte da visão, juntos ou separados. */}
        <ChipContagem
          tone="attention"
          ativo={filtros.soBloqueados}
          onClick={contagemAvisos.bloqueados > 0 || filtros.soBloqueados ? () => onFiltros({ soBloqueados: !filtros.soBloqueados }) : undefined}
          title={filtros.soBloqueados ? 'Mostrando só os produtos com estoque bloqueado — clique para voltar' : 'Produtos com estoque bloqueado nesta filial'}
        >
          {`Bloqueados ${contagemAvisos.bloqueados}`}
        </ChipContagem>
        <ChipContagem
          tone="attention"
          ativo={filtros.soExcesso}
          onClick={contagemAvisos.excesso > 0 || filtros.soExcesso ? () => onFiltros({ soExcesso: !filtros.soExcesso }) : undefined}
          title={filtros.soExcesso ? 'Mostrando só os produtos com excesso em outras filiais — clique para voltar' : 'Produtos com estoque acima da cobertura (ou sem giro) em outra filial'}
        >
          {`Excesso em outras filiais ${contagemAvisos.excesso}`}
        </ChipContagem>
        <SelectMenu label="Ordenar" value={filtros.ordem} onChange={(v) => onFiltros({ ordem: v as OrdemLista })} options={OPCOES_ORDEM} className="w-40 lg:w-36" />
        <SelectMenu label="Movimentação" value={filtros.movimentacao} onChange={(v) => onFiltros({ movimentacao: v as FiltroMovimentacao })} options={OPCOES_MOVIMENTACAO} className="w-52 lg:w-44" />
        <SelectMenu label="Situação" value={filtros.situacao} onChange={(v) => onFiltros({ situacao: v as '' | StatusRessuprimento })} options={OPCOES_SITUACAO} className="w-44 lg:w-40" />
        <SearchInput placeholder="Produto ou código" value={busca} onChange={(e) => onBusca(e.target.value)} className="w-56 lg:w-48" />
        <div><CheckRow marcado={desconsiderarLicitacao} onToggle={onLicitacao}>Desconsiderar venda a órgãos públicos</CheckRow></div>
      </Toolbar>
    </>
  );

  return (
    // R-129: no desktop o card tem a altura que sobra na tela; só as linhas rolam, com o cabeçalho grudado.
    <Panel className="lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <PanelHeader
        title="Produtos"
        hint={`${linhas.length.toLocaleString('pt-BR')} ${linhas.length === 1 ? 'produto' : 'produtos'} no recorte · sugestão ${sugestaoTotal > 0 ? moeda(sugestaoTotal) : '—'}`}
      >
        <IconButton label="Exportar a lista visível (CSV)" disabled={linhas.length === 0} onClick={acoes.onExportar}>
          <Download aria-hidden />
        </IconButton>
        <Button variant="primary" size="sm" onClick={acoes.onAbrirCarrinho}>
          <ShoppingCart aria-hidden />
          {`Carrinho · ${carrinho.itens} ${carrinho.itens === 1 ? 'item' : 'itens'} · ${carrinho.pedidos} ${carrinho.pedidos === 1 ? 'pedido' : 'pedidos'}`}
        </Button>
      </PanelHeader>

      {filtrosRolam ? null : barra}

      <div ref={rolagem} className="overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto">
      {filtrosRolam ? barra : null}
      <Table cabecalhoFixo className={compacta ? COMPACTA : undefined}>
        <thead>
          {/* C-049: a visão Em trânsito tem grade própria, como no legado — o que importa é quanto vem e quando cobre. */}
          {visao === 'transito' ? (
            <tr>
              <Th>Produto</Th>
              {compacta ? null : <Th>Situação</Th>}
              {minima ? null : <Th numeric className={compacta ? 'w-20' : 'w-28'}>Estoque</Th>}
              <Th numeric className={compacta ? 'w-32' : 'w-40'}>Em trânsito</Th>
              {minima ? null : <Th numeric className={compacta ? 'w-28' : 'w-32'}>Preço compra</Th>}
              {minima ? null : <Th numeric className={compacta ? 'w-28' : 'w-36'}>Sugestão</Th>}
              <Th className={cn(compacta ? 'w-20' : 'w-24', 'text-right')}>Ações</Th>
            </tr>
          ) : (
            <tr>
              <Th>Produto</Th>
              {compacta ? null : <Th>Situação</Th>}
              {minima ? null : curvasNumaColuna ? <Th className="w-16" title="Curva de faturamento / de rentabilidade">F/R</Th> : (
                <>
                  <Th className="w-20">Curva fat.</Th>
                  <Th className="w-20">Curva rent.</Th>
                </>
              )}
              {minima ? null : <Th numeric className={compacta ? 'w-24' : 'w-32'}>Cobertura</Th>}
              <Th numeric className={compacta ? 'w-32' : 'w-40'}>{referencia === 'caixas' ? 'Qtd. (cx)' : 'Qtd. (un.)'}</Th>
              <Th className={cn(compacta ? 'w-20' : 'w-24', 'text-right')}>Ações</Th>
            </tr>
          )}
        </thead>
        <tbody>
          {visiveis.map((linha) => {
            const codprod = Number(linha.medida.CODPROD);
            const escolhida = quantidades[codprod] ?? quantidadeInicial(linha);
            const ativa = codprod === selecionado;
            const aberto = emPedidoAberto.get(codprod);
            const selo = especiais.get(codprod) ?? null;
            return (
              <Tr
                key={codprod}
                aria-selected={ativa}
                onClick={() => onSelecionar(linha)}
                className={cn('h-20 cursor-pointer border-l-4', ativa ? 'border-l-primary bg-accent' : 'border-l-transparent')}
              >
                {/* R-137: altura fixa — nome numa linha, meta noutra e os avisos todos numa terceira (o completo no title). */}
                <Td className="py-2">
                  <span className="block max-w-[22rem] truncate font-semibold text-ink" title={String(linha.medida.DESCRICAO)}>{String(linha.medida.DESCRICAO)}</span>
                  {minima ? (
                    <span className="block max-w-[22rem] truncate text-[12px] leading-tight text-ink-secondary">
                      {visao === 'transito'
                        ? `est. ${quantidade(linha.estoqueAtual)} · sug. ${linha.sugerida > 0 ? textoDaSugestao(linha.sugerida, linha.unidadesPorCaixa, referencia) : '—'}`
                        : `cob. ${linha.coberturaAtualDias === null ? 'sem giro' : rotuloCobertura(linha.coberturaAtualDias)} · gatilho ${linha.diasDeGatilho ?? '—'} d · F/R ${linha.curvaFaturamento ?? '—'}/${linha.curvaRentabilidade ?? '—'}`}
                    </span>
                  ) : (
                    <span className="flex max-w-[22rem] min-w-0 items-center gap-1 overflow-hidden text-[12px] leading-tight whitespace-nowrap text-ink-secondary">
                      <Code prefix="cód.">{codprod}</Code>
                      <span className="min-w-0 truncate">{` · ${String(linha.medida.EMBALAGEM) || '—'} · `}</span>
                      {rotuloSemCusto(linha.custo) ? <Status tone="alert">{rotuloSemCusto(linha.custo)}</Status> : <span className="shrink-0" title={`Custo padrão · Gestão de Custos · ${fmtData(linha.custo?.dataRef ?? '')}`}>{moeda(linha.custo?.valor ?? 0)}</span>}
                    </span>
                  )}
                  {(() => {
                    const avisos: { chave: string; tom: 'live' | 'off' | 'attention' | 'alert'; texto: string; titulo?: string }[] = [];
                    if (compacta) avisos.push({ chave: 'status', tom: TOM_STATUS[linha.status], texto: ROTULO_STATUS[linha.status] });
                    const bloqueado = seloBloqueado(linha.medida.QT_BLOQUEADA);
                    if (bloqueado) avisos.push({ chave: 'bloq', tom: 'attention', texto: bloqueado });
                    if (excessos.has(codprod)) avisos.push({ chave: 'exc', tom: 'attention', texto: seloExcesso(excessos.get(codprod)?.length ?? 0) ?? '', titulo: resumoExcesso(excessos.get(codprod) ?? []) ?? '' });
                    if (selo) avisos.push({ chave: 'esp', tom: selo.tone === 'accent' ? 'live' : 'attention', texto: selo.texto });
                    if (linha.projecao) avisos.push({ chave: 'proj', tom: 'live', texto: textoDoSelo(linha.projecao.percentual), titulo: `até ${fmtData(linha.projecao.validaAte)} · ${linha.projecao.motivo}` });
                    if (linha.silenciado) avisos.push({ chave: 'sil', tom: 'attention', texto: `Silenciado até ${fmtData(linha.silenciadoAte)}${linha.motivoSilencio ? ` · ${linha.motivoSilencio}` : ''}`, titulo: linha.motivoSilencio || 'Silenciado' });
                    if (aberto && linha.emTransito <= 0) avisos.push({ chave: 'ped', tom: 'alert', texto: `Pedido #${aberto.idCard} aberto, ainda sem trânsito`, titulo: aberto.titulo });
                    if (avisos.length === 0) return null;
                    return (
                      <span
                        className="flex max-w-[22rem] min-w-0 items-center gap-3 overflow-hidden text-[12px] leading-tight whitespace-nowrap"
                        title={avisos.map((a) => a.titulo ? `${a.texto} (${a.titulo})` : a.texto).join(' · ')}
                      >
                        {avisos.map((a) => <span key={a.chave} className="shrink-0"><Status tone={a.tom}>{a.texto}</Status></span>)}
                      </span>
                    );
                  })()}
                </Td>
                {compacta ? null : <Td><Status tone={TOM_STATUS[linha.status]}>{ROTULO_STATUS[linha.status]}</Status></Td>}
                {visao === 'transito' ? (
                  <>
                    {minima ? null : <Td numeric>{quantidade(linha.estoqueAtual)}</Td>}
                    <Td numeric>
                      <RowTitle>{textoDaSugestao(linha.emTransito, linha.unidadesPorCaixa, referencia)}</RowTitle>
                      {/* R-132: quando chega e quanto cobre ao chegar (o estoque segue vendendo até lá) — numa linha (R-137). */}
                      {linha.chegada ? (() => {
                        const chegada = `${textoChegada(linha.chegada)} · cobre ${rotuloCobertura(linha.chegada.coberturaAoChegarDias, 'Sem consumo')} ao chegar`;
                        const ruptura = linha.chegada.diasSemEstoque > 0 ? `ruptura antes de chegar (${linha.chegada.diasSemEstoque} d sem estoque)` : '';
                        return (
                          <span className="ml-auto block max-w-[16rem] truncate text-[12px] leading-tight text-ink-secondary" title={ruptura ? `${chegada} · ${ruptura}` : chegada}>
                            {ruptura ? <Status tone="alert">{ruptura}</Status> : chegada}
                          </span>
                        );
                      })() : <RowMeta>Sem consumo</RowMeta>}
                    </Td>
                    {minima ? null : <Td numeric>
                      {(() => {
                        const preco = precoDeCompra(linha);
                        if (!preco) return <Status tone="alert">{rotuloSemCusto(linha.custo) ?? 'Sem custo'}</Status>;
                        return (
                          <>
                            {moeda(preco.valor)}
                            <RowMeta>{`custo padrão · ${fmtData(preco.dataRef)}`}</RowMeta>
                          </>
                        );
                      })()}
                    </Td>}
                    {minima ? null : <Td numeric>{linha.sugerida > 0 ? textoDaSugestao(linha.sugerida, linha.unidadesPorCaixa, referencia) : <Dash />}</Td>}
                  </>
                ) : (
                  <>
                {minima ? null : curvasNumaColuna ? (
                  <Td><LetraCurva letra={linha.curvaFaturamento} linha={linha} />{' / '}<LetraCurva letra={linha.curvaRentabilidade} linha={linha} /></Td>
                ) : (
                  <>
                    <Td><LetraCurva letra={linha.curvaFaturamento} linha={linha} /></Td>
                    <Td><LetraCurva letra={linha.curvaRentabilidade} linha={linha} /></Td>
                  </>
                )}
                {minima ? null : <Td numeric>
                  {linha.coberturaAtualDias === null
                    ? <span title="Sem giro: não há consumo para dividir"><Dash /></span>
                    : rotuloCobertura(linha.coberturaAtualDias)}
                  <span className="block text-[12px] whitespace-nowrap text-ink-secondary">
                    {linha.diasDeGatilho === null ? 'sem gatilho' : linha.diasDeGatilho < 0
                      ? <Status tone="alert">{`gatilho ${linha.diasDeGatilho} d`}</Status>
                      : `gatilho ${linha.diasDeGatilho} d${linha.urgente ? ' · urgente' : ''}`}
                  </span>
                </Td>}
                <Td numeric onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="number"
                    min={0}
                    className="text-right"
                    step={rotuloDaQuantidade(linha.unidadesPorCaixa, referencia) === 'cx' ? 1 : linha.unidadesPorCaixa}
                    aria-label={`Quantidade de ${linha.medida.DESCRICAO} (${rotuloDaQuantidade(linha.unidadesPorCaixa, referencia)})`}
                    value={String(quantidadeNaReferencia(escolhida, linha.unidadesPorCaixa, referencia))}
                    disabled={!podeOperar}
                    title={podeOperar ? `Em ${rotuloDaQuantidade(linha.unidadesPorCaixa, referencia)} · sobe para a caixa cheia de ${linha.unidadesPorCaixa} un.` : motivoBloqueio}
                    onChange={(evento) => onQuantidade(codprod, unidadesDaDigitada(Number(evento.target.value) || 0, linha.unidadesPorCaixa, referencia))}
                    onBlur={(evento) => onQuantidade(codprod, arredondarPorCaixa(unidadesDaDigitada(Number(evento.target.value) || 0, linha.unidadesPorCaixa, referencia), linha.unidadesPorCaixa))}
                  />
                  <RowMeta>
                    {`sug. ${textoDaSugestao(linha.sugerida, linha.unidadesPorCaixa, referencia)}`}
                    {projetadaDe(linha) !== null ? ` · projetada ${textoDaSugestao(projetadaDe(linha) ?? 0, linha.unidadesPorCaixa, referencia)}` : ''}
                  </RowMeta>
                </Td>
                  </>
                )}
                <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex items-center justify-end gap-1">
                    <IconButton
                      label={podeOperar ? 'Jogar no carrinho' : motivoBloqueio}
                      disabled={!podeOperar || escolhida <= 0}
                      onClick={() => acoes.onAdicionar(linha, escolhida)}
                    >
                      <ShoppingCart aria-hidden />
                    </IconButton>
                    {linha.silenciado ? (
                      <IconButton
                        label={podeParametrizar ? 'Restaurar: devolver o produto à fila de compra' : motivoBloqueio}
                        disabled={!podeParametrizar}
                        onClick={() => acoes.onRestaurar(linha)}
                      >
                        <RotateCcw aria-hidden />
                      </IconButton>
                    ) : (
                      <IconButton
                        label={podeParametrizar ? 'Silenciar por 30 dias' : motivoBloqueio}
                        disabled={!podeParametrizar}
                        onClick={() => acoes.onSilenciar(linha)}
                      >
                        <VolumeX aria-hidden />
                      </IconButton>
                    )}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      <Pagination
        page={paginaAtual}
        lastPage={ultima}
        total={linhas.length}
        unit="produtos"
        onPrevious={() => { setPagina((p) => Math.max(1, p - 1)); rolagem.current?.scrollTo({ top: 0 }); }}
        onNext={() => { setPagina((p) => Math.min(ultima, p + 1)); rolagem.current?.scrollTo({ top: 0 }); }}
      />
      </div>
    </Panel>
  );
}
