// Regra pura de calendário para o DatePicker (src/components/DatePicker.tsx,
// spec 004 — UI-03 B). Grade do mês, navegação, texto <-> ISO. Sem `Date` com
// fuso local: tudo em UTC (`Date.UTC`) ou aritmética de texto, para o 20/10
// que a pessoa digitou não virar 19/10 por causa do fuso do navegador.
//
// Testado por frontend/tests/data.test.mjs — sem React, sem DOM.

export interface DiaGrade {
  iso: string; // 'aaaa-mm-dd'
  noMes: boolean; // pertence ao mês exibido (falso = dia de outro mês, no preenchimento das 6 semanas)
}

const DOIS = (n: number) => String(n).padStart(2, '0');

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS_SEMANA_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function nomeMes(mes: number): string {
  return MESES[mes - 1] ?? '';
}

export function nomeDiaSemanaAbrev(indice: number): string {
  return DIAS_SEMANA_ABREV[indice] ?? '';
}

/** Último dia do mês (mês 1-12). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** 'aaaa-mm-dd' -> partes, ou `undefined` se malformado ou impossível (31/02). */
export function parseIso(iso: string): { ano: number; mes: number; dia: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return undefined;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return undefined;
  return { ano, mes, dia };
}

export function isoValido(iso: string): boolean {
  return parseIso(iso) !== undefined;
}

/** 'dd/mm/aaaa' -> 'aaaa-mm-dd'; texto incompleto ou data impossível -> `null` (não chama onChange). */
export function textoParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const iso = `${aaaa}-${mm}-${dd}`;
  return isoValido(iso) ? iso : null;
}

/** 'aaaa-mm-dd' -> 'dd/mm/aaaa'; entrada vazia ou inválida -> ''. */
export function isoParaTexto(iso: string): string {
  const partes = parseIso(iso);
  return partes ? `${DOIS(partes.dia)}/${DOIS(partes.mes)}/${partes.ano}` : '';
}

/** 'aaaa-mm-dd' -> "20 de outubro de 2026" (aria-label por extenso de cada dia da grade). */
export function isoPorExtenso(iso: string): string {
  const partes = parseIso(iso);
  return partes ? `${partes.dia} de ${nomeMes(partes.mes)} de ${partes.ano}` : '';
}

/** Máscara leve dd/mm/aaaa enquanto a pessoa digita: só dígitos, barras automáticas. */
export function aplicarMascaraData(entrada: string): string {
  const digitos = String(entrada ?? '').replace(/\D/g, '').slice(0, 8);
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join('/');
}

/** Soma dias a um iso, sem fuso. */
export function somarDias(iso: string, dias: number): string {
  const partes = parseIso(iso);
  if (!partes) return iso;
  const d = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia + dias));
  return `${d.getUTCFullYear()}-${DOIS(d.getUTCMonth() + 1)}-${DOIS(d.getUTCDate())}`;
}

/** 0 (domingo) a 6 (sábado). */
export function diaDaSemana(iso: string): number {
  const partes = parseIso(iso);
  return partes ? new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia)).getUTCDay() : 0;
}

export function inicioDaSemana(iso: string): string {
  return somarDias(iso, -diaDaSemana(iso));
}

export function fimDaSemana(iso: string): string {
  return somarDias(iso, 6 - diaDaSemana(iso));
}

/** Mês adjacente (delta em meses), virando o ano nas pontas. */
export function mesAdjacente(anoMes: { ano: number; mes: number }, delta: number): { ano: number; mes: number } {
  const total = anoMes.ano * 12 + (anoMes.mes - 1) + delta;
  return { ano: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 + 1 };
}

/** Mesmo dia do mês, levado para outro ano/mês — corta no último dia se o mês for mais curto. */
export function comMesmoDia(iso: string, alvo: { ano: number; mes: number }): string {
  const dia = Math.min(parseIso(iso)?.dia ?? 1, diasNoMes(alvo.ano, alvo.mes));
  return `${alvo.ano}-${DOIS(alvo.mes)}-${DOIS(dia)}`;
}

export function dentroDoLimite(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** As 42 células (6 semanas) do mês, começando no domingo da semana do dia 1. */
export function gradeDoMes(ano: number, mes: number): DiaGrade[] {
  const primeiroDoMes = `${ano}-${DOIS(mes)}-01`;
  const inicio = inicioDaSemana(primeiroDoMes);
  return Array.from({ length: 42 }, (_, i) => {
    const iso = somarDias(inicio, i);
    return { iso, noMes: parseIso(iso)?.mes === mes };
  });
}
