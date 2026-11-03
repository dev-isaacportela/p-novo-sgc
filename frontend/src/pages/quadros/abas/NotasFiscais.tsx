// Aba Notas fiscais do pedido aberto (spec 005, RF-005 a RF-016 e RF-022).
//
// Uma execução de `sgcNfListar` por abertura (RNF-001): a aba inteira —
// sugestões, notas, itens, conferências e contatos — vem de uma chamada só, e
// só volta ao servidor depois de uma escrita.
//
// A aba NÃO declara `contagem` no `AbaExtra`: `contagem` é síncrona e lê apenas
// `card.valores`, e não existe campo do quadro com conferências pendentes
// (R-049). O número aparece no cabeçalho do painel, que já tem os dados.

import * as React from 'react';
import { CheckCheck, FilePlus2, Mail, PhoneCall } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, EmptyState, GradeMini, MiniCartao, Panel, PanelHeader, Status,
} from '@/components/page';
import { acao } from '@/lib/mitra-api';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { diasUteisEntre } from '@/lib/dias-uteis';
import { percentuaisFaturados, temNfNaCapa, textoDaCapaFaturamento } from '@/lib/faturamento';
import { rotuloPercentual } from '@/lib/resumo-do-pedido';
import { usePersona } from '@/lib/persona';
import { atualizarCapaDoQuadro, capaMudou } from './capa-do-quadro';
import {
  DialogoCobranca, DialogoContato, DialogoDecidir, DialogoRegistrarNf,
  type ContatoDaAba, type ItemDaAba, type NfDaAba, type OcorrenciaDaAba,
  type PedidoDaAba, type SugestaoDaAba,
} from './nf-dialogos';
import { BlocoDaNota, CartoesDeContato, CartoesDeSugestao } from './nf-cartoes';
import { contagemDeValidade, textoDaOcorrencia } from '@/lib/nf';
import { lerCarga } from './carga-do-card';

interface ItemDoPedido { CODPROD: number; DESCRICAO: string; QT_PEDIDA: number; PRECO_CUSTO: number }

interface Dados {
  pedido: PedidoDaAba | null;
  sugestoes: SugestaoDaAba[];
  nfs: NfDaAba[];
  itens: ItemDaAba[];
  ocorrencias: OcorrenciaDaAba[];
  contatos: ContatoDaAba[];
  itensPedido: ItemDoPedido[];
}

const VAZIO: Dados = { pedido: null, sugestoes: [], nfs: [], itens: [], ocorrencias: [], contatos: [], itensPedido: [] };

const agora = () => new Date().toISOString().slice(0, 19);

export default function AbaNotasFiscais(ctx: ExtensaoContexto) {
  const sessao = usePersona();
  const [dados, setDados] = React.useState<Dados>(VAZIO);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);

  const [registrando, setRegistrando] = React.useState(false);
  const [contatando, setContatando] = React.useState(false);
  const [cobrando, setCobrando] = React.useState(false);
  const [decidindo, setDecidindo] = React.useState<{ ocorrencia: OcorrenciaDaAba; decisao: 'aceito' | 'recusado' } | null>(null);

  const cardId = ctx.card.id;

  /**
   * A aba inteira em UMA execução (RNF-001), dividida com os blocos de
   * conclusão e de concluído (R-150, `carga-do-card.ts`). Só lê: quem guarda
   * é quem chama; depois de gravar, `forcar` avisa os outros blocos.
   */
  const buscar = React.useCallback(async (forcar = false): Promise<Dados> => {
    const resposta = await lerCarga('sgcNfListar', cardId, forcar);
    if (!resposta.ok) throw new Error(String(resposta.erro ?? 'Não foi possível carregar as notas fiscais.'));
    return {
      pedido: (resposta.pedido as PedidoDaAba) ?? null,
      sugestoes: (resposta.sugestoes as SugestaoDaAba[]) ?? [],
      nfs: (resposta.nfs as NfDaAba[]) ?? [],
      itens: (resposta.itens as ItemDaAba[]) ?? [],
      ocorrencias: (resposta.ocorrencias as OcorrenciaDaAba[]) ?? [],
      contatos: (resposta.contatos as ContatoDaAba[]) ?? [],
      itensPedido: (resposta.itensPedido as ItemDoPedido[]) ?? [],
    };
  }, [cardId]);

  React.useEffect(() => {
    let vivo = true;
    buscar()
      .then((novos) => { if (vivo) setDados(novos); })
      .catch((falha) => { if (vivo) setErro(falha instanceof Error ? falha.message : 'Falha ao carregar.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [buscar]);

  const carregar = React.useCallback(async (): Promise<Dados> => {
    const novos = await buscar(true);
    setDados(novos);
    return novos;
  }, [buscar]);

  const pedido = dados.pedido;
  const pendentes = dados.ocorrencias.filter((o) => o.DECISAO === 'pendente');
  const conformesPendentes = pendentes.filter((o) => o.RESULTADO === 'conforme');
  const podeOperar = !!sessao?.permissoes.operarNf;
  const podeContatar = !!sessao?.permissoes.registrarContato;
  const bloqueado = ctx.travado || ocupado || !podeOperar;
  const diasUteis = pedido?.DT_ENVIO ? diasUteisEntre(pedido.DT_ENVIO, hojeIso()) : 0;

  const motivoSemPermissao = sessao && !podeOperar
    ? 'O seu perfil não vincula nota fiscal nem decide conferências.'
    : '';

  /**
   * RN-013 / R-042: depois de cada escrita, a capa do cartão recebe a MESMA
   * frase que o cron escreveria. `capaMudou` evita o `kbCardAtualizar` inútil —
   * e, com ele, o recarregamento do quadro inteiro.
   */
  const espelharCapa = React.useCallback(async (novos: Dados) => {
    if (!novos.pedido) return;
    const { valor, saldo } = percentuaisFaturados({
      vlPedido: Number(novos.pedido.VL_TOTAL) || 0,
      vlFaturado: Number(novos.pedido.VL_FATURADO) || 0,
      qtPedida: 0, qtFaturada: 0,
    });
    const espelho = {
      faturamento: textoDaCapaFaturamento({
        // A-7: o MESMO critério do cron (valor faturado > 0), não a contagem de
        // linhas de SGC_NF — com uma nota de VL_TOTAL zero os dois textos
        // divergiam e um sobrescrevia o outro a cada rodada.
        temNf: temNfNaCapa(novos.pedido.VL_FATURADO),
        vlFaturado: Number(novos.pedido.VL_FATURADO) || 0,
        percValor: Number(novos.pedido.PERC_FATURADO_VALOR) || valor,
        saldo,
        diasUteis: novos.pedido.DT_ENVIO ? diasUteisEntre(novos.pedido.DT_ENVIO, hojeIso()) : 0,
      }),
    };
    if (!capaMudou(ctx.card, espelho)) return;
    await atualizarCapaDoQuadro(ctx.card, espelho);
    await ctx.recarregar();
  }, [ctx]);

  /** Uma escrita, o recarregamento da aba e o espelho da capa — nessa ordem. */
  const gravar = React.useCallback(async (executar: () => Promise<void>) => {
    setOcupado(true);
    setErro('');
    try {
      await executar();
      await espelharCapa(await carregar());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar.');
    } finally {
      setOcupado(false);
    }
  }, [carregar, espelharCapa]);

  async function validarSugestao(sugestao: SugestaoDaAba) {
    await gravar(async () => {
      const resposta = await acao('sgcNfVincular', {
        cardId, idSugestao: sugestao.ID, numnota: sugestao.NUMNOTA, serie: sugestao.SERIE,
        codfornec: sugestao.CODFORNEC, codfilial: sugestao.CODFILIAL,
        origem: sugestao.ORIGEM || 'automatica', itensJson: '',
      });
      if (!resposta.ok) throw new Error(String(resposta.erro ?? 'Não foi possível vincular a nota.'));
      // A sugestão só sai da fila depois de a nota entrar: se o vínculo falhar,
      // ela continua lá para alguém decidir de novo.
      await acao('sgcEscSugestaoDecidir', {
        id: sugestao.ID, status: 'validada', motivo: '', decididoEm: agora(),
      });
    });
  }

  async function recusarSugestao(sugestao: SugestaoDaAba) {
    await gravar(async () => {
      await acao('sgcEscSugestaoDecidir', {
        id: sugestao.ID, status: 'recusada',
        motivo: 'Recusada na aba do pedido.', decididoEm: agora(),
      });
    });
  }

  async function aceitarConformes() {
    await gravar(async () => {
      const resposta = await acao('sgcOcorrenciaDecidir', {
        cardId, idOcorrencia: 0, modo: 'conformes', decisao: 'aceito', justificativa: '',
      });
      if (!resposta.ok) throw new Error(String(resposta.erro ?? 'Nada foi decidido.'));
    });
  }

  if (carregando) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando as notas fiscais...</p>;
  }

  if (!pedido) {
    return <EmptyState title="Pedido não encontrado" hint={erro || 'Este cartão não tem pedido de compra ligado.'} />;
  }

  const saldo = (Number(pedido.VL_TOTAL) || 0) - (Number(pedido.VL_FATURADO) || 0);
  const validade = dados.itens.length > 0 ? contagemDeValidade(dados.itens, hojeIso()) : null;

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {motivoSemPermissao ? <Alert tone="info">{motivoSemPermissao}</Alert> : null}

      {/* ── resumo do faturamento (RF-016), no molde do legado: números em cima, ações embaixo ── */}
      <Panel>
        <PanelHeader
          title="Faturamento do pedido"
          hint={`Enviado em ${fmtData(pedido.DT_ENVIO)} · ${diasUteis} ${diasUteis === 1 ? 'dia útil' : 'dias úteis'}`}
        />
        <div className="flex flex-col gap-3 p-4">
          <GradeMini colunas={4}>
            <MiniCartao rotulo="Em valor" valor={rotuloPercentual(Number(pedido.PERC_FATURADO_VALOR ?? 0))} hint={moeda(pedido.VL_FATURADO)} />
            <MiniCartao rotulo="Em quantidade" valor={rotuloPercentual(Number(pedido.PERC_FATURADO_QTD ?? 0))} />
            <MiniCartao rotulo="Saldo" valor={moeda(Math.max(0, saldo))} hint={`de ${moeda(pedido.VL_TOTAL)}`} />
            <MiniCartao rotulo="Notas" valor={dados.nfs.length} hint={pendentes.length > 0 ? `${pendentes.length} conferência(s) pendente(s)` : undefined} />
          </GradeMini>
          {validade ? (
            // R-152 (P-5): a faixa de validade do resumo do legado (PW:11349-11365).
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
              <span>Validade dos itens faturados:</span>
              <Status tone="live">{validade.conforme} {validade.conforme === 1 ? 'conforme' : 'conformes'}</Status>
              <Status tone="attention">{validade.atencao} em atenção (até 120 d)</Status>
              <Status tone="alert">{validade.critica} {validade.critica === 1 ? 'crítica' : 'críticas'} (abaixo de 90 d)</Status>
              {validade.semData > 0 ? <Status tone="off">{validade.semData} sem data</Status> : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setRegistrando(true)} disabled={bloqueado}>
              <FilePlus2 aria-hidden />
              Registrar NF
            </Button>
            <Button size="sm" onClick={() => setContatando(true)} disabled={ctx.travado || ocupado || !podeContatar}>
              <PhoneCall aria-hidden />
              Registrar contato
            </Button>
            <Button size="sm" onClick={() => setCobrando(true)} disabled={ctx.travado || ocupado || !podeContatar}>
              <Mail aria-hidden />
              Enviar cobrança
            </Button>
          </div>
        </div>
      </Panel>

      {/* ── sugestões pendentes (RF-001 a RF-004) ── */}
      {dados.sugestoes.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Notas identificadas no WinThor"
            hint="Encontradas pela rotina diária; nada é vinculado sem alguém validar."
          />
          <CartoesDeSugestao
            sugestoes={dados.sugestoes}
            bloqueado={bloqueado}
            aoValidar={(sugestao) => void validarSugestao(sugestao)}
            aoRecusar={(sugestao) => void recusarSugestao(sugestao)}
          />
        </Panel>
      ) : null}

      {/* ── notas vinculadas, com itens e conferências (RF-006 a RF-013) ── */}
      <Panel>
        <PanelHeader
          title="Notas vinculadas"
          hint={pendentes.length > 0
            ? `${pendentes.length} ${pendentes.length === 1 ? 'conferência pendente' : 'conferências pendentes'} — o pedido não conclui assim.`
            : dados.nfs.length > 0 ? 'Todas as conferências foram decididas.' : undefined}
        >
          {conformesPendentes.length > 0 ? (
            <Button size="sm" variant="primary" onClick={() => void aceitarConformes()} disabled={bloqueado}>
              <CheckCheck aria-hidden />
              Aceitar os {conformesPendentes.length} conformes
            </Button>
          ) : null}
        </PanelHeader>

        {dados.nfs.length === 0 ? (
          <EmptyState
            title="Nenhuma nota vinculada"
            hint="Valide uma nota identificada ou registre a nota pelo número — o pedido não entra em Em Trânsito para BN sem nota."
          />
        ) : (
          dados.nfs.map((nf) => (
            <BlocoDaNota
              key={nf.ID}
              nf={nf}
              itens={dados.itens.filter((item) => item.ID_NF === nf.ID)}
              ocorrencias={dados.ocorrencias.filter((o) => o.ID_NF === nf.ID)}
              bloqueado={bloqueado}
              aoDecidir={(ocorrencia, decisao) => setDecidindo({ ocorrencia, decisao })}
            />
          ))
        )}
      </Panel>

      {/* ── contatos de faturamento (RF-022) ── */}
      <Panel>
        <PanelHeader
          title="Contatos com a indústria"
          hint={dados.contatos.length > 0
            ? `Último contato em ${fmtData(dados.contatos[0].DT_CONTATO)} · cada cobrança e cada retorno ficam aqui.`
            : 'Cada cobrança e cada retorno ficam registrados aqui.'}
        />
        {dados.contatos.length === 0 ? (
          <EmptyState title="Nenhum contato registrado" hint="Registre o que a indústria respondeu sobre o faturamento." />
        ) : (
          <CartoesDeContato contatos={dados.contatos} />
        )}
      </Panel>

      <DialogoRegistrarNf
        aberto={registrando}
        onOpenChange={setRegistrando}
        pedido={pedido}
        aoVincular={async () => { await espelharCapa(await carregar()); }}
      />
      <DialogoDecidir
        alvo={decidindo}
        onFechar={() => setDecidindo(null)}
        cardId={cardId}
        rotulo={decidindo ? textoDaConferencia(decidindo.ocorrencia, dados.itens) : ''}
        aoDecidir={async () => { await espelharCapa(await carregar()); }}
      />
      <DialogoContato
        aberto={contatando}
        onOpenChange={setContatando}
        cardId={cardId}
        aoRegistrar={async () => { await carregar(); }}
      />
      <DialogoCobranca
        aberto={cobrando}
        onOpenChange={setCobrando}
        pedido={pedido}
        diasUteis={diasUteis}
        aoEnviar={async () => { await carregar(); }}
      />
    </div>
  );
}

/** A frase da conferência (D-006), com a descrição do produto quando há item. */
function textoDaConferencia(ocorrencia: OcorrenciaDaAba, itens: ItemDaAba[]): string {
  const item = itens.find((linha) => linha.CODPROD === ocorrencia.CODPROD);
  return textoDaOcorrencia(ocorrencia, item?.DESCRICAO ?? '');
}
