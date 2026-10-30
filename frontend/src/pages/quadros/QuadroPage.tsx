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
import type { Card, ExtensaoContexto, Fase } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { estadoDoPedido, type PedidoCapa } from '@/lib/pedido';
import { motivoDeDestino, motivoDeExcluir, type ChaveFase } from '@/lib/transicoes';
import { ATUALIZAR_A_CADA_MS, QUADRO_COMPRAS, ROTULO_NOVO_PEDIDO } from '@/lib/quadro';
import { NovoPedidoDialogo } from '@/pages/pedidos/NovoPedidoDialogo';
import { Alert, EmptyState, PageHeader } from '@/components/page';
import AcoesDoPedido, { type MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import { PedidoProvider } from '@/pages/quadros/abas/PedidoProvider';
import ConteudoDaFase from '@/pages/quadros/abas/ConteudoDaFase';
import { verificarSaidaAnalise } from '@/pages/quadros/abas/verificar-saida';

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
  // C-036 (R-118): a janela "Novo pedido" vive na URL (?novo=1), como o card
  // aberto — assim o link antigo /pedidos/novo, que redireciona para cá, abre
  // a janela sem estado extra.
  const novoAberto = params.get('novo') === '1';
  // Trocar a `key` remonta o quadro: é como a lista mostra o card recém-criado
  // sem esperar os 60 s da atualização periódica (a lib não expõe recarga por fora).
  const [boardVersao, setBoardVersao] = React.useState(0);
  const sessao = usePersona();
  const fases = useMapaDeFases();
  const [pedido, setPedido] = React.useState<PedidoCapa | null>(null);

  // RNF-001: abrir um pedido custa 2 execuções — a do motor (kbCardDetalhe,
  // dentro do KanbanBoard) e esta, que traz a capa para o `AcoesDoPedido`. O
  // `PedidoProvider` da 003 carrega a sua própria cópia para as abas Itens e
  // Alertas; ver a nota de custo junto de `abasExtras`.
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
   * nota do resumo. Quem conversa com ela é o adaptador da 003
   * (`pages/quadros/abas/verificar-saida.ts`): é ele que lê o `erro` do
   * contrato e devolve a mensagem real de cada uma das cinco condições de
   * RN-012, em vez de uma frase genérica.
   *
   * O servidor reconfere tudo no gancho `sgcPodeMover`, pelo bloco
   * `PENDENCIAS`, e é ele quem recusa de verdade.
   */
  const antesDeMover = React.useCallback(
    async (card: Card, fase: Fase) => {
      const origem = fases.chaveDe(card.faseId);
      const destino = fases.chaveDe(fase.id);
      if (origem !== 'analise' || destino !== 'tecnica') return { ok: true };
      const saida = await verificarSaidaAnalise(card.id);
      if (saida.ok) await recarregarPedido();
      return saida;
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

  // Conteúdo da aba "Nesta fase" (spec 015 da lib, R-050): o card não tem uma
  // aba por assunto — o que aparece muda com a fase (itens e alertas na
  // montagem e nas aprovações, notas fiscais e recebimento depois do envio,
  // B.O. quando falta produto), como no SGC legado. O mapa fase → blocos é
  // `lib/conteudo-da-fase.ts`; o `PedidoProvider` embrulha o quadro e guarda
  // capa, itens e alertas do card.
  // ponytail: a capa é carregada duas vezes (este componente e o provider),
  // 3 execuções por card aberto em vez das 2 do RNF-001; unificar quando o
  // provider expuser a capa crua para o AcoesDoPedido.
  const conteudoDaFase = React.useCallback(
    (ctx: ExtensaoContexto) => (sessao ? <ConteudoDaFase {...ctx} fases={fases} sessao={sessao} /> : null),
    [fases, sessao],
  );

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
      key={boardVersao}
      slug={QUADRO_COMPRAS}
      cardId={cardId}
      onCardChange={(id) => setParams(id ? { card: String(id) } : {}, { replace: true })}
      onAdministrar={sessao.permissoes.administrarQuadro ? () => navigate('/quadro/admin') : undefined}
      novoCard={
        sessao.permissoes.criarPedido
          ? { rotulo: ROTULO_NOVO_PEDIDO, onClick: () => setParams({ novo: '1' }, { replace: true }) }
          : false
      }
      atualizarACadaMs={ATUALIZAR_A_CADA_MS}
      podeMover={podeMover}
      antesDeMover={antesDeMover}
      podeExcluir={podeExcluir}
      conteudoDaFase={conteudoDaFase}
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
    {sessao.permissoes.criarPedido ? (
      <NovoPedidoDialogo
        aberto={novoAberto}
        onFechar={() => setParams({}, { replace: true })}
        onCriado={(id) => {
          setBoardVersao((atual) => atual + 1);
          setParams({ card: String(id) }, { replace: true });
        }}
      />
    ) : null}
    </PedidoProvider>
  );
}
