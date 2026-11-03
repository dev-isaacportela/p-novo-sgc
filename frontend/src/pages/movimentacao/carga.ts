// Spec 013 — os dois ganchos que as cinco abas usam: a carga de uma consulta e
// a página que volta a 1 quando o filtro muda (RN-020). Nenhum dos dois chama
// setState de forma síncrona dentro de efeito: "carregando" e "página" são
// DERIVADOS da chave do pedido, não estados que alguém precisa zerar.
import * as React from 'react';

export interface FiltrosMov {
  codfilial: string;
  codfornec: number;
  codepto: number;
  busca: string;
  /** P-08: 0 = venda a órgão público fora (o padrão da R-131); 1 = conta como venda. */
  incluirPublico: number;
}

/**
 * `carregar` vem de um `useCallback` da aba, com as dependências dele — é a
 * identidade dele que diz "outra consulta". Falha vira `erro` e `dados` null.
 */
export function useCarga<T>(carregar: () => Promise<T>) {
  const [versao, setVersao] = React.useState(0);
  const [estado, setEstado] = React.useState<{ fonte: unknown; versao: number; dados: T | null; erro: string }>(
    { fonte: null, versao: -1, dados: null, erro: '' },
  );

  React.useEffect(() => {
    let vivo = true;
    carregar()
      .then((dados) => { if (vivo) setEstado({ fonte: carregar, versao, dados, erro: '' }); })
      .catch((erro: unknown) => {
        if (vivo) setEstado({ fonte: carregar, versao, dados: null, erro: erro instanceof Error ? erro.message : String(erro) });
      });
    return () => { vivo = false; };
  }, [carregar, versao]);

  const recarregar = React.useCallback(() => setVersao((v) => v + 1), []);
  const carregando = estado.fonte !== carregar || estado.versao !== versao;
  return { dados: estado.dados, erro: carregando ? '' : estado.erro, carregando, recarregar };
}

/** A página (1-based) de um recorte: qualquer mudança em `chave` volta à página 1. */
export function usePagina(chave: string): [number, (pagina: number) => void] {
  const [estado, setEstado] = React.useState({ chave, pagina: 1 });
  const pagina = estado.chave === chave ? estado.pagina : 1;
  const irPara = React.useCallback((nova: number) => setEstado({ chave, pagina: Math.max(1, nova) }), [chave]);
  return [pagina, irPara];
}
