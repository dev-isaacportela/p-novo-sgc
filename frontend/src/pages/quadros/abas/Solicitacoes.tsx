// Bloco "Solicitações do comercial" da fase Análise (spec 008; R-133 no
// desenho do SGC legado): as demandas do comercial do MESMO fornecedor e da
// MESMA filial do pedido, uma por cartão — nada de tabela nem de rolagem
// horizontal, em qualquer largura de card.
//
// Cada cartão: nome (truncado, com title), prioridade, "Cód · Qtd · Cliente ·
// Abertura · Solicitante", status, a justificativa em uma linha (expande), o
// que já está no pedido e o seletor de custo. "+ Adicionar" inclui com a
// quantidade solicitada e a origem na solicitação (`sgcSolicitacaoIncluirNoPedido`);
// já no pedido, "✓ Adicionado" e, com menos do que o comercial pediu,
// "Atualizar p/ N" — que mexe no rascunho, como o resto da tela, e só grava no
// Salvar. "Recusar" segue a 008.
//
// RNF-001: a fila é UMA execução ao abrir (`sgcSolicitacoesDaMontagem`, no
// RascunhoProvider). RF-020/C-019: sem `avaliarSolicitacao` ou sem
// `podeEditar`, os botões ficam DESABILITADOS com o motivo no `title`.
import * as React from 'react';
import { Check, Plus } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { Alert, Badge, Button, EmptyState, Panel, PanelHeader, TextLink } from '@/components/page';
import { cn } from '@/lib/utils';
import { acao } from '@/lib/mitra-api';
import { hojeIso } from '@/lib/formato';
import { custoPadraoDe, type TipoPreco } from '@/lib/compras';
import { tabelasVigentes } from '@/lib/custo-do-item';
import {
  ROTULO_PRIORIDADE, TOM_PRIORIDADE_CARTAO, estadoNoPedido, metaDaSolicitacao, prioridadeDe, rotuloStatus, textoNoPedido,
} from '@/lib/solicitacoes';
import type { SessaoPersona } from '@/lib/persona';
import type { MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { AvaliarDialogo } from '@/pages/solicitacoes/solicitacoes-dialogos';
import { usePedido } from './pedido-contexto';
import { useRascunho, type SolicitacaoDaMontagem } from './rascunho-contexto';
import { SeletorDeCusto } from './SeletorDeCusto';

const quantidade = (valor: number) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
type Custo = { precoCusto: number; tipoPreco: TipoPreco };

export default function BlocoSolicitacoes(
  ctx: ExtensaoContexto & { fases: MapaDeFases; sessao: SessaoPersona },
) {
  const { fases, sessao } = ctx;
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const r = useRascunho();
  const hoje = hojeIso();
  const [recusando, setRecusando] = React.useState<SolicitacaoDaMontagem | null>(null);
  const [abertas, setAbertas] = React.useState<Set<number>>(() => new Set());
  // O custo escolhido ANTES de incluir: depois da inclusão ele vira edição do item no rascunho.
  const [custoAntes, setCustoAntes] = React.useState<Record<number, Custo>>({});

  const chaveFase = fases.chaveDe(ctx.card.faseId);
  const motivoBloqueio = !sessao.permissoes.avaliarSolicitacao
    ? (sessao.permissoes.somenteLeitura ? 'Seu acesso é somente leitura.' : 'Seu perfil lê a fila, mas não avalia solicitação.')
    : !pedido.podeEditar
      ? 'Seu acesso permite operar apenas os pedidos que você criou.'
      : chaveFase !== 'analise'
        ? 'O pedido não está mais na Análise.'
        : '';
  const bloqueado = ctx.travado || r.ocupado || motivoBloqueio !== '';
  const registros = r.solicitacoes;

  async function incluir(registro: SolicitacaoDaMontagem) {
    await r.comRecarga(async () => {
      const saida = await acao('sgcSolicitacaoIncluirNoPedido', { cardId: ctx.card.id, id: registro.ID });
      if (saida.ok === false) throw new Error(String(saida.erro ?? 'Não foi possível incluir a solicitação no pedido.'));
      // O custo escolhido antes vira edição do item quando o pedido recarregar.
      const custo = custoAntes[Number(registro.CODPROD)];
      if (custo) r.agendar(Number(registro.CODPROD), custo);
      // O item novo aparece nos itens (as edições não salvas sobrevivem) e a capa do card pode mudar.
      await pedido.recarregar(ctx.card.id);
      await ctx.recarregar();
    });
  }

  if (!registros) {
    return r.erroSolicitacoes
      ? <Alert tone="error">{r.erroSolicitacoes}</Alert>
      : <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando as solicitações do comercial...</p>;
  }

  const naFila = registros.filter((s) => Number(s.VINCULADA) !== 1).length;
  return (
    <Panel>
      <PanelHeader
        title="Solicitações do comercial"
        hint={`${naFila} demanda(s) na fila deste fornecedor e filial${registros.length > naFila ? ` · ${registros.length - naFila} já neste pedido` : ''}, na ordem da prioridade.`}
      />

      {r.erroSolicitacoes ? <div className="px-4 pt-3"><Alert tone="error">{r.erroSolicitacoes}</Alert></div> : null}

      {registros.length === 0 ? (
        <EmptyState
          title="Nenhuma solicitação em aberto"
          hint="O comercial não registrou demanda deste fornecedor para esta filial — ou todas já entraram em outro pedido."
        />
      ) : (
        <ul className="flex flex-col gap-2 p-3">
          {registros.map((s) => {
            const codprod = Number(s.CODPROD);
            const item = r.itens.find((i) => i.codprod === codprod);
            const qtNoPedido = item ? item.qtPedida : Number(s.QT_NO_PEDIDO);
            const estado = estadoNoPedido(s.QUANTIDADE, qtNoPedido);
            const vinculada = Number(s.VINCULADA) === 1;
            const prioridade = prioridadeDe(s.PRIORIDADE);
            const status = rotuloStatus(s.STATUS);
            const meta = metaDaSolicitacao(s);
            const aberta = abertas.has(s.ID);
            const custo: Custo = item ?? custoAntes[codprod] ?? { precoCusto: custoPadraoDe(r.analise?.custos, codprod).valor, tipoPreco: 'padrao' };
            return (
              <li
                key={s.ID}
                className={cn(
                  'flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5',
                  estado === 'menor' ? 'border-attention' : estado === 'completa' ? 'border-primary' : 'border-rule-row',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink" title={s.DESCRICAO}>{s.DESCRICAO}</span>
                  <Badge tone={TOM_PRIORIDADE_CARTAO[prioridade]}>{ROTULO_PRIORIDADE[prioridade]}</Badge>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-secondary">
                  <span>{meta.codigo}</span>
                  <span aria-hidden>·</span>
                  <span className="font-semibold text-ink">{meta.quantidade}</span>
                  <span aria-hidden>·</span>
                  <span className="min-w-0 truncate" title={meta.cliente}>{meta.cliente}</span>
                  <span aria-hidden>·</span>
                  <span>{meta.abertura}</span>
                  <span aria-hidden>·</span>
                  <span>{meta.solicitante}</span>
                  <Badge tone={vinculada ? 'accent' : status.tom}>{vinculada ? 'Neste pedido' : status.label}</Badge>
                </div>
                {s.JUSTIFICATIVA ? (
                  <button
                    type="button"
                    onClick={() => setAbertas((atual) => {
                      const proximo = new Set(atual);
                      if (proximo.has(s.ID)) proximo.delete(s.ID); else proximo.add(s.ID);
                      return proximo;
                    })}
                    aria-expanded={aberta}
                    title={aberta ? 'Recolher a justificativa' : s.JUSTIFICATIVA}
                    className={cn('min-w-0 rounded-sm text-left text-[12px] text-ink-secondary hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none', aberta ? 'break-words' : 'truncate')}
                  >
                    {s.JUSTIFICATIVA}
                  </button>
                ) : null}
                {textoNoPedido(s.QUANTIDADE, qtNoPedido) ? (
                  <span className={cn('text-[12px]', estado === 'menor' ? 'text-attention' : 'text-ink-secondary')}>{textoNoPedido(s.QUANTIDADE, qtNoPedido)}</span>
                ) : null}
                <div className="flex min-w-0 flex-wrap items-start gap-2">
                  <div className="w-56 max-w-full">
                    <SeletorDeCusto
                      rotulo={s.DESCRICAO}
                      tipoPreco={custo.tipoPreco}
                      precoCusto={custo.precoCusto}
                      padrao={custoPadraoDe(r.analise?.custos, codprod)}
                      tabelas={tabelasVigentes(r.analise?.especiais ?? [], codprod, hoje)}
                      disabled={r.bloqueado}
                      onEscolher={(c) => (item ? r.alterar(codprod, c) : setCustoAntes((atual) => ({ ...atual, [codprod]: c })))}
                    />
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {vinculada ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
                        <Check className="size-4" aria-hidden />
                        Adicionado
                      </span>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => void incluir(s)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>
                        <Plus aria-hidden />
                        {estado === 'fora' ? 'Adicionar' : 'Vincular ao item'}
                      </Button>
                    )}
                    {estado === 'menor' ? (
                      <Button size="sm" onClick={() => r.alterar(codprod, { qtPedida: Number(s.QUANTIDADE) })} disabled={bloqueado} title={bloqueado ? motivoBloqueio : 'Muda a quantidade no pedido; grava no Salvar dos itens'}>
                        {`Atualizar p/ ${quantidade(Number(s.QUANTIDADE))}`}
                      </Button>
                    ) : null}
                    {!vinculada ? (
                      <TextLink onClick={() => setRecusando(s)} disabled={bloqueado} title={bloqueado ? motivoBloqueio : undefined}>Recusar</TextLink>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {recusando ? (
        <AvaliarDialogo
          solicitacao={recusando}
          somenteRecusa
          onFechar={() => setRecusando(null)}
          onGravado={() => { void r.recarregarSolicitacoes(); }}
        />
      ) : null}
    </Panel>
  );
}
