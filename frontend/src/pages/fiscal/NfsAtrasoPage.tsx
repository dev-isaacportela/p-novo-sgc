// Spec 006 (trânsito e recebimento) — RF-018..RF-021: as notas vencidas dos
// pedidos em Enviado e Em Trânsito, com total e valor acumulado, faixas de
// atraso, busca, exportação e a sincronização sob demanda com o WinThor.
//
// Duas execuções por filtro (`sgcNfsEmAtraso` + `sgcNfsEmAtrasoTotal`), como
// toda listagem do projeto. Exportar não custa execução nenhuma: o CSV é
// montado sobre as linhas já carregadas do filtro atual (D-012).

import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import {
  Alert, Button, Code, Dash, EmptyState, FilterChip, MetaDot, PageHeader, Pagination,
  Panel, SearchInput, SelectMenu, Stat, Status, Table, Td, Th, Toolbar, Tr, RowMeta, RowTitle,
} from '@/components/page';
import { linhas, linha, acao, comPadrao } from '@/lib/mitra-api';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { rotuloPrazoEntrega } from '@/lib/fornecedor';
import { usePersona } from '@/lib/persona';
import {
  COLUNAS_CSV_ATRASO, linhasCsv, notaDeLinha, rotuloAtraso, rotuloSituacao, tomSituacao,
  type FaixaAtraso, type NotaRecebimento,
} from '@/lib/recebimento';

const LIMITE = 20;

const OPCOES_FAIXA: { value: '' | FaixaAtraso; label: string }[] = [
  { value: '', label: 'Todas as faixas' },
  { value: 'ate3', label: 'Até 3 dias' },
  { value: '4a7', label: 'De 4 a 7 dias' },
  { value: 'mais7', label: 'Mais de 7 dias' },
];

const FASES: Record<string, string> = {
  enviado: 'Enviado para Indústria',
  transito: 'Em Trânsito para BN',
};

export default function NfsAtrasoPage() {
  const sessao = usePersona();
  const [busca, setBusca] = useState('');
  const [faixa, setFaixa] = useState<'' | FaixaAtraso>('');
  const [pagina, setPagina] = useState(1);

  const [notas, setNotas] = useState<NotaRecebimento[]>([]);
  const [total, setTotal] = useState(0);
  const [valorTotal, setValorTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');

  const [recarga, setRecarga] = useState(0);

  // Duas execuções por filtro: a página e o total do MESMO recorte.
  useEffect(() => {
    let vivo = true;
    const filtros = comPadrao(
      { busca, faixa, hoje: hojeIso(), limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) },
      { busca: '', faixa: '', hoje: hojeIso(), limite: String(LIMITE), offset: '0' },
    );
    Promise.all([linhas('sgcNfsEmAtraso', filtros), linha('sgcNfsEmAtrasoTotal', filtros)])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setNotas(rows.map(notaDeLinha));
        setTotal(Number(totalRow?.TOTAL ?? 0));
        setValorTotal(Number(totalRow?.VALOR_TOTAL ?? 0));
        setErro('');
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível ler as notas em atraso.');
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [busca, faixa, pagina, recarga]);

  const lastPage = Math.max(1, Math.ceil(total / LIMITE));
  const faixaSelecionada = OPCOES_FAIXA.find((opcao) => opcao.value === faixa && opcao.value !== '');
  const podeOperar = Boolean(sessao?.permissoes.operarNf);

  function filtrar(aplicar: () => void) {
    setCarregando(true);
    setPagina(1);
    aplicar();
  }

  async function sincronizar() {
    setSincronizando(true);
    setErro('');
    setConfirmacao('');
    try {
      const resposta = await acao('sgcRecebimentoSincronizar', { cardId: 0 });
      if (resposta.ok !== true) {
        setErro(String(resposta.erro || 'A sincronização não foi concluída.'));
        return;
      }
      const atualizadas = Number(resposta.recebidas) || 0;
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setConfirmacao(atualizadas === 0
        ? `Sincronizado às ${hora} — nenhuma nota nova deu entrada no WinThor.`
        : `Sincronizado às ${hora} — ${atualizadas} ${atualizadas === 1 ? 'nota atualizada' : 'notas atualizadas'}.`);
      setCarregando(true);
      setRecarga((atual) => atual + 1);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível falar com o WinThor.');
    } finally {
      setSincronizando(false);
    }
  }

  function exportar() {
    const nome = `nfs-em-atraso-${hojeIso()}.csv`;
    baixarCsv(nome, textoCsv(COLUNAS_CSV_ATRASO, linhasCsv(notas)));
  }

  if (!sessao) return <EmptyState title="Carregando..." />;

  // A-8 da revisão: sem porteiro de rota, o endereço direto lia a lista
  // mesmo fora do menu (RN-012/R-028) — mesmo padrão de QuadroPage/SegurancaPage.
  if (!sessao.permissoes.verNfsAtraso) {
    return (
      <>
        <PageHeader module="Fiscal" title="NFs em atraso" />
        <Alert tone="error">Seu perfil não tem acesso às notas fiscais em atraso.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Fiscal"
        title="NFs em atraso"
        description="Notas vencidas dos pedidos enviados à indústria e em trânsito para a Benenutri — a lista por onde a cobrança e a negociação de prorrogação começam."
        meta={<>
          <span><Stat>{total.toLocaleString('pt-BR')}</Stat> {total === 1 ? 'nota vencida' : 'notas vencidas'}</span>
          <MetaDot />
          <span><Stat>{moeda(valorTotal)}</Stat> em valor acumulado</span>
        </>}
        actions={<>
          <Button
            onClick={exportar}
            disabled={carregando || notas.length === 0}
            title={notas.length === 0 ? 'Nada para exportar neste filtro.' : undefined}
          >
            <Download aria-hidden />
            Exportar
          </Button>
          <Button
            variant="primary"
            onClick={() => void sincronizar()}
            disabled={sincronizando || !podeOperar}
            title={podeOperar ? undefined : 'Seu perfil não sincroniza o recebimento das notas.'}
          >
            <RefreshCw aria-hidden />
            Sincronizar com o WinThor
          </Button>
        </>}
      />

      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Panel className={erro ? 'mt-4' : undefined}>
        <Toolbar>
          <SearchInput
            placeholder="Buscar por número da nota, fornecedor ou pedido no ERP"
            value={busca}
            onChange={(evento) => filtrar(() => setBusca(evento.target.value))}
            className="min-w-56 flex-1"
          />
          <div className="w-52">
            <SelectMenu
              label="Faixa de atraso"
              value={faixa}
              onChange={(valor) => filtrar(() => setFaixa(valor as '' | FaixaAtraso))}
              options={OPCOES_FAIXA}
            />
          </div>
        </Toolbar>

        {faixaSelecionada ? (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            <FilterChip
              label="Atraso"
              value={faixaSelecionada.label}
              onClear={() => filtrar(() => setFaixa(''))}
            />
          </div>
        ) : null}

        {confirmacao ? (
          <p className="border-b border-rule-row px-4 py-2 text-[12px] text-ink-secondary" aria-live="polite">
            {confirmacao}
          </p>
        ) : null}

        {!carregando && notas.length === 0 ? (
          <EmptyState
            title="Nenhuma nota vencida"
            hint="Toda nota dos pedidos em Enviado e Em Trânsito está dentro do prazo do fornecedor — ou ainda não tem prazo parametrizado."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Nota</Th>
                  <Th>Pedido</Th>
                  <Th>Fase</Th>
                  <Th>Faturamento</Th>
                  <Th>Prazo</Th>
                  <Th>Previsão</Th>
                  <Th>Situação</Th>
                  <Th numeric>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {notas.map((nota) => (
                  <Tr key={nota.id}>
                    <Td>
                      <RowTitle><Code>NF {nota.numnota}</Code></RowTitle>
                      <RowMeta>{nota.serie ? `Série ${nota.serie}` : 'Sem série'}</RowMeta>
                    </Td>
                    <Td>
                      <RowTitle>{nota.fornecedor || nota.titulo}</RowTitle>
                      <RowMeta>
                        {nota.filial || `Filial ${nota.codfilial}`}
                        {nota.numpedWinthor ? <> <MetaDot /> Pedido {nota.numpedWinthor}</> : null}
                      </RowMeta>
                    </Td>
                    <Td>{FASES[nota.fase] ?? nota.fase}</Td>
                    <Td>{nota.dtEmissao ? fmtData(nota.dtEmissao) : <Dash />}</Td>
                    <Td>{rotuloPrazoEntrega(nota.prazoDias, nota.prazoTipo) || <Dash />}</Td>
                    <Td>{nota.dtPrevisao ? fmtData(nota.dtPrevisao) : <Dash />}</Td>
                    <Td>
                      <Status tone={tomSituacao(nota.situacao)}>{rotuloSituacao(nota.situacao)}</Status>
                      <RowMeta>{rotuloAtraso(nota)}</RowMeta>
                    </Td>
                    <Td numeric>{nota.vlTotal ? moeda(nota.vlTotal) : <Dash />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={pagina}
              lastPage={lastPage}
              total={total}
              unit={total === 1 ? 'nota' : 'notas'}
              busy={carregando}
              onPrevious={() => setPagina((atual) => Math.max(1, atual - 1))}
              onNext={() => setPagina((atual) => Math.min(lastPage, atual + 1))}
            />
          </>
        )}
      </Panel>
    </>
  );
}
