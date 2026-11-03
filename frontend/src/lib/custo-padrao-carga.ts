// A carga do custo padrão do Gestão de Custos (R-128): `sgcCustoPadraoAtual`
// em lotes de 500 códigos, junto com as outras leituras da carga — nunca por
// linha. Falhou um lote, falhou tudo (`null`): a tela mostra "Erro custo" em
// todos os itens, nunca um custo parcial.
import { linhas } from '@/lib/mitra-api';
import { mapaDeCustoPadrao } from '@/lib/compras';
import type { MapaCustoPadrao } from '@/lib/compras';
import { lotesDeCodigos } from '@/lib/custo-especial';

export async function carregarCustoPadrao(codprods: number[]): Promise<MapaCustoPadrao | null> {
  try {
    const todas: Record<string, unknown>[] = [];
    for (const lote of lotesDeCodigos(codprods)) todas.push(...(await linhas('sgcCustoPadraoAtual', { codprods: lote })));
    return mapaDeCustoPadrao(todas);
  } catch {
    return null;
  }
}

export const AVISO_ERRO_CUSTO = 'Não foi possível ler o custo padrão do Gestão de Custos: os custos aparecem como "Erro custo" e nenhum valor é calculado com eles.';
