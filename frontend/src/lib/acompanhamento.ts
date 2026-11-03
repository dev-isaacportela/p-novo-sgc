// O "Acompanhamento de faturamento" que abre o card em Trânsito (R-150, C-024
// da 006), no molde do legado (PipeWorkspace.tsx:10935-10982): dias úteis
// desde o envio e o selo do escalonamento. A régua é a do SGC 2 — `nivelDeAlerta`
// (RN-009 da 005: 3 avisa, 5 escala) e `diasUteisEntre` —, e não muda aqui.
// Puro, testado em tests/acompanhamento.test.mjs.
import { diasUteisEntre } from './dias-uteis.ts';
import { nivelDeAlerta } from './faturamento.ts';

export type TomDoAcompanhamento = 'live' | 'attention' | 'alert' | 'off';

export interface Acompanhamento {
  diasUteis: number;
  nivel: 0 | 3 | 5;
  selo: string;
  tom: TomDoAcompanhamento;
}

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

export function rotuloDiasUteis(dias: number): string {
  return `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
}

/**
 * Pedido sem envio não conta dia nenhum; pedido 100 % faturado sai do
 * escalonamento (o cron também para). Com faturamento parcial o selo diz
 * "parcial", mas o prazo continua contando — como no legado.
 */
export function acompanhamentoDoFaturamento(entrada: { dtEnvio: string; hoje: string; percFaturado: number }): Acompanhamento {
  if (!String(entrada.dtEnvio ?? '').trim()) {
    return { diasUteis: 0, nivel: 0, selo: 'Envio não registrado', tom: 'off' };
  }
  const diasUteis = Math.max(0, diasUteisEntre(entrada.dtEnvio.slice(0, 10), entrada.hoje));
  const pct = numero(entrada.percFaturado);
  if (pct >= 100) return { diasUteis, nivel: 0, selo: 'Faturado por completo', tom: 'live' };
  const nivel = nivelDeAlerta(diasUteis);
  const dias = rotuloDiasUteis(diasUteis);
  if (nivel === 5) return { diasUteis, nivel, selo: `Faturamento pendente — ${dias} — gerência avisada`, tom: 'alert' };
  if (nivel === 3) return { diasUteis, nivel, selo: `Faturamento pendente — ${dias} — contate a indústria`, tom: 'attention' };
  if (pct > 0) return { diasUteis, nivel, selo: 'Faturamento parcial', tom: 'live' };
  return { diasUteis, nivel, selo: 'Aguardando faturamento', tom: 'off' };
}

/* ── R-155 (P-3, C-034 da 005): "Notificar gestor" do legado (PW:11003-11116) ──
 * A escalada automática do cron continua; o botão aparece no mesmo limiar
 * (nível 5: 5 dias úteis sem faturamento completo) e quem opera a nota
 * escolhe UM gestor, que vira responsável do card e recebe o aviso. A guarda
 * de verdade é a do `sgcEscGestorNotificar`. */

export interface GestorDaLista { id: number; nome: string; email: string }

export function podeNotificarGestor(acompanhamento: Acompanhamento): boolean {
  return acompanhamento.nivel === 5;
}

/** Só quem tem a persona gestor, em ordem de nome (a lista vem de `sgcPersonasListar`). */
export function gestoresDe(linhas: readonly Record<string, unknown>[]): GestorDaLista[] {
  return (linhas ?? [])
    .filter((linha) => String(linha.PERSONA ?? '') === 'gestor')
    .map((linha) => ({ id: Number(linha.USUARIO_ID), nome: String(linha.NOME ?? ''), email: String(linha.EMAIL ?? '') }))
    .filter((gestor) => gestor.id > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Os responsáveis com o gestor no fim; já estando, a lista não muda (e o `kbCardAtualizar` não precisa rodar). */
export function responsaveisComGestor(atuais: readonly number[], gestorId: number): { lista: number[]; mudou: boolean } {
  const lista = [...(atuais ?? [])].map(Number).filter((id) => id > 0);
  if (lista.includes(gestorId)) return { lista, mudou: false };
  return { lista: [...lista, gestorId], mudou: true };
}

/** O texto do aviso que o gestor recebe (até 500 caracteres, como o aviso do cron). */
export function textoNotificacaoGestor(e: { fornecedor: string; diasUteis: number; saldo: number; quem: string }): string {
  const saldo = (Number(e.saldo) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
  return `Pedido de ${e.fornecedor} sem faturamento completo há ${rotuloDiasUteis(e.diasUteis)} (saldo ${saldo}). ${e.quem} indicou você como gestor para cobrar a indústria.`.slice(0, 500);
}
