// Regra pura da spec 001 (fornecedores): tudo que é cálculo, formato ou
// validação, fora do JSX — testado por tests/fornecedor.test.mjs. As mesmas
// mensagens são replicadas em `sgcFornecedorSalvar` (backend/add-004-fornecedores.mjs,
// D-009 do plan): mudou uma regra aqui, muda lá também.
//
// O formato das parcelas ("30/60/90") não é desta spec — vem de
// `lib/prazo-pagamento.ts` (dono: spec 003, C-10); esta lib só importa.

import { moeda } from './formato.ts';
import { parcelasDoPrazo } from './prazo-pagamento.ts';

/* ── RN-002: CNPJ ── */

/** Mantém só os dígitos. */
export function normalizarCnpj(valor: string): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/** 14 dígitos, não todos iguais, os dois dígitos verificadores conferem. */
export function cnpjValido(valor: string): boolean {
  const d = normalizarCnpj(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  const digitoVerificador = (base: string): number => {
    let soma = 0;
    let peso = base.length - 7;
    for (const c of base) {
      soma += Number(c) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const doze = d.slice(0, 12);
  const d1 = digitoVerificador(doze);
  const d2 = digitoVerificador(doze + d1);
  return d === `${doze}${d1}${d2}`;
}

/** "49324221000104" -> "49.324.221/0001-04". Entrada incompleta volta como veio (só dígitos). */
export function formatarCnpj(valor: string): string {
  const d = normalizarCnpj(valor);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/* ── RN-004: janela de fechamento ── */

/** Os dois dias entre 1 e 31, em qualquer ordem — a janela pode virar o mês (R-003). */
export function janelaFechamentoValida(inicio: number, fim: number): boolean {
  const i = Number(inicio);
  const f = Number(fim);
  return Number.isInteger(i) && Number.isInteger(f) && i >= 1 && i <= 31 && f >= 1 && f <= 31;
}

/* ── RN-005: SLA ── */

export interface SlaEfetivo {
  analise: { dias: number; origem: 'padrao' | 'parametrizado' };
  faturamento: { dias: number; origem: 'padrao' | 'parametrizado' };
}

/** `0`/vazio vira o padrão do sistema (1 dia de análise, 5 de faturamento). */
export function slaEfetivo(input: { analise?: number; faturamento?: number }): SlaEfetivo {
  const analise = Number(input?.analise) || 0;
  const faturamento = Number(input?.faturamento) || 0;
  return {
    analise: analise > 0 ? { dias: analise, origem: 'parametrizado' } : { dias: 1, origem: 'padrao' },
    faturamento: faturamento > 0 ? { dias: faturamento, origem: 'parametrizado' } : { dias: 5, origem: 'padrao' },
  };
}

/* ── RN-006: prazo de entrega ── */

/** `7, 'uteis'` -> "7 dias úteis"; `1, 'corridos'` -> "1 dia corrido"; `0` -> "". */
export function rotuloPrazoEntrega(dias: number, tipo: string): string {
  const n = Number(dias) || 0;
  if (n <= 0) return '';
  const corridos = tipo === 'corridos';
  const unidade = n === 1 ? (corridos ? 'dia corrido' : 'dia útil') : (corridos ? 'dias corridos' : 'dias úteis');
  return `${n} ${unidade}`;
}

/* ── RN-007: e-mail do contato ── */

/** Um `@`, sem espaço, domínio com ponto que não termina em ponto (regra do p-45547). */
export function emailValido(valor: string): boolean {
  const v = String(valor ?? '').trim();
  if (!v || /\s/.test(v)) return false;
  const partes = v.split('@');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return false;
  const dominio = partes[1];
  return dominio.includes('.') && !dominio.endsWith('.');
}

/* ── RN-008/RN-010: faixas de prazo ── */

export interface Faixa {
  valorDe: number;
  valorAte: number;
  rotulo?: string;
  parcelas?: string;
}

/**
 * Ordena por `valorDe`; `valorAte` 0 = sem teto. Recusa sobreposição,
 * `valorAte <= valorDe`, mais de uma faixa sem teto e faixa sem teto que não
 * seja a última. Duas linhas com o mesmo (valorDe, valorAte) são a MESMA
 * faixa com duas opções de prazo — não contam como sobreposição.
 */
export function validarFaixas(faixas: Faixa[]): { ok: boolean; erro?: string } {
  if (!faixas || faixas.length === 0) return { ok: true };

  const distintas = Array.from(
    new Map(faixas.map((f) => [`${Number(f.valorDe) || 0}:${Number(f.valorAte) || 0}`, f])).values(),
  ).sort((a, b) => (Number(a.valorDe) || 0) - (Number(b.valorDe) || 0));

  const semTeto = distintas.filter((f) => (Number(f.valorAte) || 0) === 0);
  if (semTeto.length > 1) return { ok: false, erro: 'Só uma faixa pode ficar sem teto.' };
  if (semTeto.length === 1 && (Number(distintas[distintas.length - 1].valorAte) || 0) !== 0) {
    return { ok: false, erro: 'A faixa sem teto precisa ser a última.' };
  }

  for (let i = 0; i < distintas.length; i += 1) {
    const de = Number(distintas[i].valorDe) || 0;
    const ate = Number(distintas[i].valorAte) || 0;
    if (ate !== 0 && ate <= de) return { ok: false, erro: 'Faixa inválida: o valor final deve ser maior que o inicial.' };
    if (i > 0) {
      const anteriorAte = Number(distintas[i - 1].valorAte) || 0;
      const fimAnterior = anteriorAte === 0 ? Infinity : anteriorAte;
      if (de < fimAnterior) return { ok: false, erro: 'As faixas de valor não podem se sobrepor.' };
    }
  }
  return { ok: true };
}

/**
 * Opções (parcelas já convertidas) da(s) faixa(s) que contêm `valor`: o
 * limite inferior conta, o superior não; a faixa sem teto pega tudo acima do
 * início (RN-010). Faixa cujas parcelas não formam opção válida (RN-009) não entra.
 */
export function faixaDoValor(faixas: Faixa[], valor: number): number[][] {
  const v = Number(valor) || 0;
  return (faixas || [])
    .filter((f) => {
      const de = Number(f.valorDe) || 0;
      const ate = Number(f.valorAte) || 0;
      return de <= v && (ate === 0 || v < ate);
    })
    .map((f) => parcelasDoPrazo(f.parcelas ?? ''))
    .filter((opcao) => opcao.length > 0);
}

/** `0,0` -> "Qualquer valor"; `0,20000` -> "Até R$ 20.000,00"; `20000,0` -> "Acima de R$ 20.000,00"; `20000,45000` -> "R$ 20.000,00 a R$ 45.000,00". */
export function rotuloFaixa(valorDe: number, valorAte: number): string {
  const de = Number(valorDe) || 0;
  const ate = Number(valorAte) || 0;
  if (de === 0 && ate === 0) return 'Qualquer valor';
  if (de === 0) return `Até ${moeda(ate)}`;
  if (ate === 0) return `Acima de ${moeda(de)}`;
  return `${moeda(de)} a ${moeda(ate)}`;
}

/* ── RN-014: documento vencido ── */

/** Comparação de texto (VARCHAR(10), sem fuso): vencimento < hoje. Vazio nunca vence. */
export function documentoVencido(vencimento: string, hoje: string): boolean {
  const v = String(vencimento ?? '').trim();
  if (!v) return false;
  return v < String(hoje ?? '');
}

/* ── RF-016: validação completa da parametrização ── */

export interface ContatoPayload {
  nome?: string;
  email: string;
}

export interface FaixaPayload extends Faixa {
  parcelas: string;
}

export interface LinhaPayload {
  nome: string;
  contatos: ContatoPayload[];
  faixas: FaixaPayload[];
}

export interface FornecedorParametrosPayload {
  cnpj: string;
  pedidoMinimo: number;
  fechamentoDiaInicio: number;
  fechamentoDiaFim: number;
}

export interface ParametrizacaoPayload {
  fornecedor: FornecedorParametrosPayload;
  linhas: LinhaPayload[];
}

/** Roda as regras na ordem da tela e devolve a PRIMEIRA recusa, citando o campo ou a linha. */
export function validarParametrizacao(payload: ParametrizacaoPayload): { ok: boolean; error?: string } {
  const f = payload.fornecedor;
  if (!cnpjValido(f.cnpj)) return { ok: false, error: 'CNPJ inválido.' };
  if (!(Number(f.pedidoMinimo) > 0)) return { ok: false, error: 'Pedido mínimo deve ser maior que zero.' };
  if (!janelaFechamentoValida(f.fechamentoDiaInicio, f.fechamentoDiaFim)) {
    return { ok: false, error: 'Janela de fechamento inválida: os dois dias devem estar entre 1 e 31.' };
  }

  for (const linha of payload.linhas ?? []) {
    const nome = String(linha.nome ?? '').trim();
    if (!nome) return { ok: false, error: 'Informe o nome da linha.' };

    for (const contato of linha.contatos ?? []) {
      if (!emailValido(contato.email)) return { ok: false, error: `E-mail inválido no contato da linha ${nome}.` };
    }

    const resultadoFaixas = validarFaixas(linha.faixas ?? []);
    if (!resultadoFaixas.ok) return { ok: false, error: `${resultadoFaixas.erro} (linha ${nome}).` };

    for (const faixa of linha.faixas ?? []) {
      // RN-009: opção de faixa é "30/60/90" — toda parcela em dias > 0 ("0/30" e
      // "à vista" valem só na comparação de prazo da 003, não aqui).
      const parcelasDaFaixa = parcelasDoPrazo(faixa.parcelas);
      if (parcelasDaFaixa.length === 0 || parcelasDaFaixa.some((dias) => dias <= 0)) {
        return { ok: false, error: `Opção de prazo inválida na linha ${nome}.` };
      }
    }
  }

  return { ok: true };
}
