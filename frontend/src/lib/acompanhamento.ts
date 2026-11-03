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
