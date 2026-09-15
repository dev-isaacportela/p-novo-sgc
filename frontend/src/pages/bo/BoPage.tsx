// Spec 007 (produtos em B.O.) — painel consolidado `/bo`: uma linha por
// produto em B.O., de todos os pedidos, sem recorte por persona (D-012,
// RN-010) — visível a todas as personas, inclusive comercial (O2-06).
// Ação de marcar/liberar é do card aberto (aba B.O.); este painel é
// predominantemente leitura (RF-015..RF-017/RF-022).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { linhas, linha, comPadrao } from '@/lib/mitra-api';
import {
  PageHeader, Panel, Toolbar, SearchInput, SelectMenu, FilterChip, Table, Th, Td, Tr,
  RowTitle, RowMeta, Code, Status, Dash, TextLink, Pagination, EmptyState, Button,
} from '@/components/page';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { moeda, fmtData, hojeIso } from '@/lib/formato';
import { rotuloSituacaoPrevisao, COLUNAS_CSV_BO, linhasCsvBo, type SituacaoPrevisao } from '@/lib/bo';

const LIMITE = 20;

interface PainelLinha {
  ID: number; ID_CARD: number; TITULO: string;
  CODFORNEC: number; FORNECEDOR: string; CODFILIAL: string; FILIAL: string;
  CODPROD: number; DESCRICAO: string; UNIDADE: string;
  QT_PENDENTE: number; VL_PENDENTE: number;
  CLIENTES_IMPACTADOS: number; QT_VENDIDA_60D: number; OBSERVACAO: string;
  STATUS: 'aberto' | 'liberado' | 'cancelado';
  DT_PREVISAO_BO: string; SITUACAO_PREVISAO: SituacaoPrevisao;
  CARTA_FALTA_ENDERECO: string; CRIADO_EM: string;
}

const OPCOES_SITUACAO = [
  { value: '', label: 'Qualquer previsão' },
  { value: 'sem_previsao', label: 'Sem previsão' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'hoje', label: 'Vence hoje' },
  { value: 'no_prazo', label: 'No prazo' },
];
const OPCOES_STATUS = [
  { value: 'aberto', label: 'Em aberto' },
  { value: '', label: 'Todos, inclusive liberados' },
];

const diasEntre = (aIso: string, bIso: string) => Math.round(
  (Date.UTC(...(bIso.split('-').map(Number) as [number, number, number])) - Date.UTC(...(aIso.split('-').map(Number) as [number, number, number]))) / 86400000,
);
const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const SITUACAO_TONE = { sem_previsao: 'alert', vencida: 'alert', hoje: 'attention', no_prazo: 'live' } as const;
const STATUS_TONE = { aberto: 'attention', liberado: 'live', cancelado: 'off' } as const;

export default function BoPage() {
  const navigate = useNavigate();
  const hoje = hojeIso();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [status, setStatus] = useState('aberto');
  const [pagina, setPagina] = useState(1);

  const [linhasPainel, setLinhasPainel] = useState<PainelLinha[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const filtros = comPadrao(
      { busca, situacao, status, hoje, limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) },
      { busca: '', situacao: '', status: 'aberto', hoje, limite: String(LIMITE), offset: '0' },
    );
    Promise.all([linhas('sgcBoPainel', filtros), linha('sgcBoPainelTotal', filtros)])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setLinhasPainel(rows as unknown as PainelLinha[]);
        setTotal(Number(totalRow?.TOTAL ?? 0));
      })
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [busca, situacao, status, hoje, pagina]);

  const lastPage = Math.max(1, Math.ceil(total / LIMITE));
  const situacaoSelecionada = OPCOES_SITUACAO.find((o) => o.value === situacao && o.value !== '');
  const statusSelecionado = status === '' ? OPCOES_STATUS.find((o) => o.value === '') : undefined;

  // A-15/R-037: exporta a página atual do painel (D-012 — zero execução nova).
  function exportar() {
    const nome = `produtos-em-bo-${hoje}.csv`;
    baixarCsv(nome, textoCsv(COLUNAS_CSV_BO, linhasCsvBo(linhasPainel)));
  }

  return (
    <>
      <PageHeader
        module="Compras"
        title="Produtos em B.O."
        description="Itens que a indústria não confirmou, previsão de liberação e clientes impactados — de todos os pedidos."
        meta={<span><strong>{total.toLocaleString('pt-BR')}</strong> {status === 'aberto' ? 'em aberto' : 'no total'}</span>}
        actions={
          <Button
            onClick={exportar}
            disabled={carregando || linhasPainel.length === 0}
            title={linhasPainel.length === 0 ? 'Nada para exportar neste filtro.' : undefined}
          >
            <Download aria-hidden />
            Exportar CSV
          </Button>
        }
      />

      <Panel>
        <Toolbar>
          <SearchInput
            placeholder="Buscar por produto, pedido ou fornecedor"
            value={busca}
            onChange={(e) => { setCarregando(true); setPagina(1); setBusca(e.target.value); }}
            className="min-w-56 flex-1"
          />
          <div className="w-52">
            <SelectMenu label="Situação da previsão" placeholder="Qualquer previsão" value={situacao} onChange={(v) => { setCarregando(true); setPagina(1); setSituacao(v); }} options={OPCOES_SITUACAO} />
          </div>
          <div className="w-56">
            <SelectMenu label="Status" value={status} onChange={(v) => { setCarregando(true); setPagina(1); setStatus(v); }} options={OPCOES_STATUS} />
          </div>
        </Toolbar>

        {situacaoSelecionada || statusSelecionado ? (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {situacaoSelecionada ? (
              <FilterChip label="Previsão" value={situacaoSelecionada.label} onClear={() => { setCarregando(true); setPagina(1); setSituacao(''); }} />
            ) : null}
            {statusSelecionado ? (
              <FilterChip label="Status" value={statusSelecionado.label} onClear={() => { setCarregando(true); setPagina(1); setStatus('aberto'); }} />
            ) : null}
          </div>
        ) : null}

        {!carregando && linhasPainel.length === 0 ? (
          <EmptyState title="Nenhum produto em B.O." hint="Ajuste a busca ou os filtros — ou não há pendência nenhuma agora." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Pedido</Th>
                <Th numeric>Pendente</Th>
                <Th numeric>Valor</Th>
                <Th numeric>Clientes</Th>
                <Th>Previsão</Th>
                <Th>Status</Th>
                <Th>Carta de falta</Th>
              </tr>
            </thead>
            <tbody>
              {linhasPainel.map((l) => {
                const diasPrevisao = l.DT_PREVISAO_BO ? Math.abs(diasEntre(l.DT_PREVISAO_BO, hoje)) : 0;
                return (
                  <Tr key={l.ID}>
                    <Td>
                      <RowTitle>{l.DESCRICAO}</RowTitle>
                      <RowMeta><Code prefix="cód.">{l.CODPROD}</Code> · {l.UNIDADE || '—'}</RowMeta>
                    </Td>
                    <Td>
                      <TextLink onClick={() => navigate(`/quadro?card=${l.ID_CARD}`)}>{l.TITULO}</TextLink>
                      <RowMeta>{l.FORNECEDOR} · {l.FILIAL}</RowMeta>
                    </Td>
                    <Td numeric>{quantidade(l.QT_PENDENTE)}</Td>
                    <Td numeric>{moeda(l.VL_PENDENTE)}</Td>
                    <Td numeric>{l.CLIENTES_IMPACTADOS > 0 ? l.CLIENTES_IMPACTADOS : <Dash />}</Td>
                    <Td>
                      <Status tone={SITUACAO_TONE[l.SITUACAO_PREVISAO]}>{rotuloSituacaoPrevisao(l.SITUACAO_PREVISAO, diasPrevisao)}</Status>
                      {l.DT_PREVISAO_BO ? <RowMeta>{fmtData(l.DT_PREVISAO_BO)}</RowMeta> : null}
                    </Td>
                    <Td>
                      <Status tone={STATUS_TONE[l.STATUS]}>{l.STATUS === 'aberto' ? 'Em aberto' : l.STATUS === 'liberado' ? 'Liberado' : 'Cancelado'}</Status>
                    </Td>
                    <Td>
                      {l.CARTA_FALTA_ENDERECO ? (
                        <TextLink onClick={() => window.open(l.CARTA_FALTA_ENDERECO, '_blank', 'noopener')} title={l.CARTA_FALTA_ENDERECO}>Ver carta</TextLink>
                      ) : <Dash />}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={pagina}
          lastPage={lastPage}
          total={total}
          unit="itens em B.O."
          busy={carregando}
          onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
          onNext={() => { setCarregando(true); setPagina((p) => Math.min(lastPage, p + 1)); }}
        />
      </Panel>
    </>
  );
}
