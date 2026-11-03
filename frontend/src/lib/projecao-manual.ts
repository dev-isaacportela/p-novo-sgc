// Projeção manual (spec 019, extensão da 011): o ajuste percentual da venda
// projetada de um produto, com validade e motivo. O sistema antigo só mostrava
// o selo (RN-CI-23, "cálculo inalterado"); aqui o fator multiplica a venda
// projetada (P-01) — o consumo da régua (`calcularRessuprimento`) e a previsão
// de cada modelo (`preverVendas`). Módulo puro, sem React e sem SDK, e sem
// importar `ressuprimento.ts` (que importa daqui): é o que
// `frontend/tests/projecao-manual.test.mjs` exercita.

/** RN-004 (P-02, P-03, P-05). */
export const PERCENTUAL_MINIMO = -90;
export const PERCENTUAL_MAXIMO = 300;
export const VALIDADE_PADRAO_DIAS = 30;
export const VALIDADE_MAXIMA_DIAS = 365;
export const MOTIVO_MINIMO = 5;
export const MOTIVO_MAXIMO = 500;

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Linha de `sgcProjecaoManualListar`, já no formato da regra. */
export interface ProjecaoManual {
  codprod: number;
  percentual: number;
  validaAte: string;
  motivo: string;
  atualizadoPor: number;
  atualizadoEm: string;
}

/** Linha de `sgcProjecaoManualListar` (UPPERCASE) -> o objeto da regra. */
export function projecaoDeLinha(linha: Record<string, unknown>): ProjecaoManual {
  return {
    codprod: numero(linha.CODPROD),
    percentual: numero(linha.PERCENTUAL),
    validaAte: String(linha.VALIDA_ATE ?? '').slice(0, 10),
    motivo: String(linha.MOTIVO ?? ''),
    atualizadoPor: numero(linha.ATUALIZADO_POR),
    atualizadoEm: String(linha.ATUALIZADO_EM ?? ''),
  };
}

/** RN-001: vale com percentual ≠ 0 e validade hoje ou depois (texto AAAA-MM-DD, sem fuso). Sem validade não vale (P-02). */
export function projecaoAtiva(p: Pick<ProjecaoManual, 'percentual' | 'validaAte'> | null | undefined, hoje: string): boolean {
  if (!p || numero(p.percentual) === 0) return false;
  const ate = String(p.validaAte ?? '').slice(0, 10);
  if (ate.length !== 10) return false;
  return ate >= String(hoje ?? '').slice(0, 10);
}

/** RN-002: fator = 1 + percentual ÷ 100 quando vale; 1 fora disso. */
export function fatorDaProjecao(p: Pick<ProjecaoManual, 'percentual' | 'validaAte'> | null | undefined, hoje: string): number {
  return projecaoAtiva(p, hoje) ? 1 + numero(p?.percentual) / 100 : 1;
}

/** Os ajustes que VALEM hoje, por produto — o que `montarRessuprimento` recebe. */
export function projecoesAtivas(lista: ProjecaoManual[], hoje: string): Map<number, ProjecaoManual> {
  return new Map((lista ?? []).filter((p) => numero(p.codprod) > 0 && projecaoAtiva(p, hoje)).map((p) => [numero(p.codprod), p]));
}

function somarDias(hoje: string, dias: number): string {
  const base = Date.parse(`${String(hoje ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(base)) return '';
  return new Date(base + dias * 86400000).toISOString().slice(0, 10);
}

/** RN-004: a validade nasce em hoje + 30. */
export function validadePadrao(hoje: string): string {
  return somarDias(hoje, VALIDADE_PADRAO_DIAS);
}

/** A data mais distante aceita (hoje + 365). */
export function validadeMaxima(hoje: string): string {
  return somarDias(hoje, VALIDADE_MAXIMA_DIAS);
}

/** "20", "−12,5", "+20 %" ou "20,0" -> número; texto inválido -> NaN. */
export function lerPercentual(texto: string): number {
  const limpo = String(texto ?? '').replace(/[%\s+]/g, '').replace('−', '-').replace(',', '.');
  if (limpo === '' || limpo === '-') return Number.NaN;
  return Number(limpo);
}

export interface ValidacaoProjecao { ok: boolean; erros: string[]; percentual: number }

/** RN-004 / C-005: o que impede gravar, na ordem dos campos da janela. */
export function validarProjecao(
  valores: { percentual: string; validaAte: string; motivo: string },
  hoje: string,
): ValidacaoProjecao {
  const erros: string[] = [];
  const lido = lerPercentual(valores.percentual);
  const percentual = Number.isFinite(lido) ? Math.round(lido * 10) / 10 : Number.NaN;
  if (!Number.isFinite(percentual)) {
    erros.push('Informe o percentual, por exemplo 20 ou −15.');
  } else if (percentual === 0) {
    erros.push('O percentual não pode ser zero — para tirar o ajuste, use "Remover ajuste".');
  } else if (percentual < PERCENTUAL_MINIMO || percentual > PERCENTUAL_MAXIMO) {
    erros.push(`O percentual vai de ${PERCENTUAL_MINIMO} % a +${PERCENTUAL_MAXIMO} %.`);
  }
  const ate = String(valores.validaAte ?? '').slice(0, 10);
  const dia = String(hoje ?? '').slice(0, 10);
  if (ate.length !== 10) {
    erros.push('Informe até quando o ajuste vale.');
  } else if (ate < dia) {
    erros.push('A validade não pode ser antes de hoje.');
  } else if (ate > validadeMaxima(dia)) {
    erros.push(`A validade vai até no máximo ${VALIDADE_MAXIMA_DIAS} dias a partir de hoje.`);
  }
  const motivo = String(valores.motivo ?? '').trim();
  if (motivo.length < MOTIVO_MINIMO) {
    erros.push(`Informe o motivo (ao menos ${MOTIVO_MINIMO} caracteres) — é ele que explica a compra diferente na semana que vem.`);
  } else if (motivo.length > MOTIVO_MAXIMO) {
    erros.push(`O motivo tem no máximo ${MOTIVO_MAXIMO} caracteres.`);
  }
  return { ok: erros.length === 0, erros, percentual: Number.isFinite(percentual) ? percentual : 0 };
}

/** O percentual com sinal, sem casa quando inteiro: "+20 %", "−12,5 %". */
export function textoDoPercentual(percentual: number): string {
  const p = numero(percentual);
  const absoluto = Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${p < 0 ? '−' : '+'}${absoluto} %`;
}

/** RN-008: o selo da linha. */
export function textoDoSelo(percentual: number): string {
  return `Projeção ${textoDoPercentual(percentual)}`;
}

export interface PreviaProjecao { consumoAntes: number; consumoDepois: number; maximoAntes: number; maximoDepois: number }

/** C-005: o efeito antes de gravar, sobre o consumo MEDIDO (o de antes de qualquer ajuste). */
export function previaDaProjecao(consumoMedido: number, coberturaDias: number, percentual: number): PreviaProjecao {
  const consumo = Math.max(0, numero(consumoMedido));
  const fator = 1 + numero(percentual) / 100;
  const cobertura = Math.max(0, numero(coberturaDias));
  return {
    consumoAntes: consumo,
    consumoDepois: consumo * fator,
    maximoAntes: consumo * cobertura,
    maximoDepois: consumo * fator * cobertura,
  };
}
