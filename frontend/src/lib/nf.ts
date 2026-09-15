// A regra de nota fiscal — sugestão, casamento do item e as conferências
// (spec 005, RN-002 a RN-007). Regra pura, sem React e sem transporte: é o que
// `frontend/tests/nf.test.mjs` exercita.
//
// O MESMO cálculo existe uma segunda vez, em JavaScript, dentro de
// `sgcNfVincular`/`sgcNfDetectar` (backend/add-008-notas-fiscais.mjs) — a
// server function não importa código do frontend. As duas são espelho
// declarado: os números daqui e os do `backend/simulator/smoke/005-*.mjs` são
// os mesmos, e é isso que impede as duas de divergirem.
//
// A comparação de parcelas do prazo NÃO é reimplementada aqui: `parcelasDoPrazo`
// e `textoDeParcelas` são de `lib/prazo-pagamento.ts`, dono único da regra (R-015).

import { parcelasDoPrazo, textoDeParcelas } from './prazo-pagamento.ts';

export type Resultado = 'conforme' | 'atencao' | 'divergente';
export type CasadoPor = 'codprod' | 'codfab' | 'ean' | 'nenhum';

/** RN-004: até 1 % de diferença é atenção; acima, divergente (R-032). */
export const TOLERANCIA_PRECO = 0.01;
/** RN-005: o padrão, usado só quando o fornecedor não tem mínimo cadastrado. */
export const VALIDADE_MINIMA_PADRAO_DIAS = 120;

export interface ItemDeNota {
  CODPROD: number;
  CODFAB?: string;
  EAN?: string;
  QT?: number;
  PUNIT?: number;
}

export interface ItemDePedido {
  CODPROD: number;
  CODFAB?: string;
  EAN?: string;
  DESCRICAO?: string;
  QT_PEDIDA?: number;
  PRECO_CUSTO?: number;
}

export interface CandidataNf {
  NUMNOTA: number;
  SERIE?: string;
  DT_EMISSAO: string;
  NUMPED?: number;
  VL_TOTAL: number;
  itens: ItemDeNota[];
}

export interface ContextoDaSugestao {
  /** Itens do pedido, com os três códigos — a cobertura é sobre eles. */
  itensPedido: ItemDePedido[];
  dataEnvio: string;
  valorPedido: number;
  /** Valor do pedido menos o que já foi faturado. */
  saldoPedido: number;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

const codigo = (valor: unknown): string => String(valor ?? '').trim().toUpperCase();

/** Dias corridos entre duas datas ISO; entrada inválida devolve `null`. */
function diasEntre(inicioIso: string, fimIso: string): number | null {
  const a = String(inicioIso ?? '').slice(0, 10).split('-').map(Number);
  const b = String(fimIso ?? '').slice(0, 10).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || !a[0] || !b[0]) return null;
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

/** O produto do pedido aparece na nota, por qualquer um dos três códigos? */
function estaNaNota(item: ItemDePedido, itensNf: ItemDeNota[]): boolean {
  return itensNf.some((linha) => (
    Number(linha.CODPROD) === Number(item.CODPROD)
    || (!!codigo(item.CODFAB) && codigo(linha.CODFAB) === codigo(item.CODFAB))
    || (!!codigo(item.EAN) && codigo(linha.EAN) === codigo(item.EAN))
  ));
}

/**
 * RN-002 — a pontuação da sugestão por semelhança:
 * `arredondar(cobertura × 60)` + 20 se a emissão estiver entre 0 e 45 dias
 * depois do envio + 20 se o valor couber no saldo a faturar com folga de 1 %,
 * limitado a [5, 95]. Nota sem nenhum produto do pedido não vira sugestão
 * (`null`). O casamento pelo número do pedido não passa por aqui: vale 100.
 */
export function pontuarSugestao(
  nf: CandidataNf,
  ctx: ContextoDaSugestao,
): { score: number; motivo: string } | null {
  const total = ctx.itensPedido.length;
  if (total === 0) return null;
  const naNota = ctx.itensPedido.filter((item) => estaNaNota(item, nf.itens)).length;
  if (naNota === 0) return null;

  let score = Math.round((naNota / total) * 60);
  const dias = diasEntre(ctx.dataEnvio, nf.DT_EMISSAO);
  if (dias !== null && dias >= 0 && dias <= 45) score += 20;
  if (numero(nf.VL_TOTAL) <= numero(ctx.saldoPedido) * 1.01) score += 20;

  return {
    score: Math.max(5, Math.min(95, score)),
    motivo: `${naNota} de ${total} itens do pedido estão na NF`,
  };
}

/**
 * RN-003 — casa o item da nota com o do pedido: primeiro pelo código do
 * produto, depois pelo código de fábrica, depois pelo código de barras.
 */
export function casarItem(
  itemNf: ItemDeNota,
  itensPedido: ItemDePedido[],
): { item: ItemDePedido | null; casadoPor: CasadoPor } {
  const porCodprod = itensPedido.find((item) => Number(item.CODPROD) === Number(itemNf.CODPROD));
  if (porCodprod) return { item: porCodprod, casadoPor: 'codprod' };

  const codfab = codigo(itemNf.CODFAB);
  if (codfab) {
    const achado = itensPedido.find((item) => codigo(item.CODFAB) === codfab);
    if (achado) return { item: achado, casadoPor: 'codfab' };
  }
  const ean = codigo(itemNf.EAN);
  if (ean) {
    const achado = itensPedido.find((item) => codigo(item.EAN) === ean);
    if (achado) return { item: achado, casadoPor: 'ean' };
  }
  return { item: null, casadoPor: 'nenhum' };
}

/** RN-003: casamento por código de fábrica ou de barras é sempre atenção. */
export function resultadoDoCasamento(casadoPor: CasadoPor): Resultado {
  if (casadoPor === 'codprod') return 'conforme';
  if (casadoPor === 'nenhum') return 'divergente';
  return 'atencao';
}

/**
 * RN-004 — `diferença = |encontrado − esperado| ÷ |esperado|`: zero é conforme,
 * até 1 % é atenção, acima é divergente. Esperado zero com encontrado diferente
 * de zero é divergente.
 */
export function classificarDelta(esperado: number, encontrado: number): { resultado: Resultado; delta: number } {
  const base = numero(esperado);
  const achado = numero(encontrado);
  if (base === 0) return achado === 0 ? { resultado: 'conforme', delta: 0 } : { resultado: 'divergente', delta: 1 };
  const delta = Math.abs(achado - base) / Math.abs(base);
  if (delta === 0) return { resultado: 'conforme', delta: 0 };
  return { resultado: delta <= TOLERANCIA_PRECO ? 'atencao' : 'divergente', delta };
}

/** RN-005 — dias de validade do lote, contados da emissão da nota. */
export function diasDeValidade(dtEmissao: string, dtValidade: string): number | null {
  if (!dtValidade) return null;
  return diasEntre(dtEmissao, dtValidade);
}

/** RN-005 — abaixo do mínimo é divergente; sem data de validade, atenção. */
export function resultadoDeValidade(dias: number | null, minimo: number): Resultado {
  if (dias === null) return 'atencao';
  const regua = numero(minimo) > 0 ? numero(minimo) : VALIDADE_MINIMA_PADRAO_DIAS;
  return dias >= regua ? 'conforme' : 'divergente';
}

/** RN-006 — acima da pedida é divergente; abaixo é conforme, com o saldo no texto. */
export function resultadoDeQuantidade(pedida: number, faturada: number): { resultado: Resultado; texto: string } {
  const pedidaN = numero(pedida);
  const faturadaN = numero(faturada);
  if (faturadaN > pedidaN) return { resultado: 'divergente', texto: 'quantidade faturada acima da pedida' };
  if (faturadaN < pedidaN) {
    return { resultado: 'conforme', texto: `faturamento parcial, saldo de ${pedidaN - faturadaN}` };
  }
  return { resultado: 'conforme', texto: 'quantidade faturada igual à pedida' };
}

/**
 * RN-007 — o prazo da nota são os dias entre emissão e vencimento de cada
 * duplicata; não havendo duplicatas, o prazo declarado na própria nota.
 * Mesmas parcelas na mesma ordem é conforme, qualquer outra coisa é
 * divergente, um dos lados sem número é atenção.
 */
export function resultadoDePrazo(
  acordado: string,
  diasDaNf: number[],
  prazoDaNota: number,
): { resultado: Resultado; esperado: string; encontrado: string } {
  const parcelasAcordadas = parcelasDoPrazo(acordado);
  const daNota = diasDaNf.length > 0 ? diasDaNf : (numero(prazoDaNota) > 0 ? [numero(prazoDaNota)] : []);
  const esperado = textoDeParcelas(parcelasAcordadas);
  const encontrado = textoDeParcelas(daNota);
  if (parcelasAcordadas.length === 0 || daNota.length === 0) {
    return { resultado: 'atencao', esperado: esperado || 'sem prazo acordado', encontrado: encontrado || 'sem duplicata' };
  }
  return { resultado: esperado === encontrado ? 'conforme' : 'divergente', esperado, encontrado };
}

/** Uma conferência como o servidor a gravou (colunas em UPPERCASE). */
export interface Ocorrencia {
  TIPO: string;
  RESULTADO: string;
  VALOR_ESPERADO?: string;
  VALOR_ENCONTRADO?: string;
  DELTA_PERC?: number;
  CODPROD?: number;
}

export const ROTULO_OCORRENCIA: Readonly<Record<string, string>> = {
  item_nao_pedido: 'Casamento do item',
  validade_curta: 'Validade do lote',
  preco_divergente: 'Preço unitário',
  qtd_maior: 'Quantidade faturada',
  prazo_divergente: 'Prazo de pagamento',
  valor_total_divergente: 'Valor total',
  percentual_faturado: 'Percentual faturado',
};

/**
 * D-006 — a frase da conferência é montada aqui, não guardada no banco: texto
 * pronto em coluna envelhece e a mesma regra passa a ter duas redações.
 */
export function textoDaOcorrencia(ocorrencia: Ocorrencia, descricaoDoProduto = ''): string {
  const esperado = String(ocorrencia.VALOR_ESPERADO ?? '');
  const encontrado = String(ocorrencia.VALOR_ENCONTRADO ?? '');
  const produto = descricaoDoProduto ? `${descricaoDoProduto}: ` : '';
  const delta = numero(ocorrencia.DELTA_PERC);
  const percentual = delta > 0 ? ` (${(delta * 100).toFixed(2).replace('.', ',')} %)` : '';

  switch (ocorrencia.TIPO) {
    case 'item_nao_pedido':
      return ocorrencia.RESULTADO === 'divergente'
        ? `${produto}o item faturado não consta no pedido (${encontrado}).`
        : `${produto}casado com ${esperado} por ${encontrado}.`;
    case 'validade_curta':
      return `${produto}validade de ${encontrado}, mínimo de ${esperado}.`;
    case 'preco_divergente':
      return `${produto}preço de ${encontrado} contra ${esperado} do pedido${percentual}.`;
    case 'qtd_maior':
      return `${produto}${encontrado} faturadas de ${esperado} pedidas.`;
    case 'prazo_divergente':
      return `prazo da nota ${encontrado} contra ${esperado} acordado no pedido.`;
    case 'valor_total_divergente':
      return `faturado ${encontrado} de ${esperado} do pedido${percentual}.`;
    case 'percentual_faturado':
      return `${encontrado} do pedido faturado.`;
    default:
      return `${produto}${encontrado}`.trim();
  }
}
