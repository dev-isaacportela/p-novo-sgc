// Spec 009 (indicadores e relatórios) — `/relatorios`: a galeria dos recortes
// salvos e o construtor (RF-017..RF-021, C-018..C-023).
//
// A consulta é FIXA (RNF-005): a tela manda valores de um conjunto fechado de
// filtros, nunca um pedaço de consulta. Executar um relatório custa três
// execuções em paralelo (linhas, total e agregado); salvar, editar e excluir
// custam a escrita mais a RELEITURA da galeria (D-03).
//
// §9.4/D-11: quem não pode salvar vê os botões DESABILITADOS com o motivo no
// `title`, nunca escondidos.
import * as React from 'react';
import { Download, Pencil, Trash2 } from 'lucide-react';
import { linha as linhaSf, linhas } from '@/lib/mitra-api';
import { DatePicker } from '@/components/DatePicker';
import {
  Alert, AlternaVisao, Badge, Bar, BarChart, Button, CartesianGrid, ChartContainer, ChartTooltip,
  ChartTooltipContent, CheckRow, Code, Dash, EmptyState, Field, IconButton, Line, LineChart,
  PageHeader, Pagination, Panel, PanelHeader, RowMeta, RowTitle, SelectMenu, Table, Td, Th,
  Toolbar, Tr, XAxis, YAxis, corDeSerie, type ChartConfig,
} from '@/components/page';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { fmtData, fmtDataHora, moeda } from '@/lib/formato';
import { usePersona } from '@/lib/persona';
import type { FilialErp } from '@/lib/analises';
import {
  CAMPOS_AGRUPAVEIS, COLUNAS, MEDIDAS, PRIORIDADES, colunasCsvRelatorio, configPadrao,
  escreverConfig, filtrosDaConfig, lerConfig, linhasCsvRelatorio, podeEditar,
  type AgregadoRow, type ConfigRelatorio, type Medida, type PedidoRow, type TipoGrafico,
} from '@/lib/relatorio';
import { serieDoAgregado } from '@/lib/relatorio';
import { DialogoExcluir, DialogoRelatorio, type RelatorioSalvo } from './relatorio-dialogos';

const LIMITE = 20;
const LIMITE_AGREGADO = 50;

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
  { value: 'cancelado', label: 'Compras Canceladas' },
];
const OPCOES_PRIORIDADE = [
  { value: '', label: 'Qualquer prioridade' },
  ...PRIORIDADES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })),
];
const OPCOES_TIPO = [
  { value: 'barra', label: 'Barras' },
  { value: 'linha', label: 'Linha' },
];

interface Fornecedor { CODFORNEC: number; FORNECEDOR: string }
const inteiro = (valor: unknown) => Number(valor ?? 0);

export default function RelatoriosPage() {
  const sessao = usePersona();
  const [galeria, setGaleria] = React.useState<RelatorioSalvo[]>([]);
  const [abertoId, setAbertoId] = React.useState(0);
  const [config, setConfig] = React.useState<ConfigRelatorio>(() => configPadrao());
  const [pagina, setPagina] = React.useState(1);

  const [pedidos, setPedidos] = React.useState<PedidoRow[]>([]);
  const [agregado, setAgregado] = React.useState<AgregadoRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [erro, setErro] = React.useState('');
  const [carregando, setCarregando] = React.useState(false);
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('tabela');
  const [editando, setEditando] = React.useState<RelatorioSalvo | null>(null);
  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<RelatorioSalvo | null>(null);
  const [filiais, setFiliais] = React.useState<FilialErp[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);

  // `lerGaleria` só lê; quem guarda é o chamador. Assim a primeira carga cabe
  // dentro de um `.then` (efeito não chama setState direto) e a releitura das
  // escritas continua devolvendo a lista para a conferência do D-03.
  const lerGaleria = React.useCallback(
    () => linhas('sgcRelatoriosListar', { busca: '', limite: 100 }) as unknown as Promise<RelatorioSalvo[]>,
    [],
  );

  const recarregarGaleria = React.useCallback(async () => {
    const rows = await lerGaleria();
    setGaleria(rows);
    return rows;
  }, [lerGaleria]);

  React.useEffect(() => {
    lerGaleria().then((rows) => setGaleria(rows)).catch(() => setGaleria([]));
    linhas('sgcWintFiliais').then((rows) => setFiliais(rows as unknown as FilialErp[])).catch(() => setFiliais([]));
    linhas('sgcFornecedorListar', { busca: '', codfilial: '', ativo: 0, limite: 200, offset: 0 })
      .then((rows) => setFornecedores(rows as unknown as Fornecedor[]))
      .catch(() => setFornecedores([]));
  }, [lerGaleria]);

  // Ajuste de estado durante a RENDERIZAÇÃO (não em efeito): trocar o recorte
  // volta para a primeira página e acende o "carregando" na mesma passada.
  const [ultimaConfig, setUltimaConfig] = React.useState(config);
  if (config !== ultimaConfig) {
    setUltimaConfig(config);
    setPagina(1);
    setCarregando(true);
    setErro('');
  }

  React.useEffect(() => {
    let vivo = true;
    const filtros = { ...filtrosDaConfig(config), hoje: '' };
    Promise.all([
      linhas('sgcRelatorioPedidos', { ...filtros, limite: LIMITE, offset: (pagina - 1) * LIMITE }),
      linhaSf('sgcRelatorioPedidosTotal', filtros),
      linhas('sgcRelatorioAgregar', {
        ...filtros, campoAgrupar: config.grafico.eixo || 'fase', limite: LIMITE_AGREGADO,
      }),
    ]).then(([rows, totalRow, agregadoRows]) => {
      if (!vivo) return;
      setPedidos(rows as unknown as PedidoRow[]);
      setTotal(inteiro(totalRow?.TOTAL));
      setAgregado(agregadoRows as unknown as AgregadoRow[]);
    }).catch((e) => vivo && setErro(String((e as Error)?.message || e)))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [config, pagina]);

  if (!sessao) return <EmptyState title="Carregando…" />;

  if (!sessao.permissoes.verRelatorios) {
    return (
      <>
        <PageHeader module="Gestão" title="Relatórios" />
        <Alert tone="error">Seu perfil não tem acesso aos relatórios.</Alert>
      </>
    );
  }

  const podeSalvar = sessao.permissoes.salvarRelatorio;
  const motivoSemSalvar = 'Seu perfil vê os relatórios, mas não salva, edita nem exclui.';
  const ehAdmin = sessao.persona === 'admin';
  const ultimaPagina = Math.max(1, Math.ceil(total / LIMITE));
  const medida = config.grafico.medida;
  const serie = serieDoAgregado(agregado, medida);
  const chartConfig = { value: { label: MEDIDAS.find((m) => m.chave === medida)?.label ?? '', color: corDeSerie(0) } } satisfies ChartConfig;
  const formatarMedida = (valor: number) => (medida === 'valor'
    ? moeda(valor)
    : valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

  const trocarFiltro = (parte: Partial<ConfigRelatorio['filtros']>) =>
    setConfig((atual) => ({ ...atual, filtros: { ...atual.filtros, ...parte } }));

  function abrir(relatorio: RelatorioSalvo) {
    setAbertoId(Number(relatorio.ID));
    setConfig(lerConfig(relatorio.CONFIG_JSON));
    setVisao(lerConfig(relatorio.CONFIG_JSON).visao);
  }

  function exportar() {
    const nome = `relatorio-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    baixarCsv(nome, textoCsv(colunasCsvRelatorio(config.colunas), linhasCsvRelatorio(pedidos, config.colunas)));
  }

  const colunaAtiva = (chave: string) => config.colunas.includes(chave);
  const alternarColuna = (chave: string) => setConfig((atual) => ({
    ...atual,
    // A ordem é a da lista fechada, não a da ordem de clique: a tela e o CSV
    // saem iguais em qualquer sequência de cliques (C-023).
    colunas: COLUNAS.map((c) => c.chave).filter((c) => (c === chave ? !colunaAtiva(chave) : colunaAtiva(c))),
  }));

  const celula = (linha: PedidoRow, chave: string): React.ReactNode => {
    switch (chave) {
      case 'numero': return linha.NUMPED_WINTHOR ? <Code prefix="WinThor">{linha.NUMPED_WINTHOR}</Code> : <Code>{linha.ID_CARD}</Code>;
      case 'titulo': return <RowTitle>{linha.TITULO}</RowTitle>;
      case 'valor': return Number(linha.VL_TOTAL) ? moeda(linha.VL_TOTAL) : <Dash />;
      case 'criado_em': return fmtData(linha.CRIADO_EM);
      case 'dias_na_fase': return inteiro(linha.DIAS_NA_FASE);
      case 'fase': return linha.FASE_NOME || <Dash />;
      case 'fornecedor': return linha.FORNECEDOR || <Dash />;
      case 'filial': return linha.FILIAL || <Dash />;
      case 'responsavel': return linha.RESPONSAVEL || <Dash />;
      case 'prioridade': return linha.PRIORIDADE || <Dash />;
      default: return <Dash />;
    }
  };

  return (
    <>
      <PageHeader
        module="Gestão"
        title="Relatórios"
        description="Recortes salvos sobre os pedidos: filtros, colunas, agrupamento, gráfico e CSV."
        meta={<span><strong>{total.toLocaleString('pt-BR')}</strong> pedidos no recorte</span>}
        actions={
          <>
            <Button onClick={exportar} disabled={carregando || pedidos.length === 0}
              title={pedidos.length === 0 ? 'Nada para exportar neste recorte.' : undefined}>
              <Download aria-hidden />
              Exportar CSV
            </Button>
            <Button
              variant="primary"
              onClick={() => { setEditando(null); setDialogoAberto(true); }}
              disabled={!podeSalvar}
              title={podeSalvar ? undefined : motivoSemSalvar}
            >
              Salvar relatório
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader title="Galeria" hint="Os seus recortes e os que a equipe compartilhou." />
          {galeria.length === 0 ? (
            <EmptyState title="Nenhum relatório salvo" hint="Monte um recorte abaixo e salve com um título." />
          ) : (
            <Table>
              <thead>
                <Tr><Th>Relatório</Th><Th>Autor</Th><Th>Atualizado</Th><Th>{''}</Th></Tr>
              </thead>
              <tbody>
                {galeria.map((r) => {
                  const meu = podeEditar(r, sessao.usuarioId, ehAdmin);
                  const motivo = meu ? undefined : 'Só quem criou o relatório, ou um administrador, edita e exclui.';
                  return (
                    <Tr key={r.ID}>
                      <Td>
                        <RowTitle>{r.TITULO}</RowTitle>
                        {r.DESCRICAO ? <RowMeta>{r.DESCRICAO}</RowMeta> : null}
                        {Number(r.COMPARTILHADO) === 1
                          ? <Badge tone="accent">Compartilhado</Badge>
                          : <Badge tone="neutral">Só meu</Badge>}
                      </Td>
                      <Td>{r.CRIADO_POR_NOME || <Dash />}</Td>
                      <Td>{r.ATUALIZADO_EM ? fmtDataHora(r.ATUALIZADO_EM) : fmtDataHora(r.CRIADO_EM)}</Td>
                      <Td>
                        <Button size="sm" onClick={() => abrir(r)}>
                          {abertoId === Number(r.ID) ? 'Aberto' : 'Abrir'}
                        </Button>
                        {/* D-11: desabilitado COM o motivo — o `label` do
                            IconButton vira `title` e `aria-label` de uma vez. */}
                        <IconButton
                          label={meu && podeSalvar ? 'Editar relatório' : (podeSalvar ? motivo! : motivoSemSalvar)}
                          onClick={() => { setEditando(r); setDialogoAberto(true); }}
                          disabled={!meu || !podeSalvar}
                        >
                          <Pencil aria-hidden />
                        </IconButton>
                        <IconButton
                          label={meu && podeSalvar ? 'Excluir relatório' : (podeSalvar ? motivo! : motivoSemSalvar)}
                          tone="danger"
                          onClick={() => setExcluindo(r)}
                          disabled={!meu || !podeSalvar}
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
        </Panel>

        <Panel>
          <PanelHeader title="Construtor" hint="Filtro em branco não filtra — o período de criação inclusive." />
          <Toolbar>
            <Field label="Fase" className="w-60">
              <SelectMenu label="Fase" value={config.filtros.fase} onChange={(v) => trocarFiltro({ fase: v })} options={OPCOES_FASE} />
            </Field>
            <Field label="Fornecedor" className="w-60">
              <SelectMenu
                label="Fornecedor"
                value={config.filtros.codfornec ? String(config.filtros.codfornec) : ''}
                onChange={(v) => trocarFiltro({ codfornec: Number(v || 0) })}
                placeholder="Todos os fornecedores"
                options={[{ value: '', label: 'Todos os fornecedores' },
                  ...fornecedores.map((f) => ({ value: String(f.CODFORNEC), label: f.FORNECEDOR }))]}
              />
            </Field>
            <Field label="Filial" className="w-52">
              <SelectMenu
                label="Filial"
                value={config.filtros.codfilial}
                onChange={(v) => trocarFiltro({ codfilial: v })}
                placeholder="Todas as filiais"
                options={[{ value: '', label: 'Todas as filiais' },
                  ...filiais.map((f) => ({ value: f.CODFILIAL, label: f.FILIAL }))]}
              />
            </Field>
            <Field label="Prioridade" className="w-48">
              <SelectMenu label="Prioridade" value={config.filtros.prioridade}
                onChange={(v) => trocarFiltro({ prioridade: v })} options={OPCOES_PRIORIDADE} />
            </Field>
            <Field label="Criado de" className="w-44">
              <DatePicker value={config.filtros.dataInicio} onChange={(v) => trocarFiltro({ dataInicio: v })} aria-label="Criado a partir de" />
            </Field>
            <Field label="Criado até" className="w-44">
              <DatePicker value={config.filtros.dataFim} onChange={(v) => trocarFiltro({ dataFim: v })} aria-label="Criado até" />
            </Field>
          </Toolbar>
          <Toolbar>
            <Field label="Agrupar o gráfico por" className="w-52">
              <SelectMenu
                label="Agrupar por"
                value={config.grafico.eixo || 'fase'}
                onChange={(v) => setConfig((a) => ({ ...a, grafico: { ...a.grafico, eixo: v as ConfigRelatorio['agrupamento'] } }))}
                options={CAMPOS_AGRUPAVEIS.map((c) => ({ value: c.chave, label: c.label }))}
              />
            </Field>
            <Field label="Medida" className="w-56">
              <SelectMenu
                label="Medida"
                value={medida}
                onChange={(v) => setConfig((a) => ({ ...a, grafico: { ...a.grafico, medida: v as Medida } }))}
                options={MEDIDAS.map((m) => ({ value: m.chave, label: m.label }))}
              />
            </Field>
            <Field label="Tipo de gráfico" className="w-44">
              <SelectMenu
                label="Tipo"
                value={config.grafico.tipo}
                onChange={(v) => setConfig((a) => ({ ...a, grafico: { ...a.grafico, tipo: v as TipoGrafico } }))}
                options={OPCOES_TIPO}
              />
            </Field>
          </Toolbar>
          <Toolbar>
            {COLUNAS.map((coluna) => (
              <CheckRow key={coluna.chave} marcado={colunaAtiva(coluna.chave)} onToggle={() => alternarColuna(coluna.chave)}>
                {coluna.label}
              </CheckRow>
            ))}
          </Toolbar>
        </Panel>

        <Panel>
          <PanelHeader title="Resultado" hint={`Agrupado por ${CAMPOS_AGRUPAVEIS.find((c) => c.chave === (config.grafico.eixo || 'fase'))?.label}`}>
            <AlternaVisao visao={visao} onVisao={setVisao} />
          </PanelHeader>

          {erro ? <Alert tone="error">Não foi possível executar o relatório. {erro}</Alert> : null}

          {visao === 'grafico' ? (
            <div className="h-[320px] w-full min-w-0 p-4">
              {serie.length < 2 ? (
                <Alert tone="info">Um ponto só não vira gráfico: troque para a visão de tabela.</Alert>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  {config.grafico.tipo === 'linha' ? (
                    <LineChart data={serie}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={false} width={56} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
                    </LineChart>
                  ) : (
                    <BarChart data={serie}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tickLine={false} axisLine={false} width={56} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                    </BarChart>
                  )}
                </ChartContainer>
              )}
            </div>
          ) : (
            <Table>
              <thead>
                <Tr>
                  {COLUNAS.filter((c) => colunaAtiva(c.chave)).map((c) => (
                    <Th key={c.chave} numeric={c.numerica}>{c.label}</Th>
                  ))}
                </Tr>
              </thead>
              <tbody>
                {pedidos.length === 0 ? (
                  <Tr><Td colSpan={Math.max(1, config.colunas.length)}>Nenhum pedido neste recorte.</Td></Tr>
                ) : pedidos.map((linha) => (
                  <Tr key={linha.ID_CARD}>
                    {COLUNAS.filter((c) => colunaAtiva(c.chave)).map((c) => (
                      <Td key={c.chave} numeric={c.numerica}>{celula(linha, c.chave)}</Td>
                    ))}
                  </Tr>
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

        <Panel>
          <PanelHeader title="Agregado" hint="O mesmo conjunto, somado pelo campo do gráfico — a versão acessível dele." />
          <Table>
            <thead>
              <Tr><Th>Chave</Th><Th numeric>Pedidos</Th><Th numeric>Valor</Th><Th numeric>Dias na fase</Th></Tr>
            </thead>
            <tbody>
              {agregado.length === 0 ? (
                <Tr><Td colSpan={4}>Sem dados neste recorte.</Td></Tr>
              ) : agregado.map((l) => (
                <Tr key={l.CHAVE}>
                  <Td>{l.CHAVE}</Td>
                  <Td numeric>{inteiro(l.QTD)}</Td>
                  <Td numeric>{Number(l.VL_TOTAL) ? moeda(l.VL_TOTAL) : <Dash />}</Td>
                  <Td numeric>{l.DIAS_NA_FASE_MEDIA === null ? <Dash /> : formatarMedida(Number(l.DIAS_NA_FASE_MEDIA))}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </div>

      <DialogoRelatorio
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        relatorio={editando}
        configJson={escreverConfig({ ...config, visao })}
        aoSalvar={recarregarGaleria}
      />
      <DialogoExcluir
        relatorio={excluindo}
        onFechar={() => setExcluindo(null)}
        aoExcluir={recarregarGaleria}
      />
    </>
  );
}
