// C-004..C-006: os pregões, paginados e filtrados por edital ou órgão; escolher
// um mostra os empenhos dele e o consolidado (quantidade, contrato, custo e CMV
// pela razão das somas, sem os cancelados no valor — RN-014).
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { fmtData, moeda } from '@/lib/formato';
import { diasAte, hojeEmBrasilia, nivelDoPrazo } from '@/lib/empenhos';
import {
  Alert, Button, Dash, EmptyState, GradeKpi, Kpi, PageHeader, Pagination, Panel, PanelHeader, SearchInput, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import DialogoPregao from '@/pages/empenhos/DialogoPregao';
import { TabelaEmpenhos } from '@/pages/empenhos/AbaPregao';
import { pct } from '@/pages/empenhos/operacoes';

const POR_PAGINA = 20;
const TOM = { vencido: 'alert', critico: 'alert', atencao: 'attention' } as const;
type Linha = Record<string, unknown>;

function usePaginado(chave: 'sgcEmpPregoesListar' | 'sgcEmpPregaoEmpenhos', filtros: Record<string, unknown> | null, porPagina: number, versao = 0) {
  const [pagina, setPagina] = React.useState(1);
  const [dados, setDados] = React.useState<{ linhas: Linha[]; total: number } | null>(null);
  const chaveFiltros = JSON.stringify(filtros);
  const [ultimos, setUltimos] = React.useState(chaveFiltros);
  if (ultimos !== chaveFiltros) {
    setUltimos(chaveFiltros);
    setPagina(1);
  }
  React.useEffect(() => {
    if (!filtros) return undefined;
    let vivo = true;
    linhas(chave, { ...filtros, limite: porPagina, offset: (pagina - 1) * porPagina })
      .then((rows) => vivo && setDados({ linhas: rows, total: Number(rows[0]?.TOTAL_REGISTROS) || 0 }))
      .catch(() => vivo && setDados({ linhas: [], total: 0 }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chaveFiltros` é o conteúdo de `filtros`
  }, [chave, chaveFiltros, pagina, porPagina, versao]);
  return { pagina, setPagina, dados, ultima: Math.max(1, Math.ceil((dados?.total ?? 0) / porPagina)) };
}

export default function PregoesPage() {
  const navigate = useNavigate();
  const sessao = usePersona();
  const [busca, setBusca] = React.useState('');
  const [filtro, setFiltro] = React.useState('');
  const [escolhido, setEscolhido] = React.useState<Linha | null>(null);
  const [novo, setNovo] = React.useState(false);
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    const espera = window.setTimeout(() => setFiltro(busca.trim()), 350);
    return () => window.clearTimeout(espera);
  }, [busca]);

  const lista = usePaginado('sgcEmpPregoesListar', { busca: filtro }, POR_PAGINA, versao);
  const empenhos = usePaginado('sgcEmpPregaoEmpenhos', escolhido ? { idPregao: Number(escolhido.ID) } : null, POR_PAGINA);

  if (!sessao) return <EmptyState title="Carregando..." />;
  if (!sessao.permissoes.verEmpenhos) {
    return (
      <>
        <PageHeader module="Empenhos" title="Pregões" />
        <Alert tone="error">Seu perfil não tem acesso ao quadro de empenhos.</Alert>
      </>
    );
  }

  const hoje = hojeEmBrasilia();
  const valor = Number(escolhido?.VL_TOTAL) || 0;
  const custo = Number(escolhido?.VL_CUSTO) || 0;

  return (
    <>
      <PageHeader
        module="Empenhos"
        title="Pregões"
        description="Os editais dos órgãos e o histórico de empenhos de cada um."
        actions={
          <Button variant="primary" disabled={!sessao.permissoes.operarEmpenhos} title={sessao.permissoes.operarEmpenhos ? undefined : 'Seu perfil não cadastra pregão.'} onClick={() => setNovo(true)}>
            Novo pregão
          </Button>
        }
      />
      <Panel>
        <Toolbar><SearchInput placeholder="Edital ou órgão" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pregão" /></Toolbar>
        {lista.dados === null ? <EmptyState title="Carregando os pregões..." /> : lista.dados.linhas.length === 0 ? (
          <EmptyState title="Nenhum pregão encontrado." hint={filtro ? 'Tente outro trecho do edital ou do órgão.' : 'Cadastre o primeiro pelo botão Novo pregão.'} />
        ) : (
          <>
            <Table>
              <thead><Tr><Th>Edital</Th><Th>Órgão</Th><Th>Vigência</Th><Th numeric>Empenhos</Th><Th numeric>Contrato</Th><Th numeric>CMV</Th><Th /></Tr></thead>
              <tbody>
                {lista.dados.linhas.map((p) => {
                  const vig = nivelDoPrazo(diasAte(hoje, String(p.DT_VIGENCIA_FIM ?? '')), 'vigencia');
                  const v = Number(p.VL_TOTAL) || 0;
                  return (
                    <Tr key={String(p.ID)}>
                      <Td><span className="font-semibold text-ink">{String(p.CODIGO_EDITAL)}</span></Td>
                      <Td>{String(p.ORGAO)}</Td>
                      <Td>{p.DT_VIGENCIA_FIM ? fmtData(String(p.DT_VIGENCIA_FIM)) : <Dash />}{vig ? <span className="block"><Status tone={TOM[vig.nivel]}>{vig.texto}</Status></span> : null}</Td>
                      <Td numeric>{Number(p.QT_EMPENHOS) || 0}</Td>
                      <Td numeric>{moeda(v)}</Td>
                      <Td numeric>{v > 0 ? pct((Number(p.VL_CUSTO) || 0) / v) : <Dash />}</Td>
                      <Td><Button size="sm" onClick={() => setEscolhido(p)} aria-pressed={Number(escolhido?.ID) === Number(p.ID)}>Ver empenhos</Button></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={lista.pagina} lastPage={lista.ultima} total={lista.dados.total} unit="pregões" onPrevious={() => lista.setPagina((x) => x - 1)} onNext={() => lista.setPagina((x) => x + 1)} />
          </>
        )}
      </Panel>

      {escolhido ? (
        <div className="mt-6 flex flex-col gap-4">
          <GradeKpi>
            <Kpi rotulo="Empenhos" valor={Number(escolhido.QT_EMPENHOS) || 0} />
            <Kpi rotulo="Valor de contrato" valor={moeda(valor)} hint="sem os cancelados" />
            <Kpi rotulo="Custo" valor={moeda(custo)} />
            <Kpi rotulo="CMV" valor={valor > 0 ? pct(custo / valor) : <Dash />} hint="razão das somas" />
          </GradeKpi>
          <Panel>
            <PanelHeader title={`Empenhos de ${String(escolhido.CODIGO_EDITAL)}`} hint={String(escolhido.ORGAO)}>
              <Button size="sm" onClick={() => navigate('/empenhos')}>Abrir o quadro</Button>
            </PanelHeader>
            {empenhos.dados === null ? <EmptyState title="Carregando..." /> : empenhos.dados.linhas.length === 0 ? (
              <EmptyState title="Nenhum empenho neste pregão." />
            ) : (
              <>
                <TabelaEmpenhos empenhos={empenhos.dados.linhas} />
                <Pagination page={empenhos.pagina} lastPage={empenhos.ultima} total={empenhos.dados.total} unit="empenhos" onPrevious={() => empenhos.setPagina((x) => x - 1)} onNext={() => empenhos.setPagina((x) => x + 1)} />
              </>
            )}
          </Panel>
        </div>
      ) : null}

      <DialogoPregao aberto={novo} onFechar={() => setNovo(false)} onCriado={() => setVersao((v) => v + 1)} />
    </>
  );
}
