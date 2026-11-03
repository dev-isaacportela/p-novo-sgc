// O resumo que abre o card em toda fase depois da Análise (R-150, C-046 da
// 002): fornecedor, filial, valor, % faturado com barra, período e prazo, e os
// selos do que já aconteceu — aprovação técnica, diretoria, envio,
// cancelamento —, como a coluna da esquerda do SGC legado
// (PipeWorkspace.tsx:8603-8720). Regra em `lib/resumo-do-pedido.ts`.
//
// Custo zero: lê a capa do `PedidoProvider` (o `sgcPedidoCarregar` da
// abertura). Só volta ao servidor quando o card MUDA de fase com ele aberto —
// a capa de antes do movimento não tem o envio nem a aprovação que acabaram
// de ser gravados.
import * as React from 'react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { BarraConsumo, Carimbo, Dash, GradeMini, MiniCartao, Panel } from '@/components/page';
import { fmtData, moeda } from '@/lib/formato';
import { faturadoDoPedido, rotuloPercentual, selosDoPedido } from '@/lib/resumo-do-pedido';
import { usePedido } from './pedido-contexto';

export default function ResumoDoPedido({ semEnvio = false, ...ctx }: ExtensaoContexto & { semEnvio?: boolean }) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const { recarregar, cardId: carregado } = pedido;
  const faseVista = React.useRef(ctx.card.faseId);

  React.useEffect(() => {
    if (faseVista.current === ctx.card.faseId) return;
    faseVista.current = ctx.card.faseId;
    if (carregado === ctx.card.id) void recarregar(ctx.card.id);
  }, [ctx.card.faseId, ctx.card.id, carregado, recarregar]);

  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  if (!capa) return null;

  const faturado = faturadoDoPedido(capa);
  const selos = selosDoPedido(capa).filter((selo) => !(semEnvio && selo.chave === 'envio'));
  const prazo = capa.prazoAcordado || capa.prazoPadrao;
  // Antes do envio não existe faturamento: o quarto número é o prazo (o legado mostra os dois).
  const enviado = capa.dtEnvio.trim() !== '';

  return (
    <Panel>
      <div className="flex flex-col gap-3 p-4">
        <GradeMini colunas={4}>
          <MiniCartao rotulo="Fornecedor" valor={capa.fornecedor || <Dash />} title={capa.fornecedor} />
          <MiniCartao rotulo="Filial" valor={capa.filial || <Dash />} title={capa.filial} />
          <MiniCartao rotulo="Valor do pedido" valor={moeda(capa.vlTotal)} />
          {enviado ? (
            <MiniCartao
              rotulo="Faturado"
              valor={rotuloPercentual(faturado.pct)}
              hint={faturado.falta > 0 && capa.vlFaturado > 0 ? `falta ${moeda(faturado.falta)}` : moeda(capa.vlFaturado)}
            />
          ) : (
            <MiniCartao rotulo="Prazo de pagamento" valor={prazo || <Dash />} hint={capa.prazoAcordado && capa.prazoPadrao !== capa.prazoAcordado ? `padrão ${capa.prazoPadrao}` : undefined} />
          )}
        </GradeMini>
        {enviado ? (
          <BarraConsumo
            pct={faturado.pctBarra}
            tone={faturado.pct >= 100 ? 'live' : faturado.pct > 0 ? 'attention' : 'off'}
            rotulo={`${moeda(capa.vlFaturado)} de ${moeda(capa.vlTotal)} faturados`}
          />
        ) : null}
        <p className="text-[12px] text-ink-secondary">
          Vendas de {fmtData(capa.periodoInicio)} a {fmtData(capa.periodoFim)}
          {enviado && prazo ? ` · pagamento ${prazo}` : ''}
        </p>
        {selos.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {selos.map((selo) => (
              <Carimbo key={selo.chave} tone={selo.tom} titulo={selo.titulo}>{selo.texto}</Carimbo>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
