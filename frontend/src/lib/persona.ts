// A persona de quem está usando o sistema, lida UMA vez por sessão (D-013: o
// teto é de 300 execuções/min, a persona muda raramente e a mudança vale na
// sessão seguinte — C-042).
//
// A regra de decisão não mora aqui: `personaDe`/`permissoesDe` são puras e
// vivem em `permissoes.ts`. Aqui só ficam a chamada, o cache e o hook.

import * as React from 'react';
import { linha } from './mitra-api';
import { permissoesDe, personaDe, type NivelAcesso, type Permissoes, type Persona } from './permissoes';

export interface SessaoPersona {
  usuarioId: number;
  nome: string;
  email: string;
  persona: Persona;
  acesso: NivelAcesso;
  permissoes: Permissoes;
}

let emMemoria: Promise<SessaoPersona> | null = null;

async function buscar(): Promise<SessaoPersona> {
  // RN-001: se a consulta falhar, vale analista — menor privilégio útil, e
  // nunca uma tela travada por causa de um erro de rede.
  const registro = await linha('sgcPersonaAtual').catch(() => null);
  const { persona, acesso } = personaDe(registro);
  return {
    usuarioId: Number(registro?.USUARIO_ID ?? 0),
    nome: String(registro?.NOME ?? ''),
    email: String(registro?.EMAIL ?? ''),
    persona,
    acesso,
    permissoes: permissoesDe(persona, acesso),
  };
}

export function carregarPersona(): Promise<SessaoPersona> {
  if (!emMemoria) emMemoria = buscar();
  return emMemoria;
}

/** Chamado no logout: a sessão seguinte lê a persona de novo (C-042). */
export function limparPersona(): void {
  emMemoria = null;
}

/** `null` enquanto carrega — a tela não decide permissão com meia informação. */
export function usePersona(): SessaoPersona | null {
  const [sessao, setSessao] = React.useState<SessaoPersona | null>(null);
  React.useEffect(() => {
    let vivo = true;
    carregarPersona().then((valor) => {
      if (vivo) setSessao(valor);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return sessao;
}
