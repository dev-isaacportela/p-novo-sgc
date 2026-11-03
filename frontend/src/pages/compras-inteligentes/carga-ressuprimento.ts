// A carga de um fornecedor numa filial da 011 (R-133: tirada da página para a
// Análise do Produto do pedido usar a MESMA carga, sem cópia). As mesmas
// execuções de antes (RNF-001 da 011): seis leituras em paralelo (a sexta é
// a da projeção manual, spec 019 RNF-001), UMA
// `sgcWintRessuprimento` com as vendas desconsideradas em mãos e, com os
// produtos em mãos, as unidades por caixa (lotes de 1000), o custo padrão e a
// posição das outras filiais (lotes de 500) e as políticas de preço especial
// com a venda por cliente (lotes de 500, só se houver política).
//
// `etapa` entrega cada parte assim que ela chega — a lista aparece antes das
// tabelas especiais. `vivo` para de entregar quando o recorte mudou.
import { linhas } from '@/lib/mitra-api';
import { coberturaDeLinha, type Cobertura } from '@/lib/cobertura';
import { JANELA_DIAS, parametroDeLinha, type MedidaRessuprimento, type ParametroCompra } from '@/lib/ressuprimento';
import type { VendaDesconsiderada } from '@/lib/ressuprimento-detalhe';
import type { MapaCustoPadrao } from '@/lib/compras';
import { lotesDeCodigos, type CustoEspecial, type VendaCliente } from '@/lib/custo-especial';
import { carregarCustoPadrao } from '@/lib/custo-padrao-carga';
import { carregarPosicoesFiliais } from '@/lib/avisos-carga';
import type { PosicaoOutraFilial } from '@/lib/avisos-produto';
import { projecaoDeLinha, type ProjecaoManual } from '@/lib/projecao-manual';

/** Lote de códigos por chamada ao Gestão de Custos (R-120). */
const LOTE_CAIXAS = 1000;

export interface PedidoAbertoDoFornecedor { idCard: number; titulo: string; faseChave: string }

export interface CargaRessuprimento {
  parametros: ParametroCompra[];
  /** Spec 019: os ajustes de projeção manual do fornecedor na filial (vencidos inclusive; a regra decide). */
  projecoes: ProjecaoManual[];
  coberturas: Cobertura[];
  desconsideradas: VendaDesconsiderada[];
  pedidoAberto: PedidoAbertoDoFornecedor | null;
  emPedidoAberto: Map<number, { idCard: number; titulo: string }>;
  medidas: MedidaRessuprimento[];
  porCaixa: Map<number, number>;
  custosPadrao: MapaCustoPadrao | null;
  posicoesFiliais: PosicaoOutraFilial[] | null;
  custosEspeciais: CustoEspecial[];
  vendasClientes: VendaCliente[];
}

export async function carregarRessuprimento(
  recorte: { codfornec: number; codfilial: string },
  periodo: { inicio: string; fim: string },
  etapa: (parte: Partial<CargaRessuprimento>) => void,
  vivo: () => boolean = () => true,
): Promise<void> {
  const { codfilial } = recorte;
  const [linhasParametro, linhasVenda, linhasCobertura, abertos, itensAbertos, linhasProjecao] = await Promise.all([
    linhas('sgcParametrosCompraListar', { ...recorte, limite: 600, offset: 0 }),
    linhas('sgcVendasDesconsideradasListar', { codfilial, codprod: 0, limite: 500, offset: 0 }),
    linhas('sgcCoberturaListar', { nivel: '', limite: 500, offset: 0 }),
    linhas('sgcPedidoAbertoDoFornecedor', { ...recorte, limite: 5, offset: 0 }),
    linhas('sgcItensEmPedidoAberto', { ...recorte, limite: 2000, offset: 0 }),
    linhas('sgcProjecaoManualListar', { ...recorte, limite: 600, offset: 0 }),
  ]);
  // D-03: o `{{excluir}}` é montado do que VOLTOU do banco, nunca do que
  // a tela achou que gravou — escrita guardada recusada devolve 0 linhas.
  const vendas = linhasVenda
    .map((l) => ({ numtransitem: Number(l.NUMTRANSITEM), codprod: Number(l.CODPROD), dtmov: String(l.DTMOV ?? ''), quantidade: Number(l.QUANTIDADE ?? 0) }))
    .filter((v) => v.numtransitem > 0)
    .slice(0, 500);
  if (!vivo()) return;
  etapa({
    parametros: linhasParametro.map(parametroDeLinha),
    projecoes: linhasProjecao.map(projecaoDeLinha),
    coberturas: linhasCobertura.map(coberturaDeLinha),
    desconsideradas: vendas,
    pedidoAberto: abertos.length > 0
      ? { idCard: Number(abertos[0].ID_CARD), titulo: String(abertos[0].TITULO ?? ''), faseChave: String(abertos[0].FASE_CHAVE ?? '') }
      : null,
    emPedidoAberto: new Map(itensAbertos.map((i) => [Number(i.CODPROD), { idCard: Number(i.ID_CARD), titulo: String(i.TITULO ?? '') }])),
  });

  const rows = await linhas('sgcWintRessuprimento', {
    ...recorte,
    dataInicio: periodo.inicio, dataFim: periodo.fim, diasPeriodo: JANELA_DIAS,
    excluir: vendas.length > 0 ? vendas.map((v) => v.numtransitem).join(', ') : '0',
  });
  if (!vivo()) return;
  etapa({ medidas: rows as unknown as MedidaRessuprimento[] });

  // R-120: as unidades por caixa do Gestão de Custos, UMA execução por lote
  // de 1000 códigos. A integração pode não existir no ambiente: sem ela,
  // a caixa cai no cadastro do ERP e na embalagem (RN-002 da 003).
  const codprods = rows.map((r) => Number(r.CODPROD)).filter((n) => n > 0);
  const mapa = new Map<number, number>();
  try {
    for (let i = 0; i < codprods.length; i += LOTE_CAIXAS) {
      const lote = codprods.slice(i, i + LOTE_CAIXAS);
      for (const linha of await linhas('sgcCustoUnidadesPorCaixa', { codprods: lote.join(',') })) {
        mapa.set(Number(linha.CODPROD), Number(linha.UNIDADES_POR_CAIXA));
      }
    }
  } catch { /* a embalagem resolve */ }
  const [padrao, posicoes] = await Promise.all([carregarCustoPadrao(codprods), carregarPosicoesFiliais(codprods, codfilial)]);
  if (!vivo()) return;
  etapa({ porCaixa: mapa, custosPadrao: padrao, posicoesFiliais: posicoes });

  // R-125: as políticas de preço especial (gestao-de-custos) e, só se
  // houver alguma, a venda por cliente destes produtos (WinThor) — ambas
  // em lotes de 500, uma vez por carga. Sem a integração, sem oportunidade.
  const custos: CustoEspecial[] = [];
  const porCliente: VendaCliente[] = [];
  try {
    for (const lote of lotesDeCodigos(codprods)) {
      custos.push(...(await linhas('sgcCustoEspeciaisProdutos', { codprods: lote })) as unknown as CustoEspecial[]);
    }
    const comPolitica = [...new Set(custos.map((c) => Number(c.CODPROD)))];
    for (const lote of lotesDeCodigos(comPolitica)) {
      porCliente.push(...(await linhas('sgcWintVendasClientesProdutos', {
        codprods: lote, codfilial, dataInicio: periodo.inicio, dataFim: periodo.fim, incluirPublico: 0,
      })) as unknown as VendaCliente[]);
    }
  } catch { /* sem o módulo de custos não há oportunidade; a lista segue */ }
  if (!vivo()) return;
  etapa({ custosEspeciais: custos, vendasClientes: porCliente });
}

/** A janela da 011: 153 dias terminados hoje, fixa e mostrada (D-016). */
export function janelaDeHoje(hoje: string): { inicio: string; fim: string } {
  const inicio = new Date(`${hoje}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (JANELA_DIAS - 1));
  return { inicio: inicio.toISOString().slice(0, 10), fim: hoje };
}
