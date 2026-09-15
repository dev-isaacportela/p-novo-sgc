// PROVISÓRIO (registrado no relatório da 004): `lib/permissoes.ts` é da spec
// 002 (dona da matriz `Permissoes` inteira — verQuadro, mover, aprovar...) e
// ainda não existe neste worktree. B-02 do plan da 004 diz que a agenda só
// LÊ os campos `agendar` e `cancelarAgendamento` de lá, sem definir matriz
// própria; para não travar nesta feature, este arquivo cobre só esses dois
// campos, com a MESMA assinatura `permissoesDe(persona, acesso)` do plan.
//
// Quando `lib/permissoes.ts` existir: trocar os imports de `agenda-permissoes`
// por `permissoes` em AgendaPage.tsx, AgendaDialogo.tsx e agenda.test.mjs, e
// apagar este arquivo.

export type Persona = 'admin' | 'analista' | 'gestor' | 'diretoria' | 'comercial';
export type AccessLevel = 'ADMIN' | 'MEMBER' | 'RESTRICTED' | 'READ_ONLY';

export interface Permissoes {
  agendar: boolean;
  cancelarAgendamento: boolean;
}

/** RN-011/RF-017: criar/editar/processar é admin+analista+gestor; cancelar é admin+gestor+diretoria. */
export function permissoesDe(persona: Persona | undefined, acesso: AccessLevel | string | undefined): Permissoes {
  if (acesso === 'READ_ONLY') return { agendar: false, cancelarAgendamento: false };
  const p = persona || 'analista';
  return {
    agendar: p === 'admin' || p === 'analista' || p === 'gestor',
    cancelarAgendamento: p === 'admin' || p === 'gestor' || p === 'diretoria',
  };
}
