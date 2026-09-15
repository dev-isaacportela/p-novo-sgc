// Seção Simulador do plan da 002 (quadro de compras): SGC_FASE (as 10 chaves
// -> FASE_ID, o tradutor que toda regra usa), KB_CAMPO (os 6 campos do
// quadro, com a capa por fase), KB_AUTOMACAO (as 11 automações de e-mail),
// KB_META (os ganchos gancho:podeMover/gancho:podeExcluir) e 6 pedidos de
// exemplo, um por situação (analise, tecnica, diretoria, envio, enviado,
// cancelado). Ver docs/specs/002-quadro-de-compras/plan.md §Simulador.
//
// As personas (SGC_USUARIO_PERSONA) já nascem aqui: é dado simples que a 001
// também precisa (R-001), sem depender do resto desta spec.

export function seed002(db, cenario) {
  const PERSONA_POR_CHAVE = { admin: 'admin', ana: 'analista', gil: 'gestor', dora: 'diretoria', leo: 'comercial' };
  const inserir = db.prepare('INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, ?)');
  for (const [chave, persona] of Object.entries(PERSONA_POR_CHAVE)) {
    const usuarioId = cenario.usuarios[chave];
    if (usuarioId) inserir.run(usuarioId, persona);
  }
}
