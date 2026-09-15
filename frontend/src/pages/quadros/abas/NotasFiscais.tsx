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
import { CheckCheck, FilePlus2, Mail, PhoneCall, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, Dash, EmptyState, Panel, PanelHeader, Stat, Status,
  Table, Td, Th, Tr,
} from '@/components/page';
import { acao } from '@/lib/mitra-api';
import { fmtData, fmtDataHora, hojeIso, moeda } from '@/lib/formato';
import { diasUteisEntre } from '@/lib/dias-uteis';
import { ROTULO_OCORRENCIA, textoDaOcorrencia } from '@/lib/nf';
import { percentuaisFaturados, textoDaCapaFaturamento } from '@/lib/faturamento';
import { usePersona } from '@/lib/persona';
import { atualizarCapaDoQuadro, capaMudou } from './capa-do-quadro';
import {
  DialogoCobranca, DialogoContato, DialogoDecidir, DialogoRegistrarNf,
  type ContatoDaAba, type ItemDaAba, type NfDaAba, type OcorrenciaDaAba,
  type PedidoDaAba, type SugestaoDaAba,
} from './nf-dialogos';

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

const TOM_RESULTADO = { conforme: 'live', atencao: 'attention', divergente: 'alert' } as const;
const TOM_DECISAO = { aceito: 'live', pendente: 'attention', recusado: 'alert' } as const;

const ROTULO_CASAMENTO: Record<string, string> = {
  codprod: 'Código do produto',
  codfab: 'Código de fábrica',
  ean: 'Código de barras',
  nenhum: 'Não casou',
};

const ROTULO_CANAL: Record<string, string> = {
  email: 'E-mail', telefone: 'Telefone', whatsapp: 'WhatsApp', portal: 'Portal', outro: 'Outro',
};

function tom<T extends Record<string, string>>(mapa: T, chave: string, padrao: 'off' = 'off') {
  return (mapa[chave] ?? padrao) as 'live' | 'attention' | 'alert' | 'off';
}

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

  /** A aba inteira em UMA execução (RNF-001). Só lê: quem guarda é quem chama. */
  const buscar = React.useCallback(async (): Promise<Dados> => {
    const resposta = await acao('sgcNfListar', { cardId });
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
    const novos = await buscar();
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
        temNf: novos.nfs.length > 0,
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

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {motivoSemPermissao ? <Alert tone="info">{motivoSemPermissao}</Alert> : null}

      {/* ── resumo do faturamento (RF-016) ── */}
      <Panel>
        <PanelHeader
          title="Faturamento do pedido"
          hint={`Enviado em ${fmtData(pedido.DT_ENVIO)} · ${diasUteis} dias úteis`}
        >
          <Button size="sm" onClick={() => setContatando(true)} disabled={ctx.travado || ocupado || !podeContatar}>
            <PhoneCall aria-hidden />
            Registrar contato
          </Button>
          <Button size="sm" onClick={() => setCobrando(true)} disabled={ctx.travado || ocupado || !podeContatar}>
            <Mail aria-hidden />
            Enviar cobrança
          </Button>
          <Button size="sm" variant="primary" onClick={() => setRegistrando(true)} disabled={bloqueado}>
            <FilePlus2 aria-hidden />
            Registrar NF
          </Button>
        </PanelHeader>
        <div className="flex flex-wrap gap-6 px-4 py-3 text-[13px]">
          <Stat>Pedido <strong>{moeda(pedido.VL_TOTAL)}</strong></Stat>
          <Stat>Faturado <strong>{moeda(pedido.VL_FATURADO)}</strong></Stat>
          <Stat>Saldo <strong>{moeda(saldo)}</strong></Stat>
          <Stat>Em valor <strong>{Number(pedido.PERC_FATURADO_VALOR ?? 0).toFixed(2).replace('.', ',')} %</strong></Stat>
          <Stat>Em quantidade <strong>{Number(pedido.PERC_FATURADO_QTD ?? 0).toFixed(2).replace('.', ',')} %</strong></Stat>
        </div>
      </Panel>

      {/* ── sugestões pendentes (RF-001 a RF-004) ── */}
      {dados.sugestoes.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Notas sugeridas"
            hint="Encontradas no WinThor pela rotina diária; nada é vinculado sem alguém validar."
          />
          <Table>
            <thead>
              <tr>
                <Th>Nota</Th>
                <Th>Emissão</Th>
                <Th numeric>Valor</Th>
                <Th numeric>Pontuação</Th>
                <Th>Por quê</Th>
                <Th className="w-44 text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {dados.sugestoes.map((sugestao) => (
                <Tr key={sugestao.ID}>
                  <Td>
                    <span className="font-semibold text-ink">{sugestao.NUMNOTA}{sugestao.SERIE ? ` / ${sugestao.SERIE}` : ''}</span>
                    <span className="block text-[12px] text-ink-secondary">
                      {sugestao.ORIGEM === 'pedido' ? 'Casada pelo número do pedido' : 'Semelhança de itens'}
                    </span>
                  </Td>
                  <Td>{fmtData(sugestao.DT_EMISSAO)}</Td>
                  <Td numeric>{moeda(sugestao.VL_TOTAL)}</Td>
                  <Td numeric>
                    <Status tone={sugestao.SCORE >= 80 ? 'live' : 'attention'}>{sugestao.SCORE}</Status>
                  </Td>
                  <Td>{sugestao.MOTIVO || <Dash />}</Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <Button size="sm" onClick={() => void recusarSugestao(sugestao)} disabled={bloqueado}>Recusar</Button>
                      <Button size="sm" variant="primary" onClick={() => void validarSugestao(sugestao)} disabled={bloqueado}>Validar</Button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}

      {/* ── notas vinculadas, com itens e conferências (RF-006 a RF-013) ── */}
      <Panel>
        <PanelHeader
          title="Notas vinculadas"
          hint={pendentes.length > 0
            ? `${pendentes.length} ${pendentes.length === 1 ? 'conferência pendente' : 'conferências pendentes'} — o pedido não conclui assim.`
            : 'Todas as conferências foram decididas.'}
        >
          <Button
            size="sm"
            variant="primary"
            onClick={() => void aceitarConformes()}
            disabled={bloqueado || conformesPendentes.length === 0}
          >
            <CheckCheck aria-hidden />
            Aceitar os {conformesPendentes.length} conformes
          </Button>
        </PanelHeader>

        {dados.nfs.length === 0 ? (
          <EmptyState
            title="Nenhuma nota vinculada"
            hint="Valide uma sugestão ou registre a nota pelo número — o pedido não entra em Em Trânsito para BN sem nota."
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
        <PanelHeader title="Contatos com a indústria" hint="Cada cobrança e cada retorno ficam registrados aqui." />
        {dados.contatos.length === 0 ? (
          <EmptyState title="Nenhum contato registrado" hint="Registre o que a indústria respondeu sobre o faturamento." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Canal</Th>
                <Th>Resumo</Th>
                <Th>Previsão</Th>
                <Th>Quem registrou</Th>
              </tr>
            </thead>
            <tbody>
              {dados.contatos.map((contato) => (
                <Tr key={contato.ID}>
                  <Td>{fmtDataHora(contato.DT_CONTATO)}</Td>
                  <Td>{ROTULO_CANAL[contato.CANAL] ?? contato.CANAL}</Td>
                  <Td>{contato.RESUMO || <Dash />}</Td>
                  <Td>{contato.PREVISAO_FATURAMENTO ? fmtData(contato.PREVISAO_FATURAMENTO) : <Dash />}</Td>
                  <Td>{contato.REGISTRADO_NOME || <Dash />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
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

/**
 * Uma nota: cabeçalho, itens e as conferências agrupadas POR ITEM — as de
 * pedido (prazo, valor total, percentual) vêm por último, com CODPROD 0.
 */
function BlocoDaNota({
  nf, itens, ocorrencias, bloqueado, aoDecidir,
}: {
  nf: NfDaAba;
  itens: ItemDaAba[];
  ocorrencias: OcorrenciaDaAba[];
  bloqueado: boolean;
  aoDecidir: (ocorrencia: OcorrenciaDaAba, decisao: 'aceito' | 'recusado') => void;
}) {
  const doPedido = ocorrencias.filter((o) => !o.CODPROD);

  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[13px] font-semibold text-ink">
          NF {nf.NUMNOTA}{nf.SERIE ? ` / ${nf.SERIE}` : ''}
        </span>
        <span className="text-[12px] text-ink-secondary">Emissão {fmtData(nf.DT_EMISSAO)}</span>
        <span className="text-[12px] text-ink-secondary">
          {nf.DT_ENTRADA ? `Entrada ${fmtData(nf.DT_ENTRADA)}` : 'Ainda sem entrada no armazém'}
        </span>
        <span className="text-[12px] text-ink-secondary">{moeda(nf.VL_TOTAL)}</span>
        {nf.PRAZO_PARCELAS ? <span className="text-[12px] text-ink-secondary">Prazo {nf.PRAZO_PARCELAS}</span> : null}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th numeric>Faturado</Th>
            <Th>Lote</Th>
            <Th>Casamento</Th>
            <Th>Conferências</Th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <Tr key={item.ID}>
              <Td>
                <span className="font-semibold text-ink">{item.DESCRICAO || `Produto ${item.CODPROD}`}</span>
                <span className="block text-[12px] text-ink-secondary">Código {item.CODPROD}</span>
              </Td>
              <Td numeric>
                {Number(item.QT_FATURADA ?? 0).toLocaleString('pt-BR')}
                <span className="block text-[12px] text-ink-secondary">{moeda(item.PRECO_FATURADO)}</span>
              </Td>
              <Td>
                {item.NUMLOTE || <Dash />}
                {item.DT_VALIDADE ? <span className="block text-[12px] text-ink-secondary">vence {fmtData(item.DT_VALIDADE)}</span> : null}
              </Td>
              <Td>
                <Status tone={item.CASADO_POR === 'codprod' ? 'live' : item.CASADO_POR === 'nenhum' ? 'alert' : 'attention'}>
                  {ROTULO_CASAMENTO[item.CASADO_POR] ?? item.CASADO_POR}
                </Status>
              </Td>
              <Td>
                <ListaDeConferencias
                  ocorrencias={ocorrencias.filter((o) => o.CODPROD === item.CODPROD)}
                  descricao={item.DESCRICAO}
                  bloqueado={bloqueado}
                  aoDecidir={aoDecidir}
                />
              </Td>
            </Tr>
          ))}
          {doPedido.length > 0 ? (
            <Tr>
              <Td colSpan={4}>
                <span className="font-semibold text-ink">Conferências do pedido</span>
                <span className="block text-[12px] text-ink-secondary">Prazo, valor total e percentual faturado</span>
              </Td>
              <Td>
                <ListaDeConferencias
                  ocorrencias={doPedido}
                  descricao=""
                  bloqueado={bloqueado}
                  aoDecidir={aoDecidir}
                />
              </Td>
            </Tr>
          ) : null}
        </tbody>
      </Table>
    </div>
  );
}

function ListaDeConferencias({
  ocorrencias, descricao, bloqueado, aoDecidir,
}: {
  ocorrencias: OcorrenciaDaAba[];
  descricao: string;
  bloqueado: boolean;
  aoDecidir: (ocorrencia: OcorrenciaDaAba, decisao: 'aceito' | 'recusado') => void;
}) {
  if (ocorrencias.length === 0) return <Dash />;
  return (
    <ul className="flex flex-col gap-2">
      {ocorrencias.map((ocorrencia) => (
        <li key={ocorrencia.ID} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Status tone={tom(TOM_RESULTADO, ocorrencia.RESULTADO)}>
            {ROTULO_OCORRENCIA[ocorrencia.TIPO] ?? ocorrencia.TIPO}
          </Status>
          <span className="text-[12px] text-ink-secondary">{textoDaOcorrencia(ocorrencia, descricao)}</span>
          <Status tone={tom(TOM_DECISAO, ocorrencia.DECISAO)}>
            {ocorrencia.DECISAO === 'pendente'
              ? 'Pendente'
              : `${ocorrencia.DECISAO === 'aceito' ? 'Aceita' : 'Recusada'}${ocorrencia.DECIDIDO_NOME ? ` por ${ocorrencia.DECIDIDO_NOME}` : ''}`}
          </Status>
          {ocorrencia.DECISAO === 'pendente' ? (
            <span className="inline-flex items-center gap-1">
              <Button size="sm" onClick={() => aoDecidir(ocorrencia, 'aceito')} disabled={bloqueado}>
                <ThumbsUp aria-hidden />
                Aceitar
              </Button>
              <Button size="sm" onClick={() => aoDecidir(ocorrencia, 'recusado')} disabled={bloqueado}>
                <ThumbsDown aria-hidden />
                Recusar
              </Button>
            </span>
          ) : null}
          {ocorrencia.JUSTIFICATIVA ? (
            <span className="block w-full text-[12px] text-ink-secondary">{ocorrencia.JUSTIFICATIVA}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
