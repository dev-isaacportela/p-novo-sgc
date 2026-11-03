// Aba B.O. do pedido aberto (spec 007): itens em B.O., previsão de
// liberação e carta de falta. RNF-001: a aba inteira carrega com UMA
// chamada (`sgcBoCarregar`).
//
// Recebe, além do `ExtensaoContexto` do motor, `fases` e `sessao` — mesmo
// padrão de AcoesDoPedido.tsx (QuadroPage.tsx passa os dois no `render` do
// `abasExtras`; ver o texto pronto no relatório da spec 007, arquivo
// compartilhado que esta spec não edita).
//
// RF-019/RN-009: sem `operarBo`, os controles ficam desabilitados com o
// motivo no `title` (C-014) — nunca escondidos. R-046: nenhum `antesDeMover`
// novo — "Mover para Produtos em B.O." é só `ctx.mover(faseId)`, a mesma
// ação que a coluna genérica da lib já ofereceria; a aba a repete aqui só
// porque a condição "abertos > 0" é B.O.-específica.
import * as React from 'react';
import { PackageOpen } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Badge, Button, CartaoLinha, Dash, EmptyState, GradeMini, ListaCartoes, MetaDot,
  MiniCartao, Panel, PanelHeader, RodapeTotal, Status, TextLink, Toolbar,
} from '@/components/page';
import { acao } from '@/lib/mitra-api';
import { fmtData, fmtDataHora, moeda } from '@/lib/formato.ts';
import { rotuloSituacaoPrevisao, topoDoBo, type SituacaoPrevisao, type StatusBoItem } from '@/lib/bo.ts';
import type { SessaoPersona } from '@/lib/persona.ts';
import type { MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { usePedido } from './pedido-contexto';
import { MarcarItensDialogo, PrevisaoDialogo, DocumentoBoDialogo } from './bo-dialogos';
import { lerCarga } from './carga-do-card';

interface BoItemLinha {
  ID: number; CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string;
  QT_PENDENTE: number; QT_PEDIDA: number; PRECO_CUSTO: number; VL_PENDENTE: number;
  OBSERVACAO: string; STATUS: StatusBoItem; CLIENTES_IMPACTADOS: number; QT_VENDIDA_60D: number;
  CRIADO_POR_NOME: string; CRIADO_EM: string; RESOLVIDO_POR_NOME: string; RESOLVIDO_EM: string;
}
interface BoPrevisaoLinha { ID: number; DT_PREVISAO: string; OBSERVACAO: string; REGISTRADO_POR_NOME: string; REGISTRADO_EM: string }
interface BoDocumentoLinha { ID: number; TIPO: string; NOME_ARQUIVO: string; ENDERECO: string; ENVIADO_POR_NOME: string; ENVIADO_EM: string }
interface BoCarregado {
  itens: BoItemLinha[];
  previsoes: BoPrevisaoLinha[];
  documentos: BoDocumentoLinha[];
  resumo: { abertos: number; liberados: number; previsao: string; situacao: SituacaoPrevisao };
}
const VAZIO: BoCarregado = { itens: [], previsoes: [], documentos: [], resumo: { abertos: 0, liberados: 0, previsao: '', situacao: 'sem_previsao' } };

const horaCurta = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const agora = () => new Date().toISOString().slice(0, 19);
const hojeIso = () => new Date().toISOString().slice(0, 10);
// R-141: o mês do `Date.UTC` começa em 0 — sem o `- 1` a conta errava quando
// a previsão e hoje caem em meses de tamanhos diferentes (30/10 → 03/11 dava 3).
const diasEntre = (aIso: string, bIso: string) => {
  const [a, b] = [aIso, bIso].map((iso) => iso.split('-').map(Number));
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
};
const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const STATUS_TONE = { aberto: 'attention', liberado: 'live', cancelado: 'off' } as const;
const SITUACAO_TONE = { sem_previsao: 'alert', vencida: 'alert', hoje: 'attention', no_prazo: 'live' } as const;

export default function AbaBo(ctx: ExtensaoContexto & { fases: MapaDeFases; sessao: SessaoPersona }) {
  const { fases, sessao } = ctx;
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  // `carregando` é DERIVADO (cardId da última resposta != cardId atual), em
  // vez de um `setState(true)` síncrono no topo do efeito (react-hooks/set-state-in-effect).
  const [resposta, setResposta] = React.useState<{ cardId: number; dados: BoCarregado } | null>(null);
  const [erro, setErro] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [salvoEm, setSalvoEm] = React.useState('');
  const [dialogoMarcar, setDialogoMarcar] = React.useState(false);
  const [dialogoPrevisao, setDialogoPrevisao] = React.useState(false);
  const [dialogoDocumento, setDialogoDocumento] = React.useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = React.useState(0);

  const dados = resposta && resposta.cardId === ctx.card.id ? resposta.dados : VAZIO;
  const carregando = !resposta || resposta.cardId !== ctx.card.id;

  // R-141: a mesma execução serve a conclusão do Faturamento (`carga-do-card.ts`).
  const buscar = React.useCallback(async (forcar = false): Promise<BoCarregado> => {
    const r = await lerCarga('sgcBoCarregar', ctx.card.id, forcar);
    if (r.ok === false) throw new Error(String(r.erro ?? 'Não foi possível carregar os produtos em B.O.'));
    return {
      itens: (r.itens ?? []) as BoItemLinha[],
      previsoes: (r.previsoes ?? []) as BoPrevisaoLinha[],
      documentos: (r.documentos ?? []) as BoDocumentoLinha[],
      resumo: r.resumo as BoCarregado['resumo'],
    };
  }, [ctx.card.id]);

  React.useEffect(() => {
    let vivo = true;
    const cardId = ctx.card.id;
    buscar()
      .then((d) => { if (vivo) { setResposta({ cardId, dados: d }); setErro(''); } })
      .catch((falha) => vivo && setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar.'));
    return () => { vivo = false; };
  }, [buscar, ctx.card.id]);

  const chaveFase = fases.chaveDe(ctx.card.faseId);
  const foraDoBo = chaveFase !== 'faturamento' && chaveFase !== 'bo';
  const motivoBloqueio = !sessao.permissoes.operarBo
    ? (sessao.permissoes.somenteLeitura ? 'Seu acesso é somente leitura.' : 'Seu perfil não opera os produtos em B.O. deste pedido.')
    : !pedido.podeEditar
      ? 'Seu acesso permite operar apenas os pedidos que você criou.'
      : foraDoBo
        ? 'O pedido não está em Faturamento nem em Produtos em B.O.'
        : '';
  const bloqueado = ctx.travado || ocupado || motivoBloqueio !== '';

  async function comRecarga(passos: () => Promise<void>) {
    setOcupado(true);
    setErro('');
    try {
      await passos();
      setResposta({ cardId: ctx.card.id, dados: await buscar(true) });
      setSalvoEm(horaCurta());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir a ação.');
      throw falha;
    } finally {
      setOcupado(false);
    }
  }

  async function marcar(itens: { codprod: number; qtPendente: number; observacao: string }[]) {
    await comRecarga(async () => {
      const r = await acao('sgcBoMarcar', {
        cardId: ctx.card.id,
        itensJson: JSON.stringify(itens.map((i) => ({ codprod: i.codprod, status: 'aberto', qtPendente: i.qtPendente, observacao: i.observacao }))),
      });
      if (r.ok === false) throw new Error(String(r.erro ?? 'Não foi possível marcar os itens.'));
    });
  }

  async function liberar(codprod: number) {
    await comRecarga(async () => {
      const r = await acao('sgcBoMarcar', { cardId: ctx.card.id, itensJson: JSON.stringify([{ codprod, status: 'liberado' }]) });
      if (r.ok === false) throw new Error(String(r.erro ?? 'Não foi possível liberar o item.'));
    });
  }

  /**
   * R-144 (P-6): "não vem mais" — a indústria não vai entregar o saldo. O
   * item sai do aberto como `cancelado` (o `sgcBoMarcar` já aceitava) e o
   * valor dele passa a contar como coberto na trava de conclusão.
   */
  async function naoVemMais(codprod: number) {
    setConfirmandoCancelar(0);
    await comRecarga(async () => {
      const r = await acao('sgcBoMarcar', { cardId: ctx.card.id, itensJson: JSON.stringify([{ codprod, status: 'cancelado' }]) });
      if (r.ok === false) throw new Error(String(r.erro ?? 'Não foi possível encerrar o item.'));
    });
  }

  async function registrarPrevisao(dadosPrevisao: { dtPrevisao: string; observacao: string }) {
    await comRecarga(async () => {
      await acao('sgcEscBoPrevisaoInserir', { idCard: ctx.card.id, dtPrevisao: dadosPrevisao.dtPrevisao, observacao: dadosPrevisao.observacao, registradoEm: agora() });
      // RN-004/C-005: zera ALERTA_BO_EM e reinicia a cobrança — sempre.
      await acao('sgcEscPedidoPrevisaoBo', { idCard: ctx.card.id, dtPrevisao: dadosPrevisao.dtPrevisao });
    });
  }

  async function anexarDocumento(documento: { tipo: string; nomeArquivo: string; endereco: string }) {
    await comRecarga(async () => {
      await acao('sgcEscBoDocumentoInserir', { idCard: ctx.card.id, tipo: documento.tipo, nomeArquivo: documento.nomeArquivo, endereco: documento.endereco, enviadoEm: agora() });
    });
  }

  async function moverParaBo() {
    setOcupado(true);
    try {
      await ctx.mover(fases.faseIdDe('bo'));
    } finally {
      setOcupado(false);
    }
  }

  const hoje = hojeIso();
  const diasPrevisao = dados.resumo.previsao ? Math.abs(diasEntre(dados.resumo.previsao, hoje)) : 0;

  if (carregando) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando os produtos em B.O...</p>;
  }

  // Concluído sem item em B.O.: não há o que mostrar (o legado só lista B.O. quando existe).
  if (chaveFase === 'concluido' && dados.itens.length === 0) return null;

  const topo = topoDoBo({ itens: dados.itens, documentos: dados.documentos, dtPrevisao: dados.resumo.previsao, hoje });
  const dtEnvio = pedido.capa?.idCard === ctx.card.id ? pedido.capa.dtEnvio : '';

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {/* RN-006 / legado BoFasePanel:253-267 — fica até registrarem previsão nova. */}
      {topo.avisoVencida ? <Alert tone="warn">{topo.avisoVencida}</Alert> : null}

      <Panel>
        <PanelHeader
          title="Produtos em B.O."
          hint={salvoEm
            ? `Salvo às ${salvoEm}. ${dados.resumo.abertos} em aberto, ${dados.resumo.liberados} liberados.`
            : `${dados.resumo.abertos} em aberto, ${dados.resumo.liberados} liberados.`}
        >
          <Status tone={SITUACAO_TONE[dados.resumo.situacao]}>{rotuloSituacaoPrevisao(dados.resumo.situacao, diasPrevisao)}</Status>
        </PanelHeader>

        {/* As datas da fase (legado BoFasePanel:269-302). */}
        <div className="border-b border-rule-row p-4">
          <GradeMini colunas={3}>
            <MiniCartao rotulo="Envio à indústria" valor={dtEnvio ? fmtData(dtEnvio) : <Dash />} />
            <MiniCartao
              rotulo="Previsão da indústria"
              valor={dados.resumo.previsao ? fmtData(dados.resumo.previsao) : <Dash />}
              tone={dados.resumo.situacao === 'vencida' ? 'attention' : 'neutral'}
              hint={rotuloSituacaoPrevisao(dados.resumo.situacao, diasPrevisao)}
            />
            <MiniCartao
              rotulo="Carta de falta"
              valor={topo.cartaEm ? fmtData(topo.cartaEm) : dados.resumo.abertos > 0 ? 'Pendente' : <Dash />}
              tone={topo.cartaEm || dados.resumo.abertos === 0 ? 'neutral' : 'attention'}
              hint={topo.cartaEm ? 'a mais recente' : dados.resumo.abertos > 0 ? 'anexe o documento da indústria' : 'só com item em B.O.'}
            />
          </GradeMini>
        </div>

        <Toolbar>
          <Button size="sm" onClick={() => setDialogoMarcar(true)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>
            Marcar itens em B.O.
          </Button>
          <Button size="sm" onClick={() => setDialogoPrevisao(true)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>
            Registrar previsão
          </Button>
          <Button size="sm" onClick={() => setDialogoDocumento(true)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>
            Anexar documento
          </Button>
          {chaveFase === 'faturamento' && dados.resumo.abertos > 0 ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void moverParaBo()}
              disabled={bloqueado}
              title={bloqueado ? motivoBloqueio : undefined}
            >
              <PackageOpen aria-hidden />
              Mover para Produtos em B.O.
            </Button>
          ) : null}
        </Toolbar>

        {dados.itens.length === 0 ? (
          <EmptyState title="Nenhum item em B.O." hint="Marque os produtos que a indústria não confirmou nesta compra." />
        ) : (
          <>
            <ListaCartoes rotulo="Itens em B.O.">
              {dados.itens.map((item) => (
                <CartaoLinha
                  key={item.ID}
                  titulo={item.DESCRICAO}
                  meta={<>Código {item.CODPROD} <MetaDot /> {item.EMBALAGEM || '—'} <MetaDot /> pedida {quantidade(item.QT_PEDIDA)}</>}
                  valor={moeda(item.VL_PENDENTE)}
                  valorMeta={`${quantidade(item.QT_PENDENTE)} pendente`}
                  acoes={item.STATUS === 'aberto' ? (
                    <>
                      <Button size="sm" onClick={() => void liberar(item.CODPROD)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>
                        Liberar
                      </Button>
                      {confirmandoCancelar === item.CODPROD ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => void naoVemMais(item.CODPROD)} disabled={bloqueado}>
                            Confirmar: não vem mais
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmandoCancelar(0)}>Voltar</Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setConfirmandoCancelar(item.CODPROD)}
                          disabled={bloqueado}
                          title={bloqueado ? motivoBloqueio : 'A indústria não vai entregar: o saldo deixa de ser esperado e conta como coberto para concluir.'}
                        >
                          Não vem mais
                        </Button>
                      )}
                    </>
                  ) : undefined}
                >
                  <Status tone={STATUS_TONE[item.STATUS] ?? 'off'}>
                    {item.STATUS === 'aberto' ? 'Em aberto' : item.STATUS === 'liberado' ? 'Liberado' : 'Não vem mais'}
                  </Status>
                  {item.STATUS === 'liberado' && item.RESOLVIDO_POR_NOME ? (
                    <span>{item.RESOLVIDO_POR_NOME} em {fmtDataHora(item.RESOLVIDO_EM)}</span>
                  ) : null}
                  {item.CLIENTES_IMPACTADOS > 0 ? <span>{item.CLIENTES_IMPACTADOS} clientes impactados</span> : null}
                  {item.QT_VENDIDA_60D > 0 ? <span>{quantidade(item.QT_VENDIDA_60D)} vendidos em 60 dias</span> : null}
                  {item.OBSERVACAO ? <span className="w-full">{item.OBSERVACAO}</span> : null}
                </CartaoLinha>
              ))}
            </ListaCartoes>
            <RodapeTotal rotulo="Total pendente em B.O. (itens em aberto)" valor={moeda(topo.totalPendente)} />
          </>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Histórico de previsões" hint={dados.previsoes.length === 0 ? 'Nenhuma previsão registrada ainda.' : undefined} />
        {dados.previsoes.length > 0 ? (
          <ListaCartoes rotulo="Histórico de previsões">
            {dados.previsoes.map((p) => (
              <CartaoLinha
                key={p.ID}
                titulo={p.OBSERVACAO || 'Sem observação'}
                meta={`${p.REGISTRADO_POR_NOME} · ${fmtDataHora(p.REGISTRADO_EM)}`}
                valor={fmtData(p.DT_PREVISAO)}
              />
            ))}
          </ListaCartoes>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Carta de falta e documentos" hint={dados.documentos.length === 0 ? 'Nenhum documento anexado ainda.' : undefined} />
        {dados.documentos.length > 0 ? (
          <ListaCartoes rotulo="Documentos">
            {dados.documentos.map((d) => (
              <CartaoLinha
                key={d.ID}
                titulo={<TextLink onClick={() => window.open(d.ENDERECO, '_blank', 'noopener')} title={d.ENDERECO}>{d.NOME_ARQUIVO}</TextLink>}
                meta={`${d.ENVIADO_POR_NOME} · ${fmtDataHora(d.ENVIADO_EM)}`}
              >
                <Badge tone={d.TIPO === 'carta_falta' ? 'accent' : 'neutral'}>{d.TIPO === 'carta_falta' ? 'Carta de falta' : 'Outro'}</Badge>
              </CartaoLinha>
            ))}
          </ListaCartoes>
        ) : null}
      </Panel>

      <MarcarItensDialogo open={dialogoMarcar} onOpenChange={setDialogoMarcar} itensDoPedido={pedido.itens} onConfirmar={marcar} />
      <PrevisaoDialogo open={dialogoPrevisao} onOpenChange={setDialogoPrevisao} dtPrevisaoAtual={dados.resumo.previsao} onConfirmar={registrarPrevisao} />
      <DocumentoBoDialogo open={dialogoDocumento} onOpenChange={setDialogoDocumento} onSalvar={anexarDocumento} />
    </div>
  );
}
