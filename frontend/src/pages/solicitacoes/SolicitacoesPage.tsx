// Spec 008 (solicitações do comercial) — `/solicitacoes`: a fila, os filtros, o
// registro, a avaliação, o detalhe com histórico e o painel de rastreio.
//
// Duas execuções ao abrir (`sgcSolicitacoesListar` + `sgcSolicitacoesListarTotal`);
// os seletores de fornecedor e de filial saem do que já veio na página, sem
// consulta nova (o mesmo desenho de /notas-fiscais).
//
// RF-019/D-010: o comercial só vê o que registrou porque o RECORTE é do
// servidor — a tela não esconde nada. RF-020/C-019: quem não opera vê os
// controles DESABILITADOS com o motivo no `title`, nunca escondidos.
//
// Spec 017: o alternador de visões (Detalhada, Por vendedor, Por fornecedor,
// Por filial — RN-SOL-16). Na visão agrupada a lista não é consultada; quem
// consulta é `VisoesAgrupadas`, com os mesmos filtros. Abrir um grupo aplica o
// filtro dele (o vendedor é filtro novo da tela, com ficha) e volta à Detalhada.
import * as React from 'react';
import { Eye, Ban, Plus, LineChart } from 'lucide-react';
import {
  Alert, AlternaOpcoes, Badge, Button, Code, Dash, EmptyState, FilterChip, IconButton, PageHeader, Pagination,
  Panel, PanelHeader, RowMeta, RowTitle, SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { acao, comPadrao, linha, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { fmtData } from '@/lib/formato';
import {
  prioridadeDe, rotuloSituacao, rotuloStatus,
  type LinhaSolicitacao, type Prioridade, type TomStatus,
} from '@/lib/solicitacoes';
import { AvaliarDialogo, DetalheSolicitacaoDialogo, NovaSolicitacaoDialogo } from './solicitacoes-dialogos';
import { carimboGravado } from './carimbo';
import RastreioPainel from './RastreioPainel';
import VisoesAgrupadas from './VisoesAgrupadas';
import { OPCOES_VISAO, ROTULO_DIMENSAO, comOpcao, type FiltroDoGrupo, type Visao } from '@/lib/solicitacoes-visoes';

const LIMITE = 20;

const OPCOES_STATUS = [
  { value: '', label: 'Qualquer situação' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovada', label: 'Aprovadas' },
  { value: 'recusada', label: 'Recusadas' },
  { value: 'cancelada', label: 'Canceladas' },
];

const OPCOES_SITUACAO = [
  { value: '', label: 'Qualquer atendimento' },
  { value: 'sem_pedido', label: 'Sem pedido' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'em_aprovacao', label: 'Em aprovação' },
  { value: 'em_envio', label: 'Em envio' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'em_transito', label: 'Em trânsito' },
  { value: 'em_faturamento', label: 'Em faturamento' },
  { value: 'atendida', label: 'Atendida' },
  { value: 'nao_atendida', label: 'Não atendida' },
];

const OPCOES_AUTORIA = [
  { value: '0', label: 'De todos os vendedores' },
  { value: '1', label: 'Só as minhas' },
];

const TOM_PRIORIDADE: Record<Prioridade, TomStatus> = { urgente: 'alert', alta: 'attention', normal: 'off' };
const ROTULO_PRIORIDADE: Record<Prioridade, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal' };

const quantidade = (valor: number) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const agora = () => new Date().toISOString().slice(0, 19);

export default function SolicitacoesPage() {
  const sessao = usePersona();
  const [busca, setBusca] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [situacao, setSituacao] = React.useState('');
  const [codfornec, setCodfornec] = React.useState('');
  const [codfilial, setCodfilial] = React.useState('');
  const [minhas, setMinhas] = React.useState('0');
  const [vendedor, setVendedor] = React.useState<{ id: number; nome: string } | null>(null);
  // O rótulo do fornecedor ou da filial do grupo aberto: o seletor tira as
  // opções da página à vista, e a ficha precisa do nome mesmo antes dela chegar.
  const [rotulosDoGrupo, setRotulosDoGrupo] = React.useState<{ codfornec: string; codfilial: string }>({ codfornec: '', codfilial: '' });
  const [visao, setVisao] = React.useState<Visao>('detalhe');
  const [totalGrupos, setTotalGrupos] = React.useState(0);
  const [pagina, setPagina] = React.useState(1);
  const [versao, setVersao] = React.useState(0);

  const [registros, setRegistros] = React.useState<LinhaSolicitacao[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [salvoEm, setSalvoEm] = React.useState('');

  const [novaAberta, setNovaAberta] = React.useState(false);
  const [avaliando, setAvaliando] = React.useState<LinhaSolicitacao | null>(null);
  const [detalhando, setDetalhando] = React.useState<LinhaSolicitacao | null>(null);
  const [mostrarRastreio, setMostrarRastreio] = React.useState(false);

  const codVendedor = vendedor ? String(vendedor.id) : '0';
  /** Os filtros da fila, com os padrões ('' no texto, '0' no número) — os mesmos nas duas visões (RN-09 da 017). */
  const filtrosDaFila = React.useMemo(() => comPadrao(
    { status, situacao, codfornec, codfilial, minhas, busca, vendedor: codVendedor },
    { status: '', situacao: '', codfornec: '0', codfilial: '', minhas: '0', busca: '', vendedor: '0' },
  ), [status, situacao, codfornec, codfilial, minhas, busca, codVendedor]);

  React.useEffect(() => {
    // RNF-02 da 017: na visão agrupada, quem consulta é `VisoesAgrupadas`.
    if (visao !== 'detalhe') return undefined;
    let vivo = true;
    const filtros = { ...filtrosDaFila, limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) };
    Promise.all([
      linhas('sgcSolicitacoesListar', filtros),
      linha('sgcSolicitacoesListarTotal', filtros),
    ])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setRegistros(rows as unknown as LinhaSolicitacao[]);
        setTotal(Number(totalRow?.TOTAL ?? 0));
        setErro('');
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as solicitações.');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [filtrosDaFila, pagina, versao, visao]);

  function refiltrar(mudar: () => void) {
    setCarregando(true);
    setPagina(1);
    mudar();
  }

  /** D-03: quem prova que gravou é a releitura, não a resposta da escrita. */
  function recarregar() {
    setCarregando(true);
    setSalvoEm(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    setVersao((v) => v + 1);
  }

  const lastPage = Math.max(1, Math.ceil(total / LIMITE));

  function trocarVisao(nova: Visao) {
    if (nova === 'detalhe') setCarregando(true);
    setVisao(nova);
  }

  /** RN-11 da 017 (P-07): abrir o grupo filtra a lista por ele e volta à Detalhada. */
  function abrirGrupo(filtro: FiltroDoGrupo) {
    refiltrar(() => {
      if (filtro.campo === 'vendedor') setVendedor(filtro.vendedor);
      else if (filtro.campo === 'codfornec') {
        setCodfornec(filtro.valor);
        setRotulosDoGrupo((r) => ({ ...r, codfornec: filtro.rotulo }));
      } else {
        setCodfilial(filtro.valor);
        setRotulosDoGrupo((r) => ({ ...r, codfilial: filtro.rotulo }));
      }
      setVisao('detalhe');
    });
  }

  /** Fornecedores e filiais da página atual — o filtro é sobre o que está à vista. */
  const fornecedores = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const registro of registros) vistos.set(String(registro.CODFORNEC), registro.FORNECEDOR);
    return comOpcao([...vistos].map(([value, label]) => ({ value, label })), codfornec, rotulosDoGrupo.codfornec);
  }, [registros, codfornec, rotulosDoGrupo.codfornec]);
  const filiais = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const registro of registros) vistos.set(String(registro.CODFILIAL), registro.FILIAL || registro.CODFILIAL);
    return comOpcao([...vistos].map(([value, label]) => ({ value, label })), codfilial, rotulosDoGrupo.codfilial);
  }, [registros, codfilial, rotulosDoGrupo.codfilial]);

  const podeCriar = !!sessao?.permissoes.criarSolicitacao;
  const podeAvaliar = !!sessao?.permissoes.avaliarSolicitacao;
  const motivoCriar = sessao && !podeCriar
    ? (sessao.permissoes.somenteLeitura
      ? 'Seu acesso é somente leitura.'
      : 'Quem registra a solicitação é o vendedor que recebeu a demanda do cliente.')
    : '';
  const motivoAvaliar = sessao && !podeAvaliar
    ? (sessao.permissoes.somenteLeitura ? 'Seu acesso é somente leitura.' : 'Seu perfil lê a fila, mas não avalia solicitação.')
    : '';

  async function cancelar(registro: LinhaSolicitacao) {
    setCarregando(true);
    setErro('');
    try {
      const quando = agora();
      await acao('sgcEscSolicitacaoCancelar', { id: registro.ID, canceladoEm: quando });
      // D-03: o cancelamento é guardado (só o autor, só enquanto pendente) e
      // recusa devolvendo 0 linhas, sem erro. O carimbo é a prova de que rodou
      // — sem ela, a ficha ganhava a linha "cancelada" de um cancelamento que
      // não houve.
      if (!await carimboGravado(registro.ID, 'ATUALIZADO_EM', quando)) {
        setCarregando(false);
        setErro('A solicitação não foi cancelada (sem permissão ou já avaliada).');
        return;
      }
      await acao('sgcEscSolicitacaoHistoricoInserir', {
        id: registro.ID, idCard: 0, evento: 'cancelada', detalhe: 'Cancelada pelo vendedor.', em: quando,
      });
      recarregar();
    } catch (falha) {
      setCarregando(false);
      setErro(falha instanceof Error ? falha.message : 'Não foi possível cancelar a solicitação.');
    }
  }

  // A-8 da onda 2: sem porteiro, o endereço direto abriria a tela para quem
  // está fora do menu — o item some, a rota não.
  if (!sessao) return <EmptyState title="Carregando..." />;
  if (!sessao.permissoes.verSolicitacoes) {
    return (
      <>
        <PageHeader module="Compras" title="Solicitações" />
        <Alert tone="error">Seu perfil não tem acesso às solicitações do comercial.</Alert>
      </>
    );
  }

  const statusFiltrado = OPCOES_STATUS.find((o) => o.value === status && o.value !== '');
  const situacaoFiltrada = OPCOES_SITUACAO.find((o) => o.value === situacao && o.value !== '');
  const fornecedorFiltrado = fornecedores.find((f) => f.value === codfornec);
  const filialFiltrada = filiais.find((f) => f.value === codfilial);
  const minhasFiltrado = minhas === '1';

  return (
    <>
      <PageHeader
        module="Compras"
        title="Solicitações"
        description="Demandas que o comercial registrou, a avaliação de compras e a situação de atendimento de cada uma."
        meta={
          <span>
            {visao === 'detalhe'
              ? <><strong>{total.toLocaleString('pt-BR')}</strong> na fila</>
              : <><strong>{totalGrupos.toLocaleString('pt-BR')}</strong> {totalGrupos === 1 ? 'grupo' : 'grupos'}</>}
            {salvoEm ? ` · salvo às ${salvoEm}` : ''}
          </span>
        }
        actions={
          <>
            <Button onClick={() => setMostrarRastreio((v) => !v)} aria-pressed={mostrarRastreio}>
              <LineChart aria-hidden />
              {mostrarRastreio ? 'Ocultar rastreio' : 'Rastreio pós-aprovação'}
            </Button>
            <Button
              variant="primary"
              onClick={() => setNovaAberta(true)}
              disabled={!podeCriar}
              title={motivoCriar || undefined}
            >
              <Plus aria-hidden />
              Nova solicitação
            </Button>
          </>
        }
      />

      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Panel>
        <PanelHeader
          title={visao === 'detalhe' ? 'Fila de solicitações' : `Fila por ${ROTULO_DIMENSAO[visao].toLowerCase()}`}
          hint={visao === 'detalhe' ? undefined : 'Clique no nome do grupo para ver as solicitações dele na lista.'}
        >
          <AlternaOpcoes rotulo="Visão da fila" opcoes={OPCOES_VISAO} valor={visao} onValor={trocarVisao} />
        </PanelHeader>
        <Toolbar>
          <SearchInput
            placeholder="Buscar por produto, cliente ou fornecedor"
            value={busca}
            onChange={(evento) => refiltrar(() => setBusca(evento.target.value))}
            className="min-w-56 flex-1"
          />
          <div className="w-48">
            <SelectMenu
              label="Situação"
              placeholder="Qualquer situação"
              value={status}
              onChange={(valor) => refiltrar(() => setStatus(valor))}
              options={OPCOES_STATUS}
            />
          </div>
          <div className="w-52">
            <SelectMenu
              label="Atendimento"
              placeholder="Qualquer atendimento"
              value={situacao}
              onChange={(valor) => refiltrar(() => setSituacao(valor))}
              options={OPCOES_SITUACAO}
            />
          </div>
          <div className="w-52">
            <SelectMenu
              label="Fornecedor"
              placeholder="Todos os fornecedores"
              value={codfornec}
              onChange={(valor) => refiltrar(() => setCodfornec(valor))}
              options={[{ value: '', label: 'Todos os fornecedores' }, ...fornecedores]}
            />
          </div>
          <div className="w-44">
            <SelectMenu
              label="Filial"
              placeholder="Todas as filiais"
              value={codfilial}
              onChange={(valor) => refiltrar(() => setCodfilial(valor))}
              options={[{ value: '', label: 'Todas as filiais' }, ...filiais]}
            />
          </div>
          <div className="w-52">
            <SelectMenu
              label="Autoria"
              value={minhas}
              onChange={(valor) => refiltrar(() => setMinhas(valor))}
              options={OPCOES_AUTORIA}
            />
          </div>
        </Toolbar>

        {statusFiltrado || situacaoFiltrada || fornecedorFiltrado || filialFiltrada || minhasFiltrado || vendedor ? (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {statusFiltrado ? (
              <FilterChip label="Situação" value={statusFiltrado.label} onClear={() => refiltrar(() => setStatus(''))} />
            ) : null}
            {situacaoFiltrada ? (
              <FilterChip label="Atendimento" value={situacaoFiltrada.label} onClear={() => refiltrar(() => setSituacao(''))} />
            ) : null}
            {fornecedorFiltrado ? (
              <FilterChip label="Fornecedor" value={fornecedorFiltrado.label} onClear={() => refiltrar(() => setCodfornec(''))} />
            ) : null}
            {filialFiltrada ? (
              <FilterChip label="Filial" value={filialFiltrada.label} onClear={() => refiltrar(() => setCodfilial(''))} />
            ) : null}
            {minhasFiltrado ? (
              <FilterChip label="Autoria" value="Só as minhas" onClear={() => refiltrar(() => setMinhas('0'))} />
            ) : null}
            {vendedor ? (
              <FilterChip label="Vendedor" value={vendedor.nome} onClear={() => refiltrar(() => setVendedor(null))} />
            ) : null}
          </div>
        ) : null}

        {visao !== 'detalhe' ? (
          <VisoesAgrupadas
            key={`${visao}|${JSON.stringify(filtrosDaFila)}`}
            dimensao={visao}
            filtros={filtrosDaFila}
            onAbrir={abrirGrupo}
            onTotal={setTotalGrupos}
          />
        ) : !carregando && registros.length === 0 ? (
          <EmptyState
            title="Nenhuma solicitação por aqui"
            hint="Ajuste a busca ou os filtros — ou registre a primeira demanda do cliente."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th numeric>Quantidade</Th>
                <Th>Cliente</Th>
                <Th>Prioridade</Th>
                <Th>Vendedor</Th>
                <Th>Situação</Th>
                <Th>Atendimento</Th>
                <Th className="w-36 text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {registros.map((registro) => {
                const prioridade = prioridadeDe(registro.PRIORIDADE);
                const situacaoLinha = rotuloSituacao(registro.SITUACAO);
                const statusLinha = rotuloStatus(registro.STATUS);
                const propria = Number(registro.CRIADO_POR) === sessao.usuarioId;
                const podeCancelar = podeCriar && propria && registro.STATUS === 'pendente';
                return (
                  <Tr key={registro.ID}>
                    <Td>
                      <RowTitle>{registro.DESCRICAO}</RowTitle>
                      <RowMeta>
                        <Code prefix="cód.">{registro.CODPROD}</Code> · {registro.FORNECEDOR} · {registro.FILIAL || registro.CODFILIAL}
                      </RowMeta>
                      {registro.MOTIVO ? <RowMeta>Motivo: {registro.MOTIVO}</RowMeta> : null}
                    </Td>
                    <Td numeric>{quantidade(registro.QUANTIDADE)}</Td>
                    <Td>
                      {Number(registro.CODCLI) > 0 ? (
                        <>
                          <RowTitle>{registro.CLIENTE}</RowTitle>
                          <RowMeta><Code prefix="cód.">{registro.CODCLI}</Code></RowMeta>
                        </>
                      ) : (
                        <RowMeta>Sem cliente informado</RowMeta>
                      )}
                    </Td>
                    <Td>
                      <Status tone={TOM_PRIORIDADE[prioridade]}>{ROTULO_PRIORIDADE[prioridade]}</Status>
                    </Td>
                    <Td>
                      <RowMeta>{registro.CRIADO_POR_NOME || <Dash />}</RowMeta>
                      <RowMeta>{fmtData(registro.CRIADO_EM)}</RowMeta>
                    </Td>
                    <Td>
                      <Badge tone={statusLinha.tom}>{statusLinha.label}</Badge>
                    </Td>
                    <Td>
                      <Status tone={situacaoLinha.tom}>{situacaoLinha.label}</Status>
                      {registro.TITULO_CARD ? <RowMeta>{registro.TITULO_CARD}</RowMeta> : null}
                    </Td>
                    <Td className="text-right">
                      {/* Cada ação tem a sua coluna fixa (olho · avaliar · cancelar): a linha que
                          não tem uma delas deixa o lugar vazio, e nada salta entre as linhas. */}
                      <span className="ml-auto grid w-fit grid-cols-[2rem_4.75rem_2rem] items-center justify-items-center gap-1">
                        <IconButton label="Ver o histórico da solicitação" onClick={() => setDetalhando(registro)}>
                          <Eye aria-hidden />
                        </IconButton>
                        {registro.STATUS === 'pendente' ? (
                          <Button
                            size="sm"
                            onClick={() => setAvaliando(registro)}
                            disabled={!podeAvaliar}
                            title={motivoAvaliar || undefined}
                          >
                            Avaliar
                          </Button>
                        ) : <span aria-hidden />}
                        {registro.STATUS === 'pendente' && propria ? (
                          <IconButton
                            // O `label` do primitivo vira `title` E `aria-label`:
                            // desabilitado, ele é que diz o porquê (C-019).
                            label={podeCancelar ? 'Cancelar a minha solicitação' : motivoCriar}
                            tone="danger"
                            onClick={() => void cancelar(registro)}
                            disabled={!podeCancelar}
                          >
                            <Ban aria-hidden />
                          </IconButton>
                        ) : <span aria-hidden />}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {visao === 'detalhe' ? (
          <Pagination
            page={pagina}
            lastPage={lastPage}
            total={total}
            unit="solicitações"
            busy={carregando}
            onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
            onNext={() => { setCarregando(true); setPagina((p) => Math.min(lastPage, p + 1)); }}
          />
        ) : null}
      </Panel>

      {mostrarRastreio ? <RastreioPainel registros={registros} /> : null}

      {novaAberta ? (
        <NovaSolicitacaoDialogo
          open={novaAberta}
          onOpenChange={setNovaAberta}
          onGravado={recarregar}
        />
      ) : null}

      {avaliando ? (
        <AvaliarDialogo
          solicitacao={avaliando}
          onFechar={() => setAvaliando(null)}
          onGravado={recarregar}
        />
      ) : null}

      {detalhando ? (
        <DetalheSolicitacaoDialogo
          solicitacao={detalhando}
          onFechar={() => setDetalhando(null)}
        />
      ) : null}
    </>
  );
}
