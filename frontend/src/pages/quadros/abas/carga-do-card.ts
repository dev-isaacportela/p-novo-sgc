// Uma execução por card aberto, dividida entre os blocos da fase (R-141,
// RNF-001 e o teto de 300 execuções/min). Notas fiscais, a conclusão e o
// concluído leem o MESMO `sgcNfListar`; B.O. e a conclusão, o MESMO
// `sgcBoCarregar`. O primeiro bloco que monta busca; os outros esperam a mesma
// promessa. Quem grava pede `forcar` e todos os que leem recebem o novo.
//
// A carga vale por `VALIDADE_MS`: é o intervalo de uma abertura de card (os
// blocos montam juntos). Reabrir o card depois disso busca de novo.
import * as React from 'react';
import { acao } from '@/lib/mitra-api';

export type NomeDaCarga = 'sgcNfListar' | 'sgcBoCarregar';
type Resposta = Record<string, unknown>;

interface Entrada {
  promessa: Promise<Resposta>;
  em: number;
  valor: Resposta | null;
}

const VALIDADE_MS = 15_000;
const cargas = new Map<string, Entrada>();
const ouvintes = new Map<string, Set<() => void>>();

const chaveDe = (nome: NomeDaCarga, cardId: number) => `${nome}:${cardId}`;

function avisar(chave: string) {
  ouvintes.get(chave)?.forEach((ouvir) => ouvir());
}

/** Lê a carga do card; `forcar` ignora a que existe (depois de uma escrita). */
export function lerCarga(nome: NomeDaCarga, cardId: number, forcar = false): Promise<Resposta> {
  const chave = chaveDe(nome, cardId);
  const atual = cargas.get(chave);
  if (atual && !forcar && Date.now() - atual.em < VALIDADE_MS) return atual.promessa;
  const entrada: Entrada = { promessa: acao(nome, { cardId }), em: Date.now(), valor: atual?.valor ?? null };
  cargas.set(chave, entrada);
  entrada.promessa.then(
    (valor) => {
      if (cargas.get(chave) !== entrada) return;
      entrada.valor = valor;
      avisar(chave);
    },
    () => {
      // Falha não fica no cache: a próxima leitura tenta de novo.
      if (cargas.get(chave) === entrada) cargas.delete(chave);
    },
  );
  return entrada.promessa;
}

/**
 * Para o bloco que só LÊ: devolve a última resposta e se re-renderiza quando
 * quem grava força uma carga nova. `null` enquanto a primeira não chegou.
 */
export function useCarga(nome: NomeDaCarga, cardId: number): { dados: Resposta | null; erro: string } {
  const chave = chaveDe(nome, cardId);
  const [erro, setErro] = React.useState('');
  const assinar = React.useCallback((ouvir: () => void) => {
    const lista = ouvintes.get(chave) ?? new Set();
    lista.add(ouvir);
    ouvintes.set(chave, lista);
    return () => { lista.delete(ouvir); };
  }, [chave]);
  const dados = React.useSyncExternalStore(assinar, () => cargas.get(chave)?.valor ?? null);

  React.useEffect(() => {
    let vivo = true;
    lerCarga(nome, cardId).catch((falha: unknown) => {
      if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar.');
    });
    return () => { vivo = false; };
  }, [nome, cardId]);

  return { dados, erro };
}
