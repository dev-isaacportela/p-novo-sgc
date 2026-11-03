// Spec 014 — o porteiro de persona das três telas Galderma (RN-015 / C-031).
// Fora do `abas.tsx` porque é hook, não componente (fast refresh).
import * as React from 'react';
import { usePersona } from '@/lib/persona';

export interface AcessoGalderma { carregando: boolean; ver: boolean; operar: boolean; usuarioId: number; motivo: string }

/** `operar` já zera com READ_ONLY (permissoesDe); `motivo` é o texto que a tela mostra ao desabilitar. */
export function useAcessoGalderma(): AcessoGalderma {
  const sessao = usePersona();
  return React.useMemo(() => {
    if (!sessao) return { carregando: true, ver: false, operar: false, usuarioId: 0, motivo: '' };
    const { permissoes } = sessao;
    const motivo = permissoes.operarGalderma ? ''
      : permissoes.somenteLeitura ? 'Seu acesso é somente leitura.' : 'Seu perfil lê o pedido Galderma e não altera nada.';
    return { carregando: false, ver: permissoes.verGalderma, operar: permissoes.operarGalderma, usuarioId: sessao.usuarioId, motivo };
  }, [sessao]);
}
