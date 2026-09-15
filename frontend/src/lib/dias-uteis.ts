// Dias úteis — R-025 do 000: segunda a sexta, sem feriados. Espelho puro, em
// TypeScript, do MESMO cálculo de backend/lib/dias-uteis.mjs (fragmento SQL,
// rodando no MySQL/dialeto do simulador). As duas implementações existem
// porque a tela não importa código do backend; a conferência abaixo é a mesma
// dos dois lados — é o que impede as duas de divergirem.
//
// A 006 importa este arquivo, não reimplementa (R-025).

const MS_DIA = 24 * 60 * 60 * 1000;
const EPOCH_SEGUNDA_MS = Date.UTC(1970, 0, 5); // 1970-01-05, segunda-feira

function paraMs(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function paraIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Dias úteis decorridos do epoch até a data, inclusive — mesma fórmula do
 * fragmento SQL `acumulado` (DATEDIFF/FLOOR/MOD/LEAST). */
function acumulado(iso: string): number {
  const d = Math.round((paraMs(iso) - EPOCH_SEGUNDA_MS) / MS_DIA) + 1;
  return 5 * Math.floor(d / 7) + Math.min(((d % 7) + 7) % 7, 5);
}

/** Dias úteis entre duas datas: conta o dia de chegada, não o de partida
 * (segunda→sábado = 4, sexta→segunda = 1, mesmo dia = 0). */
export function diasUteisEntre(inicioIso: string, fimIso: string): number {
  return acumulado(fimIso) - acumulado(inicioIso);
}

/** Soma `n` dias úteis a `iso`; base em fim de semana recua para sexta antes
 * de contar. `n = 0` devolve o próprio dia quando ele é útil, senão a sexta
 * anterior. Devolve 'AAAA-MM-DD'. */
export function somarDiasUteis(iso: string, n: number): string {
  const a = acumulado(iso) + n - 1;
  const dias = 7 * Math.floor(a / 5) + (((a % 5) + 5) % 5);
  return paraIso(EPOCH_SEGUNDA_MS + dias * MS_DIA);
}
