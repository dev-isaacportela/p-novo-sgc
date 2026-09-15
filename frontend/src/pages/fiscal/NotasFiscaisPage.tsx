// Fila de sugestões de nota fiscal (spec 005, RF-024): o que a rotina diária
// encontrou no WinThor, esperando alguém validar ou recusar.
//
// O total vem SEMPRE de `sgcNfSugestoesListarTotal` — nunca da contagem da
// página, que só tem a fatia atual (R-045).
//
// R-038: quem não opera nota fiscal vê a fila com os botões DESABILITADOS, não
// escondidos — esconder faz a pessoa achar que a tela está quebrada.

import * as React from 'react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Code, EmptyState, FilterChip, IconButton, PageHeader, Pagination,
  Panel, SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr, RowMeta, RowTitle,
} from '@/components/page';
import { acao, comPadrao, linha, linhas } from '@/lib/mitra-api';
import { fmtData, fmtDataHora, hojeIso, moeda } from '@/lib/formato';
import { usePersona } from '@/lib/persona';

const LIMITE = 20;

interface SugestaoLinha {
  ID: number; ID_CARD: number; CARD_TITULO: string; FASE: string;
  FORNECEDOR: string; FILIAL: string; VL_PEDIDO: number;
  NUMNOTA: number; SERIE: string; CODFORNEC: number; CODFILIAL: string;
  DT_EMISSAO: string; DT_ENTRADA: string; VL_TOTAL: number;
  ORIGEM: string; SCORE: number; STATUS: string; MOTIVO: string;
  NUMPED_WINTHOR: string; DECIDIDO_NOME: string; DECIDIDO_EM: string; CRIADO_EM: string;
}

const OPCOES_STATUS = [
  { value: '', label: 'Todas as situações' },
  { value: 'sugerida', label: 'Aguardando decisão' },
  { value: 'validada', label: 'Validadas' },
  { value: 'recusada', label: 'Recusadas' },
];

const ROTULO_STATUS: Record<string, string> = {
  sugerida: 'Aguardando', validada: 'Validada', recusada: 'Recusada', ignorada: 'Ignorada',
};

const TOM_STATUS: Record<string, 'live' | 'attention' | 'alert' | 'off'> = {
  sugerida: 'attention', validada: 'live', recusada: 'alert', ignorada: 'off',
};

const agora = () => new Date().toISOString().slice(0, 19);

export default function NotasFiscaisPage() {
  const navigate = useNavigate();
  const sessao = usePersona();
  const [busca, setBusca] = React.useState('');
  const [status, setStatus] = React.useState('sugerida');
  const [codfornec, setCodfornec] = React.useState('');
  const [pagina, setPagina] = React.useState(1);
  const [versao, setVersao] = React.useState(0);

  const [registros, setRegistros] = React.useState<SugestaoLinha[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    const filtros = comPadrao(
      { status, codfornec, busca, hoje: hojeIso(), limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) },
      { status: '', codfornec: '0', busca: '', hoje: hojeIso(), limite: String(LIMITE), offset: '0' },
    );
    Promise.all([
      linhas('sgcNfSugestoesListar', filtros),
      linha('sgcNfSugestoesListarTotal', { status: filtros.status, codfornec: filtros.codfornec, busca: filtros.busca }),
    ])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setRegistros(rows as unknown as SugestaoLinha[]);
        setTotal(Number(totalRow?.TOTAL ?? 0));
      })
      .catch((falha) => { if (vivo) setErro(falha instanceof Error ? falha.message : 'Falha ao carregar a fila.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [busca, status, codfornec, pagina, versao]);

  const podeOperar = !!sessao?.permissoes.operarNf;
  const motivo = sessao && !podeOperar ? 'O seu perfil vê a fila, mas não valida nem recusa nota fiscal.' : '';
  const lastPage = Math.max(1, Math.ceil(total / LIMITE));

  /** Fornecedores da página atual — o filtro é sobre o que está à vista. */
  const fornecedores = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const registro of registros) vistos.set(String(registro.CODFORNEC), registro.FORNECEDOR);
    return [...vistos].map(([value, label]) => ({ value, label }));
  }, [registros]);

  function refiltrar(mudar: () => void) {
    setCarregando(true);
    setPagina(1);
    mudar();
  }

  async function decidir(sugestao: SugestaoLinha, decisao: 'validada' | 'recusada') {
    setOcupado(true);
    setErro('');
    try {
      if (decisao === 'validada') {
        const resposta = await acao('sgcNfVincular', {
          cardId: sugestao.ID_CARD, idSugestao: sugestao.ID, numnota: sugestao.NUMNOTA,
          serie: sugestao.SERIE, codfornec: sugestao.CODFORNEC, codfilial: sugestao.CODFILIAL,
          origem: sugestao.ORIGEM || 'automatica', itensJson: '',
        });
        if (!resposta.ok) {
          setErro(String(resposta.erro ?? 'Não foi possível vincular a nota.'));
          return;
        }
      }
      await acao('sgcEscSugestaoDecidir', {
        id: sugestao.ID, status: decisao,
        motivo: decisao === 'recusada' ? 'Recusada na fila de sugestões.' : '',
        decididoEm: agora(),
      });
      setVersao((atual) => atual + 1);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar a decisão.');
    } finally {
      setOcupado(false);
    }
  }

  const fornecedorFiltrado = fornecedores.find((f) => f.value === codfornec);
  const statusFiltrado = OPCOES_STATUS.find((o) => o.value === status && o.value !== '');

  return (
    <>
      <PageHeader
        module="Fiscal"
        title="Notas fiscais"
        description="Sugestões de NF detectadas no WinThor e busca por número."
        meta={<span><strong>{total.toLocaleString('pt-BR')}</strong> sugestões</span>}
      />

      <Panel>
        {erro ? <Alert tone="error">{erro}</Alert> : null}
        {motivo ? <Alert tone="info">{motivo}</Alert> : null}

        <Toolbar>
          <SearchInput
            placeholder="Buscar por número da nota, pedido ou fornecedor"
            value={busca}
            onChange={(evento) => refiltrar(() => setBusca(evento.target.value))}
            className="min-w-56 flex-1"
          />
          <div className="w-52">
            <SelectMenu
              label="Situação"
              value={status}
              onChange={(valor) => refiltrar(() => setStatus(valor))}
              options={OPCOES_STATUS}
            />
          </div>
          <div className="w-56">
            <SelectMenu
              label="Fornecedor"
              placeholder="Todos os fornecedores"
              value={codfornec}
              onChange={(valor) => refiltrar(() => setCodfornec(valor))}
              options={[{ value: '', label: 'Todos os fornecedores' }, ...fornecedores]}
            />
          </div>
        </Toolbar>

        {fornecedorFiltrado || statusFiltrado ? (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {statusFiltrado ? (
              <FilterChip label="Situação" value={statusFiltrado.label} onClear={() => refiltrar(() => setStatus(''))} />
            ) : null}
            {fornecedorFiltrado ? (
              <FilterChip label="Fornecedor" value={fornecedorFiltrado.label} onClear={() => refiltrar(() => setCodfornec(''))} />
            ) : null}
          </div>
        ) : null}

        {!carregando && registros.length === 0 ? (
          <EmptyState
            title="Nenhuma sugestão nesta situação"
            hint="A rotina diária procura notas de entrada dos pedidos enviados; nada é vinculado sem alguém validar."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Fornecedor</Th>
                <Th>Nota</Th>
                <Th numeric>Valor</Th>
                <Th numeric>Pontuação</Th>
                <Th>Situação</Th>
                <Th className="w-56 text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {registros.map((sugestao) => (
                <Tr key={sugestao.ID}>
                  <Td>
                    <RowTitle>{sugestao.CARD_TITULO}</RowTitle>
                    <RowMeta>
                      {sugestao.FASE}
                      {sugestao.NUMPED_WINTHOR ? ` · pedido ${sugestao.NUMPED_WINTHOR}` : ''}
                      {` · ${moeda(sugestao.VL_PEDIDO)}`}
                    </RowMeta>
                  </Td>
                  <Td>
                    {sugestao.FORNECEDOR}
                    <RowMeta>{sugestao.FILIAL}</RowMeta>
                  </Td>
                  <Td>
                    <Code>{sugestao.NUMNOTA}{sugestao.SERIE ? `/${sugestao.SERIE}` : ''}</Code>
                    <RowMeta>
                      emissão {fmtData(sugestao.DT_EMISSAO)}
                      {sugestao.DT_ENTRADA ? ` · entrada ${fmtData(sugestao.DT_ENTRADA)}` : ' · sem entrada'}
                    </RowMeta>
                  </Td>
                  <Td numeric>{moeda(sugestao.VL_TOTAL)}</Td>
                  <Td numeric>
                    <Status tone={sugestao.SCORE >= 80 ? 'live' : 'attention'}>{sugestao.SCORE}</Status>
                    <RowMeta>{sugestao.MOTIVO || (sugestao.ORIGEM === 'pedido' ? 'Número do pedido' : '')}</RowMeta>
                  </Td>
                  <Td>
                    <Status tone={TOM_STATUS[sugestao.STATUS] ?? 'off'}>
                      {ROTULO_STATUS[sugestao.STATUS] ?? sugestao.STATUS}
                    </Status>
                    {sugestao.DECIDIDO_EM ? (
                      <RowMeta>{sugestao.DECIDIDO_NOME} · {fmtDataHora(sugestao.DECIDIDO_EM)}</RowMeta>
                    ) : <RowMeta>{sugestao.CRIADO_EM ? fmtDataHora(sugestao.CRIADO_EM) : ''}</RowMeta>}
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => void decidir(sugestao, 'recusada')}
                        disabled={ocupado || !podeOperar || sugestao.STATUS !== 'sugerida'}
                      >
                        Recusar
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void decidir(sugestao, 'validada')}
                        disabled={ocupado || !podeOperar || sugestao.STATUS !== 'sugerida'}
                      >
                        Validar
                      </Button>
                      <IconButton label="Abrir o pedido no quadro" onClick={() => navigate(`/quadro?card=${sugestao.ID_CARD}`)}>
                        <Eye aria-hidden />
                      </IconButton>
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={pagina}
          lastPage={lastPage}
          total={total}
          unit="sugestões"
          busy={carregando || ocupado}
          onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
          onNext={() => { setCarregando(true); setPagina((p) => Math.min(lastPage, p + 1)); }}
        />
      </Panel>
    </>
  );
}
