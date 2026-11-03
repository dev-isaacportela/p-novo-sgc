// A tela ampla da análise de produtos do pedido (R-133), no desenho do SGC
// legado: a linha de cada produto (o que a análise montou + o que já está no
// pedido), os chips de filtro, a busca, a ordenação por coluna em três passos,
// a alternância Embalagem mínima / Caixa cheia, a coluna Dias e o rodapé.
// Regra pura, exercitada por `frontend/tests/analise-pedido.test.mjs`.
//
// A sugestão e a cobertura são as da 003 (RN-001 e RN-004, `compras.ts`, na
// fórmula do legado da R-134): esta tela só mostra e ordena, não recalcula a
// fórmula — salvo o arredondamento à caixa cheia, que depende da unidade
// exibida (`sugestaoNaUnidade`).

import type { CurvaAbc, ItemPedido } from './compras.ts';
import { arredondarPorCaixa, coberturaFuturaDias, vendaBaseDoItem } from './compras.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** A venda válida do período dividida como no legado (R-133); `null` antes da análise carregar. */
export interface DivisaoVenda { privado: number; pf: number; publico: number }

/** O mesmo produto em outro pedido aberto do Kanban (análise até o envio). */
export interface TransitoKanban { idCard: number; titulo: string; fase: string; quantidade: number }

export interface LinhaDaAnalise {
  codprod: number;
  /** O produto como a análise o montou: sugestão, venda, estoque e cobertura. */
  base: ItemPedido;
  /** O item do pedido (com quantidade), ou `null` quando ainda não entrou. */
  noPedido: ItemPedido | null;
  divisao: DivisaoVenda | null;
  /** Pedido ao ERP (PCEST.QTPEDIDA): já somado ao trânsito da conta (R-134); aqui, para o `title` separar. */
  pedidoErp: number;
  kanban: TransitoKanban[];
  /** Há solicitação do comercial deste produto (no pedido ou na fila). */
  comercial: boolean;
  /** Há tabela de preço especial vigente para o produto. */
  especial: boolean;
}

export interface ExtrasDaAnalise {
  divisao?: Map<number, DivisaoVenda>;
  pedidoErp?: Map<number, number>;
  kanban?: Map<number, TransitoKanban[]>;
  comercial?: Set<number>;
  especial?: Set<number>;
}

/**
 * As linhas da aba Análise: cada produto montado, com o item do pedido por
 * cima quando ele tem quantidade; depois, o que está no pedido e a análise não
 * trouxe (produto acrescentado pela busca).
 */
export function linhasDaAnalise(montados: ItemPedido[], itens: ItemPedido[], extras: ExtrasDaAnalise = {}): LinhaDaAnalise[] {
  const noPedido = new Map((itens ?? []).filter((i) => numero(i.qtPedida) > 0).map((i) => [i.codprod, i]));
  const linha = (base: ItemPedido): LinhaDaAnalise => ({
    codprod: base.codprod,
    base,
    noPedido: noPedido.get(base.codprod) ?? null,
    divisao: extras.divisao?.get(base.codprod) ?? null,
    pedidoErp: extras.pedidoErp?.get(base.codprod) ?? 0,
    kanban: extras.kanban?.get(base.codprod) ?? [],
    comercial: Boolean(extras.comercial?.has(base.codprod)) || numero(noPedido.get(base.codprod)?.idSolicitacao) > 0,
    especial: Boolean(extras.especial?.has(base.codprod)),
  });
  const vistos = new Set((montados ?? []).map((m) => m.codprod));
  return [
    ...(montados ?? []).map(linha),
    ...[...noPedido.values()].filter((i) => !vistos.has(i.codprod)).map(linha),
  ];
}

export const temSaida = (l: Pick<LinhaDaAnalise, 'base'>): boolean => numero(l.base.qtVendaTotal) > 0;

/** "N produto(s) com saída · M sem saída". */
export function contagemDeSaida(linhas: Pick<LinhaDaAnalise, 'base'>[]): { com: number; sem: number } {
  const com = (linhas ?? []).filter(temSaida).length;
  return { com, sem: (linhas ?? []).length - com };
}

/* ─────────────── chips e busca ─────────────── */

export interface FiltrosAnalise {
  saida: 'todas' | 'com' | 'sem';
  comSugestao: boolean;
  noPedido: boolean;
}

export const FILTROS_ANALISE: FiltrosAnalise = { saida: 'todas', comSugestao: false, noPedido: false };

const semAcento = (texto: unknown) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Os chips somam (E): "com saída" + "com sugestão" = os dois ao mesmo tempo. A busca casa nome ou código. */
export function filtrarAnalise(linhas: LinhaDaAnalise[], filtros: FiltrosAnalise, termo = ''): LinhaDaAnalise[] {
  const busca = semAcento(termo).trim();
  return (linhas ?? []).filter((l) => {
    if (filtros.saida === 'com' && !temSaida(l)) return false;
    if (filtros.saida === 'sem' && temSaida(l)) return false;
    if (filtros.comSugestao && !(numero(l.base.qtSugerida) > 0)) return false;
    if (filtros.noPedido && !l.noPedido) return false;
    if (busca && !semAcento(l.base.descricao).includes(busca) && !String(l.codprod).includes(busca)) return false;
    return true;
  });
}

/* ─────────────── unidade exibida ─────────────── */

export type UnidadeExibida = 'embalagem' | 'caixa';

/** Unidades → o número da coluna: em caixa cheia, caixas (com fração quando não fecha). */
export function naUnidade(unidades: number, unPorCaixa: number, unidade: UnidadeExibida): number {
  const caixa = numero(unPorCaixa) > 1 ? numero(unPorCaixa) : 1;
  return unidade === 'caixa' ? numero(unidades) / caixa : numero(unidades);
}

/** O número digitado na coluna → unidades. */
export function daUnidade(valor: number, unPorCaixa: number, unidade: UnidadeExibida): number {
  const caixa = numero(unPorCaixa) > 1 ? numero(unPorCaixa) : 1;
  return Math.max(0, unidade === 'caixa' ? Math.round(numero(valor) * caixa) : Math.round(numero(valor)));
}

const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * A 2ª linha do "Comprar" quando a quantidade não é a sugerida: a conversão na
 * outra unidade e a sugestão. `null` quando segue a sugestão.
 */
export function segundaLinhaComprar(unidades: number, sugerida: number, unPorCaixa: number, unidade: UnidadeExibida): string | null {
  if (numero(unidades) === numero(sugerida)) return null;
  const caixa = numero(unPorCaixa) > 1 ? numero(unPorCaixa) : 1;
  if (unidade === 'caixa') return `${fmt(numero(unidades))} un · sug. ${fmt(numero(sugerida) / caixa)} cx`;
  return caixa > 1
    ? `${fmt(numero(unidades) / caixa)} cx · sug. ${fmt(numero(sugerida))}`
    : `sug. ${fmt(numero(sugerida))}`;
}

/* ─────────────── a coluna Dias ─────────────── */

export type TomDias = 'alert' | 'attention' | 'off' | 'neutral';

/** Perigo abaixo de 30 dias, atenção acima do teto da curva, "s/ venda" sem venda. */
export function rotuloDias(dias: number | null, limite: number): { texto: string; tom: TomDias } {
  if (dias === null) return { texto: 's/ venda', tom: 'off' };
  const texto = dias > 365 ? '> 365 d' : `${Math.round(dias)} d`;
  if (dias < 30) return { texto, tom: 'alert' };
  if (numero(limite) > 0 && dias > numero(limite)) return { texto, tom: 'attention' };
  return { texto, tom: 'neutral' };
}

/** A cobertura futura com a quantidade da coluna Comprar (RN-004, a mesma conta e a mesma base da sugestão). */
export function diasComCompra(base: ItemPedido, quantidade: number, meses: number): number | null {
  return coberturaFuturaDias(vendaBaseDoItem(base), base.qtEstoque, base.qtTransito, quantidade, meses);
}

/** R-134: em Caixa cheia a sugestão sobe ao múltiplo da caixa; em Embalagem mínima, não. */
export function sugestaoNaUnidade(sugerida: number, unPorCaixa: number, unidade: UnidadeExibida): number {
  return unidade === 'caixa' ? arredondarPorCaixa(numero(sugerida), numero(unPorCaixa)) : numero(sugerida);
}

/** O `title` da coluna Dias: alvo, teto e de onde vieram (R-134). */
export function textoDosDias(base: Pick<ItemPedido, 'coberturaAlvo' | 'coberturaLimite' | 'coberturaOrigem'>): string {
  const alvo = numero(base.coberturaAlvo);
  const partes = [];
  if (alvo > 0) partes.push(`alvo ${fmt(alvo)} d`);
  if (numero(base.coberturaLimite) > 0) partes.push(`limite ${fmt(numero(base.coberturaLimite))} d`);
  if (base.coberturaOrigem) partes.push(base.coberturaOrigem);
  return partes.length > 0 ? `Cobertura futura · ${partes.join(' · ')}` : 'Cobertura futura';
}

/* ─────────────── ordenação por coluna ─────────────── */

export type ColunaAnalise =
  | 'produto' | 'curva' | 'venda' | 'privado' | 'pf' | 'publico'
  | 'estoque' | 'transito' | 'comprar' | 'dias' | 'custo';

/** `invertida` = o segundo clique. Sem ordem (`null`) = a ordem da análise. */
export interface OrdemAnalise { coluna: ColunaAnalise; invertida: boolean }

/** Padrão → invertida → sem ordem. Outra coluna recomeça no padrão. */
export function proximaOrdem(atual: OrdemAnalise | null, coluna: ColunaAnalise): OrdemAnalise | null {
  if (!atual || atual.coluna !== coluna) return { coluna, invertida: false };
  return atual.invertida ? null : { coluna, invertida: true };
}

const ORDEM_CURVA: Record<CurvaAbc, number> = { A: 0, B: 1, C: 2 };

/**
 * O padrão de cada coluna é o que se lê primeiro: produto e curva em ordem
 * crescente (A antes de C), número do maior para o menor, Dias do menor para
 * o maior (quem acaba primeiro). `quantidadeDe` dá o Comprar de cada linha.
 */
export function ordenarAnalise(
  linhas: LinhaDaAnalise[],
  ordem: OrdemAnalise | null,
  quantidadeDe: (l: LinhaDaAnalise) => number,
  meses: number,
): LinhaDaAnalise[] {
  if (!ordem) return linhas;
  const valor = (l: LinhaDaAnalise): number | string => {
    switch (ordem.coluna) {
      case 'produto': return semAcento(l.base.descricao);
      case 'curva': return ORDEM_CURVA[l.base.curvaAbc] ?? 2;
      case 'venda': return numero(l.base.qtVendaTotal);
      case 'privado': return numero(l.divisao?.privado);
      case 'pf': return numero(l.divisao?.pf);
      case 'publico': return numero(l.divisao?.publico);
      case 'estoque': return numero(l.base.qtEstoque);
      case 'transito': return numero(l.base.qtTransito);
      case 'comprar': return quantidadeDe(l);
      case 'dias': return diasComCompra(l.base, quantidadeDe(l), meses) ?? Number.POSITIVE_INFINITY;
      case 'custo': return numero((l.noPedido ?? l.base).precoCusto);
    }
  };
  const crescente = ['produto', 'curva', 'dias'].includes(ordem.coluna);
  const sinal = (crescente ? 1 : -1) * (ordem.invertida ? -1 : 1);
  return [...linhas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const comparacao = typeof va === 'string' ? va.localeCompare(String(vb), 'pt-BR') : (va as number) - (vb as number);
    return comparacao * sinal || a.codprod - b.codprod;
  });
}

/* ─────────────── rodapé ─────────────── */

export interface RodapeAnalise {
  produtos: number;
  aComprar: number;
  curvas: Record<CurvaAbc, number>;
  venda: number;
  estoque: number;
  transito: number;
  comprar: number;
  valor: number;
}

/** "N produtos · X a comprar", A/B/C e as somas das colunas — sobre as linhas visíveis. */
export function rodapeDaAnalise(linhas: LinhaDaAnalise[], quantidadeDe: (l: LinhaDaAnalise) => number): RodapeAnalise {
  const r: RodapeAnalise = { produtos: 0, aComprar: 0, curvas: { A: 0, B: 0, C: 0 }, venda: 0, estoque: 0, transito: 0, comprar: 0, valor: 0 };
  for (const l of linhas ?? []) {
    const qt = quantidadeDe(l);
    r.produtos += 1;
    if (qt > 0) r.aComprar += 1;
    r.curvas[l.base.curvaAbc] = (r.curvas[l.base.curvaAbc] ?? 0) + 1;
    r.venda += numero(l.base.qtVendaTotal);
    r.estoque += numero(l.base.qtEstoque);
    r.transito += numero(l.base.qtTransito);
    r.comprar += qt;
    r.valor += qt * numero((l.noPedido ?? l.base).precoCusto);
  }
  r.valor = Math.round(r.valor * 100) / 100;
  return r;
}

/* ─────────────── aba Itens do pedido ─────────────── */

/** Diferença pedida − sugerida: perigo se negativa (abaixo da sugestão), atenção se positiva. */
export function diferencaDoItem(item: Pick<ItemPedido, 'qtPedida' | 'qtSugerida'>): { valor: number; tom: 'alert' | 'attention' | 'neutral' } {
  const valor = numero(item.qtPedida) - numero(item.qtSugerida);
  return { valor, tom: valor < 0 ? 'alert' : valor > 0 ? 'attention' : 'neutral' };
}

/** O rodapé da aba Itens: unidades, "N esp. · N man." ou "todos padrão", e o total. */
export function rodapeDosItens(itens: Pick<ItemPedido, 'qtPedida' | 'precoCusto' | 'tipoPreco'>[]): { unidades: number; custos: string; total: number } {
  const lista = (itens ?? []).filter((i) => numero(i.qtPedida) > 0);
  const esp = lista.filter((i) => i.tipoPreco === 'especial').length;
  const man = lista.filter((i) => i.tipoPreco === 'manual').length;
  const total = lista.reduce((soma, i) => soma + numero(i.qtPedida) * numero(i.precoCusto), 0);
  return {
    unidades: lista.reduce((soma, i) => soma + numero(i.qtPedida), 0),
    custos: esp + man === 0 ? 'todos padrão' : `${esp} esp. · ${man} man.`,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * O Trâns. separado por origem, para o `title` da coluna. R-134: o trânsito da
 * conta é o do WinThor — o em trânsito mais o pedido ao ERP —; os outros
 * pedidos abertos do Kanban só informam, fora da conta.
 */
export function textoDoTransito(l: Pick<LinhaDaAnalise, 'base' | 'pedidoErp' | 'kanban'>): string {
  const pedidoErp = Math.min(numero(l.pedidoErp), numero(l.base.qtTransito));
  const partes = [`WinThor: ${fmt(numero(l.base.qtTransito) - pedidoErp)} un. em trânsito`];
  if (pedidoErp > 0) partes.push(`+ ${fmt(pedidoErp)} un. pedidas ao ERP`);
  if (l.kanban.length === 0) partes.push('Kanban: nenhum outro pedido aberto');
  else {
    const soma = l.kanban.reduce((t, k) => t + numero(k.quantidade), 0);
    partes.push(`Kanban (fora da conta): ${fmt(soma)} un. em ${l.kanban.length === 1 ? '1 pedido' : `${l.kanban.length} pedidos`} (${l.kanban.map((k) => `${k.titulo} · ${fmt(numero(k.quantidade))}`).join('; ')})`);
  }
  return partes.join(' · ');
}
