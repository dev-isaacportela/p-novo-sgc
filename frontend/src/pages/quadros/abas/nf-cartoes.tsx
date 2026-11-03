// As listas do bloco Notas fiscais em cartões (R-150): no card estreito, a
// nota, as sugestões e os contatos deixam de ser tabelas de cinco ou seis
// colunas. O conteúdo é o mesmo de antes (spec 005, RF-005 a RF-013 e RF-022);
// só a forma muda. Quem carrega e grava continua sendo `NotasFiscais.tsx`.
import * as React from 'react';
import { ChevronDown, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button, CartaoLinha, Dash, ListaCartoes, MetaDot, Status, TextLink,
} from '@/components/page';
import { fmtData, fmtDataHora, hojeIso, moeda, numeroPt } from '@/lib/formato';
import { ROTULO_OCORRENCIA, seloDeValidade, textoDaOcorrencia, type SeloValidade } from '@/lib/nf';
import type {
  ContatoDaAba, ItemDaAba, NfDaAba, OcorrenciaDaAba, SugestaoDaAba,
} from './nf-dialogos';

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

function tom<T extends Record<string, string>>(mapa: T, chave: string) {
  return (mapa[chave] ?? 'off') as 'live' | 'attention' | 'alert' | 'off';
}

export function CartoesDeSugestao({
  sugestoes, bloqueado, aoValidar, aoRecusar,
}: {
  sugestoes: SugestaoDaAba[];
  bloqueado: boolean;
  aoValidar: (sugestao: SugestaoDaAba) => void;
  aoRecusar: (sugestao: SugestaoDaAba) => void;
}) {
  return (
    <ListaCartoes rotulo="Notas sugeridas">
      {sugestoes.map((sugestao) => (
        <CartaoLinha
          key={sugestao.ID}
          titulo={`NF ${sugestao.NUMNOTA}${sugestao.SERIE ? ` / ${sugestao.SERIE}` : ''}`}
          meta={<>{sugestao.ORIGEM === 'pedido' ? 'Casada pelo número do pedido' : 'Semelhança de itens'} <MetaDot /> emissão {fmtData(sugestao.DT_EMISSAO)}</>}
          valor={moeda(sugestao.VL_TOTAL)}
          acoes={(
            <>
              <Button size="sm" onClick={() => aoRecusar(sugestao)} disabled={bloqueado}>Recusar</Button>
              <Button size="sm" variant="primary" onClick={() => aoValidar(sugestao)} disabled={bloqueado}>Validar</Button>
            </>
          )}
        >
          <Status tone={sugestao.SCORE >= 80 ? 'live' : 'attention'}>Pontuação {sugestao.SCORE}</Status>
          {sugestao.MOTIVO ? <span>{sugestao.MOTIVO}</span> : null}
        </CartaoLinha>
      ))}
    </ListaCartoes>
  );
}

export function CartoesDeContato({ contatos }: { contatos: ContatoDaAba[] }) {
  return (
    <ListaCartoes rotulo="Contatos com a indústria">
      {contatos.map((contato) => (
        <CartaoLinha
          key={contato.ID}
          titulo={contato.RESUMO || <Dash />}
          meta={<>{ROTULO_CANAL[contato.CANAL] ?? contato.CANAL} <MetaDot /> {fmtDataHora(contato.DT_CONTATO)}{contato.REGISTRADO_NOME ? <> <MetaDot /> {contato.REGISTRADO_NOME}</> : null}</>}
          valor={contato.PREVISAO_FATURAMENTO ? fmtData(contato.PREVISAO_FATURAMENTO) : undefined}
          valorMeta={contato.PREVISAO_FATURAMENTO ? 'previsão' : undefined}
        />
      ))}
    </ListaCartoes>
  );
}

const SELO: Record<SeloValidade, { tom: 'alert' | 'attention' | 'live'; rotulo: string }> = {
  critica: { tom: 'alert', rotulo: 'Validade crítica' },
  atencao: { tom: 'attention', rotulo: 'Validade em atenção' },
  conforme: { tom: 'live', rotulo: 'Validade conforme' },
};

/** R-152 (P-5): o selo 90/120 do legado, com os dias até vencer. Sem data, nada. */
export function SeloDeValidade({ dtValidade }: { dtValidade: string | null | undefined }) {
  const selo = seloDeValidade(dtValidade, hojeIso());
  if (!selo) return null;
  const { tom, rotulo } = SELO[selo.selo];
  return <Status tone={tom}>{rotulo} · {selo.dias < 0 ? `vencida há ${-selo.dias} d` : `${selo.dias} d`}</Status>;
}

type AoDecidir = (ocorrencia: OcorrenciaDaAba, decisao: 'aceito' | 'recusado') => void;

/**
 * Uma nota: cabeçalho, itens e as conferências agrupadas POR ITEM — as de
 * pedido (prazo, valor total, percentual) vêm por último, com CODPROD 0.
 *
 * R-150 / R-126: a nota nasce recolhida, com o resumo das conferências no
 * cabeçalho; aberta, mostra primeiro só o que precisa de olho (divergência ou
 * atenção) — o "Ocultar conformes" do legado (NfAutomacaoPanels.tsx:295-302).
 * Uma nota de 28 itens tem mais de cem conferências conformes.
 */
export function BlocoDaNota({
  nf, itens, ocorrencias, bloqueado, aoDecidir,
}: {
  nf: NfDaAba;
  itens: ItemDaAba[];
  ocorrencias: OcorrenciaDaAba[];
  bloqueado: boolean;
  aoDecidir: AoDecidir;
}) {
  const [aberta, setAberta] = React.useState(false);
  const [conformes, setConformes] = React.useState(false);
  const doPedido = ocorrencias.filter((o) => !o.CODPROD);
  const visivel = (o: OcorrenciaDaAba) => conformes || o.RESULTADO !== 'conforme';
  const itensVisiveis = conformes ? itens : itens.filter((item) => ocorrencias.some((o) => o.CODPROD === item.CODPROD && visivel(o)));
  const fora = ocorrencias.filter((o) => o.RESULTADO !== 'conforme').length;
  const pendentes = ocorrencias.filter((o) => o.DECISAO === 'pendente').length;
  const ocultos = itens.length - itensVisiveis.length;

  return (
    <div className="border-t border-rule-row first:border-t-0 last:overflow-hidden last:rounded-b-2xl">
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        aria-expanded={aberta}
        className="flex w-full items-center justify-between gap-3 bg-muted px-4 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-ink">
            NF {nf.NUMNOTA}{nf.SERIE ? ` / ${nf.SERIE}` : ''}
            <span className="ml-2 font-normal text-ink-secondary">{moeda(nf.VL_TOTAL)}</span>
          </span>
          <span className="block text-[12px] text-ink-secondary">
            Emissão {fmtData(nf.DT_EMISSAO)} <MetaDot /> {nf.DT_ENTRADA ? `entrada ${fmtData(nf.DT_ENTRADA)}` : 'sem entrada no armazém'}
            {nf.PRAZO_PARCELAS ? <> <MetaDot /> prazo {nf.PRAZO_PARCELAS}</> : null}
            {' '}<MetaDot /> {itens.length} {itens.length === 1 ? 'item' : 'itens'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-[12px]">
          {fora > 0 ? <Status tone="alert">{fora} {fora === 1 ? 'divergência' : 'divergências'}</Status> : null}
          <Status tone={pendentes > 0 ? 'attention' : 'live'}>{pendentes > 0 ? `${pendentes} sem decisão` : 'Decidida'}</Status>
          <ChevronDown className={cn('size-4 text-ink-muted transition-transform', aberta && 'rotate-180')} aria-hidden />
        </span>
      </button>

      {aberta ? (
        <>
          <ListaCartoes rotulo={`Itens da NF ${nf.NUMNOTA}`}>
            {itensVisiveis.map((item) => (
              <CartaoLinha
                key={item.ID}
                titulo={item.DESCRICAO || `Produto ${item.CODPROD}`}
                meta={(
                  <>
                    Código {item.CODPROD}
                    {item.NUMLOTE ? <> <MetaDot /> lote {item.NUMLOTE}</> : null}
                    {item.DT_VALIDADE ? <> <MetaDot /> vence {fmtData(item.DT_VALIDADE)}</> : null}
                  </>
                )}
                valor={numeroPt(item.QT_FATURADA)}
                valorMeta={moeda(item.PRECO_FATURADO)}
              >
                <Status tone={item.CASADO_POR === 'codprod' ? 'live' : item.CASADO_POR === 'nenhum' ? 'alert' : 'attention'}>
                  {ROTULO_CASAMENTO[item.CASADO_POR] ?? item.CASADO_POR}
                </Status>
                <SeloDeValidade dtValidade={item.DT_VALIDADE} />
                <ListaDeConferencias
                  ocorrencias={ocorrencias.filter((o) => o.CODPROD === item.CODPROD && visivel(o))}
                  descricao={item.DESCRICAO}
                  bloqueado={bloqueado}
                  aoDecidir={aoDecidir}
                />
              </CartaoLinha>
            ))}
            {doPedido.some(visivel) ? (
              <CartaoLinha titulo="Conferências do pedido" meta="Prazo, valor total e percentual faturado">
                <ListaDeConferencias ocorrencias={doPedido.filter(visivel)} descricao="" bloqueado={bloqueado} aoDecidir={aoDecidir} />
              </CartaoLinha>
            ) : null}
          </ListaCartoes>
          {ocultos > 0 || conformes ? (
            <div className="border-t border-rule-row px-4 py-2.5">
              <TextLink onClick={() => setConformes((atual) => !atual)}>
                {conformes ? 'Mostrar só o que diverge' : `Mostrar os ${ocultos} ${ocultos === 1 ? 'item conforme' : 'itens conformes'}`}
              </TextLink>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ListaDeConferencias({
  ocorrencias, descricao, bloqueado, aoDecidir,
}: {
  ocorrencias: OcorrenciaDaAba[];
  descricao: string;
  bloqueado: boolean;
  aoDecidir: AoDecidir;
}) {
  if (ocorrencias.length === 0) return null;
  return (
    <ul className="flex w-full flex-col gap-2">
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
