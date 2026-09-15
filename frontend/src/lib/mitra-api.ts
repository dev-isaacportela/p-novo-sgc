// Chamadas as server functions do projeto.
//
// Tudo passa por `executeServerFunctionMitra` — o CRUD REST (listRecords,
// createRecord...) retorna 403 para usuario business. Colunas voltam em
// UPPERCASE (`row.NOME`) e o `output` pode vir como string JSON ou embrulhado;
// a normalizacao mora aqui para nenhuma tela repetir isso.

import { executeServerFunctionMitra } from 'mitra-interactions-sdk';
import { SERVER_FUNCTIONS } from './server-functions';

export const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID || '1');

type Chave = keyof typeof SERVER_FUNCTIONS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

/**
 * Execucao bem-sucedida. A plataforma devolve 'COMPLETED'; simuladores antigos
 * devolviam 'SUCCESS' — aceitar os dois evita que a tela quebre conforme o
 * ambiente. Falha real ('FAILED', 'CANCELLED') continua estourando.
 */
const STATUS_OK = new Set(['COMPLETED', 'SUCCESS']);

function desembrulhar(bruto: unknown): unknown {
  let saida: unknown = bruto;
  if (typeof saida === 'string') {
    try {
      saida = JSON.parse(saida);
    } catch {
      return saida;
    }
  }
  if (saida && typeof saida === 'object' && 'output' in (saida as Record<string, unknown>)) {
    return desembrulhar((saida as Record<string, unknown>).output);
  }
  return saida;
}

async function executar(chave: Chave, input: Record<string, unknown>) {
  const resposta = await executeServerFunctionMitra({
    projectId: PROJECT_ID,
    serverFunctionId: Number(SERVER_FUNCTIONS[chave]),
    input, // `input`, nunca `params`: com `params` o SDK ignora em silencio.
  });
  const resultado = (resposta as { result?: { executionStatus?: string; error?: string | null; output?: unknown } })?.result;
  if (resultado?.executionStatus && !STATUS_OK.has(resultado.executionStatus)) {
    throw new Error(resultado.error || `Falha ao executar ${chave}.`);
  }
  return desembrulhar(resultado?.output);
}

/** Server function SQL: devolve as linhas, colunas em UPPERCASE. */
export async function linhas(chave: Chave, input: Record<string, unknown> = {}): Promise<Linha[]> {
  const saida = desembrulhar(await executar(chave, input)) as
    | { rows?: unknown; result?: unknown; data?: unknown }
    | unknown[]
    | null;
  if (Array.isArray(saida)) return saida as Linha[];
  const rows = saida?.rows ?? saida?.result ?? saida?.data;
  return Array.isArray(rows) ? (rows as Linha[]) : [];
}

/** Primeira linha ou null — para detalhe/contagem. */
export async function linha(chave: Chave, input: Record<string, unknown> = {}): Promise<Linha | null> {
  const [primeira] = await linhas(chave, input);
  return primeira ?? null;
}

/** Server function JAVASCRIPT: devolve o objeto `{ ok, ... }` da regra. */
export async function acao(chave: Chave, input: Record<string, unknown> = {}): Promise<Linha> {
  const saida = await executar(chave, input);
  if (saida && typeof saida === 'object') return saida as Linha;
  return { ok: false, error: 'Resposta vazia do servidor.' };
}

/**
 * Filtros com TODOS os campos presentes: o Mitra substitui `{{x}}` por texto
 * antes do parse, entao numerico ausente viraria erro de sintaxe — desligado
 * e 0 no numerico e '' no texto. Use para montar o input de listagens.
 */
export function comPadrao<T extends Record<string, unknown>>(
  filtros: Partial<T>,
  padrao: T,
): T {
  const saida = { ...padrao } as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') saida[chave] = valor;
  }
  return saida as T;
}
