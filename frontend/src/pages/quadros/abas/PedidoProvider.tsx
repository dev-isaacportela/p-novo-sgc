// O provedor que guarda capa, itens e alertas do card aberto. Envolve o
// `KanbanBoard` no `/quadro`; o contrato (tipos, contexto e `usePedido`) mora
// em `pedido-contexto.ts`.

import * as React from 'react';
import { acao, linhas } from '@/lib/mitra-api';
import { itemDeLinha } from '@/lib/compras';
import type { CapaPedido, ContextoPedido, EstadoPedido } from './pedido-contexto';
import {
  ESTADO_VAZIO, PERSONAS_QUE_MONTAM, PedidoContexto, alertaDeLinha, capaDeLinha,
} from './pedido-contexto';

type Linha = Record<string, unknown>;

export function PedidoProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = React.useState<EstadoPedido>(ESTADO_VAZIO);
  const [persona, setPersona] = React.useState('');
  const emCurso = React.useRef(0);

  React.useEffect(() => {
    let vivo = true;
    // P-02: persona não resolvida é analista. Falha de consulta, porém, é menor
    // privilégio — a tela fica de leitura em vez de deixar gravar no escuro.
    linhas('sgcPersonaAtual')
      .then((rows) => { if (vivo) setPersona(String(rows[0]?.PERSONA ?? 'analista')); })
      .catch(() => { if (vivo) setPersona(''); });
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

  const valor = React.useMemo<ContextoPedido>(() => ({
    ...estado,
    persona,
    podeEditar: PERSONAS_QUE_MONTAM.includes(persona),
    recarregar,
    definirCapa,
  }), [estado, persona, recarregar, definirCapa]);

  return <PedidoContexto.Provider value={valor}>{children}</PedidoContexto.Provider>;
}
