// "Análise para aprovação" das fases Aprovação Técnica e Diretoria (R-141,
// C-047 da 002), no molde do legado (PipeWorkspace.tsx:7007-7249 e
// 10215-10316): a faixa de decisão e os indicadores do pedido, cada um com os
// produtos que o compõem.
//
// Só entra o que os ITENS do pedido dão. Compras do mês, saldo sobre a meta e
// compras × vendas dependem de meta de compras e venda projetada que o SGC 2
// não tem (pergunta P-1 do levantamento); a economia do preço especial
// depende do custo padrão, que o pedido não guarda. O limite de cobertura é o
// do item (R-134: a resolução de cobertura é a do SGC 2), não os 60 dias fixos
// do legado. Puro, testado em tests/aprovacao.test.mjs.
import { coberturaFuturaDias, type ItemPedido } from './compras.ts';

export interface ProdutoDoIndicador {
  codprod: number;
  descricao: string;
  qtPedida: number;
  qtSugerida: number;
  coberturaAtual: number | null;
  coberturaApos: number | null;
  valor: number;
}

export interface Indicador {
  chave: string;
  rotulo: string;
  /** Contagem de produtos, ou valor em reais quando `emValor`. */
  quantidade: number;
  emValor?: boolean;
  produtos: ProdutoDoIndicador[];
}

export interface AnaliseParaAprovacao {
  total: number;
  coberturaAtual: number | null;
  coberturaApos: number | null;
  especialValor: number;
  especialPct: number;
  indicadores: Indicador[];
}

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

function media(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  return validos.length ? validos.reduce((soma, v) => soma + v, 0) / validos.length : null;
}

/** `meses` é o do período analisado (`mesesDoPeriodo`), o mesmo da cobertura da Análise. */
export function analiseParaAprovacao(itens: readonly ItemPedido[], meses: number): AnaliseParaAprovacao {
  const comQuantidade = (itens ?? []).filter((item) => numero(item.qtPedida) > 0);
  const produtos = comQuantidade.map((item) => ({
    item,
    produto: {
      codprod: item.codprod,
      descricao: item.descricao,
      qtPedida: numero(item.qtPedida),
      qtSugerida: numero(item.qtSugerida),
      coberturaAtual: coberturaFuturaDias(item.qtVendaTotal, item.qtEstoque, item.qtTransito, 0, meses),
      coberturaApos: coberturaFuturaDias(item.qtVendaTotal, item.qtEstoque, item.qtTransito, item.qtPedida, meses),
      valor: numero(item.qtPedida) * numero(item.precoCusto),
    } satisfies ProdutoDoIndicador,
  }));
  const total = produtos.reduce((soma, p) => soma + p.produto.valor, 0);
  const onde = (filtro: (p: (typeof produtos)[number]) => boolean) => produtos.filter(filtro).map((p) => p.produto);

  const especiais = onde((p) => p.item.tipoPreco === 'especial');
  const especialValor = especiais.reduce((soma, p) => soma + p.valor, 0);
  // Legado: ruptura é cobertura atual abaixo de 30 dias, ou sem estoque com venda.
  const ruptura = onde((p) => (p.produto.coberturaAtual === null
    ? numero(p.item.qtVendaTotal) > 0 && numero(p.item.qtEstoque) <= 0
    : p.produto.coberturaAtual < 30));
  const acimaDoLimite = onde((p) => numero(p.item.coberturaLimite) > 0 && numero(p.item.coberturaDias) > numero(p.item.coberturaLimite));

  const indicadores: Indicador[] = [
    { chave: 'itens', rotulo: 'Itens do pedido', quantidade: produtos.length, produtos: onde(() => true) },
    { chave: 'comercial', rotulo: 'Pedidos pelo comercial', quantidade: 0, produtos: onde((p) => numero(p.item.idSolicitacao) > 0) },
    { chave: 'dentro', rotulo: 'Dentro da sugestão', quantidade: 0, produtos: onde((p) => p.produto.qtPedida === p.produto.qtSugerida) },
    { chave: 'acima', rotulo: 'Acima da sugestão', quantidade: 0, produtos: onde((p) => p.produto.qtPedida > p.produto.qtSugerida) },
    { chave: 'abaixo', rotulo: 'Abaixo da sugestão', quantidade: 0, produtos: onde((p) => p.produto.qtPedida < p.produto.qtSugerida) },
    { chave: 'ruptura', rotulo: 'Em ruptura ou com risco de ruptura', quantidade: 0, produtos: ruptura },
    { chave: 'cobertura', rotulo: 'Cobertura acima do limite', quantidade: 0, produtos: acimaDoLimite },
    {
      chave: 'cobertura-valor', rotulo: 'Valor acima do limite de cobertura', emValor: true,
      quantidade: acimaDoLimite.reduce((soma, p) => soma + p.valor, 0), produtos: acimaDoLimite,
    },
    { chave: 'sem-venda', rotulo: 'Sem venda no período', quantidade: 0, produtos: onde((p) => numero(p.item.qtVendaTotal) <= 0) },
  ].map((ind) => (ind.emValor || ind.chave === 'itens' ? ind : { ...ind, quantidade: ind.produtos.length }));

  return {
    total,
    coberturaAtual: media(produtos.map((p) => p.produto.coberturaAtual)),
    coberturaApos: media(produtos.map((p) => p.produto.coberturaApos)),
    especialValor,
    especialPct: total > 0 ? (especialValor / total) * 100 : 0,
    indicadores,
  };
}

/* ── R-147 (P-1, C-050 da 002): compras × vendas do fornecedor, sob demanda ──
 * Sem meta de compras (decisão do usuário): a faixa do legado fica só com o
 * comprado × vendido do fornecedor na filial, no MESMO período de vendas que
 * o pedido analisou, hoje e depois deste pedido. A leitura é a
 * `sgcWintComprasVsVendas` da 009 (WinThor), que devolve o ranking da filial
 * — aqui se acha a linha do fornecedor. */

export interface ComprasVsVendas {
  comprado: number;
  vendido: number;
  /** comprado ÷ vendido × 100; null sem venda no período. */
  pctAtual: number | null;
  pctApos: number | null;
}

export function comprasVsVendasDoFornecedor(
  linhas: readonly Record<string, unknown>[],
  codfornec: number,
  totalPedido: number,
): ComprasVsVendas | null {
  const linha = (linhas ?? []).find((l) => Number(l.CODFORNEC) === Number(codfornec));
  if (!linha) return null;
  const comprado = numero(linha.VL_COMPRADO);
  const vendido = numero(linha.VL_VENDIDO);
  const pct = (valor: number) => (vendido > 0 ? (valor / vendido) * 100 : null);
  return { comprado, vendido, pctAtual: pct(comprado), pctApos: pct(comprado + numero(totalPedido)) };
}
