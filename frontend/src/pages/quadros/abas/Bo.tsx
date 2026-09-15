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
  Alert, Badge, Button, Code, Dash, EmptyState, Panel, PanelHeader, RowMeta, RowTitle,
  Status, Table, Td, TextLink, Th, Toolbar, Tr,
} from '@/components/page';
import { acao } from '@/lib/mitra-api';
import { fmtData, fmtDataHora, moeda } from '@/lib/formato.ts';
import { rotuloSituacaoPrevisao, type SituacaoPrevisao, type StatusBoItem } from '@/lib/bo.ts';
import type { SessaoPersona } from '@/lib/persona.ts';
import type { MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { usePedido } from './pedido-contexto';
import { MarcarItensDialogo, PrevisaoDialogo, DocumentoBoDialogo } from './bo-dialogos';

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
const diasEntre = (aIso: string, bIso: string) => Math.round(
  (Date.UTC(...(bIso.split('-').map(Number) as [number, number, number])) - Date.UTC(...(aIso.split('-').map(Number) as [number, number, number]))) / 86400000,
);
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

  const dados = resposta && resposta.cardId === ctx.card.id ? resposta.dados : VAZIO;
  const carregando = !resposta || resposta.cardId !== ctx.card.id;

  const buscar = React.useCallback(async (): Promise<BoCarregado> => {
    const r = await acao('sgcBoCarregar', { cardId: ctx.card.id });
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
      setResposta({ cardId: ctx.card.id, dados: await buscar() });
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

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Panel>
        <PanelHeader
          title="Itens em B.O."
          hint={salvoEm
            ? `Salvo às ${salvoEm}. ${dados.resumo.abertos} em aberto, ${dados.resumo.liberados} liberados.`
            : `${dados.resumo.abertos} em aberto, ${dados.resumo.liberados} liberados.`}
        >
          <Status tone={SITUACAO_TONE[dados.resumo.situacao]}>{rotuloSituacaoPrevisao(dados.resumo.situacao, diasPrevisao)}</Status>
        </PanelHeader>

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
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th numeric>Pendente</Th>
                <Th numeric>Valor</Th>
                <Th numeric>Clientes</Th>
                <Th numeric>Vendido (60d)</Th>
                <Th>Situação</Th>
                <Th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((item) => (
                <Tr key={item.ID}>
                  <Td>
                    <RowTitle>{item.DESCRICAO}</RowTitle>
                    <RowMeta><Code prefix="cód.">{item.CODPROD}</Code> · {item.EMBALAGEM || '—'} · {item.UNIDADE || '—'}</RowMeta>
                    {item.OBSERVACAO ? <RowMeta>{item.OBSERVACAO}</RowMeta> : null}
                  </Td>
                  <Td numeric>{quantidade(item.QT_PENDENTE)}</Td>
                  <Td numeric>{moeda(item.VL_PENDENTE)}</Td>
                  <Td numeric>{item.CLIENTES_IMPACTADOS > 0 ? item.CLIENTES_IMPACTADOS : <Dash />}</Td>
                  <Td numeric>{item.QT_VENDIDA_60D > 0 ? quantidade(item.QT_VENDIDA_60D) : <Dash />}</Td>
                  <Td>
                    <Status tone={STATUS_TONE[item.STATUS] ?? 'off'}>
                      {item.STATUS === 'aberto' ? 'Em aberto' : item.STATUS === 'liberado' ? 'Liberado' : 'Cancelado'}
                    </Status>
                    {item.STATUS === 'liberado' && item.RESOLVIDO_POR_NOME ? (
                      <RowMeta>{item.RESOLVIDO_POR_NOME} em {fmtDataHora(item.RESOLVIDO_EM)}</RowMeta>
                    ) : null}
                  </Td>
                  <Td className="text-right">
                    {item.STATUS === 'aberto' ? (
                      <Button size="sm" onClick={() => void liberar(item.CODPROD)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>
                        Liberar
                      </Button>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Histórico de previsões" hint={dados.previsoes.length === 0 ? 'Nenhuma previsão registrada ainda.' : undefined} />
        {dados.previsoes.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Previsão</Th><Th>Observação</Th><Th>Registrado por</Th></tr>
            </thead>
            <tbody>
              {dados.previsoes.map((p) => (
                <Tr key={p.ID}>
                  <Td>{fmtData(p.DT_PREVISAO)}</Td>
                  <Td>{p.OBSERVACAO || <Dash />}</Td>
                  <Td><RowMeta>{p.REGISTRADO_POR_NOME} · {fmtDataHora(p.REGISTRADO_EM)}</RowMeta></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Documentos" hint={dados.documentos.length === 0 ? 'Nenhum documento anexado ainda.' : undefined} />
        {dados.documentos.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Arquivo</Th><Th>Tipo</Th><Th>Enviado por</Th></tr>
            </thead>
            <tbody>
              {dados.documentos.map((d) => (
                <Tr key={d.ID}>
                  <Td><TextLink onClick={() => window.open(d.ENDERECO, '_blank', 'noopener')} title={d.ENDERECO}>{d.NOME_ARQUIVO}</TextLink></Td>
                  <Td><Badge tone={d.TIPO === 'carta_falta' ? 'accent' : 'neutral'}>{d.TIPO === 'carta_falta' ? 'Carta de falta' : 'Outro'}</Badge></Td>
                  <Td><RowMeta>{d.ENVIADO_POR_NOME} · {fmtDataHora(d.ENVIADO_EM)}</RowMeta></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Panel>

      <MarcarItensDialogo open={dialogoMarcar} onOpenChange={setDialogoMarcar} itensDoPedido={pedido.itens} onConfirmar={marcar} />
      <PrevisaoDialogo open={dialogoPrevisao} onOpenChange={setDialogoPrevisao} dtPrevisaoAtual={dados.resumo.previsao} onConfirmar={registrarPrevisao} />
      <DocumentoBoDialogo open={dialogoDocumento} onOpenChange={setDialogoDocumento} onSalvar={anexarDocumento} />
    </div>
  );
}
