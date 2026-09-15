// Regra pura da agenda de análises (spec 004). Aritmética de data em texto
// ISO, reaproveitando os helpers de `src/lib/data.ts` (o mesmo cálculo que o
// DatePicker usa) em vez de reimplementar `Date.UTC` aqui — só `diasEntre`
// (duração de um período) é novo, porque data.ts não tinha diferença de dias.
//
// O mesmo cálculo de `proximaOcorrencia`/`periodoDaOcorrencia`/`diaNoFuso`
// existe de novo, em texto puro, dentro do corpo JS de `sgcAgendaProcessar`
// (backend/add-007-agenda.mjs) — a SF roda isolada, sem import. É espelho
// declarado (plan.md), testado dos dois lados com os mesmos números.
//
// Testado por frontend/tests/agenda.test.mjs — sem React, sem SDK.

import { comMesmoDia, mesAdjacente, parseIso, somarDias } from './data.ts';

export type Recorrencia = 'nenhuma' | 'semanal' | 'quinzenal' | 'mensal';
export type SituacaoAgenda = 'pendente' | 'atrasado' | 'processado' | 'cancelado';
export type ModoProcessamento = 'mes' | 'intervalo' | 'dias' | 'agendamento';

/** Fuso do negócio (RN-013): Brasil, sem horário de verão. */
const FUSO_MINUTOS = -180;

const DOIS = (n: number) => String(n).padStart(2, '0');

/** Dias entre duas datas ISO (b - a), sem fuso. */
function diasEntre(aIso: string, bIso: string): number {
  const a = parseIso(aIso);
  const b = parseIso(bIso);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86400000);
}

/** Mesmo dia do mês seguinte, cortado no último dia quando ele não existe (RN-001). */
function proximoMes(iso: string): string {
  const partes = parseIso(iso);
  if (!partes) return iso;
  return comMesmoDia(iso, mesAdjacente(partes, 1));
}

/** Próxima data da recorrência, ou null quando não há ou passa do limite (RN-001..003). */
export function proximaOcorrencia(dataIso: string, recorrencia: Recorrencia, limiteIso?: string): string | null {
  let proxima: string;
  if (recorrencia === 'semanal') proxima = somarDias(dataIso, 7);
  else if (recorrencia === 'quinzenal') proxima = somarDias(dataIso, 14);
  else if (recorrencia === 'mensal') proxima = proximoMes(dataIso);
  else return null;
  if (limiteIso && proxima > limiteIso) return null;
  return proxima;
}

function comoAtivo(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === 'boolean') return valor;
  return Number(valor) !== 0;
}

/** Situação derivada (RN-005). `hojeIso` é sempre parâmetro — a função não lê o relógio. */
export function situacao(
  linha: { ATIVO?: unknown; PROCESSADO_EM?: unknown; DATA_ANALISE?: unknown },
  hojeIso: string,
): SituacaoAgenda {
  if (!comoAtivo(linha.ATIVO)) return 'cancelado';
  if (linha.PROCESSADO_EM) return 'processado';
  if (linha.DATA_ANALISE && String(linha.DATA_ANALISE) < hojeIso) return 'atrasado';
  return 'pendente';
}

/** Período padrão de 45 dias terminando na data da análise (RN-006). */
export function periodoPadrao(dataAnaliseIso: string, dias = 45): { inicio: string; fim: string } {
  return { inicio: somarDias(dataAnaliseIso, -dias), fim: dataAnaliseIso };
}

/** Período da ocorrência seguinte: mesma duração, fim na data nova (RN-008). */
export function periodoDaOcorrencia(
  atual: { inicio: string; fim: string },
  novaDataIso: string,
): { inicio: string; fim: string } {
  const duracao = diasEntre(atual.inicio, atual.fim);
  return { inicio: somarDias(novaDataIso, -duracao), fim: novaDataIso };
}

/**
 * Validação do formulário (RF-003): só recusa o que está preenchido e errado
 * — período invertido (C-002) ou data-limite anterior à análise (C-003). Não
 * cobra os obrigatórios (fornecedor/filial/data): isso é RF-001 na tela, não
 * um cenário desta função.
 */
export function validarAgendamento(entrada: {
  codfornec: number;
  codfilial: string;
  dataAnalise: string;
  periodoInicio: string;
  periodoFim: string;
  recorrencia: Recorrencia;
  dataLimite: string;
}): { ok: true } | { ok: false; erro: string } {
  const { periodoInicio, periodoFim, recorrencia, dataLimite, dataAnalise } = entrada;
  if (periodoInicio && periodoFim && periodoInicio > periodoFim) {
    return { ok: false, erro: 'O período de vendas é inválido: o início não pode ser depois do fim.' };
  }
  if (recorrencia && recorrencia !== 'nenhuma' && dataLimite && dataAnalise && dataLimite < dataAnalise) {
    return { ok: false, erro: 'A data-limite da recorrência não pode ser anterior à data da análise.' };
  }
  return { ok: true };
}

/** Recorte do processamento manual, já resolvido em datas (RF-011/RF-012, D-007, D-008). */
export function recorte(
  modo: ModoProcessamento,
  valores: { dataInicio?: string; dataFim?: string; dias?: number; idAgenda?: number },
  hojeIso: string,
): { modo: ModoProcessamento; dataInicio: string; dataFim: string; idAgenda: number } | { erro: string } {
  if (modo === 'agendamento') {
    const idAgenda = Number(valores.idAgenda) || 0;
    if (!idAgenda) return { erro: 'Escolha um agendamento.' };
    return { modo, dataInicio: '', dataFim: '', idAgenda };
  }
  if (modo === 'intervalo') {
    const dataInicio = valores.dataInicio || '';
    const dataFim = valores.dataFim || '';
    if (!dataInicio || !dataFim || dataInicio > dataFim) return { erro: 'Informe um intervalo válido.' };
    return { modo, dataInicio, dataFim, idAgenda: 0 };
  }
  if (modo === 'dias') {
    const dias = Number(valores.dias) || 0;
    if (dias < 1) return { erro: 'Informe quantos dias.' };
    return { modo, dataInicio: hojeIso, dataFim: somarDias(hojeIso, dias - 1), idAgenda: 0 };
  }
  // 'mes' é o padrão (RF-012): primeiro e último dia do mês de hojeIso.
  const partes = parseIso(hojeIso);
  const ano = partes?.ano ?? Number(hojeIso.slice(0, 4));
  const mes = partes?.mes ?? Number(hojeIso.slice(5, 7));
  const inicio = `${ano}-${DOIS(mes)}-01`;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { modo: 'mes', dataInicio: inicio, dataFim: `${ano}-${DOIS(mes)}-${DOIS(ultimoDia)}`, idAgenda: 0 };
}

/** Dia no fuso de Brasília (UTC−3) a partir de um instante (RN-013). */
export function diaNoFuso(instante: number): string {
  return new Date(instante + FUSO_MINUTOS * 60000).toISOString().slice(0, 10);
}

/**
 * Depois de `sgcEscAgendaInserir` (SQL guardada, sem retorno de id — a
 * plataforma só devolve linhas de SELECT), a tela relista pelo trio
 * fornecedor/filial/data e precisa achar QUAL linha é a que acabou de
 * nascer. Pegar o maior ID é errado: se já existir um agendamento antigo do
 * mesmo trio (fornecedor reagendado na mesma data, por exemplo) e a guarda
 * recusar o insert (fornecedor inativo, perfil sem permissão…), o maior ID
 * continua sendo o antigo — e a tela agiria sobre ele como se fosse novo
 * (achado A5 da revisão). `CRIADO_EM` é o instante exato que esta chamada
 * enviou, então só ele identifica com certeza a linha que ESTA gravação
 * criou; nenhuma bate, é sinal de que o insert foi recusado.
 */
export function localizarPorCriadoEm(
  candidatos: { ID: number | string; CRIADO_EM?: string | null }[],
  criadoEm: string,
): number | null {
  const achado = candidatos.find((c) => String(c.CRIADO_EM ?? '') === criadoEm);
  return achado ? Number(achado.ID) : null;
}
