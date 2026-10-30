// O painel de detalhe fixo à direita da lista (layout legado da 011, R-117 /
// C-031): título do SKU, quatro KPIs, o gráfico "Compras × vendas" sempre
// aberto e as seções recolhidas de "Mais detalhes" — simulação de compra,
// atributos e estoque, compras do produto, vendas do período, filiais com
// excesso e parâmetros do cálculo.
//
// Custo de execução: as três consultas do SKU (histórico de 13 meses, últimas
// compras e posição por filial) são feitas pela PÁGINA uma vez por SKU
// selecionado e ficam em cache; este arquivo só desenha o que recebeu. As
// vendas do período continuam no diálogo de sempre (1 execução, ao abrir).
import * as React from 'react';
import { Eye, ShoppingCart, VolumeX } from 'lucide-react';

import {
  Alert, Button, ChipContagem, Code, Dash, Disclosure, EmptyState, IconButton, Input, KpiCompacto, Panel, PanelHeader, RowMeta,
  RowTitle, Status, Table, Td, Th, Tr,
} from '@/components/page';
import { fmtData, moeda } from '@/lib/formato';
import { ROTULO_ORIGEM_CAIXA, arredondarPorCaixa } from '@/lib/compras';
import {
  JANELA_DIAS, ROTULO_STATUS, nivelDeCobertura, quantidadeNaReferencia, rotuloDaQuantidade, textoDaSugestao, unidadesDaDigitada,
} from '@/lib/ressuprimento';
import type { LinhaRessuprimento, ReferenciaSugestao, StatusRessuprimento } from '@/lib/ressuprimento';
import { filiaisComExcesso, simularCompra } from '@/lib/ressuprimento-detalhe';
import type { DadosDoSku } from '@/lib/ressuprimento-detalhe';
import { GraficoComprasVendas } from './grafico';
import { AnaliseVendaFutura } from './previsao-ui';
import { OportunidadeEspecial } from './custo-especial-ui';
import { abaDoGrafico, temAbaEspecial } from '@/lib/custo-especial';
import type { AbaGrafico, SugestaoCliente, TabelaEspecial } from '@/lib/custo-especial';
import { modeloEscolhido } from '@/lib/previsao';
import type { ModeloPrevisao, Previsao, SugestaoProjetada } from '@/lib/previsao';

const TOM_STATUS: Record<StatusRessuprimento, 'alert' | 'attention' | 'live'> = {
  ruptura: 'alert', elevada_exposicao: 'alert', baixa_exposicao: 'attention', excesso: 'attention', adequado: 'live',
};

const quantidade = (valor: unknown) => Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
// Consumo quase nulo dá cobertura de milhares de dias: acima de 999 o número não informa nada.
const dias = (valor: number | null) => (valor === null ? 'sem giro' : valor >= 1000 ? '999+ d' : `${Math.round(valor)} d`);
const pct = (valor: number | null) => (valor === null ? '—' : `${Math.round(valor)} %`);

const ORIGEM_COBERTURA = { sku: 'do produto', fornecedor: 'do fornecedor', curva: 'alvo da curva' } as const;
const ORIGEM_LEAD = { sku: 'do produto', fornecedor: 'do fornecedor', medido: 'medido no ERP', padrao: 'padrão' } as const;

type Secao = 'previsao' | 'simulacao' | 'atributos' | 'compras' | 'vendas' | 'filiais' | 'parametros';

/**
 * C-012: o bloco do produto silenciado, como no sistema antigo — caixa em tom
 * de atenção com "Silenciado até dd/mm/aaaa", o motivo (ou "Sem motivo
 * informado") e "Devolver à fila" para quem parametriza. O painel e a janela
 * Análise do Produto mostram o mesmo bloco.
 */
export function BlocoSilenciado({
  linha,
  podeParametrizar,
  motivoBloqueio,
  onRestaurar,
}: {
  linha: LinhaRessuprimento;
  podeParametrizar: boolean;
  motivoBloqueio: string;
  onRestaurar: (linha: LinhaRessuprimento) => void;
}) {
  if (!linha.silenciado) return null;
  return (
    <Alert tone="warn">
      <div className="flex flex-wrap items-start gap-3">
        <VolumeX className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide uppercase">{`Silenciado até ${fmtData(linha.silenciadoAte)}`}</p>
          <p className="mt-0.5">{linha.motivoSilencio ? `Motivo: ${linha.motivoSilencio}` : 'Sem motivo informado'}</p>
        </div>
        <Button
          size="sm"
          disabled={!podeParametrizar}
          title={podeParametrizar ? 'Restaurar: devolver o produto à fila de compra' : motivoBloqueio}
          onClick={() => onRestaurar(linha)}
        >
          Devolver à fila
        </Button>
      </div>
    </Alert>
  );
}

export function PainelDetalhe({
  linha,
  codfilial,
  fornecedor,
  hoje,
  dados,
  referencia,
  desconsideradasDoSku,
  podeOperar,
  podeParametrizar,
  motivoBloqueio,
  onVerDetalheCompleto,
  onVerVendas,
  onAdicionar,
  onParametros,
  onRestaurar,
  previsao,
  modelo,
  onModelo,
  projetada,
  sugestoesEspeciais,
  onAdicionarEspecial,
}: {
  linha: LinhaRessuprimento | null;
  codfilial: string;
  fornecedor: string;
  hoje: string;
  dados: DadosDoSku;
  referencia: ReferenciaSugestao;
  /** Quantas vendas deste SKU estão desconsideradas nesta filial (da lista que voltou do banco). */
  desconsideradasDoSku: number;
  podeOperar: boolean;
  podeParametrizar: boolean;
  motivoBloqueio: string;
  onVerDetalheCompleto: (linha: LinhaRessuprimento) => void;
  onVerVendas: (linha: LinhaRessuprimento) => void;
  onAdicionar: (linha: LinhaRessuprimento, quantidade: number) => void;
  onParametros: (linha: LinhaRessuprimento) => void;
  onRestaurar: (linha: LinhaRessuprimento) => void;
  /** R-124: a previsão por modelo do produto aberto, a escolha e a sugestão projetada. */
  previsao: Previsao | null;
  modelo: ModeloPrevisao;
  onModelo: (modelo: ModeloPrevisao) => void;
  projetada: SugestaoProjetada | null;
  /** R-125: as sugestões por cliente das políticas de preço especial do produto aberto. */
  sugestoesEspeciais: SugestaoCliente[];
  onAdicionarEspecial: (tabela: TabelaEspecial, quantidade: number) => void;
}) {
  const [abertas, setAbertas] = React.useState<Set<Secao>>(() => new Set());
  const [simulada, setSimulada] = React.useState('');
  // C-048: um gráfico por vez — "Compras × vendas" (padrão) ou "Preço especial".
  const [abaGrafico, setAbaGrafico] = React.useState<AbaGrafico>('vendas');
  // C-037: o campo segue a referência (caixas ou unidades); `simulada` é o texto digitado nela.
  const [referenciaAnterior, setReferenciaAnterior] = React.useState(referencia);
  if (referencia !== referenciaAnterior) {
    setReferenciaAnterior(referencia);
    setSimulada('');
  }

  // Trocou de produto: a simulação volta à sugestão dele — ajuste de estado
  // durante a renderização, não em efeito.
  const codprod = linha ? Number(linha.medida.CODPROD) : 0;
  const [ultimo, setUltimo] = React.useState(codprod);
  if (codprod !== ultimo) {
    setUltimo(codprod);
    setSimulada('');
    setAbaGrafico('vendas');
  }

  if (!linha) {
    return (
      <Panel>
        <EmptyState title="Escolha um produto na lista" hint="O detalhe, o gráfico e a simulação aparecem aqui." />
      </Panel>
    );
  }

  const m = linha.medida;
  const alterna = (secao: Secao) => setAbertas((atual) => {
    const proximo = new Set(atual);
    if (proximo.has(secao)) proximo.delete(secao); else proximo.add(secao);
    return proximo;
  });

  const nivel = nivelDeCobertura(linha);
  // R-124: a quantidade de partida é a sugestão projetada pelo modelo, quando há.
  const sugestaoDePartida = projetada ? projetada.sugestao : linha.sugerida;
  const quantidadeSimulada = simulada === '' ? sugestaoDePartida : unidadesDaDigitada(Number(simulada) || 0, linha.unidadesPorCaixa, referencia);
  const simulacao = simularCompra(linha, quantidadeSimulada);
  const excessos = filiaisComExcesso(dados.filiais, codfilial, linha.coberturaDias);
  const custoAtual = Number(m.CUSTO_ATUAL ?? 0);

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelHeader
          title={`${codprod} · ${String(m.DESCRICAO)}`}
          hint={`${String(m.EMBALAGEM) || '—'} · ${fornecedor || '—'}`}
        >
          <IconButton label="Abrir o detalhe completo do produto" onClick={() => onVerDetalheCompleto(linha)}>
            <Eye aria-hidden />
          </IconButton>
        </PanelHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-rule-row px-4 py-2">
          <KpiCompacto
            rotulo="Estoque"
            valor={`${quantidade(linha.estoqueAtual)} · tr. ${quantidade(linha.emTransito)}`}
            hint="Disponível na filial · a caminho (pedido ao ERP + trânsito)"
          />
          <KpiCompacto
            rotulo="Cobertura"
            valor={`${dias(linha.coberturaAtualDias)} · ${pct(nivel)}`}
            hint={`Dias de estoque · nível: % do máximo de ${Math.round(linha.estoqueMaximo).toLocaleString('pt-BR')} un.`}
          />
          <KpiCompacto
            rotulo="Situação"
            valor={<Status tone={TOM_STATUS[linha.status]}>{ROTULO_STATUS[linha.status]}</Status>}
            hint={linha.silenciado ? `Silenciado até ${fmtData(linha.silenciadoAte)}` : `Curva ${linha.curva} · fat. ${linha.curvaFaturamento} · rent. ${linha.curvaRentabilidade}`}
          />
          <KpiCompacto
            rotulo="Gatilho"
            valor={linha.urgente ? <Status tone="alert">{`${dias(linha.diasDeGatilho)} · urgente`}</Status> : dias(linha.diasDeGatilho)}
            hint={`Urgente quando o gatilho fica em ${linha.gatilhoDias} dias ou menos`}
          />
        </div>
      </Panel>

      <BlocoSilenciado linha={linha} podeParametrizar={podeParametrizar} motivoBloqueio={motivoBloqueio} onRestaurar={onRestaurar} />

      {/* C-048: abas em pílula no topo do card; a especial só com oportunidade, e nunca os dois gráficos juntos. */}
      {temAbaEspecial(sugestoesEspeciais) ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Gráfico do produto">
          <ChipContagem ativo={abaDoGrafico(abaGrafico, sugestoesEspeciais) === 'vendas'} onClick={() => setAbaGrafico('vendas')}>Compras × vendas</ChipContagem>
          <ChipContagem ativo={abaDoGrafico(abaGrafico, sugestoesEspeciais) === 'especial'} onClick={() => setAbaGrafico('especial')} tone="attention">Preço especial</ChipContagem>
        </div>
      ) : null}
      {abaDoGrafico(abaGrafico, sugestoesEspeciais) === 'especial' ? (
        <OportunidadeEspecial
          linha={linha}
          sugestoes={sugestoesEspeciais}
          quantidade={simulacao.quantidade}
          referencia={referencia}
          podeOperar={podeOperar}
          motivoBloqueio={motivoBloqueio}
          onAdicionarEspecial={onAdicionarEspecial}
        />
      ) : (
        <GraficoComprasVendas historico={dados.historico} hoje={hoje} consumoDiario={linha.consumoDiario} pronto={dados.pronto} projecaoMes={projetada ? modeloEscolhido(previsao as Previsao, modelo)?.previsao ?? null : null} />
      )}

      <Panel>
        <PanelHeader title="Mais detalhes" hint={dados.erro || 'Abra só o que precisar; nada aqui custa consulta nova.'} />

        <Disclosure
          titulo="Análise de venda futura"
          resumo={!previsao ? '…' : !previsao.suficiente ? 'sem meses fechados suficientes' : `${modeloEscolhido(previsao, modelo)?.rotulo ?? ''} · projeção ${Math.round(modeloEscolhido(previsao, modelo)?.previsao ?? 0).toLocaleString('pt-BR')} un./mês · sug. projetada ${projetada ? textoDaSugestao(projetada.sugestao, linha.unidadesPorCaixa, referencia) : '—'}`}
          aberta={abertas.has('previsao')}
          onToggle={() => alterna('previsao')}
        >
          <AnaliseVendaFutura linha={linha} previsao={previsao} modelo={modelo} onModelo={onModelo} projetada={projetada} referencia={referencia} compacto />
        </Disclosure>

        <Disclosure
          titulo="Simulação de compra"
          resumo={`${textoDaSugestao(simulacao.quantidade, linha.unidadesPorCaixa, referencia)} · ${moeda(simulacao.total)} · cobertura futura ${dias(simulacao.coberturaFuturaDias)}`}
          aberta={abertas.has('simulacao')}
          onToggle={() => alterna('simulacao')}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1 text-[12px] text-ink-secondary">
                {`Quantidade (${rotuloDaQuantidade(linha.unidadesPorCaixa, referencia) === 'cx' ? 'caixas' : 'unidades'})`}
                <Input
                  type="number"
                  min={0}
                  step={rotuloDaQuantidade(linha.unidadesPorCaixa, referencia) === 'cx' ? 1 : linha.unidadesPorCaixa}
                  value={simulada === '' ? String(quantidadeNaReferencia(sugestaoDePartida, linha.unidadesPorCaixa, referencia)) : simulada}
                  onChange={(e) => setSimulada(e.target.value)}
                  onBlur={(e) => setSimulada(String(quantidadeNaReferencia(arredondarPorCaixa(unidadesDaDigitada(Number(e.target.value) || 0, linha.unidadesPorCaixa, referencia), linha.unidadesPorCaixa), linha.unidadesPorCaixa, referencia)))}
                  title={`Sobe para a caixa cheia de ${linha.unidadesPorCaixa} un.`}
                />
              </label>
              <Button
                variant="primary"
                size="sm"
                disabled={!podeOperar || simulacao.quantidade <= 0}
                title={podeOperar ? undefined : motivoBloqueio}
                onClick={() => onAdicionar(linha, simulacao.quantidade)}
              >
                <ShoppingCart aria-hidden />
                Jogar no carrinho
              </Button>
            </div>
            <Table>
              <tbody>
                <Tr><Td>Quantidade em caixas</Td><Td numeric>{quantidade(simulacao.caixas)}</Td></Tr>
                <Tr><Td>Total ao custo da última entrada</Td><Td numeric>{moeda(simulacao.total)}</Td></Tr>
                <Tr><Td>Cobertura depois da compra</Td><Td numeric>{dias(simulacao.coberturaFuturaDias)}</Td></Tr>
                <Tr><Td>Nível depois da compra</Td><Td numeric>{pct(simulacao.nivelFuturoPct)}</Td></Tr>
              </tbody>
            </Table>
          </div>
        </Disclosure>

        <Disclosure
          titulo="Atributos e estoque"
          resumo={`nível ${nivel === null ? 'sem giro' : nivel < 50 ? 'baixo' : nivel <= 100 ? 'adequado' : 'alto'} · ${pct(nivel)} · ressuprimento ${linha.leadTimeDias} dias`}
          aberta={abertas.has('atributos')}
          onToggle={() => alterna('atributos')}
        >
          <Table>
            <tbody>
              <Tr><Td>Estoque total</Td><Td numeric>{quantidade(m.ESTOQUE_TOTAL)}</Td></Tr>
              <Tr><Td>Bloqueado · avariado · reservado</Td><Td numeric>{`${quantidade(m.QT_BLOQUEADA)} · ${quantidade(m.QT_INDENIZ)} · ${quantidade(m.QT_RESERV)}`}</Td></Tr>
              <Tr><Td>Disponível</Td><Td numeric>{quantidade(linha.estoqueAtual)}</Td></Tr>
              <Tr><Td>Pedido ao ERP · em trânsito</Td><Td numeric>{`${quantidade(m.QT_PEDIDA_ERP)} · ${quantidade(m.QT_TRANSITO)}`}</Td></Tr>
              <Tr><Td>Embalagem · unidade</Td><Td numeric>{`${String(m.EMBALAGEM) || '—'} · ${String(m.UNIDADE) || '—'}`}</Td></Tr>
              <Tr><Td>Unidades por caixa</Td><Td numeric>{`${linha.unidadesPorCaixa} (${ROTULO_ORIGEM_CAIXA[linha.origemCaixa]})`}</Td></Tr>
              <Tr><Td>Departamento · seção</Td><Td numeric>{`${m.CODEPTO} · ${m.CODSEC}`}</Td></Tr>
              <Tr><Td>Código de fábrica</Td><Td numeric>{m.CODFAB ? <Code>{String(m.CODFAB)}</Code> : <Dash />}</Td></Tr>
              <Tr><Td>Custo da última entrada</Td><Td numeric>{moeda(Number(m.CUSTO_ULT_ENTRADA))}</Td></Tr>
              <Tr><Td>Custo atual</Td><Td numeric>{custoAtual > 0 ? moeda(custoAtual) : <Dash />}</Td></Tr>
              <Tr><Td>Última entrada · última saída</Td><Td numeric>{`${fmtData(String(m.DT_ULT_ENTRADA)) || '—'} · ${fmtData(String(m.DT_ULT_SAIDA)) || '—'}`}</Td></Tr>
            </tbody>
          </Table>
        </Disclosure>

        <Disclosure
          titulo="Compras do produto"
          resumo={!dados.pronto ? '…' : dados.compras.length === 0 ? 'nenhuma entrada'
            : `última em ${fmtData(String(dados.compras[0].DT_ENTRADA))} · ${quantidade(dados.compras[0].QUANTIDADE)} un. · ${moeda(Number(dados.compras[0].VALOR_TOTAL))} · ${dados.compras.length} ${dados.compras.length === 1 ? 'entrada' : 'entradas'}`}
          aberta={abertas.has('compras')}
          onToggle={() => alterna('compras')}
        >
          {dados.pronto && dados.compras.length === 0 ? (
            <EmptyState title="Nenhuma entrada registrada" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Entrada</Th>
                  <Th>Nota</Th>
                  <Th>Filial</Th>
                  <Th numeric>Qtd.</Th>
                  <Th numeric>Preço</Th>
                </tr>
              </thead>
              <tbody>
                {dados.compras.map((c, indice) => (
                  <Tr key={`${String(c.NUMTRANSENT)}-${indice}`}>
                    <Td>{fmtData(String(c.DT_ENTRADA))}</Td>
                    <Td><Code>{String(c.NUMNOTA)}</Code></Td>
                    <Td>{String(c.CODFILIAL)}</Td>
                    <Td numeric>{quantidade(c.QUANTIDADE)}</Td>
                    <Td numeric>{moeda(Number(c.PRECO_UNITARIO))}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Disclosure>

        <Disclosure
          titulo="Vendas do período"
          resumo={`${quantidade(m.VENDA_PERIODO)} un. em ${JANELA_DIAS} dias · ${desconsideradasDoSku} ${desconsideradasDoSku === 1 ? 'venda desconsiderada' : 'vendas desconsideradas'}`}
          aberta={abertas.has('vendas')}
          onToggle={() => alterna('vendas')}
        >
          <div className="flex flex-col gap-2">
            <RowMeta>
              {`Venda pública: ${quantidade(m.VENDA_PUBLICA)} un. · ${desconsideradasDoSku} ${desconsideradasDoSku === 1 ? 'venda desconsiderada' : 'vendas desconsideradas'} nesta filial.`}
            </RowMeta>
            <div>
              <Button size="sm" onClick={() => onVerVendas(linha)}>Ver vendas e desconsiderar</Button>
            </div>
          </div>
        </Disclosure>

        <Disclosure
          titulo="Filiais com excesso"
          resumo={dados.pronto ? `${excessos.length} ${excessos.length === 1 ? 'filial' : 'filiais'} acima da cobertura alvo` : '…'}
          aberta={abertas.has('filiais')}
          onToggle={() => alterna('filiais')}
        >
          {dados.pronto && excessos.length === 0 ? (
            <EmptyState title="Nenhuma outra filial com excesso" hint={`Excesso é cobertura acima de ${linha.coberturaDias} dias, ou estoque sem giro.`} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Filial</Th>
                  <Th numeric>Disponível</Th>
                  <Th numeric>Cobertura</Th>
                </tr>
              </thead>
              <tbody>
                {excessos.map((f) => (
                  <Tr key={f.codfilial}>
                    <Td><RowTitle>{f.filial}</RowTitle><RowMeta><Code prefix="filial">{f.codfilial}</Code></RowMeta></Td>
                    <Td numeric>{quantidade(f.estoque)}</Td>
                    <Td numeric>{dias(f.coberturaDias)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Disclosure>

        <Disclosure
          titulo="Parâmetros do cálculo"
          resumo={`janela ${JANELA_DIAS} dias · lead time ${linha.leadTimeDias} dias · cobertura ${linha.coberturaDias} dias (${ORIGEM_COBERTURA[linha.parametros.origemCobertura]})`}
          aberta={abertas.has('parametros')}
          onToggle={() => alterna('parametros')}
        >
          <Table>
            <tbody>
              <Tr><Td>Consumo diário ponderado</Td><Td numeric>{linha.consumoDiario.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</Td></Tr>
              <Tr><Td>Volatilidade diária</Td><Td numeric>{Number(m.VOLATILIDADE_DIARIA ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</Td></Tr>
              <Tr><Td>{`Lead time (${ORIGEM_LEAD[linha.parametros.origemLeadTime]})`}</Td><Td numeric>{`${linha.leadTimeDias} d`}</Td></Tr>
              <Tr><Td>{`Cobertura (${ORIGEM_COBERTURA[linha.parametros.origemCobertura]})`}</Td><Td numeric>{`${linha.coberturaDias} d`}</Td></Tr>
              <Tr><Td>Gatilho</Td><Td numeric>{`${linha.gatilhoDias} d`}</Td></Tr>
              <Tr><Td>Estoque de segurança</Td><Td numeric>{quantidade(linha.estoqueSeguranca)}</Td></Tr>
              <Tr><Td>Ponto de pedido</Td><Td numeric>{quantidade(linha.pontoDePedido)}</Td></Tr>
              <Tr><Td>Estoque máximo</Td><Td numeric>{quantidade(linha.estoqueMaximo)}</Td></Tr>
              <Tr><Td>Unidades por caixa</Td><Td numeric>{`${linha.unidadesPorCaixa} (${ROTULO_ORIGEM_CAIXA[linha.origemCaixa]})`}</Td></Tr>
              <Tr><Td>Janela de venda</Td><Td numeric>{`${JANELA_DIAS} dias`}</Td></Tr>
            </tbody>
          </Table>
          <div className="mt-3">
            <Button
              size="sm"
              disabled={!podeParametrizar}
              title={podeParametrizar ? undefined : motivoBloqueio}
              onClick={() => onParametros(linha)}
            >
              Parâmetros deste produto
            </Button>
          </div>
        </Disclosure>
      </Panel>
    </div>
  );
}
