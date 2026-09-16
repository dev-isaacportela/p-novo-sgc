// Cenários e regras da spec 009 (indicadores e relatórios). Ver
// docs/specs/009-indicadores-e-relatorios/plan.md §Testes.
//
// STUB DA BASE (S2): quem escreve os testes é o agente da 009 (S3). Tudo roda
// sobre as MESMAS definitions que o add-012-indicadores.mjs publica, no banco
// compartilhado do smoke — R-045: nenhuma asserção literal sobre totais
// globais, porque esta spec lê os cards e NFs das ondas 1 e 2.
//
// Esta é a ÚLTIMA suíte do smoke.mjs de propósito: os cenários de SLA e de
// agenda arranjam o estado que precisam por `UPDATE` direto e o desfazem no
// fim, e nenhuma outra suíte depende do que ela toca.

export async function suite(ctx) {
  // Stub: sem teste até a spec 009 (S3).
}
