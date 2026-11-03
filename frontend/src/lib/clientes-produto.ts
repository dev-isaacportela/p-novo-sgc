// "Clientes que compraram" na Análise do Produto aberta do pedido (R-135, o
// legado PW:16044-16590): as notas de venda válida do produto na filial
// (`sgcWintProdutoVendasNotas`, só ao abrir a janela) agrupadas por cliente
// no mês escolhido e numa matriz cliente × mês, nos 6 meses do gráfico
// Compras × vendas. Regra pura, exercitada por `tests/clientes-produto.test.mjs`.
//
// O público (ramos 11 a 15) fica fora no kanban; a consulta já o tira, e
// `semPublico` o tira de novo se ele vier (a soma por mês tem de bater com a
// barra de Vendas do gráfico, que no kanban é sem o público).
import { mesesAte } from './ressuprimento-detalhe.ts';

/** Uma linha de `sgcWintProdutoVendasNotas` (UPPERCASE). */
export interface NotaDoProduto {
  MES: string; DTMOV: string; NUMNOTA: number; NUMTRANSVENDA: number;
  CODCLI: number; CLIENTE: string; CODATV1: number; RAMO: string;
  QUANTIDADE: number; VALOR_TOTAL: number; PUBLICO: number;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Os 6 meses do gráfico (o corrente entra como parcial) e a janela da consulta: do 1º dia do primeiro até hoje. */
export function janelaDosClientes(hoje: string, n = 6): { meses: string[]; inicio: string; fim: string } {
  const meses = mesesAte(hoje, n);
  return { meses, inicio: `${meses[0]}-01`, fim: String(hoje).slice(0, 10) };
}

export function semPublico(notas: NotaDoProduto[]): NotaDoProduto[] {
  return (notas ?? []).filter((n) => numero(n.PUBLICO) !== 1);
}

export interface ClienteQueComprou {
  codcli: number;
  cliente: string;
  ramo: string;
  quantidade: number;
  valor: number;
  /** As notas do cliente no recorte, da mais recente para a mais antiga. */
  notas: NotaDoProduto[];
  ultimaCompra: string;
}

const nomeDe = (n: NotaDoProduto) => String(n.CLIENTE || (numero(n.CODCLI) > 0 ? `Cliente ${numero(n.CODCLI)}` : 'Sem cliente'));
const ramoDe = (n: NotaDoProduto) => String(n.RAMO || (numero(n.CODATV1) > 0 ? `Ramo ${numero(n.CODATV1)}` : '—'));

/** Os clientes do mês (`''` = os meses da janela), do que mais levou para o que menos. */
export function clientesDoMes(notas: NotaDoProduto[], mes: string, meses: string[]): ClienteQueComprou[] {
  const dentro = new Set(mes ? [mes] : meses);
  const porCliente = new Map<number, ClienteQueComprou>();
  for (const n of notas ?? []) {
    if (!dentro.has(String(n.MES))) continue;
    const codcli = numero(n.CODCLI);
    const atual = porCliente.get(codcli) ?? { codcli, cliente: nomeDe(n), ramo: ramoDe(n), quantidade: 0, valor: 0, notas: [], ultimaCompra: '' };
    atual.quantidade += numero(n.QUANTIDADE);
    atual.valor = Math.round((atual.valor + numero(n.VALOR_TOTAL)) * 100) / 100;
    atual.notas.push(n);
    if (String(n.DTMOV) > atual.ultimaCompra) atual.ultimaCompra = String(n.DTMOV);
    porCliente.set(codcli, atual);
  }
  return [...porCliente.values()]
    .map((c) => ({ ...c, notas: [...c.notas].sort((a, b) => String(b.DTMOV).localeCompare(String(a.DTMOV)) || numero(b.NUMNOTA) - numero(a.NUMNOTA)) }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor || a.codcli - b.codcli);
}

/** Top 10, ou todos com "Ver todos". */
export function topClientes<T>(lista: T[], todos: boolean, limite = 10): T[] {
  return todos ? lista : (lista ?? []).slice(0, limite);
}

export interface MatrizClienteMes {
  meses: string[];
  linhas: { codcli: number; cliente: string; ramo: string; porMes: number[]; total: number }[];
  totalPorMes: number[];
  total: number;
}

/** Clientes nas linhas (do que mais levou na janela), meses nas colunas, total por linha e por mês. */
export function matrizClienteMes(notas: NotaDoProduto[], meses: string[]): MatrizClienteMes {
  const indice = new Map(meses.map((m, i) => [m, i]));
  const linhas = new Map<number, MatrizClienteMes['linhas'][number]>();
  const totalPorMes = meses.map(() => 0);
  for (const n of notas ?? []) {
    const i = indice.get(String(n.MES));
    if (i === undefined) continue;
    const codcli = numero(n.CODCLI);
    const linha = linhas.get(codcli) ?? { codcli, cliente: nomeDe(n), ramo: ramoDe(n), porMes: meses.map(() => 0), total: 0 };
    linha.porMes[i] += numero(n.QUANTIDADE);
    linha.total += numero(n.QUANTIDADE);
    totalPorMes[i] += numero(n.QUANTIDADE);
    linhas.set(codcli, linha);
  }
  return {
    meses,
    linhas: [...linhas.values()].sort((a, b) => b.total - a.total || a.codcli - b.codcli),
    totalPorMes,
    total: totalPorMes.reduce((t, v) => t + v, 0),
  };
}

/** A soma por mês das notas — tem de ser a barra de Vendas do gráfico, mês a mês. */
export function somaPorMes(notas: NotaDoProduto[], meses: string[]): number[] {
  return matrizClienteMes(notas, meses).totalPorMes;
}
