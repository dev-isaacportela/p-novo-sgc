// Em Trânsito para BN no card (R-150, C-024 da 006), no molde do legado
// (PipeWorkspace.tsx:10935-11212): o acompanhamento do faturamento — enviado
// em, dias úteis desde o envio e o selo do escalonamento — e os itens do
// pedido com a situação, recolhidos. Regra em `lib/acompanhamento.ts`; capa e
// itens do `PedidoProvider`, sem execução nova.
import * as React from 'react';
import { Truck } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { Panel, SecaoRecolhivel, Status } from '@/components/page';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { acompanhamentoDoFaturamento } from '@/lib/acompanhamento';
import { totaisDoEnvio } from '@/lib/envio-industria';
import { usePedido } from './pedido-contexto';
import ItensEnviados from './ItensEnviados';

export default function BlocoAcompanhamento(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const [itensAbertos, setItensAbertos] = React.useState(false);

  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  if (!capa) return null;

  const acompanhamento = acompanhamentoDoFaturamento({ dtEnvio: capa.dtEnvio, hoje: hojeIso(), percFaturado: capa.percFaturadoValor });
  const totais = totaisDoEnvio(pedido.itens);

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
        <div className="border-t border-rule-row px-4 py-2.5 text-[12px]">
          <Status tone={acompanhamento.tom}>{acompanhamento.selo}</Status>
        </div>
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
