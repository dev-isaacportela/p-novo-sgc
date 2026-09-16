// Cenários C-001..C-022 e regras RN-001..RN-017 da spec 008 (solicitações do
// comercial). Ver docs/specs/008-solicitacoes-do-comercial/plan.md §Testes.
//
// STUB DA BASE (S2): quem escreve os testes é o agente da 008 (S3). Tudo roda
// sobre as MESMAS definitions que o add-011-solicitacoes.mjs publica, no banco
// compartilhado do smoke — R-045: nenhuma asserção de total absoluto, sempre
// COUNT ao vivo, recorte por `CARDS_008`/`SOLICITACOES_008` ou diferença
// antes/depois. As chamadas usam `chamar(nome, input, U.<usuario>)` com os
// cinco usuários do seed, mais um RESTRICTED criado no próprio teste (C-019).
//
// O rastreio (`sgcWintRastreioSolicitacoes`) depende dos dois shims do dialeto
// que a base entregou — `REGEXP_SUBSTR` e a reescrita do gerador
// `FROM DUAL CONNECT BY` (R-064, provados em smoke/000-dialeto.mjs).

export async function suite(ctx) {
  // Stub: sem teste até a spec 008 (S3).
}
