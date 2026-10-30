// A janela "Análise do Produto" (R-123): o detalhe completo do SKU no desenho
// do sistema antigo, aberta pelo olho do painel de detalhe. É a versão
// EXPANDIDA do painel — os mesmos blocos, todos abertos, mais a aba Vendas —
// sobre os mesmos dados que a página já carregou para o SKU (`dados`, 3
// execuções por produto, em cache): abrir a janela não custa consulta nova,
// salvo as vendas, que carregam ao abrir a aba Vendas (1 execução, RNF-003).
//
// O que o legado tinha e fica registrado como adiado na spec: a oportunidade
// com preço especial (módulo de custos), os modelos de previsão (Best Fit,
// Holt…) e o fator Z do estoque de segurança (onda 5).
import * as React from 'react';
import { BarChart3, ShoppingCart, SlidersHorizontal } from 'lucide-react';

import {
  Alert, Button, ChipContagem, Code, Dash, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, GradeMini, Input, MiniCartao, Panel, PanelHeader, RowMeta, Status, Table, Td,
  TextLink, Th, Tr,
} from '@/components/page';
import { fmtData, moeda } from '@/lib/formato';
import { ROTULO_ORIGEM_CAIXA, arredondarPorCaixa } from '@/lib/compras';
import { JANELA_DIAS, ROTULO_STATUS, nivelDeCobertura, textoDaSugestao } from '@/lib/ressuprimento';
import type { LinhaRessuprimento, ReferenciaSugestao, StatusRessuprimento } from '@/lib/ressuprimento';
import {
  ENTRADAS_VISIVEIS, desconsideradasPorMes, entradaAtrasou, filiaisComExcesso, necessidade, simularCompra, totaisDoRodape,
} from '@/lib/ressuprimento-detalhe';
import type { CompraDoProduto, DadosDoSku, VendaDesconsiderada } from '@/lib/ressuprimento-detalhe';
import { GraficoComprasVendas } from './grafico';
import { BlocoSilenciado } from './painel-detalhe';
import { VendasDoProduto } from './dialogos';
import type { VendasDoProdutoProps } from './dialogos';

const TOM_STATUS: Record<StatusRessuprimento, 'alert' | 'attention' | 'live'> = {
  ruptura: 'alert', elevada_exposicao: 'alert', baixa_exposicao: 'attention', excesso: 'attention', adequado: 'live',
};
const ORIGEM_COBERTURA = { sku: 'do produto', fornecedor: 'do fornecedor', curva: 'alvo da curva' } as const;
const ORIGEM_LEAD = { sku: 'do produto', fornecedor: 'do fornecedor', medido: 'medido no ERP', padrao: 'padrão' } as const;
const FILIAIS_NO_AVISO = 6;

const quantidade = (valor: unknown) => Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dias = (valor: number | null) => (valor === null ? 'sem giro' : valor >= 1000 ? '999+ d' : `${Math.round(valor)} d`);
const pct = (valor: number | null) => (valor === null ? '—' : `${Math.round(valor)} %`);
const data = (iso: unknown) => (iso ? fmtData(String(iso)) || <Dash /> : <Dash />);

type Aba = 'analise' | 'vendas';

export function AnaliseProdutoDialogo({
  linha,
  codfilial,
  fornecedor,
  hoje,
  dados,
  referencia,
  desconsideradas,
  periodo,
  pedidoMinimo,
  podeOperar,
  podeParametrizar,
  motivoBloqueio,
  onFechar,
  onAdicionar,
  onParametros,
  onRestaurar,
  onDesconsiderar,
  onReconsiderar,
}: {
  linha: LinhaRessuprimento | null;
  codfilial: string;
  fornecedor: string;
  hoje: string;
  dados: DadosDoSku;
  referencia: ReferenciaSugestao;
  /** Todas as desconsideradas da filial, como voltaram do banco (D-03). */
  desconsideradas: VendaDesconsiderada[];
  periodo: { inicio: string; fim: string };
  pedidoMinimo: number;
  podeOperar: boolean;
  podeParametrizar: boolean;
  motivoBloqueio: string;
  onFechar: () => void;
  onAdicionar: (linha: LinhaRessuprimento, quantidade: number) => void;
  onParametros: (linha: LinhaRessuprimento) => void;
  onRestaurar: (linha: LinhaRessuprimento) => void;
  onDesconsiderar: VendasDoProdutoProps['onDesconsiderar'];
  onReconsiderar: VendasDoProdutoProps['onReconsiderar'];
}) {
  const [aba, setAba] = React.useState<Aba>('analise');
  const [simulada, setSimulada] = React.useState('');
  const [todasEntradas, setTodasEntradas] = React.useState(false);
  const [totalVendas, setTotalVendas] = React.useState<number | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  // Trocou de produto: a janela volta ao início — ajuste de estado na renderização.
  const codprod = linha ? Number(linha.medida.CODPROD) : 0;
  const [ultimo, setUltimo] = React.useState(codprod);
  if (codprod !== ultimo) {
    setUltimo(codprod);
    setAba('analise');
    setSimulada('');
    setTodasEntradas(false);
    setTotalVendas(null);
  }

  if (!linha) return null;
  const m = linha.medida;

  const nivel = nivelDeCobertura(linha);
  const quantidadeSimulada = simulada === '' ? linha.sugerida : Number(simulada) || 0;
  const simulacao = simularCompra(linha, quantidadeSimulada);
  const comSugestao = simularCompra(linha, linha.sugerida);
  const excessos = filiaisComExcesso(dados.filiais, codfilial, linha.coberturaDias);
  const custoAtual = Number(m.CUSTO_ATUAL ?? 0);
  const custo = custoAtual > 0 ? custoAtual : Number(m.CUSTO_ULT_ENTRADA);
  const origemCusto = custoAtual > 0 ? 'custo atual do ERP' : 'custo da última entrada';
  const compras = dados.compras as unknown as CompraDoProduto[];
  const ultima = compras[0];
  const entradas = todasEntradas ? compras : compras.slice(0, ENTRADAS_VISIVEIS);
  const doSku = desconsideradas.filter((v) => v.codprod === codprod);
  const foraPorMes = desconsideradasPorMes(doSku);
  const totais = totaisDoRodape(dados.historico, hoje, linha.consumoDiario);
  const leadMedido = Number(m.LEAD_TIME_MEDIDO ?? 0);

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !ocupado && onFechar()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{`Análise do Produto ${codprod}`}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {dados.erro ? <Alert tone="error">{dados.erro}</Alert> : null}

            {/* 1. Cabeçalho */}
            <Panel className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
                <BarChart3 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-title truncate text-[15px] font-bold text-ink">{`${codprod} - ${String(m.DESCRICAO)}`}</h2>
                <p className="truncate text-[12px] text-ink-secondary">{`${String(m.EMBALAGEM) || '—'} · ${fornecedor || '—'}`}</p>
              </div>
              <Status tone={TOM_STATUS[linha.status]}>{ROTULO_STATUS[linha.status]}</Status>
            </Panel>

            {/* 2. Métricas */}
            <GradeMini colunas={4}>
              <MiniCartao rotulo="Estoque" valor={`${quantidade(linha.estoqueAtual)} un.`} hint="Disponível na filial" />
              <MiniCartao rotulo="Em trânsito" valor={`${quantidade(linha.emTransito)} un.`} hint="Pedido ao ERP + trânsito" />
              <MiniCartao rotulo="Cobertura" valor={`${dias(linha.coberturaAtualDias)} · ${pct(nivel)}`} hint={`Nível: % do máximo de ${Math.round(linha.estoqueMaximo).toLocaleString('pt-BR')} un.`} />
              <MiniCartao rotulo="Cobertura futura" valor={dias(comSugestao.coberturaFuturaDias)} hint="Com a quantidade sugerida" />
            </GradeMini>
            <GradeMini colunas={3}>
              <MiniCartao rotulo="Necessidade" valor={`${quantidade(necessidade(linha))} un.`} hint="O que falta ao estoque máximo" />
              <MiniCartao rotulo="Sugestão" valor={textoDaSugestao(linha.sugerida, linha.unidadesPorCaixa, referencia)} hint={linha.sugerida > 0 ? `${moeda(comSugestao.total)} ao ${origemCusto}` : 'Nada a comprar agora'} />
              <MiniCartao rotulo="Custo" valor={moeda(custo)} hint={origemCusto} />
            </GradeMini>

            <BlocoSilenciado linha={linha} podeParametrizar={podeParametrizar} motivoBloqueio={motivoBloqueio} onRestaurar={onRestaurar} />

            {/* 3. Abas em pílula */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções da análise">
              <ChipContagem ativo={aba === 'analise'} onClick={() => setAba('analise')}>Análise</ChipContagem>
              <ChipContagem ativo={aba === 'vendas'} onClick={() => setAba('vendas')}>
                {totalVendas === null ? 'Vendas' : `Vendas (${totalVendas.toLocaleString('pt-BR')})`}
              </ChipContagem>
            </div>

            {aba === 'vendas' ? (
              <VendasDoProduto
                linha={linha}
                codfilial={codfilial}
                periodo={periodo}
                desconsideradas={desconsideradas.map((v) => v.numtransitem)}
                onDesconsiderar={onDesconsiderar}
                onReconsiderar={onReconsiderar}
                onContagem={setTotalVendas}
                onOcupado={setOcupado}
              />
            ) : (
              <>
                {/* 4a. Simulação de compra */}
                <Panel>
                  <PanelHeader title="Simulação de compra" hint="A quantidade sobe para a caixa cheia; o valor usa o custo da última entrada." />
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex w-48 flex-col gap-1 text-[12px] text-ink-secondary">
                        Quantidade (unidades)
                        <Input
                          type="number"
                          min={0}
                          value={simulada === '' ? String(linha.sugerida) : simulada}
                          onChange={(e) => setSimulada(e.target.value)}
                          onBlur={(e) => setSimulada(String(arredondarPorCaixa(Number(e.target.value) || 0, linha.unidadesPorCaixa)))}
                        />
                      </label>
                      <RowMeta>{linha.unidadesPorCaixa > 1 ? `${quantidade(simulacao.caixas)} cx de ${linha.unidadesPorCaixa}` : 'avulso'}</RowMeta>
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" disabled={!podeParametrizar} title={podeParametrizar ? undefined : motivoBloqueio} onClick={() => onParametros(linha)}>
                          <SlidersHorizontal aria-hidden />
                          Parâmetros
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!podeOperar || simulacao.quantidade <= 0}
                          title={podeOperar ? undefined : motivoBloqueio}
                          onClick={() => onAdicionar(linha, simulacao.quantidade)}
                        >
                          <ShoppingCart aria-hidden />
                          Adicionar ao carrinho
                        </Button>
                      </div>
                    </div>
                    <GradeMini colunas={3}>
                      <MiniCartao rotulo="Valor previsto" valor={moeda(simulacao.total)} />
                      <MiniCartao rotulo="Estoque final" valor={`${quantidade(linha.estoqueAtual + linha.emTransito + simulacao.quantidade)} un.`} hint={`Nível ${pct(simulacao.nivelFuturoPct)}`} />
                      <MiniCartao rotulo="Cobertura" valor={dias(simulacao.coberturaFuturaDias)} hint="Depois da compra" />
                    </GradeMini>
                  </div>
                </Panel>

                {/* 4b. Compras × vendas */}
                <GraficoComprasVendas
                  historico={dados.historico}
                  hoje={hoje}
                  consumoDiario={linha.consumoDiario}
                  pronto={dados.pronto}
                  expandido
                  unidadesPorCaixa={linha.unidadesPorCaixa}
                  desconsideradas={foraPorMes}
                />

                {/* 4c. Análise de venda futura */}
                <Panel>
                  <PanelHeader title="Análise de venda futura" hint="O que a regra de ressuprimento calcula sobre a janela; modelos estatísticos de previsão ficam para a onda 5." />
                  <div className="p-4">
                    <GradeMini colunas={6}>
                      <MiniCartao rotulo="Consumo diário" valor={linha.consumoDiario.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} hint="Ponderado por recência" />
                      <MiniCartao rotulo="Projeção do mês" valor={`${totais.projecaoMes.toLocaleString('pt-BR')} un.`} hint="Consumo × dias do mês seguinte" />
                      <MiniCartao rotulo="Estoque de segurança" valor={`${quantidade(linha.estoqueSeguranca)} un.`} hint="Lead time × consumo" />
                      <MiniCartao rotulo="Ponto de pedido" valor={`${quantidade(linha.pontoDePedido)} un.`} hint="2 × lead time × consumo" />
                      <MiniCartao rotulo="Estoque máximo" valor={`${quantidade(linha.estoqueMaximo)} un.`} hint={`Cobertura de ${linha.coberturaDias} dias`} />
                      <MiniCartao rotulo="Lead time medido" valor={leadMedido > 0 ? `${leadMedido} d` : <Dash />} hint={leadMedido > 0 ? 'Média das entradas de 12 meses' : 'Sem entrada casada com pedido'} />
                    </GradeMini>
                  </div>
                </Panel>

                {/* 4d. Excesso em outras filiais */}
                {dados.pronto && excessos.length > 0 ? (
                  <Alert tone="warn">
                    <p className="font-semibold">Excesso de estoque em outras filiais</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {excessos.slice(0, FILIAIS_NO_AVISO).map((f) => (
                        <li key={f.codfilial}>{`${f.codfilial} - ${f.filial} · Estoque ${quantidade(f.estoque)} · Cobertura ${f.coberturaDias === null ? 'sem giro' : `${Math.round(f.coberturaDias)} dias`}`}</li>
                      ))}
                    </ul>
                    {excessos.length > FILIAIS_NO_AVISO ? <p className="mt-1">{`E mais ${excessos.length - FILIAIS_NO_AVISO}.`}</p> : null}
                  </Alert>
                ) : null}

                {/* 4e. Compras do produto */}
                <Panel>
                  <PanelHeader title="Compras do produto" hint={!dados.pronto ? 'Carregando…' : ultima ? 'A última entrada e o histórico, em qualquer filial.' : 'Nenhuma entrada registrada.'} />
                  {!dados.pronto ? (
                    <EmptyState title="Carregando…" />
                  ) : !ultima ? (
                    <EmptyState title="Nenhuma entrada registrada" />
                  ) : (
                    <div className="flex flex-col gap-3 p-4">
                      <GradeMini colunas={6}>
                        <MiniCartao rotulo="Pedido" valor={Number(ultima.NUMPED) > 0 ? <Code>{String(ultima.NUMPED)}</Code> : <Dash />} hint={`NF ${String(ultima.NUMNOTA)} · filial ${String(ultima.CODFILIAL)}`} />
                        <MiniCartao rotulo="Total item" valor={moeda(Number(ultima.VALOR_TOTAL))} hint={`${moeda(Number(ultima.PRECO_UNITARIO))} a unidade`} />
                        <MiniCartao rotulo="Quantidade" valor={`${quantidade(ultima.QUANTIDADE)} un.`} />
                        <MiniCartao rotulo="Solicitação" valor={data(ultima.DT_SOLICITACAO)} hint="Emissão do pedido ao ERP" />
                        <MiniCartao
                          rotulo="Previsão"
                          valor={data(ultima.DT_PREVISAO)}
                          tone={entradaAtrasou(ultima) ? 'attention' : 'neutral'}
                          hint={entradaAtrasou(ultima) ? 'A entrada chegou depois da previsão' : 'Previsão de entrega'}
                        />
                        <MiniCartao rotulo="Entrada" valor={data(ultima.DT_ENTRADA)} />
                      </GradeMini>
                      <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Histórico de entradas</p>
                      <Table>
                        <thead>
                          <tr>
                            <Th>Pedido</Th>
                            <Th>Solicitação</Th>
                            <Th>Previsão</Th>
                            <Th>Entrada</Th>
                            <Th numeric>Qtd.</Th>
                            <Th numeric>Unitário</Th>
                            <Th numeric>Total</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {entradas.map((c, indice) => (
                            <Tr key={`${String(c.NUMTRANSENT)}-${indice}`}>
                              <Td>{Number(c.NUMPED) > 0 ? <Code>{String(c.NUMPED)}</Code> : <Dash />}</Td>
                              <Td>{data(c.DT_SOLICITACAO)}</Td>
                              <Td>{entradaAtrasou(c) ? <Status tone="attention">{fmtData(String(c.DT_PREVISAO))}</Status> : data(c.DT_PREVISAO)}</Td>
                              <Td>{data(c.DT_ENTRADA)}</Td>
                              <Td numeric>{quantidade(c.QUANTIDADE)}</Td>
                              <Td numeric>{moeda(Number(c.PRECO_UNITARIO))}</Td>
                              <Td numeric>{moeda(Number(c.VALOR_TOTAL))}</Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                      {compras.length > ENTRADAS_VISIVEIS ? (
                        <div>
                          <TextLink onClick={() => setTodasEntradas((atual) => !atual)}>
                            {todasEntradas ? `Ver só as ${ENTRADAS_VISIVEIS} últimas` : `Ver todas as ${compras.length} entradas`}
                          </TextLink>
                        </div>
                      ) : null}
                    </div>
                  )}
                </Panel>

                {/* 4f. Parâmetros do cálculo */}
                <Panel>
                  <PanelHeader title="Parâmetros do cálculo" hint="O que entrou na conta deste produto nesta filial." />
                  <div className="p-4">
                    <GradeMini colunas={6}>
                      <MiniCartao rotulo="Janela" valor={`${JANELA_DIAS} dias`} hint={`${fmtData(periodo.inicio)} a ${fmtData(periodo.fim)}`} />
                      <MiniCartao rotulo="Demanda" valor={`${linha.consumoDiario.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} un./dia`} hint={`Venda na janela ${quantidade(m.VENDA_PERIODO)} un.`} />
                      <MiniCartao rotulo="Lead time" valor={`${linha.leadTimeDias} d`} hint={ORIGEM_LEAD[linha.parametros.origemLeadTime]} />
                      <MiniCartao rotulo="Volatilidade" valor={Number(m.VOLATILIDADE_DIARIA ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} hint="Desvio da venda diária" />
                      <MiniCartao rotulo="Segurança" valor={`${quantidade(linha.estoqueSeguranca)} un.`} hint="Lead time × consumo" />
                      <MiniCartao rotulo="Pedido mínimo" valor={pedidoMinimo > 0 ? moeda(pedidoMinimo) : <Dash />} hint="Do fornecedor" />
                      <MiniCartao rotulo="Fornecedor" valor={fornecedor || <Dash />} />
                      <MiniCartao rotulo="Unidade" valor={`${String(m.EMBALAGEM) || '—'} · ${String(m.UNIDADE) || '—'}`} />
                      <MiniCartao rotulo="Un. por caixa" valor={String(linha.unidadesPorCaixa)} hint={ROTULO_ORIGEM_CAIXA[linha.origemCaixa]} />
                      <MiniCartao rotulo="Cobertura" valor={`${linha.coberturaDias} d`} hint={`${ORIGEM_COBERTURA[linha.parametros.origemCobertura]} · gatilho ${linha.gatilhoDias} d`} />
                      <MiniCartao rotulo="Origem do custo" valor={custoAtual > 0 ? 'Custo atual (ERP)' : 'Última entrada'} hint={custoAtual > 0 ? `Última entrada ${moeda(Number(m.CUSTO_ULT_ENTRADA))}` : undefined} />
                      <MiniCartao rotulo="Data do custo" valor={data(m.DT_ULT_ENTRADA)} hint="Última entrada" />
                    </GradeMini>
                  </div>
                </Panel>
              </>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={ocupado}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
