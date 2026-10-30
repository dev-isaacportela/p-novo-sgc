// O carrinho em janela do layout legado da 011 (R-117 / C-028..C-030, RF-017,
// RF-018 / C-018, C-019, RN-015, RN-016, RN-022, RN-023, RN-027).
//
// O pedido nasce pelo MESMO caminho de `/pedidos/novo` (R-091/D-007): três
// execuções por grupo de fornecedor + filial — `api.cardCriar`,
// `sgcEscPedidoCriar` com `origem: 'compras_inteligentes'` e `sgcItensGravar`
// em lote. Nenhuma Server Function JavaScript nova. O "Por que comprar" vai
// como `observacao` do item.
//
// O `valor_total` da capa vai no próprio `cardCriar`, porque a tela já sabe a
// soma: um `kbCardAtualizar` a mais custaria execução (D-008).
import * as React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useKanban } from '@benenutri/mitra-kanban';

import {
  Alert, BarraConsumo, Button, Code, Dash, Delta, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, IconButton, Input, RowMeta, RowTitle, SearchInput, Status, Table, Td, Th, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { baixarTexto } from '@/lib/csv';
import { arredondarPorCaixa } from '@/lib/compras';
import { fmtData, fmtDataHora, moeda } from '@/lib/formato';
import { instanteIso, tituloDoPedido } from '@/lib/pedido';
import { agruparCarrinho, coberturaFuturaComCompra, itemDoCarrinho } from '@/lib/ressuprimento';
import type { LinhaRessuprimento } from '@/lib/ressuprimento';
import {
  economiaNoCusto, faltaParaMinimo, filtrarCarrinho, nomeArquivoWinthor, pedidoMinimoDoGrupo, resumoDoCarrinho,
  textoImportacaoWinthor, variacaoDePreco,
} from '@/lib/carrinho';
import type { ItemCarrinho } from '@/lib/carrinho';

/** Só as fases em que o pedido ainda bloqueia o carrinho (RN-016). */
const NOME_DA_FASE: Record<string, string> = {
  analise: 'Análise/Montagem de Pedido',
  tecnica: 'Aprovação Técnica',
  diretoria: 'Aprovação da Diretoria',
  envio: 'Envio para Indústria',
};

export interface PedidoAberto {
  idCard: number;
  titulo: string;
  faseChave: string;
}

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const horaCurta = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export function CarrinhoDialogo({
  aberto,
  onFechar,
  itens,
  abertoEm,
  abertoPor,
  salvoEm,
  boardId,
  usuarioId,
  periodo,
  hoje,
  pedidoAberto,
  grupoAtual,
  podeOperar,
  motivoBloqueio,
  coberturaLimiteDe,
  onQuantidade,
  onMotivo,
  onRemover,
  onDescartar,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  itens: ItemCarrinho[];
  abertoEm: string;
  abertoPor: string;
  salvoEm: string;
  boardId: number;
  usuarioId: number;
  periodo: { inicio: string; fim: string };
  hoje: string;
  /** O pedido do fornecedor + filial da TELA que ainda não foi enviado à indústria, se houver. */
  pedidoAberto: PedidoAberto | null;
  grupoAtual: { codfornec: number; codfilial: string };
  podeOperar: boolean;
  motivoBloqueio: string;
  /** O limite de cobertura resolvido para a linha — injetado pela página (R-111). */
  coberturaLimiteDe: (linha: LinhaRessuprimento) => number;
  onQuantidade: (codprod: number, codfilial: string, quantidade: number) => void;
  onMotivo: (codprod: number, codfilial: string, motivo: string) => void;
  onRemover: (codprod: number, codfilial: string) => void;
  onDescartar: () => void;
  onCriado: (cardId: number) => void;
}) {
  const api = useKanban();
  const [busca, setBusca] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [criando, setCriando] = React.useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = React.useState(false);

  const grupos = React.useMemo(() => agruparCarrinho(itens), [itens]);
  const resumo = React.useMemo(() => resumoDoCarrinho(itens), [itens]);
  const economia = React.useMemo(() => economiaNoCusto(itens.map((i) => ({
    quantidade: i.quantidade, ultimo: Number(i.linha.medida.CUSTO_ULT_ENTRADA), atual: Number(i.linha.medida.CUSTO_ATUAL ?? 0),
  }))), [itens]);
  const visiveis = React.useMemo(() => new Set(filtrarCarrinho(itens, busca).map((i) => `${i.codfilial}|${i.linha.medida.CODPROD}`)), [itens, busca]);

  const bloqueado = (grupo: { codfornec: number; codfilial: string }) => Boolean(pedidoAberto)
    && grupo.codfornec === grupoAtual.codfornec && grupo.codfilial === grupoAtual.codfilial;
  const algumBloqueado = grupos.some(bloqueado);

  function baixarArquivos() {
    for (const grupo of grupos) {
      const texto = textoImportacaoWinthor(grupo.itens.map(({ linha, quantidade: escolhida }) => ({
        codprod: Number(linha.medida.CODPROD),
        preco: Number(linha.medida.CUSTO_ATUAL ?? 0) > 0 ? Number(linha.medida.CUSTO_ATUAL) : Number(linha.medida.CUSTO_ULT_ENTRADA),
        quantidade: escolhida,
      })));
      baixarTexto(nomeArquivoWinthor(grupo.codfornec, grupo.codfilial, hoje), texto);
    }
  }

  async function criarPedidos() {
    if (algumBloqueado) return;
    setCriando(true);
    setErro('');
    try {
      let ultimo = 0;
      for (const grupo of grupos) {
        // 1 — o card, com a capa do quadro já preenchida (D-008).
        const criado = await api.cardCriar({
          boardId,
          titulo: tituloDoPedido(grupo.filial, grupo.fornecedor),
          valores: {
            fornecedor: grupo.fornecedor,
            filial: grupo.filial,
            prioridade: grupo.prioridade,
            valor_total: String(grupo.total),
          },
          responsaveisIds: usuarioId ? [usuarioId] : [],
        });
        if (!criado.ok || !criado.id) throw new Error(criado.error || 'O pedido não foi criado.');

        // 2 — a capa em SGC_PEDIDO, com a origem que recorta a eficiência (R-092).
        await linhas('sgcEscPedidoCriar', {
          cardId: criado.id,
          codfornec: grupo.codfornec,
          fornecedor: grupo.fornecedor,
          codfilial: grupo.codfilial,
          filial: grupo.filial,
          periodoInicio: periodo.inicio,
          periodoFim: periodo.fim,
          origem: 'compras_inteligentes',
          agora: instanteIso(),
        });

        // 3 — os itens, INTEIROS (R-112), num upsert em lote; o "por que comprar"
        // vai na observação do item.
        const itensJson = grupo.itens.map(({ linha, quantidade: escolhida }) => {
          const entrada = itens.find((i) => i.codfilial === grupo.codfilial && Number(i.linha.medida.CODPROD) === Number(linha.medida.CODPROD));
          return { ...itemDoCarrinho(linha, escolhida, coberturaLimiteDe(linha)), observacao: String(entrada?.motivo ?? '').slice(0, 500) };
        });
        const gravado = await acao('sgcItensGravar', { cardId: criado.id, itensJson: JSON.stringify(itensJson) });
        if (gravado && gravado.ok === false) throw new Error(String(gravado.erro ?? 'Os itens não foram gravados.'));
        ultimo = criado.id;
      }
      onDescartar();
      if (ultimo) onCriado(ultimo);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar o pedido.');
    } finally {
      setCriando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(estaAberto) => !estaAberto && onFechar()}>
      <DialogContent className="sm:max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-4 pr-6">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Compras inteligentes</p>
              <DialogTitle>Carrinho de compras</DialogTitle>
              {abertoEm ? (
                <p className="mt-1 text-[12px] text-ink-secondary">
                  {`Aberto em ${fmtDataHora(abertoEm)}${abertoPor ? ` por ${abertoPor}` : ''}${salvoEm ? ` · salvo às ${horaCurta(salvoEm)}` : ''}`}
                </p>
              ) : null}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <dt className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Total</dt>
                <dd className="font-title text-[22px] font-extrabold text-ink">{moeda(resumo.total)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Economia no custo</dt>
                <dd className="font-title text-[22px] font-extrabold text-primary">{economia > 0 ? moeda(economia) : '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Itens</dt>
                <dd className="font-title text-[22px] font-extrabold text-ink">{`${resumo.itens} · ${resumo.pedidos} ${resumo.pedidos === 1 ? 'pedido' : 'pedidos'}`}</dd>
              </div>
            </dl>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}

            {/* RF-018: a recusa cita o pedido e a fase em que ele está. */}
            {pedidoAberto && algumBloqueado ? (
              <Alert tone="warn">
                {`Já existe um pedido aberto para este fornecedor e filial: ${pedidoAberto.titulo}, em ${NOME_DA_FASE[pedidoAberto.faseChave] ?? pedidoAberto.faseChave}. `}
                Envie ou cancele esse pedido antes de abrir outro.
              </Alert>
            ) : null}

            {itens.length === 0 ? (
              <EmptyState
                title="O carrinho está vazio"
                hint="Jogue produtos da lista no carrinho; cada fornecedor e filial vira um pedido na Análise/Montagem."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SearchInput
                    placeholder="Buscar produto no carrinho"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="max-w-sm flex-1"
                  />
                  <RowMeta>Um pedido nasce no quadro para cada fornecedor e filial.</RowMeta>
                </div>
                {grupos.map((grupo) => {
                  const minimo = pedidoMinimoDoGrupo(itens, grupo);
                  const situacao = faltaParaMinimo(grupo.total, minimo);
                  const doGrupo = grupo.itens.filter(({ linha }) => visiveis.has(`${grupo.codfilial}|${linha.medida.CODPROD}`));
                  return (
                    <div key={`${grupo.codfornec}-${grupo.codfilial}`} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <RowTitle>{tituloDoPedido(grupo.filial, grupo.fornecedor)}</RowTitle>
                          <RowMeta>
                            <Status tone={grupo.prioridade === 'alta' ? 'alert' : 'live'}>
                              {grupo.prioridade === 'alta' ? 'Prioridade alta' : 'Prioridade normal'}
                            </Status>
                            {` · ${grupo.itens.length} ${grupo.itens.length === 1 ? 'item' : 'itens'} · ${moeda(grupo.total)}`}
                          </RowMeta>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Status tone={minimo <= 0 ? 'off' : situacao.atingido ? 'live' : 'attention'}>
                            {minimo <= 0
                              ? 'Sem pedido mínimo parametrizado'
                              : situacao.atingido
                                ? `Pedido mínimo de ${moeda(minimo)} atingido`
                                : `Faltam ${moeda(situacao.falta)} para o pedido mínimo de ${moeda(minimo)}`}
                          </Status>
                          <BarraConsumo pct={situacao.pct} tone={situacao.atingido ? 'live' : 'attention'} rotulo="" />
                          <RowTitle>{moeda(grupo.total)}</RowTitle>
                        </div>
                      </div>
                      {doGrupo.length === 0 ? (
                        <RowMeta>Nenhum item deste pedido casa com a busca.</RowMeta>
                      ) : (
                        <Table>
                          <thead>
                            <tr>
                              <Th className="min-w-72">Produto</Th>
                              <Th className="w-48">Por que comprar</Th>
                              <Th numeric>Sugerido</Th>
                              <Th numeric className="w-28">Quantidade</Th>
                              <Th numeric>Últ. preço</Th>
                              <Th numeric>Preço atual</Th>
                              <Th numeric>Variação</Th>
                              <Th numeric>Cob. futura</Th>
                              <Th numeric>Total</Th>
                              <Th className="w-12 text-right">
                                <span className="sr-only">Remover</span>
                              </Th>
                            </tr>
                          </thead>
                          <tbody>
                            {doGrupo.map(({ linha, quantidade: escolhida }) => {
                              const codprod = Number(linha.medida.CODPROD);
                              const entrada = itens.find((i) => i.codfilial === grupo.codfilial && Number(i.linha.medida.CODPROD) === codprod);
                              const ultimo = Number(linha.medida.CUSTO_ULT_ENTRADA);
                              const atual = Number(linha.medida.CUSTO_ATUAL ?? 0);
                              const variacao = variacaoDePreco(ultimo, atual);
                              const futura = coberturaFuturaComCompra(linha, escolhida);
                              return (
                                <Tr key={codprod}>
                                  <Td>
                                    <RowTitle>{String(linha.medida.DESCRICAO)}</RowTitle>
                                    <RowMeta>
                                      <Code prefix="cód.">{codprod}</Code>
                                      {linha.medida.CODFAB ? ` · fab. ${String(linha.medida.CODFAB)}` : ''}
                                      {linha.medida.DT_ULT_ENTRADA ? ` · últ. compra ${fmtData(String(linha.medida.DT_ULT_ENTRADA))}` : ''}
                                    </RowMeta>
                                  </Td>
                                  <Td>
                                    <Input
                                      value={entrada?.motivo ?? ''}
                                      placeholder="Ex.: ruptura, oportunidade de custo"
                                      aria-label={`Por que comprar ${linha.medida.DESCRICAO}`}
                                      maxLength={500}
                                      disabled={criando}
                                      onChange={(e) => onMotivo(codprod, grupo.codfilial, e.target.value)}
                                    />
                                  </Td>
                                  <Td numeric>
                                    {linha.sugerida > 0 ? quantidade(linha.sugerida) : <Dash />}
                                    {linha.unidadesPorCaixa > 1 && linha.sugerida > 0 ? <RowMeta>{`${quantidade(linha.sugerida / linha.unidadesPorCaixa)} cx`}</RowMeta> : null}
                                  </Td>
                                  <Td numeric>
                                    <Input
                                      type="number"
                                      min={0}
                                      className="text-right"
                                      aria-label={`Quantidade de ${linha.medida.DESCRICAO}`}
                                      value={String(escolhida)}
                                      disabled={criando || !podeOperar}
                                      title={podeOperar ? `Sobe para a caixa cheia de ${linha.unidadesPorCaixa} un.` : motivoBloqueio}
                                      onChange={(e) => onQuantidade(codprod, grupo.codfilial, Number(e.target.value) || 0)}
                                      onBlur={(e) => onQuantidade(codprod, grupo.codfilial, arredondarPorCaixa(Number(e.target.value) || 0, linha.unidadesPorCaixa))}
                                    />
                                    {linha.unidadesPorCaixa > 1 ? <RowMeta>{`${quantidade(escolhida / linha.unidadesPorCaixa)} cx`}</RowMeta> : null}
                                  </Td>
                                  <Td numeric>{moeda(ultimo)}</Td>
                                  <Td numeric>{atual > 0 ? moeda(atual) : <Dash />}</Td>
                                  <Td numeric><Delta valor={variacao} inverso /></Td>
                                  <Td numeric>{futura === null ? <Dash /> : `${Math.round(futura)} d`}</Td>
                                  <Td numeric>{moeda(escolhida * ultimo)}</Td>
                                  <Td className="text-right">
                                    <IconButton
                                      label="Tirar do carrinho"
                                      tone="danger"
                                      disabled={criando}
                                      onClick={() => onRemover(codprod, grupo.codfilial)}
                                    >
                                      <Trash2 aria-hidden />
                                    </IconButton>
                                  </Td>
                                </Tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {confirmandoDescarte ? (
              <Alert tone="warn">
                <span className="flex flex-wrap items-center gap-2">
                  Descartar o carrinho inteiro? Os itens e as quantidades se perdem.
                  <Button size="sm" variant="primary" onClick={() => { setConfirmandoDescarte(false); onDescartar(); }}>Descartar</Button>
                  <Button size="sm" onClick={() => setConfirmandoDescarte(false)}>Manter</Button>
                </span>
              </Alert>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" className="text-destructive" onClick={() => setConfirmandoDescarte(true)} disabled={criando || itens.length === 0 || confirmandoDescarte}>
            Descartar carrinho
          </Button>
          <Button onClick={baixarArquivos} disabled={criando || itens.length === 0} title="Um arquivo CODPROD;PRECO;QTD por fornecedor e filial">
            <Download aria-hidden />
            Baixar arquivo de importação do WinThor
          </Button>
          <Button
            variant="primary"
            onClick={() => void criarPedidos()}
            disabled={criando || itens.length === 0 || !podeOperar || algumBloqueado || boardId <= 0}
            title={!podeOperar ? motivoBloqueio : algumBloqueado ? 'Já existe um pedido aberto para este fornecedor e filial.' : undefined}
          >
            {criando ? 'Criando...' : `Criar ${grupos.length} ${grupos.length === 1 ? 'pedido' : 'pedidos'} no quadro`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
