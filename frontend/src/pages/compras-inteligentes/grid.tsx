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
  Badge,  Button, CheckRow, ChipContagem, Code, Dash, IconButton, Input, Pagination, Panel, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { arredondarPorCaixa, rotuloSemCusto } from '@/lib/compras';
import { fmtData, moeda } from '@/lib/formato';
import {
  OPCOES_MOVIMENTACAO, OPCOES_ORDEM, ROTULO_STATUS, coberturaComTransito, precoDeCompra, quantidadeNaReferencia, quantidadeParaCompletar,
  rotuloDaQuantidade, textoDaSugestao, unidadesDaDigitada,
} from '@/lib/ressuprimento';
import type {
  FiltroMovimentacao, FiltrosLista, LinhaRessuprimento, OrdemLista, ReferenciaSugestao, StatusRessuprimento,
  VisaoRessuprimento,
} from '@/lib/ressuprimento';

const POR_PAGINA = 25;

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

  return (
    <Panel>
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

      <Toolbar>
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
        <SelectMenu label="Ordenar" value={filtros.ordem} onChange={(v) => onFiltros({ ordem: v as OrdemLista })} options={OPCOES_ORDEM} className="w-40" />
        <SelectMenu label="Movimentação" value={filtros.movimentacao} onChange={(v) => onFiltros({ movimentacao: v as FiltroMovimentacao })} options={OPCOES_MOVIMENTACAO} className="w-52" />
        <SelectMenu label="Situação" value={filtros.situacao} onChange={(v) => onFiltros({ situacao: v as '' | StatusRessuprimento })} options={OPCOES_SITUACAO} className="w-44" />
        <SearchInput placeholder="Produto ou código" value={busca} onChange={(e) => onBusca(e.target.value)} className="w-56" />
        <div><CheckRow marcado={desconsiderarLicitacao} onToggle={onLicitacao}>Desconsiderar venda a órgãos públicos</CheckRow></div>
      </Toolbar>

      <Table>
        <thead>
          {/* C-049: a visão Em trânsito tem grade própria, como no legado — o que importa é quanto vem e quando cobre. */}
          {visao === 'transito' ? (
            <tr>
              <Th>Produto</Th>
              <Th>Situação</Th>
              <Th numeric className="w-28">Estoque</Th>
              <Th numeric className="w-40">Em trânsito</Th>
              <Th numeric className="w-32">Preço compra</Th>
              <Th numeric className="w-36">Sugestão</Th>
              <Th className="w-24 text-right">Ações</Th>
            </tr>
          ) : (
            <tr>
              <Th>Produto</Th>
              <Th>Situação</Th>
              <Th className="w-20">Curva fat.</Th>
              <Th className="w-20">Curva rent.</Th>
              <Th numeric className="w-32">Cobertura</Th>
              <Th numeric className="w-40">{referencia === 'caixas' ? 'Qtd. (cx)' : 'Qtd. (un.)'}</Th>
              <Th className="w-24 text-right">Ações</Th>
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
                className={ativa ? 'cursor-pointer border-l-4 border-l-primary bg-accent' : 'cursor-pointer border-l-4 border-l-transparent'}
              >
                <Td>
                  <RowTitle>{String(linha.medida.DESCRICAO)}</RowTitle>
                  <RowMeta>
                    <Code prefix="cód.">{codprod}</Code>
                    {` · ${String(linha.medida.EMBALAGEM) || '—'} · `}
                    {rotuloSemCusto(linha.custo) ? <Status tone="alert">{rotuloSemCusto(linha.custo)}</Status> : <span title={`Custo padrão · Gestão de Custos · ${fmtData(linha.custo?.dataRef ?? '')}`}>{moeda(linha.custo?.valor ?? 0)}</span>}
                  </RowMeta>
                  {selo ? <RowMeta><Badge tone={selo.tone}>{selo.texto}</Badge></RowMeta> : null}
                  {linha.silenciado ? (
                    <RowMeta>
                      <Status tone="attention">
                        <span title={linha.motivoSilencio || 'Silenciado'}>
                          {`Silenciado até ${fmtData(linha.silenciadoAte)}${linha.motivoSilencio ? ` · ${linha.motivoSilencio}` : ''}`}
                        </span>
                      </Status>
                    </RowMeta>
                  ) : null}
                  {aberto && linha.emTransito <= 0 ? (
                    <RowMeta>
                      <Status tone="alert">
                        <span title={aberto.titulo}>{`Pedido #${aberto.idCard} aberto, ainda sem trânsito`}</span>
                      </Status>
                    </RowMeta>
                  ) : null}
                </Td>
                <Td><Status tone={TOM_STATUS[linha.status]}>{ROTULO_STATUS[linha.status]}</Status></Td>
                {visao === 'transito' ? (
                  <>
                    <Td numeric>{quantidade(linha.estoqueAtual)}</Td>
                    <Td numeric>
                      <RowTitle>{textoDaSugestao(linha.emTransito, linha.unidadesPorCaixa, referencia)}</RowTitle>
                      <RowMeta>
                        {coberturaComTransito(linha) === null
                          ? 'Sem consumo'
                          : `${Math.round(coberturaComTransito(linha) ?? 0)} dias com o trânsito`}
                      </RowMeta>
                    </Td>
                    <Td numeric>
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
                    </Td>
                    <Td numeric>{linha.sugerida > 0 ? textoDaSugestao(linha.sugerida, linha.unidadesPorCaixa, referencia) : <Dash />}</Td>
                  </>
                ) : (
                  <>
                <Td><LetraCurva letra={linha.curvaFaturamento} linha={linha} /></Td>
                <Td><LetraCurva letra={linha.curvaRentabilidade} linha={linha} /></Td>
                <Td numeric>
                  {linha.coberturaAtualDias === null
                    ? <span title="Sem giro: não há consumo para dividir"><Dash /></span>
                    : `${Math.round(linha.coberturaAtualDias)} d`}
                  <RowMeta>
                    {linha.diasDeGatilho === null ? 'sem gatilho' : linha.diasDeGatilho < 0
                      ? <Status tone="alert">{`gatilho ${linha.diasDeGatilho} d`}</Status>
                      : `gatilho ${linha.diasDeGatilho} d${linha.urgente ? ' · urgente' : ''}`}
                  </RowMeta>
                </Td>
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
        onPrevious={() => setPagina((p) => Math.max(1, p - 1))}
        onNext={() => setPagina((p) => Math.min(ultima, p + 1))}
      />
    </Panel>
  );
}
