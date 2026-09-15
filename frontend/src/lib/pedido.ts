// O que a criação e os formulários do pedido calculam — regra pura, sem React
// e sem transporte (`frontend/tests/pedido.test.mjs` a executa direto).
//
// Datas sempre como texto ISO (`AAAA-MM-DD`): nunca `Date` viajando, nunca
// fuso decidindo o dia.

import type { EstadoPedido } from './transicoes';

export const PRIORIDADES = ['normal', 'alta', 'urgente'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/** A capa do pedido como `sgcPedidoCarregar` a devolve (colunas de SGC_PEDIDO, UPPERCASE). */
export interface PedidoCapa {
  ID_CARD: number;
  CODFORNEC?: number;
  FORNECEDOR?: string;
  CODFILIAL?: string;
  FILIAL?: string;
  PERIODO_INICIO?: string;
  PERIODO_FIM?: string;
  VL_TOTAL?: number;
  TEC_POR?: number | null;
  TEC_EM?: string;
  TEC_MOTIVO?: string;
  TEC_PRODUTOS_REPROVADOS?: string;
  TEC_NOME?: string;
  DIR_POR?: number | null;
  DIR_EM?: string;
  DIR_MOTIVO?: string;
  DIR_NOME?: string;
  DT_ENVIO?: string;
  CANAL?: string;
  EMAIL_ENVIO?: string;
  NUMPED_WINTHOR?: string;
  ENVIO_OBS?: string;
  ENVIO_EM?: string;
  ENVIO_NOME?: string;
  CANC_MOTIVO?: string;
  CANC_EM?: string;
  CANC_NOME?: string;
  ORIGEM?: string;
  ID_AGENDA?: number;
  CRIADO_POR?: number;
}

const preenchido = (valor: unknown) => String(valor ?? '').trim() !== '';

/**
 * O que `motivoDeDestino` precisa saber do pedido. Capa ainda não carregada
 * fecha tudo o que depende de motivo: menor privilégio enquanto a tela não sabe.
 */
export function estadoDoPedido(capa: PedidoCapa | null | undefined, souCriador: boolean): EstadoPedido {
  return {
    souCriador,
    temMotivoCancelamento: preenchido(capa?.CANC_MOTIVO),
    temMotivoTecnico: preenchido(capa?.TEC_MOTIVO),
    temMotivoDiretoria: preenchido(capa?.DIR_MOTIVO),
    envioRegistrado: preenchido(capa?.DT_ENVIO) && preenchido(capa?.NUMPED_WINTHOR),
  };
}

/** AN-11 — a sugestão de período de vendas são os últimos 45 dias. */
export const PERIODO_PADRAO_DIAS = 45;

/** Limite de texto livre (motivo de reprovação, de cancelamento, observação). */
export const MOTIVO_MAX = 1000;

const DIA_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** O dia de hoje no fuso de quem olha, como meia-noite UTC — para a conta de dias não depender de fuso. */
function hojeUtc(): Date {
  const agora = new Date();
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

/** RN-014 / C-02 A — "FILIAL · FORNECEDOR", em maiúsculas, e não é editável. */
export function tituloDoPedido(filial: string, fornecedor: string): string {
  return `${String(filial ?? '').trim().toUpperCase()} · ${String(fornecedor ?? '').trim().toUpperCase()}`;
}

/** RF-003 — período sugerido: os últimos 45 dias, editável. Em 15/09/2026, 01/08 a 15/09. */
export function periodoPadrao(hoje: Date = hojeUtc()): { inicio: string; fim: string } {
  const fim = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return { inicio: iso(fim - PERIODO_PADRAO_DIAS * DIA_MS), fim: iso(fim) };
}

export interface ErrosNovoPedido {
  fornecedor?: string;
  filial?: string;
  periodo?: string;
}

/** RF-001 — fornecedor, filial e período são os três obrigatórios (C-002). */
export function validarNovoPedido(form: {
  codfornec: string;
  codfilial: string;
  inicio: string;
  fim: string;
}): { ok: boolean; erros: ErrosNovoPedido } {
  const erros: ErrosNovoPedido = {};
  if (!String(form.codfornec ?? '').trim()) erros.fornecedor = 'Escolha o fornecedor do pedido.';
  if (!String(form.codfilial ?? '').trim()) erros.filial = 'Escolha a filial do pedido.';
  const inicio = String(form.inicio ?? '').trim();
  const fim = String(form.fim ?? '').trim();
  if (!inicio || !fim) erros.periodo = 'Informe o período de vendas.';
  else if (inicio > fim) erros.periodo = 'O início do período de vendas é depois do fim.';
  return { ok: Object.keys(erros).length === 0, erros };
}

/** RN-009 / RF-019 — motivo obrigatório na reprovação e no cancelamento. `null` = está bom. */
export function validarMotivo(texto: string): string | null {
  const valor = String(texto ?? '').trim();
  if (!valor) return 'Informe o motivo.';
  if (valor.length > MOTIVO_MAX) return `O motivo passa de ${MOTIVO_MAX} caracteres.`;
  return null;
}

export interface ErrosEnvio {
  canal?: string;
  contato?: string;
  data?: string;
  numped?: string;
}

/** RN-012 — canal, data e número do pedido; por e-mail, só contato cadastrado (EN-02 A). */
export function validarEnvio(
  form: { canal: 'email' | 'plataforma'; contato: string; data: string; numped: string },
  contatos: readonly string[],
): { ok: boolean; erros: ErrosEnvio } {
  const erros: ErrosEnvio = {};
  const contato = String(form.contato ?? '').trim();
  if (form.canal !== 'email' && form.canal !== 'plataforma') erros.canal = 'Escolha o canal do envio.';
  if (form.canal === 'email') {
    if (!contato) erros.contato = 'Escolha um contato de envio do fornecedor.';
    else if (!contatos.includes(contato)) erros.contato = 'O contato não está cadastrado no fornecedor.';
  }
  if (!String(form.data ?? '').trim()) erros.data = 'Informe a data de envio.';
  if (!String(form.numped ?? '').trim()) erros.numped = 'Informe o número do pedido no ERP.';
  return { ok: Object.keys(erros).length === 0, erros };
}

/** Instante para as colunas `*_EM` (`VARCHAR(19)`), como o backend grava. */
export function instanteIso(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 19);
}

/**
 * F-07 / C-03 (R-014) — a situação dos itens é gravada pela TELA da 002, logo
 * depois da aprovação da diretoria (`aprovado`) e logo depois do envio
 * registrado (`enviado`). `sgcEscItemStatusFase` é escrita da spec 003 e é
 * guardada por `:VAR_USER`: chamada aninhada de dentro de um JAVASCRIPT não
 * propagaria a sessão, e por isso ela NÃO sai do `sgcEnvioIndustriaRegistrar`.
 *
 * A SF vem do `add-006-itens.mjs` (id local 7353). A falha é engolida de
 * propósito: o pedido já foi aprovado ou enviado, e a situação do item é
 * consequência disso — não pode derrubar a ação da pessoa. Devolve `false`
 * nesse caso.
 *
 * O `import` é dinâmico para este módulo continuar puro (é o que `node --test`
 * carrega).
 */
export async function marcarItensDaFase(
  idCard: number,
  status: 'aprovado' | 'enviado',
  agora: Date = new Date(),
): Promise<boolean> {
  try {
    const { acao } = await import('./mitra-api');
    await acao('sgcEscItemStatusFase', { idCard, status, atualizadoEm: instanteIso(agora) });
    return true;
  } catch {
    return false;
  }
}
