// Agenda de análises (spec 004): lista paginada com filtros, diálogo de
// novo/editar, diálogo de processamento manual e confirmação de
// cancelamento. Ver docs/specs/004-agenda-de-analises/plan.md §Superfície.
import * as React from 'react';
import { Pencil, X as IconeCancelar } from 'lucide-react';

import { linhas, linha, acao } from '@/lib/mitra-api';
import { fmtData, hojeIso } from '@/lib/formato';
import { situacao, type SituacaoAgenda } from '@/lib/agenda';
// Permissões da agenda: agendar/cancelarAgendamento da matriz única (spec 002, B-02).
import { permissoesDe } from '@/lib/permissoes';
import { DatePicker } from '@/components/DatePicker';
import {
  AlternaOpcoes, PageHeader, Panel, Toolbar, FilterChip, SelectMenu, Field, Table, Th, Td, Tr,
  RowTitle, RowMeta, Status, Code, Dash, Alert, EmptyState, Pagination,
  Button, IconButton, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogBody, DialogFooter, MetaDot, Stat,
} from '@/components/page';
import { AgendaDialogo } from './AgendaDialogo';
import { AgendaCalendario } from './AgendaCalendario';
import type { LinhaDoCalendario } from './AgendaCalendario';
import { ProcessarDialogo } from './ProcessarDialogo';

const POR_PAGINA = 50;

const VISOES: { value: 'lista' | 'calendario'; label: string }[] = [
  { value: 'lista', label: 'Lista' }, { value: 'calendario', label: 'Calendário' },
];
/** Teto da carga do calendário: um mês de agendamentos, recorrentes antigos inclusos. */
const LIMITE_CALENDARIO = 500;

const SITUACAO_OPCOES = [
  { value: '', label: 'Todas as situações' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'processado', label: 'Processado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const SITUACAO_TOM: Record<SituacaoAgenda, 'off' | 'alert' | 'live'> = {
  pendente: 'off', atrasado: 'alert', processado: 'live', cancelado: 'off',
};
const SITUACAO_TEXTO: Record<SituacaoAgenda, string> = {
  pendente: 'Pendente', atrasado: 'Atrasado', processado: 'Processado', cancelado: 'Cancelado',
};

interface LinhaAgenda {
  ID: number; CODFORNEC: number; FORNECEDOR: string; CODFILIAL: string; FILIAL: string;
  DATA_ANALISE: string; PERIODO_INICIO: string; PERIODO_FIM: string; RECORRENCIA: string;
  ATIVO: number; PROCESSADO_EM: string | null; ID_CARD_GERADO: number | null;
  DATA_ENVIO_REAL: string | null; DATA_PLANEJADA_ORIGINAL: string | null;
  PARTICIPANTES_NOMES: string | null;
}

export default function AgendaPage() {
  const [persona, setPersona] = React.useState('');
  const [acesso, setAcesso] = React.useState('');
  const permissoes = permissoesDe(
    (persona || undefined) as Parameters<typeof permissoesDe>[0],
    (acesso || undefined) as Parameters<typeof permissoesDe>[1],
  );

  const [fornecedores, setFornecedores] = React.useState<{ value: string; label: string }[]>([]);
  const [fornecedor, setFornecedor] = React.useState('0');
  const [filial, setFilial] = React.useState('');
  const [dataInicio, setDataInicio] = React.useState('');
  const [dataFim, setDataFim] = React.useState('');
  const [situacaoFiltro, setSituacaoFiltro] = React.useState('');
  const [pagina, setPagina] = React.useState(1);

  const [linhasAgenda, setLinhasAgenda] = React.useState<LinhaAgenda[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');

  // R-121: visão de calendário. O mês tem a sua própria carga (um mês inteiro,
  // sem paginação), recorrentes que começaram antes inclusos — a projeção das
  // ocorrências dentro do mês é regra pura (`agruparPorDia`).
  const [visao, setVisao] = React.useState<'lista' | 'calendario'>('lista');
  const [mes, setMes] = React.useState(() => hojeIso().slice(0, 7));
  const [linhasMes, setLinhasMes] = React.useState<LinhaDoCalendario[]>([]);
  const [carregandoMes, setCarregandoMes] = React.useState(false);
  const [versaoMes, setVersaoMes] = React.useState(0);

  const [dialogoAberto, setDialogoAberto] = React.useState(false);
  const [idEditando, setIdEditando] = React.useState<number | null>(null);
  const [processarAberto, setProcessarAberto] = React.useState(false);
  const [cancelando, setCancelando] = React.useState<LinhaAgenda | null>(null);
  const [alerta, setAlerta] = React.useState<{ tone: 'success' | 'error'; texto: string } | null>(null);

  // ponytail: setCarregando(true) só no estado inicial (useState) — repô-lo a
  // cada refiltro exigiria disparar o "true" no handler de cada filtro (fora
  // do efeito, o único jeito de não acionar o lint set-state-in-effect); o
  // spinner de recarga fica para quando alguém sentir falta dele.
  const carregar = React.useCallback(() => {
    const filtros = {
      codfornec: Number(fornecedor) || 0, codfilial: filial, dataInicio, dataFim,
      situacao: situacaoFiltro, hoje: hojeIso(), limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA,
    };
    Promise.all([
      linhas('sgcAgendaListar', filtros),
      linha('sgcAgendaListarTotal', filtros),
      linha('sgcPersonaAtual'),
    ])
      .then(([linhasResp, totalResp, personaResp]) => {
        setLinhasAgenda(linhasResp as LinhaAgenda[]);
        setTotal(Number(totalResp?.TOTAL ?? 0));
        setPersona(String(personaResp?.PERSONA ?? ''));
        setAcesso(String(personaResp?.ACCESS_LEVEL ?? ''));
        setErro('');
      })
      .catch(() => setErro('Não foi possível carregar a agenda agora.'))
      .finally(() => setCarregando(false));
  }, [fornecedor, filial, dataInicio, dataFim, situacaoFiltro, pagina]);

  React.useEffect(() => { carregar(); }, [carregar]);

  React.useEffect(() => {
    if (visao !== 'calendario') return;
    let vivo = true;
    const [ano, numeroMes] = mes.split('-').map(Number);
    const fimDoMes = `${ano}-${String(numeroMes).padStart(2, '0')}-${String(new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate()).padStart(2, '0')}`;
    linhas('sgcAgendaListar', {
      codfornec: Number(fornecedor) || 0, codfilial: filial, dataInicio: '', dataFim: fimDoMes,
      situacao: situacaoFiltro, hoje: hojeIso(), limite: LIMITE_CALENDARIO, offset: 0,
    })
      .then((rows) => { if (vivo) setLinhasMes(rows as unknown as LinhaDoCalendario[]); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar o calendário agora.'); })
      .finally(() => { if (vivo) setCarregandoMes(false); });
    return () => { vivo = false; };
  }, [visao, mes, fornecedor, filial, situacaoFiltro, versaoMes]);

  // Fornecedores para o filtro: ativo:0 (RN-015 — agendamento antigo de
  // fornecedor inativo continua na lista, então o filtro também os oferece;
  // é o diálogo de novo/editar que restringe a ativo:1).
  React.useEffect(() => {
    let vivo = true;
    linhas('sgcFornecedorListar', { ativo: 0, busca: '', limite: 200, offset: 0 })
      .then((rows) => {
        if (!vivo) return;
        setFornecedores(rows.map((r) => ({ value: String(r.CODFORNEC), label: String(r.FORNECEDOR) })));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Sem uma SF própria de "todas as filiais" no contrato da 004, as opções da
  // barra derivam das filiais que já apareceram na página carregada.
  const filiaisConhecidas = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const l of linhasAgenda) if (l.CODFILIAL) mapa.set(l.CODFILIAL, l.FILIAL);
    return Array.from(mapa, ([value, label]) => ({ value, label }));
  }, [linhasAgenda]);

  const lastPage = Math.max(1, Math.ceil(total / POR_PAGINA));
  const atrasados = linhasAgenda.filter((l) => situacao(l, hojeIso()) === 'atrasado').length;
  const filtroAtivo = fornecedor !== '0' || filial !== '' || dataInicio !== '' || dataFim !== '' || situacaoFiltro !== '';

  function abrirNovo() { setIdEditando(null); setDialogoAberto(true); }
  function abrirEditar(id: number) { setIdEditando(id); setDialogoAberto(true); }

  function limparFiltros() {
    setFornecedor('0'); setFilial(''); setDataInicio(''); setDataFim(''); setSituacaoFiltro(''); setPagina(1);
  }

  async function confirmarCancelamento() {
    if (!cancelando) return;
    try {
      await acao('sgcEscAgendaCancelar', { id: cancelando.ID, canceladoEm: new Date().toISOString().slice(0, 19) });
      setAlerta({ tone: 'success', texto: `Agendamento de ${cancelando.FORNECEDOR} cancelado.` });
      setCancelando(null);
      carregar();
      setVersaoMes((n) => n + 1);
    } catch {
      setAlerta({ tone: 'error', texto: 'Não foi possível cancelar o agendamento.' });
    }
  }

  return (
    <>
      <PageHeader
        module="Compras"
        title="Agenda de análises"
        meta={(
          <>
            <Stat>{total}</Stat> agendamentos<MetaDot /><Stat>{atrasados}</Stat> atrasados nesta página
          </>
        )}
        actions={(
          <>
            {permissoes.agendar ? <Button variant="secondary" onClick={() => setProcessarAberto(true)}>Processar agenda</Button> : null}
            {permissoes.agendar ? <Button variant="primary" onClick={abrirNovo}>Novo agendamento</Button> : null}
          </>
        )}
      />

      {alerta ? <Alert tone={alerta.tone} className="mb-4">{alerta.texto}</Alert> : null}
      {erro ? <Alert tone="error" className="mb-4">{erro}</Alert> : null}

      <Panel>
        <Toolbar>
          <Field label="Visão">
            <AlternaOpcoes
              rotulo="Visão da agenda"
              opcoes={VISOES}
              valor={visao}
              onValor={(v) => { setVisao(v); if (v === 'calendario') setCarregandoMes(true); }}
            />
          </Field>
          <Field label="Fornecedor">
            <SelectMenu
              label="Fornecedor" value={fornecedor} onChange={(v) => { setFornecedor(v); setPagina(1); }}
              options={[{ value: '0', label: 'Todos os fornecedores' }, ...fornecedores]}
            />
          </Field>
          <Field label="Filial">
            <SelectMenu
              label="Filial" value={filial} onChange={(v) => { setFilial(v); setPagina(1); }}
              options={[{ value: '', label: 'Todas as filiais' }, ...filiaisConhecidas]}
            />
          </Field>
          <Field label="De">
            <DatePicker value={dataInicio} onChange={(v) => { setDataInicio(v); setPagina(1); }} aria-label="Data de" />
          </Field>
          <Field label="Até">
            <DatePicker value={dataFim} onChange={(v) => { setDataFim(v); setPagina(1); }} aria-label="Data até" />
          </Field>
          <Field label="Situação">
            <SelectMenu
              label="Situação" value={situacaoFiltro} onChange={(v) => { setSituacaoFiltro(v); setPagina(1); }}
              options={SITUACAO_OPCOES}
            />
          </Field>
        </Toolbar>

        {filtroAtivo ? (
          <div className="flex flex-wrap gap-2 px-4 py-2">
            {fornecedor !== '0' ? <FilterChip label="Fornecedor" value={fornecedores.find((f) => f.value === fornecedor)?.label ?? fornecedor} onClear={() => setFornecedor('0')} /> : null}
            {filial ? <FilterChip label="Filial" value={filiaisConhecidas.find((f) => f.value === filial)?.label ?? filial} onClear={() => setFilial('')} /> : null}
            {dataInicio ? <FilterChip label="De" value={fmtData(dataInicio)} onClear={() => setDataInicio('')} /> : null}
            {dataFim ? <FilterChip label="Até" value={fmtData(dataFim)} onClear={() => setDataFim('')} /> : null}
            {situacaoFiltro ? <FilterChip label="Situação" value={SITUACAO_TEXTO[situacaoFiltro as SituacaoAgenda]} onClear={() => setSituacaoFiltro('')} /> : null}
            <Button size="sm" variant="ghost" onClick={limparFiltros}>Limpar tudo</Button>
          </div>
        ) : null}

        {visao === 'calendario' ? (
          <AgendaCalendario
            mes={mes}
            onMes={(m) => { setMes(m); setCarregandoMes(true); }}
            linhas={linhasMes}
            carregando={carregandoMes}
            podeEditar={permissoes.agendar}
            onEditar={abrirEditar}
          />
        ) : !carregando && linhasAgenda.length === 0 ? (
          <EmptyState
            title="Nenhum agendamento"
            hint="Ajuste os filtros ou crie o primeiro agendamento de análise."
            action={permissoes.agendar ? <Button variant="primary" onClick={abrirNovo}>Novo agendamento</Button> : undefined}
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Data da análise</Th>
                <Th>Situação</Th>
                <Th>Fornecedor</Th>
                <Th>Período</Th>
                <Th>Recorrência</Th>
                <Th>Participantes</Th>
                <Th>Envio</Th>
                <Th>Pedido</Th>
                <Th>Ações</Th>
              </Tr>
            </thead>
            <tbody>
              {linhasAgenda.map((l) => {
                const sit = situacao(l, hojeIso());
                const podeEditar = permissoes.agendar && sit === 'pendente' || (permissoes.agendar && sit === 'atrasado');
                const podeCancelar = permissoes.cancelarAgendamento && (sit === 'pendente' || sit === 'atrasado');
                return (
                  <Tr key={l.ID}>
                    <Td><RowTitle>{fmtData(l.DATA_ANALISE)}</RowTitle></Td>
                    <Td><Status tone={SITUACAO_TOM[sit]}>{SITUACAO_TEXTO[sit]}</Status></Td>
                    <Td>
                      <RowTitle>{l.FORNECEDOR}</RowTitle>
                      <RowMeta>{l.FILIAL}</RowMeta>
                    </Td>
                    <Td>{fmtData(l.PERIODO_INICIO)} – {fmtData(l.PERIODO_FIM)}</Td>
                    <Td>{l.RECORRENCIA && l.RECORRENCIA !== 'nenhuma' ? l.RECORRENCIA : <Dash />}</Td>
                    <Td>{l.PARTICIPANTES_NOMES || <Dash />}</Td>
                    <Td>
                      {l.DATA_ENVIO_REAL ? (
                        <>
                          {fmtData(l.DATA_ENVIO_REAL)}
                          {l.DATA_PLANEJADA_ORIGINAL && l.DATA_PLANEJADA_ORIGINAL !== l.DATA_ENVIO_REAL ? (
                            <RowMeta>{`planejado ${fmtData(l.DATA_PLANEJADA_ORIGINAL)}`}</RowMeta>
                          ) : null}
                        </>
                      ) : <Dash />}
                    </Td>
                    <Td>{l.ID_CARD_GERADO ? <Code prefix="#">{l.ID_CARD_GERADO}</Code> : <Dash />}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {podeEditar ? <IconButton label="Editar agendamento" onClick={() => abrirEditar(l.ID)}><Pencil /></IconButton> : null}
                        {podeCancelar ? <IconButton label="Cancelar agendamento" tone="danger" onClick={() => setCancelando(l)}><IconeCancelar /></IconButton> : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {visao === 'lista' ? (
          <Pagination
            page={pagina} lastPage={lastPage} total={total} unit="agendamentos" busy={carregando}
            onPrevious={() => setPagina((p) => Math.max(1, p - 1))}
            onNext={() => setPagina((p) => Math.min(lastPage, p + 1))}
          />
        ) : null}
      </Panel>

      <AgendaDialogo
        open={dialogoAberto}
        onOpenChange={setDialogoAberto}
        idAgenda={idEditando}
        onSalvo={() => { setDialogoAberto(false); carregar(); setVersaoMes((n) => n + 1); }}
      />
      <ProcessarDialogo
        open={processarAberto}
        onOpenChange={setProcessarAberto}
        onProcessado={(mensagem) => { setAlerta({ tone: 'success', texto: mensagem }); carregar(); }}
      />

      <Dialog open={!!cancelando} onOpenChange={(v) => { if (!v) setCancelando(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar agendamento</DialogTitle></DialogHeader>
          <DialogBody>
            {cancelando ? (
              <p className="text-[13px] text-ink-secondary">
                {cancelando.FORNECEDOR} · {cancelando.FILIAL} · {fmtData(cancelando.DATA_ANALISE)}. O registro continua na lista, marcado como cancelado.
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setCancelando(null)}>Voltar</Button>
            <Button variant="danger" onClick={confirmarCancelamento}>Cancelar agendamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
