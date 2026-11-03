// Em Trânsito para BN no card (R-141, C-024 da 006), no molde do legado
// (PipeWorkspace.tsx:10935-11212): o acompanhamento do faturamento — enviado
// em, dias úteis desde o envio e o selo do escalonamento — e os itens do
// pedido com a situação, recolhidos. Regra em `lib/acompanhamento.ts`; capa e
// itens do `PedidoProvider`, sem execução nova.
//
// R-145 (P-4): o botão do legado "Produto faturado — ir para Faturamento"
// (PW:11214-11226). O movimento automático do recebimento continua; este é
// o mesmo `ctx.mover` da coluna da direita, e quem recusa de verdade é o
// `sgcPodeMover` (o par transito>faturamento não tem pendência).
import * as React from 'react';
import { CircleCheck, Truck } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { Button, Panel, SecaoRecolhivel, Status } from '@/components/page';
import { estadoDoPedido } from '@/lib/pedido';
import { motivoDeDestino } from '@/lib/transicoes';
import type { SessaoPersona } from '@/lib/persona';
import type { MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { acompanhamentoDoFaturamento, podeNotificarGestor } from '@/lib/acompanhamento';
import { totaisDoEnvio } from '@/lib/envio-industria';
import { usePedido } from './pedido-contexto';
import ItensEnviados from './ItensEnviados';
import NotificarGestor from './NotificarGestor';

type Props = ExtensaoContexto & { fases: MapaDeFases; sessao: SessaoPersona };

export default function BlocoAcompanhamento({ fases, sessao, ...ctx }: Props) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const [itensAbertos, setItensAbertos] = React.useState(false);
  const [movendo, setMovendo] = React.useState(false);

  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  if (!capa) return null;

  const acompanhamento = acompanhamentoDoFaturamento({ dtEnvio: capa.dtEnvio, hoje: hojeIso(), percFaturado: capa.percFaturadoValor });
  const totais = totaisDoEnvio(pedido.itens);
  const meu = Number(ctx.card.criadoPor ?? 0) === sessao.usuarioId;
  const motivo = motivoDeDestino(sessao.persona, sessao.acesso, 'transito', 'faturamento', estadoDoPedido(null, meu));

  async function irParaFaturamento() {
    setMovendo(true);
    try {
      await ctx.mover(fases.faseIdDe('faturamento'));
    } finally {
      setMovendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-ink-secondary" aria-hidden>
              <Truck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-title text-[15px] font-bold text-ink">Acompanhamento do faturamento</p>
              <p className="text-[12px] text-ink-secondary">
                Pedido enviado em {capa.dtEnvio ? fmtData(capa.dtEnvio) : '—'}
                {capa.numped ? ` · pedido nº ${capa.numped}` : ''}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-title text-2xl font-bold text-ink tabular-nums">{acompanhamento.diasUteis}</p>
            <p className="text-[11px] text-ink-secondary">{acompanhamento.diasUteis === 1 ? 'dia útil' : 'dias úteis'} desde o envio</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule-row px-4 py-2.5 text-[12px]">
          <Status tone={acompanhamento.tom}>{acompanhamento.selo}</Status>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void irParaFaturamento()}
            disabled={movendo || ctx.travado || motivo !== null}
            title={motivo ?? 'O pedido também segue sozinho quando todas as notas dão entrada no WinThor.'}
          >
            <CircleCheck aria-hidden />
            Produto faturado — ir para Faturamento
          </Button>
        </div>
        {podeNotificarGestor(acompanhamento) ? (
          <NotificarGestor
            {...ctx}
            sessao={sessao}
            fornecedor={capa.fornecedor}
            diasUteis={acompanhamento.diasUteis}
            saldo={Math.max(0, capa.vlTotal - capa.vlFaturado)}
          />
        ) : null}
      </Panel>

      <SecaoRecolhivel
        titulo="Itens do pedido"
        resumo={`${totais.produtos} ${totais.produtos === 1 ? 'produto' : 'produtos'} · ${moeda(totais.valor)}`}
        aberta={itensAbertos}
        onToggle={() => setItensAbertos((atual) => !atual)}
      >
        <div className="-m-4">
          <ItensEnviados itens={pedido.itens} comStatus />
        </div>
      </SecaoRecolhivel>
    </div>
  );
}
