// C-036 / RN-014: os números do período (pela data de recebimento do empenho) —
// em aberto, contrato, custo e CMV; os prazos dos abertos (mais atrasado
// primeiro); o resumo por órgão; e a venda pública ao lado da privada, mês a
// mês, com o valor escrito em cada barra (R-116). Tudo pelo mesmo período (P-14).
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { fmtData, moeda } from '@/lib/formato';
import { somarDias } from '@/lib/data';
import { alertaDoEmpenho, cmvAcimaDaReferencia, hojeEmBrasilia } from '@/lib/empenhos';
import {
  Alert, Button, Dash, EmptyState, Field, GradeKpi, Kpi, PageHeader, Pagination, Panel, PanelHeader, SelectMenu, Status, Table, Td, Th,
  Toolbar, Tr, type SelectOption,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { GraficoBarras } from '@/pages/galderma/grafico';
import { pct } from '@/pages/empenhos/operacoes';

const POR_PAGINA = 10;
const TOM = { vencido: 'alert', critico: 'alert', atencao: 'attention' } as const;
type Linha = Record<string, unknown>;
const curto = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v)));

function inicioPadrao(hoje: string) {
  const [ano, mes] = hoje.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 - 2, 1));
  return d.toISOString().slice(0, 10);
}

export default function IndicadoresEmpenhosPage() {
  const navigate = useNavigate();
  const sessao = usePersona();
  const hoje = hojeEmBrasilia();
  const [periodo, setPeriodo] = React.useState({ dataInicio: inicioPadrao(hoje), dataFim: hoje });
  const [codfilial, setCodfilial] = React.useState('');
  const [filiais, setFiliais] = React.useState<SelectOption[]>([]);
  const [resumo, setResumo] = React.useState<Linha | null>(null);
  const [meses, setMeses] = React.useState<Linha[] | null>(null);
  const [erroVenda, setErroVenda] = React.useState(false);
  const [paginaPrazo, setPaginaPrazo] = React.useState(1);
  const [prazos, setPrazos] = React.useState<{ linhas: Linha[]; total: number } | null>(null);
  const [paginaOrgao, setPaginaOrgao] = React.useState(1);
  const [orgaos, setOrgaos] = React.useState<{ linhas: Linha[]; total: number } | null>(null);
  const recorte = React.useMemo(() => ({ ...periodo, codfilial }), [periodo, codfilial]);
  // Recorte novo volta à primeira página (ajuste durante a renderização, não em efeito).
  const [ultimoRecorte, setUltimoRecorte] = React.useState(recorte);
  if (ultimoRecorte !== recorte) {
    setUltimoRecorte(recorte);
    setPaginaOrgao(1);
    setErroVenda(false);
  }

  React.useEffect(() => {
    linhas('sgcWintFiliais').then((rows) => setFiliais([{ value: '', label: 'Todas as filiais' }, ...rows.map((r) => ({ value: String(r.CODFILIAL), label: `${r.CODFILIAL} — ${r.FILIAL}` }))])).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcEmpIndicadoresResumo', recorte).then((rows) => vivo && setResumo(rows[0] ?? {})).catch(() => vivo && setResumo({}));
    linhas('sgcWintEmpVendaMensal', recorte).then((rows) => vivo && setMeses(rows)).catch(() => {
      if (!vivo) return;
      setMeses([]);
      setErroVenda(true);
    });
    return () => {
      vivo = false;
    };
  }, [recorte]);

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcEmpPorOrgao', { ...recorte, limite: POR_PAGINA, offset: (paginaOrgao - 1) * POR_PAGINA })
      .then((rows) => vivo && setOrgaos({ linhas: rows, total: Number(rows[0]?.TOTAL_REGISTROS) || 0 }))
      .catch(() => vivo && setOrgaos({ linhas: [], total: 0 }));
    return () => {
      vivo = false;
    };
  }, [recorte, paginaOrgao]);

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcEmpPrazosListar', { hoje, codfilial, limite: POR_PAGINA, offset: (paginaPrazo - 1) * POR_PAGINA })
      .then((rows) => vivo && setPrazos({ linhas: rows, total: Number(rows[0]?.TOTAL_REGISTROS) || 0 }))
      .catch(() => vivo && setPrazos({ linhas: [], total: 0 }));
    return () => {
      vivo = false;
    };
  }, [hoje, codfilial, paginaPrazo]);

  if (!sessao) return <EmptyState title="Carregando..." />;
  if (!sessao.permissoes.verEmpenhos) {
    return (
      <>
        <PageHeader module="Empenhos" title="Indicadores" />
        <Alert tone="error">Seu perfil não tem acesso ao quadro de empenhos.</Alert>
      </>
    );
  }

  const contrato = Number(resumo?.VL_CONTRATO) || 0;
  const custo = Number(resumo?.VL_CUSTO) || 0;
  const cmv = contrato > 0 ? custo / contrato : null;
  const dados = (meses ?? []).map((m) => ({
    name: String(m.MES).split('-').reverse().join('/'),
    publico: Math.round(Number(m.VENDA_PUBLICO) || 0),
    privado: Math.round(Number(m.VENDA_PRIVADO) || 0),
  }));

  return (
    <>
      <PageHeader module="Empenhos" title="Indicadores" description="Empenhos recebidos no período, prazos dos abertos e a venda pública ao lado da privada." />
      <Panel className="mb-4">
        <Toolbar>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="De"><DatePicker value={periodo.dataInicio} max={periodo.dataFim} onChange={(v) => setPeriodo((p) => ({ ...p, dataInicio: v }))} aria-label="Início do período" /></Field>
            <Field label="Até"><DatePicker value={periodo.dataFim} min={periodo.dataInicio} onChange={(v) => setPeriodo((p) => ({ ...p, dataFim: v }))} aria-label="Fim do período" /></Field>
            <Field label="Filial"><SelectMenu label="Filial" value={codfilial} options={filiais} onChange={setCodfilial} placeholder="Todas as filiais" className="w-56" /></Field>
            <Button size="sm" onClick={() => setPeriodo({ dataInicio: somarDias(hoje, -29), dataFim: hoje })}>Últimos 30 dias</Button>
          </div>
        </Toolbar>
      </Panel>

      <GradeKpi>
        <Kpi rotulo="Em aberto" valor={resumo ? Number(resumo.QT_EM_ABERTO) || 0 : <Dash />} hint={resumo ? `${Number(resumo.QT_EMPENHOS) || 0} recebidos · ${Number(resumo.QT_CONCLUIDOS) || 0} concluídos · ${Number(resumo.QT_CANCELADOS) || 0} cancelados` : undefined} />
        <Kpi rotulo="Valor de contrato" valor={resumo ? moeda(contrato) : <Dash />} hint="sem os cancelados" />
        <Kpi rotulo="Custo" valor={resumo ? moeda(custo) : <Dash />} />
        <Kpi rotulo="CMV" valor={cmv === null ? <Dash /> : <span className={cmvAcimaDaReferencia(cmv) ? 'text-destructive' : undefined}>{pct(cmv)}</span>} hint="razão das somas · referência 70 %" />
      </GradeKpi>

      <div className="mt-4">
        {erroVenda ? <Alert tone="error">Não foi possível ler a venda do WinThor.</Alert> : null}
        <GraficoBarras
          titulo="Venda pública × privada, mês a mês"
          hint="Venda válida: órgão público (ramos 11 a 15) ao lado dos demais clientes; a venda para a própria rede fica fora."
          dados={dados}
          series={[{ chave: 'publico', rotulo: 'Pública', indice: 0 }, { chave: 'privado', rotulo: 'Privada', indice: 1 }]}
          formatar={(v) => moeda(v)}
          formatarEixo={curto}
          rotular={curto}
          largura="total"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Prazos de entrega" hint="Empenhos abertos, o mais atrasado primeiro." />
          {prazos === null ? <EmptyState title="Carregando..." /> : prazos.linhas.length === 0 ? <EmptyState title="Nenhum prazo em aberto." /> : (
            <>
              <Table>
                <thead><Tr><Th>Card</Th><Th>Limite</Th><Th>Alerta</Th><Th /></Tr></thead>
                <tbody>
                  {prazos.linhas.map((l) => {
                    const alerta = alertaDoEmpenho(l.DIAS_ENTREGA === null ? null : Number(l.DIAS_ENTREGA), l.DIAS_VIGENCIA === null ? null : Number(l.DIAS_VIGENCIA));
                    return (
                      <Tr key={String(l.ID)}>
                        <Td><span className="font-semibold text-ink">{String(l.TITULO)}</span><span className="block text-[12px] text-ink-secondary">{String(l.ORGAO)} · {String(l.FASE_NOME)}</span></Td>
                        <Td>{fmtData(String(l.DT_LIMITE))}</Td>
                        <Td>{alerta ? <Status tone={TOM[alerta.nivel]}>{alerta.texto}</Status> : <Status tone="off">no prazo</Status>}</Td>
                        <Td><Button size="sm" variant="ghost" onClick={() => navigate(`/empenhos?card=${Number(l.ID_CARD)}`)}>Abrir</Button></Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={paginaPrazo} lastPage={Math.max(1, Math.ceil(prazos.total / POR_PAGINA))} total={prazos.total} unit="empenhos" onPrevious={() => setPaginaPrazo((p) => p - 1)} onNext={() => setPaginaPrazo((p) => p + 1)} />
            </>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Por órgão" hint="Contrato, custo e CMV pela razão das somas, sem os cancelados." />
          {orgaos === null ? <EmptyState title="Carregando..." /> : orgaos.linhas.length === 0 ? <EmptyState title="Nenhum empenho no período." /> : (
            <>
              <Table>
                <thead><Tr><Th>Órgão</Th><Th numeric>Empenhos</Th><Th numeric>Contrato</Th><Th numeric>CMV</Th></Tr></thead>
                <tbody>
                  {orgaos.linhas.map((o) => {
                    const v = Number(o.VL_CONTRATO) || 0;
                    const c = v > 0 ? (Number(o.VL_CUSTO) || 0) / v : null;
                    return (
                      <Tr key={String(o.ORGAO)}>
                        <Td>{String(o.ORGAO)}</Td>
                        <Td numeric>{Number(o.QT_EMPENHOS) || 0}</Td>
                        <Td numeric>{moeda(v)}</Td>
                        <Td numeric>{c === null ? <Dash /> : <Status tone={cmvAcimaDaReferencia(c) ? 'alert' : 'live'}>{pct(c)}</Status>}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={paginaOrgao} lastPage={Math.max(1, Math.ceil(orgaos.total / POR_PAGINA))} total={orgaos.total} unit="órgãos" onPrevious={() => setPaginaOrgao((p) => p - 1)} onNext={() => setPaginaOrgao((p) => p + 1)} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
