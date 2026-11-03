// Os lotes bloqueados do produto aberto (R-130): `sgcWintBloqueiosProduto` só
// para o produto aberto no painel ou na janela, só se ele tem bloqueio, uma vez
// por produto e por carga da lista (outra filial ou "Atualizar" zera o cache).
import * as React from 'react';

import { carregarLotesBloqueados } from '@/lib/avisos-carga';
import type { LoteBloqueado } from '@/lib/avisos-produto';

/** `undefined` = carregando; `null` = a consulta falhou; lista = os lotes. */
export type EstadoLotes = LoteBloqueado[] | null | undefined;

export function useLotesBloqueados(
  codfilial: string,
  recarga: number,
  abertos: { codprod: number; qtBloqueada: number }[],
): (codprod: number) => EstadoLotes {
  const [cache, setCache] = React.useState<Map<number, LoteBloqueado[] | null>>(() => new Map());
  // Outra filial ou outra carga da lista: o que estava guardado não vale mais.
  const chave = `${codfilial}|${recarga}`;
  const [chaveAtual, setChaveAtual] = React.useState(chave);
  if (chave !== chaveAtual) {
    setChaveAtual(chave);
    setCache(new Map());
  }
  const emCarga = React.useRef(new Set<string>());
  const pendentes = abertos.filter((a) => a.codprod > 0 && a.qtBloqueada > 0 && !cache.has(a.codprod));
  const pedido = pendentes.map((a) => a.codprod).join(',');
  React.useEffect(() => {
    if (!pedido || !codfilial) return;
    for (const codprod of pedido.split(',').map(Number)) {
      const marca = `${chave}|${codprod}`;
      if (emCarga.current.has(marca)) continue;
      emCarga.current.add(marca);
      carregarLotesBloqueados(codprod, codfilial)
        .then((lotes) => setCache((atual) => new Map(atual).set(codprod, lotes)))
        .finally(() => emCarga.current.delete(marca));
    }
  }, [pedido, codfilial, chave]);
  return React.useCallback((codprod: number) => cache.get(codprod), [cache]);
}

