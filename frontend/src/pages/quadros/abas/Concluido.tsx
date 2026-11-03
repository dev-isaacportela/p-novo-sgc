// Compras Concluídas no card (R-141, C-031 da 005), no molde do legado
// (PipeWorkspace.tsx:12490-12643): o resumo do que chegou e os itens
// faturados, nota a nota, com lote, validade e a decisão das conferências.
// Lê o `sgcNfListar` pela carga compartilhada (uma execução por abertura).
//
// O "valor aceito" do legado descontava os itens mandados a um card filho de
// B.O.; no SGC 2 o B.O. é do próprio pedido (P-2 do levantamento), então o
// topo mostra o faturado e quanto dele teve conferência recusada.
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  CartaoLinha, GradeMini, ListaCartoes, MetaDot, MiniCartao, Panel, PanelHeader, RodapeTotal, Status,
} from '@/components/page';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import {
  itensFaturados, type ConferenciaNf, type ItemFaturadoNf, type NotaNf,
} from '@/lib/conclusao';
import { useCarga } from './carga-do-card';
import { SeloDeValidade } from './nf-cartoes';

const DECISAO = {
  aceito: { tom: 'live', rotulo: 'Aceito' },
  pendente: { tom: 'attention', rotulo: 'Conferência pendente' },
  recusado: { tom: 'alert', rotulo: 'Recusado na conferência' },
} as const;

export default function BlocoConcluido(ctx: ExtensaoContexto) {
  const nf = useCarga('sgcNfListar', ctx.card.id);
  if (!nf.dados) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">{nf.erro || 'Carregando os itens faturados...'}</p>;
  }

  const notas = (nf.dados.nfs ?? []) as NotaNf[];
  const itens = itensFaturados(
    (nf.dados.itens ?? []) as ItemFaturadoNf[],
    notas,
    (nf.dados.ocorrencias ?? []) as ConferenciaNf[],
  );
  const pedido = (nf.dados.pedido ?? {}) as { VL_TOTAL?: number; VL_FATURADO?: number };
  const recusados = itens.filter((item) => item.decisao === 'recusado');
  const total = itens.reduce((soma, item) => soma + item.subtotal, 0);

  return (
    <Panel>
      <PanelHeader
        title="Pedido concluído"
        hint={`${itens.length} ${itens.length === 1 ? 'item faturado' : 'itens faturados'} em ${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`}
      />
      <div className="p-4">
        <GradeMini colunas={3}>
          <MiniCartao rotulo="Valor faturado" valor={moeda(pedido.VL_FATURADO)} hint={`pedido ${moeda(pedido.VL_TOTAL)}`} />
          <MiniCartao rotulo="Itens faturados" valor={itens.length} />
          <MiniCartao
            rotulo="Recusados"
            valor={recusados.length}
            tone={recusados.length > 0 ? 'attention' : 'neutral'}
            hint={recusados.length > 0 ? moeda(recusados.reduce((soma, item) => soma + item.subtotal, 0)) : undefined}
          />
        </GradeMini>
      </div>
      {itens.length > 0 ? (
        <>
          <ListaCartoes rotulo="Itens faturados">
            {itens.map((item) => (
              <CartaoLinha
                key={item.id}
                titulo={item.descricao}
                meta={(
                  <>
                    Código {item.codprod}
                    {item.nota ? <> <MetaDot /> NF {item.nota}</> : null}
                    {item.lote ? <> <MetaDot /> lote {item.lote}</> : null}
                    {item.validade ? <> <MetaDot /> vence {fmtData(item.validade)}</> : null}
                  </>
                )}
                valor={moeda(item.subtotal)}
                valorMeta={`${numeroPt(item.quantidade)} × ${moeda(item.preco)}`}
              >
                <Status tone={DECISAO[item.decisao].tom}>{DECISAO[item.decisao].rotulo}</Status>
                <SeloDeValidade dtValidade={item.validade} />
              </CartaoLinha>
            ))}
          </ListaCartoes>
          <RodapeTotal rotulo="Total faturado nas notas" valor={moeda(total)} />
        </>
      ) : null}
    </Panel>
  );
}
