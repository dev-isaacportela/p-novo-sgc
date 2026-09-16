// Seção Simulador da spec 009 (indicadores). Ver
// docs/specs/009-indicadores-e-relatorios/plan.md §Simulador.
//
// O seed da 009 está VAZIO de propósito, e por duas razões.
//
// 1) R-062: nenhum card, pedido, NF, agendamento, item de B.O. ou solicitação
//    nasce aqui. Os indicadores desta spec leem exatamente o que as ondas 1 e 2
//    (e o seed da 008) semearam, e é isso que torna as asserções interessantes
//    — um seed próprio de pedido tornaria todo número desta feature uma cópia
//    do que o próprio seed escreveu. Os estados de SLA e de agenda que os
//    cenários precisam (um pedido ligado a um agendamento, um fornecedor sem
//    prazo de entrega) são arranjados DENTRO do próprio `teste()` por `UPDATE`
//    direto e desfeitos no fim — C-10 do plan. A suíte 009 é a última do
//    smoke.mjs, então nenhuma outra depende do que ela toca.
//
// 2) O que sobrava eram as quatro linhas de `SGC_RELATORIO` da galeria de
//    `/relatorios` — ADIADO por decisão do usuário em 2026-09-16. Elas saíram
//    junto com as SFs de relatório.
//
// A função continua existindo (e exportada) porque `simulator/seed.mjs` é
// arquivo do integrador e já a chama: removê-la daqui quebraria o seed inteiro.

/** Sem seed próprio: ver o cabeçalho. `seed.mjs` (do integrador) chama assim mesmo. */
export function seed009() {}
