// O carrinho do layout legado da spec 011 (R-117): persistência e retomada,
// pedido mínimo por grupo, economia e variação de custo, busca e o arquivo de
// importação do WinThor. Módulo puro, sem React e sem SDK — é o que
// `frontend/tests/carrinho.test.mjs` exercita.
//
// RN-021: o carrinho é guardado no navegador, por usuário (`CHAVE_CARRINHO`),
// com quem abriu e quando; a tela mostra "Você tem um carrinho salvo" e oferece
// continuar ou descartar. Guardar no servidor (retomar de outra máquina) é
// dívida registrada na spec — custaria tabela e três SFs.

import type { EntradaCarrinho, GrupoCarrinho } from './ressuprimento.ts';
import { agruparCarrinho } from './ressuprimento.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Uma entrada do carrinho com o que o layout legado acrescentou. */
export interface ItemCarrinho extends EntradaCarrinho {
  /** "Por que comprar" — nasce de `motivoDaSugestao` e a compradora pode reescrever. */
  motivo: string;
  /** O pedido mínimo do fornecedor no momento em que o item entrou (R$). */
  pedidoMinimo: number;
}

export interface CarrinhoSalvo {
  versao: 1;
  abertoEm: string;
  abertoPor: string;
  salvoEm: string;
  itens: ItemCarrinho[];
}

export const CHAVE_CARRINHO = (usuarioId: number) => `sgc2.compras-inteligentes.carrinho.${numero(usuarioId)}`;

/** O texto guardado -> o carrinho, ou `null` quando não há nada aproveitável. */
export function carrinhoDeTexto(texto: string | null | undefined): CarrinhoSalvo | null {
  if (!texto) return null;
  try {
    const bruto = JSON.parse(texto) as Partial<CarrinhoSalvo>;
    if (!bruto || bruto.versao !== 1 || !Array.isArray(bruto.itens)) return null;
    const itens = bruto.itens.filter((i) => i && i.linha && i.linha.medida && numero(i.quantidade) > 0);
    if (itens.length === 0) return null;
    return {
      versao: 1,
      abertoEm: String(bruto.abertoEm ?? ''),
      abertoPor: String(bruto.abertoPor ?? ''),
      salvoEm: String(bruto.salvoEm ?? ''),
      itens: itens.map((i) => ({ ...i, motivo: String(i.motivo ?? ''), pedidoMinimo: numero(i.pedidoMinimo) })),
    };
  } catch {
    return null;
  }
}

export function textoDoCarrinho(carrinho: CarrinhoSalvo): string {
  return JSON.stringify(carrinho);
}

export interface ResumoCarrinho { itens: number; pedidos: number; total: number }

/** "N itens · N pedidos · R$ X" do aviso e do cabeçalho. */
export function resumoDoCarrinho(itens: ItemCarrinho[]): ResumoCarrinho {
  const grupos = agruparCarrinho(itens ?? []);
  return {
    itens: (itens ?? []).length,
    pedidos: grupos.length,
    total: Math.round(grupos.reduce((soma, g) => soma + g.total, 0) * 100) / 100,
  };
}

/** RN-027: variação do custo atual contra o da última entrada, em %. Sem um dos dois, `null`. */
export function variacaoDePreco(ultimo: number, atual: number): number | null {
  const u = numero(ultimo);
  const a = numero(atual);
  if (u <= 0 || a <= 0) return null;
  return ((a - u) / u) * 100;
}

/** RN-027: a economia é o que o custo atual está ABAIXO do último, vezes a quantidade; subida não desconta. */
export function economiaNoCusto(itens: { quantidade: number; ultimo: number; atual: number }[]): number {
  const soma = (itens ?? []).reduce((acc, i) => {
    const u = numero(i.ultimo);
    const a = numero(i.atual);
    if (u <= 0 || a <= 0 || a >= u) return acc;
    return acc + (u - a) * Math.max(0, numero(i.quantidade));
  }, 0);
  return Math.round(soma * 100) / 100;
}

export interface SituacaoMinimo { atingido: boolean; falta: number; pct: number }

/** RN-022: a barra de pedido mínimo do grupo. Sem mínimo parametrizado, está sempre atingido. */
export function faltaParaMinimo(total: number, pedidoMinimo: number): SituacaoMinimo {
  const minimo = numero(pedidoMinimo);
  const t = Math.max(0, numero(total));
  if (minimo <= 0) return { atingido: true, falta: 0, pct: 100 };
  const falta = Math.max(0, Math.round((minimo - t) * 100) / 100);
  return { atingido: falta === 0, falta, pct: Math.min(100, (t / minimo) * 100) };
}

/** O mínimo do grupo é o maior informado entre os itens (todos vêm do mesmo fornecedor). */
export function pedidoMinimoDoGrupo(itens: ItemCarrinho[], grupo: GrupoCarrinho): number {
  return (itens ?? [])
    .filter((i) => numero(i.codfornec) === grupo.codfornec && String(i.codfilial) === grupo.codfilial)
    .reduce((maior, i) => Math.max(maior, numero(i.pedidoMinimo)), 0);
}

/** A busca do carrinho: código, descrição ou código de fábrica. */
export function filtrarCarrinho(itens: ItemCarrinho[], busca: string): ItemCarrinho[] {
  const termo = String(busca ?? '').trim().toLowerCase();
  if (termo === '') return itens ?? [];
  return (itens ?? []).filter((i) => String(i.linha.medida.CODPROD).includes(termo)
    || String(i.linha.medida.DESCRICAO).toLowerCase().includes(termo)
    || String(i.linha.medida.CODFAB ?? '').toLowerCase().includes(termo));
}

/* ── RN-023 / C-030: o arquivo de importação do WinThor ── */

/**
 * Uma linha por item, `CODPROD;PRECO;QTD`, sem cabeçalho, preço com ponto
 * decimal e duas casas, quantidade inteira — é um arquivo para o ERP ler, não
 * para o Excel. Um arquivo por fornecedor + filial.
 */
export function textoImportacaoWinthor(itens: { codprod: number; preco: number; quantidade: number }[]): string {
  return (itens ?? [])
    .filter((i) => numero(i.quantidade) > 0)
    .map((i) => `${Math.trunc(numero(i.codprod))};${numero(i.preco).toFixed(2)};${Math.round(numero(i.quantidade))}`)
    .join('\r\n');
}

export function nomeArquivoWinthor(codfornec: number, codfilial: string, data: string): string {
  return `winthor-${numero(codfornec)}-filial-${String(codfilial)}-${String(data).slice(0, 10)}.txt`;
}
