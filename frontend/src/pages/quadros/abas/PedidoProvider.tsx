// O provedor que guarda capa, itens e alertas do card aberto. Envolve o
// `KanbanBoard` no `/quadro`; o contrato (tipos, contexto e `usePedido`) mora
// em `pedido-contexto.ts`.

import * as React from 'react';
import { acao, linhas } from '@/lib/mitra-api';
import { itemDeLinha } from '@/lib/compras';
import type { NivelAcesso, Persona } from '@/lib/permissoes';
import { permissoesDe, personaDe } from '@/lib/permissoes';
import type { CapaPedido, ContextoPedido, EstadoPedido } from './pedido-contexto';
import { ESTADO_VAZIO, PedidoContexto, alertaDeLinha, capaDeLinha } from './pedido-contexto';

type Linha = Record<string, unknown>;
type Sessao = { persona: Persona; acesso: NivelAcesso; usuarioId: number };

export function PedidoProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<EstadoPedido>(ESTADO_VAZIO);
  // null = ainda não resolvida ou falhou: menor privilégio, tela de leitura.
  const [sessao, setSessao] = React.useState<Sessao | null>(null);
  const emCurso = React.useRef(0);

  React.useEffect(() => {
    let vivo = true;
    // P-02: persona não resolvida é analista. Falha de consulta, porém, é menor
    // privilégio — a tela fica de leitura em vez de deixar gravar no escuro.
    linhas('sgcPersonaAtual')
      .then((rows) => {
        if (!vivo) return;
        const linha = rows[0] as { PERSONA?: string; ACCESS_LEVEL?: string; USUARIO_ID?: unknown } | undefined;
        setSessao({ ...personaDe(linha ?? null), usuarioId: Number(linha?.USUARIO_ID ?? 0) || 0 });
      })
      .catch(() => { if (vivo) setSessao(null); });
    return () => { vivo = false; };
  }, []);

  const recarregar = React.useCallback(async (cardId: number) => {
    if (!cardId) { setEstado(ESTADO_VAZIO); return; }
    emCurso.current = cardId;
    setEstado((atual) => ({ ...atual, cardId, carregando: true, erro: '' }));
    try {
      // Contrato da 002 (plan da 003, §Dependências): capa + itens + alertas
      // numa execução só. `capa` é aceito como apelido de `pedido`.
      const saida = await acao('sgcPedidoCarregar', { cardId });
      if (emCurso.current !== cardId) return;
      const capa = (saida.pedido ?? saida.capa ?? null) as Linha | null;
      setEstado({
        cardId,
        carregando: false,
        erro: saida.ok === false ? String(saida.erro ?? saida.error ?? 'Não foi possível carregar o pedido.') : '',
        capa: capa ? capaDeLinha(capa) : null,
        itens: ((saida.itens ?? []) as Linha[]).map(itemDeLinha).filter((item) => item.status !== 'removido'),
        alertas: ((saida.alertas ?? []) as Linha[]).map(alertaDeLinha),
      });
    } catch (falha) {
      if (emCurso.current !== cardId) return;
      setEstado({
        ...ESTADO_VAZIO,
        cardId,
        erro: falha instanceof Error ? falha.message : 'Não foi possível carregar o pedido.',
      });
    }
  }, []);

  const definirCapa = React.useCallback((capa: CapaPedido) => {
    setEstado((atual) => ({ ...atual, capa }));
  }, []);

  const valor = React.useMemo<ContextoPedido>(() => {
    // A MESMA matriz da 002 (R-013): quem edita pedido é quem monta, e
    // READ_ONLY não edita nada. RESTRICTED é filtrado no `usePedido`, que é
    // quem sabe de quem é o card (P-08 B).
    const permissoes = sessao ? permissoesDe(sessao.persona, sessao.acesso) : null;
    return {
      ...estado,
      persona: sessao?.persona ?? '',
      podeEditar: permissoes?.editarPedido ?? false,
      somenteProprios: permissoes?.somenteProprios ?? false,
      usuarioId: sessao?.usuarioId ?? 0,
      recarregar,
      definirCapa,
    };
  }, [estado, sessao, recarregar, definirCapa]);

  return <PedidoContexto.Provider value={valor}>{children}</PedidoContexto.Provider>;
}
