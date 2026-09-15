// O quadro de compras. O pedido aberto vive na URL (?card=ID) para o link ser
// compartilhável.
//
// Esta tela é o ponto onde o SGC 2 liga a sua regra no motor (spec 013 da lib):
// `podeMover` (síncrono, desabilita o destino com o motivo antes do clique),
// `antesDeMover` (a saída da Análise), `podeExcluir`, `acoesExtras` (as sete
// decisões do pedido), `novoCard` e `atualizarACadaMs`.
//
// A mesma regra existe no servidor (`sgcPodeMover`/`sgcPodeExcluir`, ligadas em
// KB_META): aqui ela só evita que a pessoa clique no que o servidor vai
// recusar (D-001).
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KanbanBoard } from '@benenutri/mitra-kanban';
import type { AbaExtra, Card, Fase } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { estadoDoPedido, type PedidoCapa } from '@/lib/pedido';
import { motivoDeDestino, motivoDeExcluir, type ChaveFase } from '@/lib/transicoes';
import { ATUALIZAR_A_CADA_MS, QUADRO_COMPRAS, ROTA_NOVO_PEDIDO, ROTULO_NOVO_PEDIDO } from '@/lib/quadro';
import { Alert, EmptyState, PageHeader } from '@/components/page';
import AcoesDoPedido, { type MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { PedidoProvider } from '@/pages/quadros/abas/PedidoProvider';
import AbaItens from '@/pages/quadros/abas/Itens';
import AbaAlertas from '@/pages/quadros/abas/Alertas';

/** Tradutor `KB_FASE.ID` ↔ `SGC_FASE.CHAVE` (RF-005: nenhuma regra usa nome nem id). */
const MAPA_VAZIO: MapaDeFases = { chaveDe: () => null, faseIdDe: () => 0 };

function useMapaDeFases(): MapaDeFases {
  const [mapa, setMapa] = React.useState<MapaDeFases>(MAPA_VAZIO);
  React.useEffect(() => {
    let vivo = true;
    linhas('sgcFasesListar', { boardId: 0 }).then((registros) => {
      if (!vivo) return;
      const porId = new Map<number, ChaveFase>();
      const porChave = new Map<string, number>();
      for (const registro of registros) {
        const faseId = Number(registro.FASE_ID);
        const chave = String(registro.CHAVE) as ChaveFase;
        porId.set(faseId, chave);
        porChave.set(chave, faseId);
      }
      setMapa({
        chaveDe: (faseId) => porId.get(Number(faseId)) ?? null,
        faseIdDe: (chave) => porChave.get(chave) ?? 0,
      });
    });
    return () => {
      vivo = false;
    };
  }, []);
  return mapa;
}

export default function QuadroPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const cardId = Number(params.get('card') || 0) || null;
  const sessao = usePersona();
  const fases = useMapaDeFases();
  const [pedido, setPedido] = React.useState<PedidoCapa | null>(null);

  // RNF-001: abrir um pedido custa 2 execuções — a do motor (kbCardDetalhe,
  // dentro do KanbanBoard) e esta. A 003 troca isto pelo `PedidoProvider`, que
  // reaproveita a MESMA chamada para as abas Itens e Alertas.
  // `versao` é o pedido de recarga que as ações do card disparam (aprovar,
  // reprovar, cancelar, registrar envio mudam a capa).
  const [versao, setVersao] = React.useState(0);
  const recarregarPedido = React.useCallback(async () => setVersao((atual) => atual + 1), []);

  React.useEffect(() => {
    if (!cardId) return undefined;
    let vivo = true;
    acao('sgcPedidoCarregar', { cardId })
      .then((resposta) => {
        if (vivo) setPedido((resposta?.pedido as PedidoCapa) ?? null);
      })
      // Capa que não carrega não derruba o quadro: a regra fecha o que depende
      // de motivo e o servidor reconfere (o risco do plan, mitigado).
      .catch(() => {
        if (vivo) setPedido(null);
      });
    return () => {
      vivo = false;
    };
  }, [cardId, versao]);

  /** O estado que a regra de transição lê; capa de outro card não vale. */
  const estado = React.useMemo(() => {
    const capa = pedido && cardId && Number(pedido.ID_CARD) === cardId ? pedido : null;
    return estadoDoPedido(capa, Number(capa?.CRIADO_POR ?? 0) === (sessao?.usuarioId ?? -1));
  }, [pedido, cardId, sessao]);

  const podeMover = React.useCallback(
    (card: Card, fase: Fase): string | null => {
      if (!sessao) return 'Carregando suas permissões...';
      const origem = fases.chaveDe(card.faseId);
      const destino = fases.chaveDe(fase.id);
      if (!origem || !destino) return null;
      const meu = Number(card.criadoPor ?? 0) === sessao.usuarioId;
      return motivoDeDestino(sessao.persona, sessao.acesso, origem, destino, { ...estado, souCriador: meu });
    },
    [sessao, fases, estado],
  );

  /**
   * Saída da Análise (AT-04, R-011, D-009). `sgcAnaliseSair` é da spec 003:
   * uma execução que regera os alertas, consulta as travas, limpa as
   * reprovações por `sgcEscPedidoReprovacoesLimpar` (002, por id) e registra a
   * nota do resumo. É aqui que o adaptador de tela da 003
   * (`pages/quadros/abas/verificar-saida.ts`) entra.
   *
   * Enquanto a 003 não publica a SF, a falha de transporte não pode travar o
   * fluxo: o servidor reconfere no gancho `sgcPodeMover`, pelo bloco
   * `PENDENCIAS`, e é ele quem recusa de verdade.
   */
  const antesDeMover = React.useCallback(
    async (card: Card, fase: Fase) => {
      const origem = fases.chaveDe(card.faseId);
      const destino = fases.chaveDe(fase.id);
      if (origem !== 'analise' || destino !== 'tecnica') return { ok: true };
      try {
        const resposta = await acao('sgcAnaliseSair', { cardId: card.id });
        if (resposta && resposta.ok === false) return { ok: false, erro: String(resposta.error ?? 'Há pendências na Análise.') };
      } catch {
        return { ok: true };
      }
      await recarregarPedido();
      return { ok: true };
    },
    [fases, recarregarPedido],
  );

  const podeExcluir = React.useCallback(
    (card: Card) => {
      if (!sessao) return false;
      const meu = Number(card.criadoPor ?? 0) === sessao.usuarioId;
      return motivoDeExcluir(sessao.persona, sessao.acesso, { souCriador: meu }) === null;
    },
    [sessao],
  );

  // Abas da spec 003 (`AbaExtra` da lib, recebendo o `ExtensaoContexto`); o
  // `PedidoProvider` embrulha o quadro e guarda capa, itens e alertas do card.
  // ponytail: a capa é carregada duas vezes (este componente e o provider),
  // 3 execuções por card aberto em vez das 2 do RNF-001; unificar quando o
  // provider expuser a capa crua para o AcoesDoPedido.
  const abasExtras: AbaExtra[] = React.useMemo(() => [
    { id: 'itens', rotulo: 'Itens', render: (ctx) => <AbaItens {...ctx} /> },
    {
      id: 'alertas',
      rotulo: 'Alertas',
      contagem: (card) => Number(card.valores.alertas_pendentes) || undefined,
      render: (ctx) => <AbaAlertas {...ctx} />,
    },
  ], []);

  if (!sessao) return <EmptyState title="Carregando o quadro..." />;

  // RN-021 / C-044: a persona comercial não entra no quadro — nem pelo menu,
  // nem pelo endereço direto. O servidor recusa a mesma coisa, com a mesma frase.
  if (!sessao.permissoes.verQuadro) {
    return (
      <>
        <PageHeader module="Compras" title="Quadro de compras" />
        <Alert tone="error">Seu perfil não tem acesso ao quadro de compras.</Alert>
      </>
    );
  }

  return (
    <PedidoProvider>
    <KanbanBoard
      slug={QUADRO_COMPRAS}
      cardId={cardId}
      onCardChange={(id) => setParams(id ? { card: String(id) } : {}, { replace: true })}
      onAdministrar={sessao.permissoes.administrarQuadro ? () => navigate('/quadro/admin') : undefined}
      novoCard={
        sessao.permissoes.criarPedido
          ? { rotulo: ROTULO_NOVO_PEDIDO, onClick: () => navigate(ROTA_NOVO_PEDIDO) }
          : false
      }
      atualizarACadaMs={ATUALIZAR_A_CADA_MS}
      podeMover={podeMover}
      antesDeMover={antesDeMover}
      podeExcluir={podeExcluir}
      abasExtras={abasExtras}
      acoesExtras={(ctx) => (
        <AcoesDoPedido
          ctx={ctx}
          sessao={sessao}
          pedido={pedido && Number(pedido.ID_CARD) === ctx.card.id ? pedido : null}
          fases={fases}
          recarregarPedido={recarregarPedido}
        />
      )}
    />
    </PedidoProvider>
  );
}
