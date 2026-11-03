// A cobertura ao chegar do que está a caminho (C-049 emendado, R-132). Regra
// pura — é o que `tests/transito.test.mjs` exercita.
//
// A chegada vem do pedido de compra pendente mais próximo da filial
// (DT_PREV_CHEGADA da consulta principal); sem ele, hoje + lead time do item,
// e a tela diz isso. Até chegar, o estoque continua sendo vendido: a cobertura
// ao chegar é (estoque que sobra na chegada + trânsito) ÷ consumo diário — e,
// se o estoque acaba antes, há dias de ruptura antes de chegar.
import { diasEntre, somarDias } from './data.ts';

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/** Cobertura acima disto é ruído de consumo quase nulo: vira "> 365 d". */
export const COBERTURA_MAXIMA = 365;

export interface ChegadaTransito {
  /** AAAA-MM-DD. */
  data: string;
  /** true = previsão do pedido; false = hoje + lead time. */
  pelaPrevisao: boolean;
  /** A previsão já passou (o pedido está atrasado). */
  atrasada: boolean;
  diasAteChegar: number;
  estoqueNaChegada: number;
  coberturaAoChegarDias: number | null;
  /** Dias sem estoque antes de chegar (0 = não rompe). */
  diasSemEstoque: number;
}

export function chegadaDoTransito(
  l: { estoqueAtual: number; emTransito: number; consumoDiario: number; leadTimeDias: number },
  previsao: string | null | undefined,
  hoje: string,
): ChegadaTransito | null {
  if (!(numero(l.emTransito) > 0)) return null;
  const texto = String(previsao ?? '').slice(0, 10);
  const pelaPrevisao = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  const data = pelaPrevisao ? texto : somarDias(hoje, Math.max(0, Math.round(numero(l.leadTimeDias))));
  const ate = diasEntre(hoje, data) ?? 0;
  const diasAteChegar = Math.max(0, ate);
  const consumo = numero(l.consumoDiario);
  const estoque = Math.max(0, numero(l.estoqueAtual));
  const estoqueNaChegada = Math.max(0, estoque - consumo * diasAteChegar);
  const coberturaAoChegarDias = consumo > 0 ? (estoqueNaChegada + numero(l.emTransito)) / consumo : null;
  const duraDias = consumo > 0 ? estoque / consumo : Number.POSITIVE_INFINITY;
  const diasSemEstoque = duraDias < diasAteChegar ? Math.ceil(diasAteChegar - duraDias) : 0;
  return { data, pelaPrevisao, atrasada: ate < 0, diasAteChegar, estoqueNaChegada, coberturaAoChegarDias, diasSemEstoque };
}

/** "12 d", "> 365 d" ou o texto de sem consumo ("Sem giro" por padrão). */
export function rotuloCobertura(dias: number | null | undefined, semConsumo = 'Sem giro'): string {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return semConsumo;
  if (dias > COBERTURA_MAXIMA) return `> ${COBERTURA_MAXIMA} d`;
  return `${Math.round(dias)} d`;
}

/** "chega em 07/11 (8 d)", "chega em 30/10 (hoje)", "chega em 27/10 (atrasado)" ou "chega em 15/11 (24 d) · prev. pelo lead time". */
export function textoChegada(c: ChegadaTransito): string {
  const [, mes, dia] = c.data.split('-');
  const quando = c.atrasada ? 'atrasado' : c.diasAteChegar === 0 ? 'hoje' : `${c.diasAteChegar} d`;
  return `chega em ${dia}/${mes} (${quando})${c.pelaPrevisao ? '' : ' · prev. pelo lead time'}`;
}
