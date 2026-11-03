// Faturamento em Andamento e Produtos em B.O. no card (R-150, C-029 e C-030
// da 005), no molde do legado (PipeWorkspace.tsx:12262-12443): o saldo que a
// indústria ainda não faturou, item a item, e o que falta para concluir.
//
// As travas são as do servidor (conferência sem decisão, B.O. em aberto e,
// desde a R-153, menos de 99,5 % do valor coberto). Lê as MESMAS execuções dos
// blocos Notas fiscais e B.O. (`carga-do-card.ts`): nada a mais por abertura.
import * as React from 'react';
import { ArrowRight, CircleCheck, Clock3 } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  BarraConsumo, CartaoLinha, ListaCartoes, MetaDot, Panel, SecaoRecolhivel, Status,
} from '@/components/page';
import { numeroPt } from '@/lib/formato';
import {
  pendenciasDaConclusao, pendentesDeFaturamento, type ItemFaturadoNf, type ItemPedidoNf,
} from '@/lib/conclusao';
import { useCarga } from './carga-do-card';

const ROTULO_SITUACAO = { pendente: 'Não faturado', parcial: 'Parcial', faturado: 'Faturado' } as const;

export default function BlocoConclusao(ctx: ExtensaoContexto) {
  const nf = useCarga('sgcNfListar', ctx.card.id);
  const bo = useCarga('sgcBoCarregar', ctx.card.id);
  const [saldoAberto, setSaldoAberto] = React.useState(false);

  if (!nf.dados || !bo.dados) return null;

  const itensPedido = (nf.dados.itensPedido ?? []) as ItemPedidoNf[];
  const itensNf = (nf.dados.itens ?? []) as ItemFaturadoNf[];
  const ocorrencias = (nf.dados.ocorrencias ?? []) as { DECISAO: string }[];
  const pedido = (nf.dados.pedido ?? {}) as { VL_TOTAL?: number; VL_FATURADO?: number };
  const resumoBo = (bo.dados.resumo ?? {}) as { abertos?: number };
  const itensBo = (bo.dados.itens ?? []) as { STATUS: string; VL_PENDENTE: number }[];

  const saldos = pendentesDeFaturamento(itensPedido, itensNf);
  const conclusao = pendenciasDaConclusao({
    conferenciasPendentes: ocorrencias.filter((o) => o.DECISAO === 'pendente').length,
    boAbertos: Number(resumoBo.abertos) || 0,
    vlTotal: Number(pedido.VL_TOTAL) || 0,
    vlFaturado: Number(pedido.VL_FATURADO) || 0,
    // R-153: o saldo que foi para o B.O. e não vem mais conta como coberto.
    vlBoCancelado: itensBo.filter((i) => i.STATUS === 'cancelado').reduce((soma, i) => soma + (Number(i.VL_PENDENTE) || 0), 0),
  });

  return (
    <div className="flex flex-col gap-4">
      <SecaoRecolhivel
        titulo="Itens pendentes de faturamento"
        resumo={saldos.length === 0
          ? 'Todos os itens do pedido foram faturados.'
          : `${saldos.length} ${saldos.length === 1 ? 'produto com saldo' : 'produtos com saldo'} que a indústria ainda não faturou`}
        aberta={saldoAberto}
        onToggle={() => setSaldoAberto((atual) => !atual)}
      >
        {saldos.length === 0 ? (
          <p className="text-[12px] text-ink-secondary">Nada pendente: as notas cobrem a quantidade pedida de cada item.</p>
        ) : (
          <div className="-m-4">
            <ListaCartoes rotulo="Itens pendentes de faturamento">
              {saldos.map((saldo) => (
                <CartaoLinha
                  key={saldo.codprod}
                  titulo={saldo.descricao || `Produto ${saldo.codprod}`}
                  meta={<>Código {saldo.codprod} <MetaDot /> pedida {numeroPt(saldo.pedida)} <MetaDot /> faturada {numeroPt(saldo.faturada)}</>}
                  valor={numeroPt(saldo.pendente)}
                  valorMeta="pendente"
                >
                  <BarraConsumo pct={saldo.pct} tone={saldo.situacao === 'parcial' ? 'attention' : 'off'} rotulo={`${numeroPt(saldo.pct)} % · ${ROTULO_SITUACAO[saldo.situacao]}`} />
                </CartaoLinha>
              ))}
            </ListaCartoes>
          </div>
        )}
      </SecaoRecolhivel>

      <Panel>
        <div className="flex flex-col gap-2 p-4">
          <p className="flex items-center gap-2 font-title text-[15px] font-bold text-ink">
            {conclusao.pronto
              ? <CircleCheck className="size-4 text-primary" aria-hidden />
              : <Clock3 className="size-4 text-attention" aria-hidden />}
            {conclusao.pronto ? 'Pedido pronto para conclusão' : 'Pendências para concluir o pedido'}
          </p>
          {conclusao.pendencias.length > 0 ? (
            <ul className="flex flex-col gap-1 text-[12px]">
              {conclusao.pendencias.map((pendencia) => (
                <li key={pendencia.texto}>
                  <Status tone="alert">Trava</Status>
                  <span className="ml-2 text-ink-secondary">{pendencia.texto}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-ink-secondary">Valor coberto (99,5 % ou mais), sem conferência pendente e sem item em B.O. em aberto.</p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-rule-row px-4 py-3 text-[12px]">
          <ArrowRight className="size-3.5 text-ink-muted" aria-hidden />
          <span className="text-ink-secondary">Próximo movimento:</span>
          <span className="font-semibold text-ink">Compras Concluídas</span>
        </div>
      </Panel>
    </div>
  );
}
