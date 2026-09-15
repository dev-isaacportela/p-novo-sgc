// O acompanhamento do faturamento (spec 005, RN-008, RN-009 e RN-013): quanto
// do pedido já foi faturado, em que nível de alerta ele está e a linha que o
// cartão mostra. Regra pura — `frontend/tests/faturamento.test.mjs`.
//
// `textoDaCapaFaturamento` tem um espelho em JavaScript dentro de
// `sgcFaturamentoMonitorar` (backend/add-008-notas-fiscais.mjs): o cron escreve
// a mesma linha de capa que a tela escreve. Se as duas redações divergirem, um
// lado reescreve o campo do outro a cada rodada — por isso o texto é idêntico,
// espaço por espaço, e o smoke do backend confere a mesma frase.

import { moeda } from './formato.ts';

export interface EntradaPercentuais {
  vlPedido: number;
  vlFaturado: number;
  qtPedida: number;
  qtFaturada: number;
}

/** Uma linha de `sgcFaturamentoPendenteListar`, como ela chega do servidor. */
export interface LinhaPendente {
  ID_CARD: number;
  TITULO?: string;
  FASE?: string;
  FORNECEDOR?: string;
  FILIAL?: string;
  NUMPED?: string | number;
  DT_ENVIO?: string;
  VL_TOTAL?: number;
  VL_FATURADO?: number;
  PERC_VALOR?: number;
  DIAS_UTEIS?: number;
  QT_CONTATOS?: number;
  DT_ULTIMO_CONTATO?: string;
  ULTIMO_CONTATO_POR?: string;
  DT_PREVISAO_BO?: string;
  QT_BO_ABERTO?: number;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/**
 * `toLocaleString` separa o `R$` do número com espaço NÃO separável (U+00A0);
 * o cron, que monta o texto na mão, usa espaço comum. A capa é comparada como
 * texto nos dois caminhos, então o espaço vira o comum aqui.
 */
const moedaDaCapa = (valor: number): string => moeda(valor).replace(/\s/g, ' ');

/** Duas casas, vírgula decimal e sem zero à direita: `60`, `59,5`, `12,34`. */
const percentual = (valor: number): string =>
  String(Math.round(numero(valor) * 100) / 100).replace('.', ',');

/**
 * RN-008 — o percentual faturado em valor (notas ÷ pedido) e em quantidade
 * (itens faturados casados ÷ itens pedidos), mais o saldo em valor. Pedido de
 * valor ou quantidade zero devolve 0 %, nunca divisão por zero.
 */
export function percentuaisFaturados(entrada: EntradaPercentuais): {
  valor: number;
  quantidade: number;
  saldo: number;
} {
  const vlPedido = numero(entrada.vlPedido);
  const vlFaturado = numero(entrada.vlFaturado);
  const qtPedida = numero(entrada.qtPedida);
  const qtFaturada = numero(entrada.qtFaturada);
  return {
    valor: vlPedido > 0 ? (vlFaturado / vlPedido) * 100 : 0,
    quantidade: qtPedida > 0 ? (qtFaturada / qtPedida) * 100 : 0,
    saldo: vlPedido - vlFaturado,
  };
}

/**
 * RN-009 — o escalonamento por dias úteis desde o envio: 3 avisa os
 * responsáveis, 5 avisa também a gerência. Abaixo de 3, nada.
 */
export function nivelDeAlerta(diasUteis: number): 0 | 3 | 5 {
  const dias = numero(diasUteis);
  if (dias >= 5) return 5;
  if (dias >= 3) return 3;
  return 0;
}

/**
 * RN-013 / R-042 — a capa tem nota quando há VALOR faturado, e não quando há
 * linha em `SGC_NF`: os dois caminhos que escrevem o campo `faturamento`
 * (a aba e o cron `sgcFaturamentoMonitorar`) precisam do MESMO critério, senão
 * uma nota de `VL_TOTAL` zero faz cada lado escrever um texto e sobrescrever o
 * outro a cada rodada.
 */
export function temNfNaCapa(vlFaturado: unknown): boolean {
  return numero(vlFaturado) > 0;
}

/**
 * RF-023 / R-043 — a cobrança enviada vira contato no histórico do pedido. O
 * resumo é montado aqui porque as DUAS telas que abrem o diálogo de cobrança
 * (a aba do pedido e `/faturamentos-pendentes`) gravam o mesmo texto.
 */
export function resumoDaCobranca(assunto: string, para: string): string {
  const destino = String(para ?? '').trim();
  const titulo = String(assunto ?? '').trim();
  return `Cobrança de faturamento enviada por e-mail para ${destino || 'a indústria'}`
    + (titulo ? ` — ${titulo}` : '');
}

/**
 * RN-013 — a linha de faturamento do cartão. Sem nota e com menos de 3 dias
 * úteis não há linha: campo vazio, cartão limpo.
 */
export function textoDaCapaFaturamento(entrada: {
  temNf: boolean;
  vlFaturado: number;
  percValor: number;
  saldo: number;
  diasUteis: number;
}): string {
  if (entrada.temNf) {
    return `${moedaDaCapa(entrada.vlFaturado)} (${percentual(entrada.percValor)} %)`
      + ` · saldo ${moedaDaCapa(entrada.saldo)}`;
  }
  if (numero(entrada.diasUteis) >= 3) {
    return `Faturamento pendente · ${numero(entrada.diasUteis)} dias úteis`;
  }
  return '';
}

const CABECALHO_CSV = [
  'Pedido', 'Fornecedor', 'Filial', 'Nº WinThor', 'Etapa', 'Enviado em',
  'Valor do pedido', 'Valor faturado', '% faturado', 'Dias úteis',
  'Contatos', 'Último contato', 'Registrado por', 'Previsão B.O.', 'Itens em B.O.',
];

/**
 * RF-025 — as colunas do CSV de faturamentos pendentes, na ordem da tela e
 * sobre as linhas que ela JÁ carregou (sem segunda consulta). Só escolhe e
 * formata; escapar e juntar é de `lib/csv.ts` (R-037).
 */
export function colunasDoCsv(linhas: LinhaPendente[]): {
  cabecalho: string[];
  corpo: (string | number)[][];
} {
  return {
    cabecalho: CABECALHO_CSV,
    corpo: linhas.map((linha) => [
      String(linha.TITULO ?? ''),
      String(linha.FORNECEDOR ?? ''),
      String(linha.FILIAL ?? ''),
      String(linha.NUMPED ?? ''),
      String(linha.FASE ?? ''),
      String(linha.DT_ENVIO ?? ''),
      numero(linha.VL_TOTAL).toFixed(2).replace('.', ','),
      numero(linha.VL_FATURADO).toFixed(2).replace('.', ','),
      percentual(linha.PERC_VALOR ?? 0),
      numero(linha.DIAS_UTEIS),
      numero(linha.QT_CONTATOS),
      String(linha.DT_ULTIMO_CONTATO ?? ''),
      String(linha.ULTIMO_CONTATO_POR ?? ''),
      String(linha.DT_PREVISAO_BO ?? ''),
      numero(linha.QT_BO_ABERTO),
    ]),
  };
}
