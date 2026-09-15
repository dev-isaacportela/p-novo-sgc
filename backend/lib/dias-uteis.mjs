// Dias úteis — R-025/R-038 do 000: segunda a sexta, sem feriados (D-4/E-2 do
// legado). Implementação ÚNICA (base, S2), consumida pela 005 (que a
// especificou no plan) e pela 006 (previsão de recebimento) sem reimplementar.
//
// Os três fragmentos abaixo são texto SQL (MySQL), que também roda sem
// alteração no dialeto do simulador (backend/simulator/mysql-dialect.mjs, que
// ganhou FLOOR/MOD como função registrada e DATE_ADD(col, INTERVAL <expressão>
// DAY) como reescrita — R-043). `n` entra sempre entre parênteses: vale tanto
// um literal (`15`) quanto uma coluna (`F.PRAZO_ENTREGA_DIAS`).
//
// Por que aritmética (DATEDIFF/FLOOR/MOD/LEAST) e não a tabela de lookup do
// legado (`MID('01234444…')` + `WEEKDAY`): WEEKDAY e MID virariam dois shims
// novos no simulador e a string de 40 caracteres é ilegível; as quatro funções
// daqui são comuns aos dois lados e batem com a conferência abaixo.
//
// Conferência (R-025): somarDiasUteis('2026-08-24', 15) -> '2026-09-14';
// diasUteisEntre('2026-08-24', '2026-09-14') -> 15. Prova em
// backend/simulator/smoke/000-dias-uteis.mjs.

const EPOCH_SEGUNDA = '1970-01-05'; // uma segunda-feira

// Dias úteis decorridos do epoch até a data, inclusive.
const acumulado = (col) => `(5 * FLOOR((DATEDIFF(${col}, '${EPOCH_SEGUNDA}') + 1) / 7)
  + LEAST(MOD(DATEDIFF(${col}, '${EPOCH_SEGUNDA}') + 1, 7), 5))`;

/** Contagem (005): dias úteis entre duas datas — conta o dia de chegada, não o
 * de partida (segunda→sábado = 4, sexta→segunda = 1, mesmo dia = 0). */
export const diasUteisEntre = (colInicio, colFim) => `(${acumulado(colFim)} - ${acumulado(colInicio)})`;

/** Previsão (006) e datas de seed: soma `n` dias ÚTEIS a `col`. `n` pode ser
 * literal OU nome de coluna; base em fim de semana recua para sexta antes de
 * contar. Devolve VARCHAR(10) 'AAAA-MM-DD'. */
export const somarDiasUteis = (col, n) => `DATE_FORMAT(DATE_ADD('${EPOCH_SEGUNDA}', INTERVAL (
  7 * FLOOR((${acumulado(col)} + (${n}) - 1) / 5) + MOD(${acumulado(col)} + (${n}) - 1, 5)
) DAY), '%Y-%m-%d')`;

/** Soma `n` dias CORRIDOS a `col` (fornecedor com `PRAZO_ENTREGA_TIPO = 'corridos'`). */
export const somarDiasCorridos = (col, n) =>
  `DATE_FORMAT(DATE_ADD(${col}, INTERVAL (${n}) DAY), '%Y-%m-%d')`;
