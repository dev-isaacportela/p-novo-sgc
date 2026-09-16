// Cobertura por curva ABC (spec 012) — quantos dias de estoque futuro a compra
// mira em cada curva (o ALVO) e quanto de folga passa sem justificativa (o
// TETO = alvo + tolerância). São dois números diferentes e nunca se
// substituem: o alvo é a mira do estoque máximo, o teto é a fronteira da
// justificativa (RN-004).
//
// Regra pura: entram a lista parametrizada, o alvo e a curva do item; saem o
// alvo, o teto e de onde vieram. Sem React, sem SDK — é o que
// `frontend/tests/cobertura.test.mjs` exercita.

export type NivelCobertura = 'fornecedor' | 'departamento' | 'secao' | 'sku';
export type CurvaAbc = 'A' | 'B' | 'C';

export interface ParCurva {
  alvoDias: number;
  toleranciaPct: number;
}

export interface Cobertura {
  id: number;
  nivel: NivelCobertura;
  codigo: string;
  descricao: string;
  ativo: boolean;
  curvas: Record<CurvaAbc, ParCurva>;
}

/** Sem linha alcançável: alvo 35 dias, tolerância 0 — o teto é o próprio alvo (RN-002/AN-07). */
export const ALVO_COBERTURA_PADRAO_DIAS = 35;
export const TOLERANCIA_COBERTURA_PADRAO_PCT = 0;

/** Do mais específico para o mais geral — é esta ordem que RN-002 define. */
const ORDEM: NivelCobertura[] = ['sku', 'secao', 'departamento', 'fornecedor'];

export const ROTULO_NIVEL: Record<NivelCobertura, string> = {
  sku: 'Produto',
  secao: 'Seção',
  departamento: 'Departamento',
  fornecedor: 'Fornecedor',
};

export interface AlvoCobertura {
  codprod: number;
  codsec: number;
  codepto: number;
  codfornec: number;
}

const CODIGO_DO_NIVEL: Record<NivelCobertura, keyof AlvoCobertura> = {
  sku: 'codprod',
  secao: 'codsec',
  departamento: 'codepto',
  fornecedor: 'codfornec',
};

/**
 * RN-001: teto = alvo × (1 + tolerância ÷ 100), arredondado a duas casas.
 * `null` quando não há teto a calcular — alvo ≤ 0 (a linha não vale para a
 * curva, D-006) ou tolerância não finita (campo ainda vazio no formulário).
 * Nunca 0 por omissão: 0 seria um teto real, e um teto 0 barra todo item.
 */
export function tetoDaCurva(alvoDias: number, toleranciaPct: number): number | null {
  if (!Number.isFinite(alvoDias) || alvoDias <= 0) return null;
  if (!Number.isFinite(toleranciaPct)) return null;
  return Math.round(alvoDias * (1 + toleranciaPct / 100) * 100) / 100;
}

/** RN-003: 'A' | 'B' | 'C'; qualquer outra coisa (vazio, 'D', ausente) → 'C'. */
export function curvaValida(bruta: unknown): CurvaAbc {
  const letra = String(bruta ?? '').trim().toUpperCase();
  return letra === 'A' || letra === 'B' ? letra : 'C';
}

export interface ResolucaoCobertura {
  alvoDias: number;
  limiteDias: number;
  toleranciaPct: number;
  curva: CurvaAbc;
  nivel: NivelCobertura | 'padrao';
}

/**
 * RN-002. Vale a parametrização do produto; na falta, a da seção; na falta, a
 * do departamento; na falta, a do fornecedor. Só entra na disputa a linha
 * ATIVA que alcance o item E tenha alvo maior que zero PARA A CURVA dele —
 * linha com alvo 0 naquela curva cai para o nível seguinte (D-006), nunca
 * produz teto 0. Sem nenhuma, alvo 35 e tolerância 0.
 */
export function limiteDeCobertura(
  coberturas: Cobertura[],
  alvo: AlvoCobertura,
  curvaBruta: unknown,
): ResolucaoCobertura {
  const curva = curvaValida(curvaBruta);
  for (const nivel of ORDEM) {
    const codigo = String(alvo[CODIGO_DO_NIVEL[nivel]] ?? '');
    if (!codigo || codigo === '0') continue;
    const achado = (coberturas ?? []).find(
      (c) => c.nivel === nivel && String(c.codigo) === codigo && c.ativo !== false,
    );
    const par = achado?.curvas?.[curva];
    const limiteDias = par ? tetoDaCurva(par.alvoDias, par.toleranciaPct) : null;
    if (par && limiteDias !== null) {
      return { alvoDias: par.alvoDias, limiteDias, toleranciaPct: par.toleranciaPct, curva, nivel };
    }
  }
  return {
    alvoDias: ALVO_COBERTURA_PADRAO_DIAS,
    limiteDias: ALVO_COBERTURA_PADRAO_DIAS,
    toleranciaPct: TOLERANCIA_COBERTURA_PADRAO_PCT,
    curva,
    nivel: 'padrao',
  };
}

/** Sem cobertura a calcular (produto sem venda) nada está acima de limite nenhum. */
export function acimaDoLimite(coberturaDias: number | null, limiteDias: number): boolean {
  return coberturaDias !== null && Number.isFinite(coberturaDias) && coberturaDias > limiteDias;
}

/** Linha de `sgcCoberturaListar` (colunas UPPERCASE) -> o objeto da regra. */
export function coberturaDeLinha(linha: Record<string, unknown>): Cobertura {
  const par = (letra: CurvaAbc): ParCurva => ({
    alvoDias: Number(linha[`ALVO_${letra}_DIAS`] ?? 0) || 0,
    toleranciaPct: Number(linha[`TOLERANCIA_${letra}_PCT`] ?? 0) || 0,
  });
  return {
    id: Number(linha.ID ?? 0),
    nivel: String(linha.NIVEL ?? 'fornecedor') as NivelCobertura,
    codigo: String(linha.CODIGO ?? ''),
    descricao: String(linha.DESCRICAO ?? ''),
    // `ATIVO` ausente = ativa: a listagem antiga não devolvia a coluna (R-109).
    ativo: Number(linha.ATIVO ?? 1) !== 0,
    curvas: { A: par('A'), B: par('B'), C: par('C') },
  };
}

/* ── Auditoria campo a campo (RF-008/RN-006/RN-007) ───────────────────────── */

export type AcaoCobertura = 'criou' | 'alterou' | 'desativou' | 'reativou';

/** Os campos auditáveis, na ordem em que a tela os mostra. */
const LEITOR_DE_CAMPO: Record<string, (c: Cobertura) => string> = {
  DESCRICAO: (c) => c.descricao,
  ALVO_A_DIAS: (c) => String(c.curvas.A.alvoDias),
  TOLERANCIA_A_PCT: (c) => String(c.curvas.A.toleranciaPct),
  ALVO_B_DIAS: (c) => String(c.curvas.B.alvoDias),
  TOLERANCIA_B_PCT: (c) => String(c.curvas.B.toleranciaPct),
  ALVO_C_DIAS: (c) => String(c.curvas.C.alvoDias),
  TOLERANCIA_C_PCT: (c) => String(c.curvas.C.toleranciaPct),
  ATIVO: (c) => (c.ativo ? '1' : '0'),
};

export const CAMPOS_COBERTURA: readonly string[] = Object.keys(LEITOR_DE_CAMPO);

export interface DiferencaCobertura {
  campo: string;
  antes: string;
  depois: string;
}

/**
 * RN-006: uma entrada por campo cujo valor mudou; nada quando nada mudou.
 * Na criação o valor anterior é vazio em todo campo — menos `ATIVO`: a linha
 * nasce ativa (`sgcEscCoberturaGravar` grava `ATIVO = 1`), então a situação
 * não mudou e não vira linha de histórico. São 7, não 8 (C-009).
 */
export function diferencasDeCobertura(
  antes: Cobertura | null,
  depois: Cobertura,
): DiferencaCobertura[] {
  return CAMPOS_COBERTURA.flatMap((campo) => {
    const leitor = LEITOR_DE_CAMPO[campo];
    const valorAntes = antes ? leitor(antes) : (campo === 'ATIVO' ? '1' : '');
    const valorDepois = leitor(depois);
    return valorAntes === valorDepois ? [] : [{ campo, antes: valorAntes, depois: valorDepois }];
  });
}

/** RN-007: a ação é derivada do que aconteceu, e é a mesma para todas as linhas do salvamento. */
export function acaoDaCobertura(antes: Cobertura | null, depois: Cobertura): AcaoCobertura {
  if (!antes) return 'criou';
  if (antes.ativo && !depois.ativo) return 'desativou';
  if (!antes.ativo && depois.ativo) return 'reativou';
  return 'alterou';
}

/* ── CSV (RF-014, R-037) ──────────────────────────────────────────────────── */

export const COLUNAS_CSV_COBERTURA: readonly string[] = [
  'Nível', 'Código', 'Alvo', 'Situação',
  'A alvo (dias)', 'A tolerância (%)', 'A máximo (dias)',
  'B alvo (dias)', 'B tolerância (%)', 'B máximo (dias)',
  'C alvo (dias)', 'C tolerância (%)', 'C máximo (dias)',
];

/** Vírgula decimal, sem separador de milhar: é o que o Excel em pt-BR lê direto. */
const csvNumero = (valor: number | null): string => (valor === null ? '' : String(valor).replace('.', ','));

export function linhasCsvCobertura(lista: Cobertura[]): string[][] {
  return (lista ?? []).map((c) => {
    const curva = (letra: CurvaAbc) => [
      csvNumero(c.curvas[letra].alvoDias),
      csvNumero(c.curvas[letra].toleranciaPct),
      csvNumero(tetoDaCurva(c.curvas[letra].alvoDias, c.curvas[letra].toleranciaPct)),
    ];
    return [
      c.nivel, c.codigo, c.descricao, c.ativo ? 'Ativa' : 'Inativa',
      ...curva('A'), ...curva('B'), ...curva('C'),
    ];
  });
}
