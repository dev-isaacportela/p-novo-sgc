// Bloco "Solicitações" da fase Análise (spec 008, R-050/R-054): as demandas do
// comercial do MESMO fornecedor e da MESMA filial do pedido que está sendo
// montado, com "Incluir no pedido" e "Recusar".
//
// NÃO é aba: entra em `BLOCOS_POR_FASE.analise`, antes de Itens — o card muda
// de assunto conforme a fase, como no SGC legado. Quem liga o bloco ao card é a
// integração (S4); o trecho vai pronto no relatório da 008.
//
// RNF-001: UMA execução ao abrir (`sgcSolicitacoesDaMontagem`), qualquer que
// seja o número de linhas. RF-020/C-019: sem `avaliarSolicitacao` ou sem
// `podeEditar`, os botões ficam DESABILITADOS com o motivo no `title` — nunca
// escondidos.
//
// Recebe, além do `ExtensaoContexto` do motor, `fases` e `sessao` — o mesmo
// padrão de `AbaBo` (QuadroPage passa os dois no `render` do conteúdo da fase).
import * as React from 'react';
import { PackagePlus } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, Code, EmptyState, Panel, PanelHeader, RowMeta, RowTitle,
  Status, Table, Td, Th, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { fmtData } from '@/lib/formato';
import { prioridadeDe, type Prioridade, type TomStatus } from '@/lib/solicitacoes';
import type { SessaoPersona } from '@/lib/persona';
import type { MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { AvaliarDialogo } from '@/pages/solicitacoes/solicitacoes-dialogos';
import { usePedido } from './pedido-contexto';

/** Uma linha de `sgcSolicitacoesDaMontagem`. */
interface SolicitacaoDaMontagem {
  ID: number; CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string;
  QUANTIDADE: number; JUSTIFICATIVA: string; CODCLI: number; CLIENTE: string;
  PRIORIDADE: string; STATUS: string; CRIADO_POR: number; CRIADO_POR_NOME: string;
  CRIADO_EM: string; QT_NO_PEDIDO: number;
}

const TOM_PRIORIDADE: Record<Prioridade, TomStatus> = { urgente: 'alert', alta: 'attention', normal: 'off' };
const ROTULO_PRIORIDADE: Record<Prioridade, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal' };
const quantidade = (valor: number) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const horaCurta = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function BlocoSolicitacoes(
  ctx: ExtensaoContexto & { fases: MapaDeFases; sessao: SessaoPersona },
) {
  const { fases, sessao } = ctx;
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  // `carregando` é DERIVADO (cardId da última resposta != cardId atual), como
  // em AbaBo: setState síncrono no topo do efeito é o que a regra
  // react-hooks/set-state-in-effect proíbe.
  const [resposta, setResposta] = React.useState<{ cardId: number; linhas: SolicitacaoDaMontagem[] } | null>(null);
  const [erro, setErro] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [salvoEm, setSalvoEm] = React.useState('');
  const [recusando, setRecusando] = React.useState<SolicitacaoDaMontagem | null>(null);

  const registros = resposta && resposta.cardId === ctx.card.id ? resposta.linhas : [];
  const carregando = !resposta || resposta.cardId !== ctx.card.id;

  const buscar = React.useCallback(async (): Promise<SolicitacaoDaMontagem[]> => {
    const rows = await linhas('sgcSolicitacoesDaMontagem', { cardId: ctx.card.id });
    return rows as unknown as SolicitacaoDaMontagem[];
  }, [ctx.card.id]);

  // A lista depende do que está no pedido (vínculo, QT_NO_PEDIDO): relê sempre
  // que os itens do pedido mudam — remover item (P-1 do ensaio), gravar,
  // incluir — e só depois que o pedido DESTE card carregou, para continuar UMA
  // execução ao abrir (RNF-001).
  const itensDoPedido = pedido.cardId === ctx.card.id && !pedido.carregando ? pedido.itens : null;

  React.useEffect(() => {
    if (!itensDoPedido) return;
    let vivo = true;
    const cardId = ctx.card.id;
    buscar()
      .then((rows) => { if (vivo) { setResposta({ cardId, linhas: rows }); setErro(''); } })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as solicitações.');
      });
    return () => { vivo = false; };
  }, [buscar, ctx.card.id, itensDoPedido]);

  const chaveFase = fases.chaveDe(ctx.card.faseId);
  const motivoBloqueio = !sessao.permissoes.avaliarSolicitacao
    ? (sessao.permissoes.somenteLeitura ? 'Seu acesso é somente leitura.' : 'Seu perfil lê a fila, mas não avalia solicitação.')
    : !pedido.podeEditar
      ? 'Seu acesso permite operar apenas os pedidos que você criou.'
      : chaveFase !== 'analise'
        ? 'O pedido não está mais na Análise.'
        : '';
  const bloqueado = ctx.travado || ocupado || motivoBloqueio !== '';

  /** `reler` = false quando os passos já recarregam o pedido: o efeito acima relê. */
  async function comRecarga(passos: () => Promise<void>, reler = true) {
    setOcupado(true);
    setErro('');
    try {
      await passos();
      if (reler) setResposta({ cardId: ctx.card.id, linhas: await buscar() });
      setSalvoEm(horaCurta());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(false);
    }
  }

  async function incluir(registro: SolicitacaoDaMontagem) {
    await comRecarga(async () => {
      const saida = await acao('sgcSolicitacaoIncluirNoPedido', { cardId: ctx.card.id, id: registro.ID });
      if (saida.ok === false) throw new Error(String(saida.erro ?? 'Não foi possível incluir a solicitação no pedido.'));
      // O item novo aparece na lista de Itens e a capa do card pode mudar.
      await pedido.recarregar(ctx.card.id);
      await ctx.recarregar();
    }, false);
  }

  if (carregando) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando as solicitações do comercial...</p>;
  }

  return (
    <Panel>
      <PanelHeader
        title="Solicitações do comercial"
        hint={salvoEm
          ? `Salvo às ${salvoEm}. ${registros.length} demanda(s) ativa(s) deste fornecedor e filial.`
          : `${registros.length} demanda(s) ativa(s) deste fornecedor e filial, na ordem da prioridade.`}
      />

      {erro ? <div className="px-4 pt-3"><Alert tone="error">{erro}</Alert></div> : null}

      {registros.length === 0 ? (
        <EmptyState
          title="Nenhuma solicitação em aberto"
          hint="O comercial não registrou demanda deste fornecedor para esta filial — ou todas já entraram no pedido."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th numeric>Solicitada</Th>
              <Th>Cliente</Th>
              <Th>Prioridade</Th>
              <Th>Vendedor</Th>
              <Th className="w-56 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {registros.map((registro) => {
              const prioridade = prioridadeDe(registro.PRIORIDADE);
              const jaNoPedido = Number(registro.QT_NO_PEDIDO) > 0;
              return (
                <Tr key={registro.ID}>
                  <Td>
                    <RowTitle>{registro.DESCRICAO}</RowTitle>
                    <RowMeta>
                      <Code prefix="cód.">{registro.CODPROD}</Code> · {registro.EMBALAGEM || '—'} · {registro.UNIDADE || '—'}
                    </RowMeta>
                    {registro.JUSTIFICATIVA ? <RowMeta>{registro.JUSTIFICATIVA}</RowMeta> : null}
                    {jaNoPedido ? (
                      <RowMeta>
                        Este produto já está no pedido com {quantidade(registro.QT_NO_PEDIDO)} — incluir só registra a origem.
                      </RowMeta>
                    ) : null}
                  </Td>
                  <Td numeric>{quantidade(registro.QUANTIDADE)}</Td>
                  <Td>
                    {Number(registro.CODCLI) > 0 ? (
                      <>
                        <RowTitle>{registro.CLIENTE}</RowTitle>
                        <RowMeta><Code prefix="cód.">{registro.CODCLI}</Code></RowMeta>
                      </>
                    ) : <RowMeta>Sem cliente informado</RowMeta>}
                  </Td>
                  <Td>
                    <Status tone={TOM_PRIORIDADE[prioridade]}>{ROTULO_PRIORIDADE[prioridade]}</Status>
                  </Td>
                  <Td>
                    <RowMeta>{registro.CRIADO_POR_NOME || '—'}</RowMeta>
                    <RowMeta>{fmtData(registro.CRIADO_EM)}</RowMeta>
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void incluir(registro)}
                        disabled={bloqueado}
                        title={bloqueado ? motivoBloqueio : undefined}
                      >
                        <PackagePlus aria-hidden />
                        Incluir no pedido
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setRecusando(registro)}
                        disabled={bloqueado}
                        title={bloqueado ? motivoBloqueio : undefined}
                      >
                        Recusar
                      </Button>
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {recusando ? (
        <AvaliarDialogo
          solicitacao={recusando}
          somenteRecusa
          onFechar={() => setRecusando(null)}
          onGravado={() => { void comRecarga(async () => {}); }}
        />
      ) : null}
    </Panel>
  );
}
