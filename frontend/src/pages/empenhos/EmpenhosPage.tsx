// O quadro de empenhos (spec 015, R-160): o segundo quadro da lib, ao lado do
// de compras. O card aberto vive na URL (?card=ID) e a janela Novo empenho em
// ?novo=1, como no quadro de compras.
//
// A regra liga no motor pelos mesmos pontos do quadro de compras: `podeMover`
// (síncrono, a frase do gancho), `antesDeMover` (a saída da Análise),
// `podeExcluir`, `acoesExtras`, `conteudoDaFase` e a aba Pregão. O servidor
// reconfere tudo no ramo de empenhos do gancho (R-161).
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KanbanBoard } from '@benenutri/mitra-kanban';
import type { Card, ExtensaoContexto, Fase } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { ATUALIZAR_A_CADA_MS, QUADRO_EMPENHOS, ROTULO_NOVO_EMPENHO } from '@/lib/quadro';
import {
  estadoDaCarga, itemDeLinha, motivoDeDestinoEmpenho, motivoDeExcluirEmpenho, prontidaoDaAnalise,
  type CargaEmpenho, type ChaveEmpenho,
} from '@/lib/empenhos';
import { Alert, EmptyState, PageHeader } from '@/components/page';
import { EmpenhoContexto, type MapaEmpenho } from '@/pages/empenhos/contexto';
import AcoesEmpenho from '@/pages/empenhos/AcoesEmpenho';
import ConteudoEmpenho from '@/pages/empenhos/ConteudoEmpenho';
import AbaPregao from '@/pages/empenhos/AbaPregao';
import NovoEmpenhoDialogo from '@/pages/empenhos/NovoEmpenhoDialogo';

const MAPA_VAZIO: MapaEmpenho = { chaveDe: () => null, faseIdDe: () => 0, boardId: 0 };

/** Tradutor `KB_FASE.ID` ↔ `SGC_EMP_FASE.CHAVE` (C-002: nenhuma regra usa nome nem id). */
function useMapaEmpenho(): MapaEmpenho {
  const [mapa, setMapa] = React.useState<MapaEmpenho>(MAPA_VAZIO);
  React.useEffect(() => {
    let vivo = true;
    linhas('sgcEmpFasesListar').then((registros) => {
      if (!vivo) return;
      const porId = new Map<number, ChaveEmpenho>();
      const porChave = new Map<string, number>();
      for (const registro of registros) {
        porId.set(Number(registro.FASE_ID), String(registro.CHAVE) as ChaveEmpenho);
        porChave.set(String(registro.CHAVE), Number(registro.FASE_ID));
      }
      setMapa({ chaveDe: (id) => porId.get(Number(id)) ?? null, faseIdDe: (chave) => porChave.get(chave) ?? 0, boardId: 0 });
    }).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return mapa;
}

export default function EmpenhosPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const cardId = Number(params.get('card') || 0) || null;
  const novoAberto = params.get('novo') === '1';
  // Trocar a `key` remonta o quadro: o card recém-criado aparece sem esperar os 60 s.
  const [boardVersao, setBoardVersao] = React.useState(0);
  const sessao = usePersona();
  const fases = useMapaEmpenho();
  const [carga, setCarga] = React.useState<{ cardId: number; carga: CargaEmpenho } | null>(null);
  const [versao, setVersao] = React.useState(0);
  const recarregar = React.useCallback(async () => setVersao((atual) => atual + 1), []);

  React.useEffect(() => {
    if (!cardId) return undefined;
    let vivo = true;
    acao('sgcEmpCarregar', { cardId })
      .then((resposta) => vivo && setCarga({ cardId, carga: resposta as CargaEmpenho }))
      // Carga que falha não derruba o quadro: a regra fecha e o servidor reconfere.
      .catch(() => vivo && setCarga({ cardId, carga: { ok: false } }));
    return () => {
      vivo = false;
    };
  }, [cardId, versao]);

  const cargaAtual = carga && carga.cardId === cardId ? carga.carga : null;

  const estadoDe = React.useCallback(
    (card: Card) => {
      const meu = Number(card.criadoPor ?? 0) === (sessao?.usuarioId ?? -1);
      return estadoDaCarga(carga && carga.cardId === card.id ? carga.carga : null, card.id, meu);
    },
    [carga, sessao],
  );

  const podeMover = React.useCallback(
    (card: Card, fase: Fase): string | null => {
      if (!sessao) return 'Carregando suas permissões...';
      const origem = fases.chaveDe(card.faseId);
      const destino = fases.chaveDe(fase.id);
      // Card que não é o aberto (arrastar no quadro): o servidor decide.
      if (!origem || !destino || !carga || carga.cardId !== card.id) return null;
      return motivoDeDestinoEmpenho(sessao.persona, sessao.acesso, origem, destino, estadoDe(card));
    },
    [sessao, fases, carga, estadoDe],
  );

  /** C-018: sair da Análise cita até três produtos; o gancho recusa a mesma coisa. */
  const antesDeMover = React.useCallback(
    async (card: Card, fase: Fase) => {
      if (fases.chaveDe(card.faseId) !== 'emp_analise' || fases.chaveDe(fase.id) !== 'emp_tecnica') return { ok: true };
      const atual = (await acao('sgcEmpCarregar', { cardId: card.id })) as CargaEmpenho;
      const erro = prontidaoDaAnalise((atual.itens ?? []).map(itemDeLinha));
      if (erro) return { ok: false, erro };
      await linhas('sgcEscEmpAnaliseEnviar', { cardId: card.id, agora: new Date().toISOString().slice(0, 19) });
      await recarregar();
      return { ok: true };
    },
    [fases, recarregar],
  );

  const podeExcluir = React.useCallback(
    (card: Card) => {
      if (!sessao || !carga || carga.cardId !== card.id) return false;
      return motivoDeExcluirEmpenho(sessao.persona, sessao.acesso, fases.chaveDe(card.faseId), estadoDe(card)) === null;
    },
    [sessao, carga, fases, estadoDe],
  );

  const contexto = React.useMemo(
    () => (sessao ? { cardId, carga: cargaAtual, fases, sessao, recarregar } : null),
    [cardId, cargaAtual, fases, sessao, recarregar],
  );

  const conteudoDaFase = React.useCallback((ctx: ExtensaoContexto) => <ConteudoEmpenho ctx={ctx} />, []);
  const acoesExtras = React.useCallback((ctx: ExtensaoContexto) => <AcoesEmpenho ctx={ctx} />, []);
  const abasExtras = React.useMemo(() => [{ id: 'pregao', rotulo: 'Pregão', render: (ctx: ExtensaoContexto) => <AbaPregao ctx={ctx} /> }], []);

  if (!sessao || !contexto) return <EmptyState title="Carregando o quadro..." />;

  // C-001: o comercial não entra — nem pelo menu, nem pelo endereço.
  if (!sessao.permissoes.verEmpenhos) {
    return (
      <>
        <PageHeader module="Empenhos" title="Quadro de empenhos" />
        <Alert tone="error">Seu perfil não tem acesso ao quadro de empenhos.</Alert>
      </>
    );
  }

  return (
    <EmpenhoContexto.Provider value={contexto}>
      <KanbanBoard
        key={boardVersao}
        slug={QUADRO_EMPENHOS}
        cardId={cardId}
        onCardChange={(id) => setParams(id ? { card: String(id) } : {}, { replace: true })}
        onAdministrar={sessao.permissoes.administrarQuadro ? () => navigate('/empenhos/admin') : undefined}
        novoCard={
          sessao.permissoes.operarEmpenhos
            ? { rotulo: ROTULO_NOVO_EMPENHO, onClick: () => setParams({ novo: '1' }, { replace: true }) }
            : false
        }
        atualizarACadaMs={ATUALIZAR_A_CADA_MS}
        podeMover={podeMover}
        antesDeMover={antesDeMover}
        podeExcluir={podeExcluir}
        conteudoDaFase={conteudoDaFase}
        acoesExtras={acoesExtras}
        abasExtras={abasExtras}
      />
      {sessao.permissoes.operarEmpenhos ? (
        <NovoEmpenhoDialogo
          aberto={novoAberto}
          onFechar={() => setParams({}, { replace: true })}
          onCriado={(id) => {
            setBoardVersao((atual) => atual + 1);
            setParams({ card: String(id) }, { replace: true });
          }}
        />
      ) : null}
    </EmpenhoContexto.Provider>
  );
}
