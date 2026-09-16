// Cenários e regras da spec 011 (compras inteligentes). Ver
// docs/specs/011-compras-inteligentes/plan.md §Testes.
//
// STUB DA BASE (S2): quem escreve os testes é o agente da 011 (S3). Tudo roda
// sobre as MESMAS definitions que o add-013-compras-inteligentes.mjs publica,
// no banco compartilhado do smoke — R-045: nenhuma asserção literal sobre
// totais globais; os cards e produtos desta spec são próprios (`CARDS_011`,
// 5401-5420 do fornecedor 1042), como a 008 fez em R-073.
//
// Roda depois de `indicadores` (R-107): é a última suíte da onda 4 a entrar e
// depende do que as ondas 1-3 já semearam. Os shims que a consulta principal
// usa (POWER, SQRT, ADD_MONTHS e o gerador de calendário) já estão provados em
// `smoke/000-dialeto.mjs` (S0-015/S0-016), pela base.

export async function suite(ctx) {
  // Stub: sem teste até a spec 011 (S3).
}
