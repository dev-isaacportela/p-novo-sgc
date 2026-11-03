// Apoio à avaliação (spec 017, RN-SOL-19 do legado): ao avaliar uma
// solicitação, as vendas do produto na filial dela (o gráfico da R-139, de
// `vendas-filial.ts`), os cinco clientes que mais compraram (a regra do
// "Clientes que compraram" da R-135, de `clientes-produto.ts`), onde está o
// cliente da própria solicitação e o estoque da filial. Regra pura, exercitada
// por `tests/solicitacoes-apoio.test.mjs`. Nada aqui consulta: as três leituras
// são as do add-013 (plan.md §O que se reusa).
import { clientesDoMes, janelaDosClientes, semPublico, topClientes, type ClienteQueComprou, type NotaDoProduto } from './clientes-produto.ts';
import { MESES_CONSULTA_FILIAL } from './vendas-filial.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** RNF-04: o teto de notas da `sgcWintProdutoVendasNotas`; chegou nele, a lista pode estar cortada. */
export const TETO_NOTAS = 3000;
/** RN-03: quantos clientes a avaliação mostra. */
export const CLIENTES_NO_APOIO = 5;

/** RN-02 (P-02): os MESMOS sete meses do gráfico — seis fechados e o corrente —, do dia 1 do primeiro até hoje. */
export function janelaDoApoio(hoje: string): { meses: string[]; inicio: string; fim: string } {
  return janelaDosClientes(hoje, MESES_CONSULTA_FILIAL);
}

/** Todos os clientes privados da janela, do que mais levou para o que menos (RN-01, RN-03). */
export function clientesDoApoio(notas: NotaDoProduto[], meses: string[]): ClienteQueComprou[] {
  return clientesDoMes(semPublico(notas ?? []), '', meses);
}

/** RN-03: os cinco primeiros. */
export function cincoMaiores(clientes: ClienteQueComprou[]): ClienteQueComprou[] {
  return topClientes(clientes ?? [], false, CLIENTES_NO_APOIO);
}

export type ClienteNoApoio =
  | { situacao: 'sem_cliente' }
  | { situacao: 'entre_os_cinco'; posicao: number; quantidade: number; notas: number }
  | { situacao: 'fora_dos_cinco'; quantidade: number; notas: number }
  | { situacao: 'nao_comprou' };

/** RN-04 (P-05): onde o cliente da solicitação está na leitura. Sem cliente nunca é "não comprou". */
export function clienteNoApoio(clientes: ClienteQueComprou[], codcli: unknown): ClienteNoApoio {
  const alvo = numero(codcli);
  if (alvo <= 0) return { situacao: 'sem_cliente' };
  const indice = (clientes ?? []).findIndex((c) => numero(c.codcli) === alvo);
  if (indice < 0) return { situacao: 'nao_comprou' };
  const cliente = clientes[indice];
  return indice < CLIENTES_NO_APOIO
    ? { situacao: 'entre_os_cinco', posicao: indice + 1, quantidade: cliente.quantidade, notas: cliente.notas.length }
    : { situacao: 'fora_dos_cinco', quantidade: cliente.quantidade, notas: cliente.notas.length };
}

const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const notasDe = (n: number) => `${n} ${n === 1 ? 'nota' : 'notas'}`;

/** A frase do cliente da solicitação; `null` quando ele já está marcado na lista dos cinco. */
export function fraseDoCliente(posicao: ClienteNoApoio): string | null {
  switch (posicao.situacao) {
    case 'sem_cliente': return 'Sem cliente informado';
    case 'nao_comprou': return 'O cliente desta solicitação não comprou este produto nesta filial nos meses do gráfico.';
    case 'fora_dos_cinco':
      return `O cliente desta solicitação levou ${fmt(posicao.quantidade)} un. em ${notasDe(posicao.notas)} nos meses do gráfico (fora dos cinco maiores).`;
    default: return null;
  }
}

/** Uma linha de `sgcWintProdutoEstoqueFiliais` (UPPERCASE). */
export interface EstoqueDaFilial { CODFILIAL: string; ESTOQUE_ATUAL: number; ESTOQUE_EM_TRANSITO: number }

/** RN-05 (P-04): o disponível (já líquido, nunca negativo) e o que está a caminho; `null` = filial sem posição. */
export function estoqueNoApoio(linhas: EstoqueDaFilial[], codfilial: unknown): { disponivel: number; aCaminho: number } | null {
  const linha = (linhas ?? []).find((l) => String(l.CODFILIAL) === String(codfilial ?? ''));
  if (!linha) return null;
  return { disponivel: Math.max(0, numero(linha.ESTOQUE_ATUAL)), aCaminho: Math.max(0, numero(linha.ESTOQUE_EM_TRANSITO)) };
}

/**
 * RN-06/RNF-04: a consulta parou no teto. Ela ordena do mês mais antigo para o
 * mais novo, então o que falta é o FIM da janela — a tela avisa que a lista é parcial.
 */
export function listaParcial(notas: NotaDoProduto[] | null): boolean {
  return (notas ?? []).length >= TETO_NOTAS;
}
