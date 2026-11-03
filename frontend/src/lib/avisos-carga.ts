// A carga dos avisos de excesso e de bloqueio (R-130). A posição das outras
// filiais vem UMA vez por carga da lista, em lotes de 500 (nada por linha); os
// lotes bloqueados, só ao abrir um produto com bloqueio. Falhou: `null` — a
// lista fica sem o selo de excesso e o alerta de bloqueio mostra só o total.
import { linhas } from '@/lib/mitra-api';
import { lotesDeCodigos } from '@/lib/custo-especial';
import type { LoteBloqueado, PosicaoOutraFilial } from '@/lib/avisos-produto';

export async function carregarPosicoesFiliais(codprods: number[], codfilial: string): Promise<PosicaoOutraFilial[] | null> {
  try {
    const todas: PosicaoOutraFilial[] = [];
    for (const lote of lotesDeCodigos(codprods)) {
      todas.push(...((await linhas('sgcWintEstoqueFiliaisProdutos', { codprods: lote, codfilial })) as unknown as PosicaoOutraFilial[]));
    }
    return todas;
  } catch {
    return null;
  }
}

export async function carregarLotesBloqueados(codprod: number, codfilial: string): Promise<LoteBloqueado[] | null> {
  try {
    return (await linhas('sgcWintBloqueiosProduto', { codprod, codfilial })) as unknown as LoteBloqueado[];
  } catch {
    return null;
  }
}
