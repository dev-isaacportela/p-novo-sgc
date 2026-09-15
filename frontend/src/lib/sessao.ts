// Sessão do piloto: usuário resolvido por kbUsuarioSessao (INT_USER).
// Vive fora do AdminLayout para o fast refresh funcionar (só componente lá).
import { createContext, useContext } from 'react';

export interface Sessao {
  ID: number;
  NOME: string;
  EMAIL: string;
}

export const SessaoContext = createContext<Sessao | null>(null);

export function useSessao() {
  const sessao = useContext(SessaoContext);
  if (!sessao) throw new Error('useSessao fora do AdminLayout.');
  return sessao;
}
