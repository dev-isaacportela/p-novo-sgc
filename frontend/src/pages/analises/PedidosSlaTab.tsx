// Spec 009 — aba Pedidos (SLA) de `/analises`: os KPIs de prazo, a lista com as
// três etapas, o pedido expandido com a linha do tempo e o perfil por fornecedor
// (RF-007..RF-014, RF-025, C-007..C-015, C-026).
//
// Os KPIs e a lista saem da MESMA cadeia de CTEs no servidor (R-057/C-013): o
// número do topo nunca discorda da linha da tabela. O expandido NÃO pede nada a
// mais para desenhar as etapas — usa `classificarEtapa` de `lib/sla.ts` sobre os
// marcos que a listagem já trouxe (D-010), e só a linha do tempo custa uma
// execução (`sgcSlaPedidoFases`).
import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { linha as linhaSf, linhas } from '@/lib/mitra-api';
import {
  Alert, Code, Dash, Field, GradeGraficos, GradeKpi, IconButton, Kpi, Pagination, Panel,
  PanelHeader, RowMeta, RowTitle, SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { intervaloPadrao, resultadosDosBlocos, serieSimples, type Bloco } from '@/lib/analises';
import { fmtData, moeda } from '@/lib/formato';
import {
  classificarEtapa, faixaDoScore, marcosDaLinha, rotuloAgenda, rotuloConsumo, rotuloEtapa,
  rotuloSla, tomAgenda, tomEtapa, tomSla, type LinhaSla,
} from '@/lib/sla';
import { PainelSerie } from './blocos';

const LIMITE = 20;
const LIMITE_BLOCO = 50;
type Generica = Record<string, string | number | null>;

const OPCOES_FASE = [
  { value: '', label: 'Todas as fases' },
  { value: 'analise', label: 'Análise/Montagem de Pedido' },
  { value: 'tecnica', label: 'Aprovação Técnica' },
  { value: 'diretoria', label: 'Aprovação da Diretoria' },
  { value: 'envio', label: 'Envio para Indústria' },
  { value: 'enviado', label: 'Enviado para Indústria' },
  { value: 'transito', label: 'Em Trânsito para BN' },
  { value: 'faturamento', label: 'Faturamento em Andamento' },
  { value: 'bo', label: 'Produtos em B.O.' },
  { value: 'concluido', label: 'Compras Concluídas' },
];
const OPCOES_VENCIDOS = [
  { value: '', label: 'Todos os prazos' },
  { value: '1', label: 'Só os atrasados' },
];

const inteiro = (valor: unknown) => Number(valor ?? 0);
const umaCasa = (valor: unknown) => Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** As três etapas de um pedido, desenhadas pela régua da TELA (D-010/RN-016). */
function Etapas({ pedido, hoje }: { pedido: LinhaSla; hoje: string }) {
  const etapas = [
    { nome: 'Análise (compras)', chave: 'analise' as const, dias: pedido.DIAS_ANALISE, meta: pedido.META_ANALISE_DIAS, tipo: 'uteis' as const },
    { nome: 'Faturamento (fornecedor)', chave: 'faturamento' as const, dias: pedido.DIAS_FATURAMENTO, meta: pedido.META_FATURAMENTO_DIAS, tipo: 'uteis' as const },
    { nome: 'Entrega (fornecedor)', chave: 'entrega' as const, dias: pedido.DIAS_ENTREGA, meta: pedido.META_ENTREGA_DIAS, tipo: pedido.META_ENTREGA_TIPO },
  ];
  return (
    <div className="flex flex-col gap-2">
      {etapas.map((etapa) => {
        const estado = classificarEtapa(marcosDaLinha(pedido, etapa.chave, hoje));
        return (
          <div key={etapa.chave} className="flex flex-wrap items-center gap-2">
            <span className="min-w-56 text-[13px] font-semibold text-ink">{etapa.nome}</span>
            <Status tone={tomEtapa(estado)}>{rotuloEtapa(estado)}</Status>
            <RowMeta>{rotuloConsumo(etapa.dias, Number(etapa.meta), etapa.tipo)}</RowMeta>
          </div>
        );
      })}
    </div>
  );
}

/** C-015 — a linha do tempo: uma execução por pedido expandido. */
function LinhaDoTempo({ idCard }: { idCard: number }) {
  const [passagens, setPassagens] = React.useState<Generica[] | null>(null);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcSlaPedidoFases', { idCard, hoje: '' })
      .then((rows) => vivo && setPassagens(rows as Generica[]))
      .catch((e) => vivo && setErro(String(e?.message || e)));
    return () => { vivo = false; };
  }, [idCard]);

  if (erro) return <Alert tone="error">Não foi possível carregar a linha do tempo. {erro}</Alert>;
  if (!passagens) return <RowMeta>Carregando a linha do tempo…</RowMeta>;
  if (passagens.length === 0) return <RowMeta>Sem passagens registradas.</RowMeta>;

  return (
    <Table>
      <thead>
        <Tr><Th>Etapa</Th><Th>Entrada</Th><Th>Saída</Th><Th numeric>Dias</Th></Tr>
      </thead>
      <tbody>
        {passagens.map((p) => (
          <Tr key={String(p.ID)}>
            <Td>{p.FASE_NOME || <Dash />}</Td>
            <Td>{fmtData(String(p.DT_ENTRADA))}</Td>
            <Td>{p.DT_SAIDA ? fmtData(String(p.DT_SAIDA)) : <RowMeta>até hoje</RowMeta>}</Td>
            <Td numeric>{inteiro(p.DIAS_NA_FASE)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function PedidosSlaTab({ codfilial }: { codfilial: string }) {
  const padrao = React.useMemo(() => intervaloPadrao(), []);
  const [busca, setBusca] = React.useState('');
  const [fase, setFase] = React.useState('');
  const [soVencidos, setSoVencidos] = React.useState('');
  const [pagina, setPagina] = React.useState(1);
  const [expandido, setExpandido] = React.useState(0);

  const [blocos, setBlocos] = React.useState<Record<string, Bloco<Generica>>>({});
  const [lista, setLista] = React.useState<LinhaSla[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const hoje = padrao.dataFim;

  // Ajuste de estado durante a RENDERIZAÇÃO, não em efeito: trocar a filial no
  // cabeçalho (uma prop) volta para a primeira página sem uma segunda passada
  // de render (react-hooks/set-state-in-effect).
  const [ultimaFilial, setUltimaFilial] = React.useState(codfilial);
  if (codfilial !== ultimaFilial) {
    setUltimaFilial(codfilial);
    setPagina(1);
    setCarregando(true);
  }

  /** Trocar filtro sempre volta para a página 1 e acende o "carregando". */
  const filtrar = (aplicar: () => void) => { setPagina(1); setCarregando(true); aplicar(); };

  React.useEffect(() => {
    let vivo = true;
    const filtros = {
      codfilial, codfornec: 0, dataInicio: padrao.dataInicio, dataFim: padrao.dataFim,
      busca, hoje: '', fase, soVencidos,
    };
    Promise.allSettled([
      linhas('sgcSlaPedidosKpis', filtros),
      linhas('sgcSlaPedidosListar', { ...filtros, limite: LIMITE, offset: (pagina - 1) * LIMITE }),
      linhas('sgcIndPerfilFornecedor', { ...filtros, limite: LIMITE_BLOCO }),
    ]).then(async (resultados) => {
      if (!vivo) return;
      const lidos = resultadosDosBlocos(['kpis', 'lista', 'perfil'], resultados as PromiseSettledResult<Generica[]>[]);
      setBlocos(lidos);
      setLista(lidos.lista.linhas as unknown as LinhaSla[]);
      setCarregando(false);
      const totalRow = await linhaSf('sgcSlaPedidosListarTotal', filtros).catch(() => null);
      if (vivo) setTotal(inteiro(totalRow?.TOTAL));
    });
    return () => { vivo = false; };
  }, [codfilial, busca, fase, soVencidos, pagina, padrao.dataInicio, padrao.dataFim]);

  const bloco = (nome: string): Bloco<Generica> => blocos[nome] ?? { estado: 'vazio', linhas: [], erro: '' };
  const kpis = bloco('kpis').linhas[0] ?? {};
  const kpi = (chave: string) => (
    carregando || bloco('kpis').estado !== 'ok' ? <Dash /> : inteiro(kpis[chave]).toLocaleString('pt-BR')
  );
  const ultimaPagina = Math.max(1, Math.ceil(total / LIMITE));
  const periodoTexto = `${fmtData(padrao.dataInicio)} a ${fmtData(padrao.dataFim)}`;

  return (
    <div className="flex flex-col gap-4">
      <GradeKpi>
        <Kpi rotulo="Pedidos no período" valor={kpi('TOTAL')} hint={periodoTexto} />
        <Kpi rotulo="Atrasados (compras)" valor={kpi('ATRASADOS_COMPRAS')} hint="Análise além da meta" />
        <Kpi rotulo="Atrasados (fornecedor)" valor={kpi('ATRASADOS_FORNECEDOR')} hint="Faturamento ou entrega além da meta" />
        <Kpi
          rotulo="Nota média"
          valor={bloco('kpis').estado === 'ok' ? umaCasa(kpis.SCORE_MEDIO) : <Dash />}
          hint={`${kpi('ATENCAO')} em atenção · ${kpi('FORA_DA_AGENDA')} fora da agenda`}
        />
      </GradeKpi>

      <Panel>
        <PanelHeader title="Prazo dos pedidos" hint={`${periodoTexto} · o mesmo recorte dos números acima`} />
        <Toolbar>
          <SearchInput
            placeholder="Buscar por pedido, fornecedor ou número do WinThor"
            value={busca}
            onChange={(e) => filtrar(() => setBusca(e.target.value))}
            className="min-w-56 flex-1"
          />
          <Field label="Fase" className="w-64">
            <SelectMenu label="Fase" value={fase} onChange={(v) => filtrar(() => setFase(v))} options={OPCOES_FASE} />
          </Field>
          <Field label="Prazo" className="w-48">
            <SelectMenu label="Prazo" value={soVencidos} onChange={(v) => filtrar(() => setSoVencidos(v))} options={OPCOES_VENCIDOS} />
          </Field>
        </Toolbar>

        {bloco('lista').estado === 'erro' ? (
          <Alert tone="error">Não foi possível carregar a lista de prazos. {bloco('lista').erro}</Alert>
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Pedido</Th><Th>Análise</Th><Th>Faturamento</Th><Th>Entrega</Th>
                <Th>Agenda</Th><Th>Situação</Th><Th numeric>Nota</Th><Th>{''}</Th>
              </Tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <Tr><Td colSpan={8}>Sem dados no período.</Td></Tr>
              ) : lista.map((pedido) => (
                <React.Fragment key={pedido.CARD_ID}>
                  <Tr>
                    <Td>
                      <RowTitle>{pedido.FORNECEDOR || pedido.TITULO}</RowTitle>
                      <RowMeta>
                        {pedido.FILIAL} · {fmtData(pedido.DT_CRIACAO)} · {moeda(pedido.VL_TOTAL)}
                        {pedido.NUMPED_WINTHOR ? <> · <Code prefix="WinThor">{pedido.NUMPED_WINTHOR}</Code></> : null}
                      </RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomEtapa(pedido.STATUS_ANALISE)}>{rotuloEtapa(pedido.STATUS_ANALISE)}</Status>
                      <RowMeta>{rotuloConsumo(pedido.DIAS_ANALISE, Number(pedido.META_ANALISE_DIAS))}</RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomEtapa(pedido.STATUS_FATURAMENTO)}>{rotuloEtapa(pedido.STATUS_FATURAMENTO)}</Status>
                      <RowMeta>{rotuloConsumo(pedido.DIAS_FATURAMENTO, Number(pedido.META_FATURAMENTO_DIAS))}</RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomEtapa(pedido.STATUS_ENTREGA)}>{rotuloEtapa(pedido.STATUS_ENTREGA)}</Status>
                      <RowMeta>{rotuloConsumo(pedido.DIAS_ENTREGA, Number(pedido.META_ENTREGA_DIAS), pedido.META_ENTREGA_TIPO)}</RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomAgenda(pedido.STATUS_AGENDA)}>{rotuloAgenda(pedido.STATUS_AGENDA)}</Status>
                      {pedido.DIAS_ATRASO_AGENDA ? <RowMeta>{pedido.DIAS_ATRASO_AGENDA} dias de diferença</RowMeta> : null}
                    </Td>
                    <Td><Status tone={tomSla(pedido.SLA_STATUS)}>{rotuloSla(pedido.SLA_STATUS)}</Status></Td>
                    <Td numeric>
                      <Status tone={faixaDoScore(pedido.SLA_SCORE)}>{pedido.SLA_SCORE ?? 0}</Status>
                    </Td>
                    <Td>
                      <IconButton
                        label={expandido === pedido.CARD_ID ? 'Fechar o pedido' : 'Abrir as etapas do pedido'}
                        onClick={() => setExpandido(expandido === pedido.CARD_ID ? 0 : pedido.CARD_ID)}
                      >
                        {expandido === pedido.CARD_ID ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                      </IconButton>
                    </Td>
                  </Tr>
                  {expandido === pedido.CARD_ID ? (
                    <Tr>
                      <Td colSpan={8}>
                        <div className="flex flex-col gap-4">
                          <Etapas pedido={pedido} hoje={hoje} />
                          <LinhaDoTempo idCard={pedido.CARD_ID} />
                        </div>
                      </Td>
                    </Tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={pagina}
          lastPage={ultimaPagina}
          total={total}
          unit="pedidos"
          busy={carregando}
          onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
          onNext={() => { setCarregando(true); setPagina((p) => Math.min(ultimaPagina, p + 1)); }}
        />
      </Panel>

      <GradeGraficos>
        <PainelSerie
          titulo="Pedidos por fornecedor"
          hint={`Quantos pedidos cada fornecedor teve no período · ${periodoTexto}`}
          rotulo="Pedidos"
          serie={serieSimples(bloco('perfil').linhas, 'FORNECEDOR', 'QTD_PEDIDOS')}
          bloco={bloco('perfil')}
          rodape={<p className="text-[12px] text-ink-secondary">Os {LIMITE_BLOCO} com mais pedidos.</p>}
        />
        <PainelSerie
          titulo="Percentual no prazo por fornecedor"
          hint="Pedidos que terminaram sem etapa vencida"
          rotulo="% no prazo"
          indiceSerie={1}
          serie={serieSimples(bloco('perfil').linhas, 'FORNECEDOR', 'PERC_NO_PRAZO')}
          bloco={bloco('perfil')}
          formatar={(valor) => `${umaCasa(valor)} %`}
          rodape={
            <p className="text-[12px] text-ink-secondary">
              Média de dias por etapa na tabela ao lado (visão Tabela).
            </p>
          }
        />
      </GradeGraficos>
    </div>
  );
}
