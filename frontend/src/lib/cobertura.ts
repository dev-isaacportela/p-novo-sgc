// Limite de cobertura futura — quantos dias de estoque são aceitáveis sem
// justificativa (spec 003, RN-005 / AN-07).
//
// Regra pura: entra a lista parametrizada e o alvo, sai o limite em dias.
// Sem React, sem SDK — é o que `frontend/tests/cobertura.test.mjs` exercita.

export type NivelCobertura = 'fornecedor' | 'departamento' | 'secao' | 'sku';

export interface Cobertura {
  id: number;
  nivel: NivelCobertura;
  codigo: string;
  descricao: string;
  limiteDias: number;
}

/** Sem linha aplicável, o limite é 35 dias (AN-07). */
export const LIMITE_COBERTURA_PADRAO_DIAS = 35;

/** Do mais específico para o mais geral — é esta ordem que RN-005 define. */
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
 * Vale o limite do produto; na falta, o da seção; na falta, o do departamento;
 * na falta, o do fornecedor; na falta de todos, 35 dias (RN-005).
 */
export function limiteDeCobertura(
  coberturas: Cobertura[],
  alvo: AlvoCobertura,
): { limiteDias: number; nivel: NivelCobertura | 'padrao' } {
  for (const nivel of ORDEM) {
    const codigo = String(alvo[CODIGO_DO_NIVEL[nivel]] ?? '');
    if (!codigo || codigo === '0') continue;
    const achado = coberturas.find((c) => c.nivel === nivel && String(c.codigo) === codigo);
    if (achado && Number.isFinite(achado.limiteDias) && achado.limiteDias > 0) {
      return { limiteDias: achado.limiteDias, nivel };
    }
  }
  return { limiteDias: LIMITE_COBERTURA_PADRAO_DIAS, nivel: 'padrao' };
}

/** Sem cobertura a calcular (produto sem venda) nada está acima de limite nenhum. */
export function acimaDoLimite(coberturaDias: number | null, limiteDias: number): boolean {
  return coberturaDias !== null && Number.isFinite(coberturaDias) && coberturaDias > limiteDias;
}

/** Linha de `sgcCoberturaListar` (colunas UPPERCASE) -> o objeto da regra. */
export function coberturaDeLinha(linha: Record<string, unknown>): Cobertura {
  return {
    id: Number(linha.ID ?? 0),
    nivel: String(linha.NIVEL ?? 'fornecedor') as NivelCobertura,
    codigo: String(linha.CODIGO ?? ''),
    descricao: String(linha.DESCRICAO ?? ''),
    limiteDias: Number(linha.LIMITE_DIAS ?? 0),
  };
}
