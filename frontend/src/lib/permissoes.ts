// A matriz de permissões do SGC 2 — regra pura, sem React e sem transporte.
// É o porte de `getPermissions` (usePersona.ts do p-45547), agora testado:
// `frontend/tests/permissoes.test.mjs`.
//
// A mesma matriz existe uma segunda vez, em SQL, nas regras ligadas
// `sgcPodeMover`/`sgcPodeExcluir` (backend/add-005-quadro-compras.mjs). São
// duas porque o motor só pergunta por SQL e a tela precisa desabilitar o botão
// ANTES do clique (D-001); o teste de 500 combinações é o que impede as duas
// de divergirem.
//
// Persona é dado (SGC_USUARIO_PERSONA). `ACCESS_LEVEL` da plataforma vale
// ALÉM dela, nunca no lugar dela: READ_ONLY não opera nada, RESTRICTED opera
// só os próprios pedidos (P-08 B). Menor privilégio em falha.

export type Persona = 'admin' | 'analista' | 'gestor' | 'diretoria' | 'comercial';
export type NivelAcesso = 'ADMIN' | 'MEMBER' | 'RESTRICTED' | 'READ_ONLY';

export const PERSONAS: readonly Persona[] = ['admin', 'analista', 'gestor', 'diretoria', 'comercial'];
const NIVEIS: readonly NivelAcesso[] = ['ADMIN', 'MEMBER', 'RESTRICTED', 'READ_ONLY'];

/** RN-001: sem persona atribuída vale o nível da plataforma; em falha, analista. */
const PERSONA_DO_NIVEL: Record<NivelAcesso, Persona> = {
  ADMIN: 'admin',
  MEMBER: 'analista',
  RESTRICTED: 'comercial',
  READ_ONLY: 'analista',
};

/** Linha de `sgcPersonaAtual`; ausente ou inválida → analista (P-02 B). */
export function personaDe(
  linha: { PERSONA?: string | null; ACCESS_LEVEL?: string | null } | null | undefined,
): { persona: Persona; acesso: NivelAcesso } {
  const bruto = String(linha?.ACCESS_LEVEL ?? '').toUpperCase();
  const acesso = (NIVEIS as readonly string[]).includes(bruto) ? (bruto as NivelAcesso) : 'MEMBER';
  const declarada = String(linha?.PERSONA ?? '').toLowerCase();
  const persona = (PERSONAS as readonly string[]).includes(declarada)
    ? (declarada as Persona)
    : PERSONA_DO_NIVEL[acesso];
  return { persona, acesso };
}

export interface Permissoes {
  verQuadro: boolean;
  criarPedido: boolean;
  editarPedido: boolean;
  aprovarTecnica: boolean;
  aprovarDiretoria: boolean;
  cancelar: boolean;
  registrarEnvio: boolean;
  excluirPedido: boolean;
  administrarQuadro: boolean;
  verSeguranca: boolean;
  /** FO-07 / RF-013 da 001: admin, gestor e diretoria parametrizam fornecedor; analista só lê. */
  editarFornecedor: boolean;
  somenteProprios: boolean;
  somenteLeitura: boolean;
  // Consumidas pela spec 004 (B-02): a agenda não tem matriz própria.
  agendar: boolean;
  cancelarAgendamento: boolean;
}

/** Quem faz o quê, por persona (a tabela do plan.md § Regras puras). */
const MATRIZ: Record<Persona, Omit<Permissoes, 'somenteProprios' | 'somenteLeitura'>> = {
  admin: {
    verQuadro: true, criarPedido: true, editarPedido: true, aprovarTecnica: true, aprovarDiretoria: true,
    cancelar: true, registrarEnvio: true, excluirPedido: true, administrarQuadro: true, verSeguranca: true,
    editarFornecedor: true, agendar: true, cancelarAgendamento: true,
  },
  analista: {
    verQuadro: true, criarPedido: true, editarPedido: true, aprovarTecnica: false, aprovarDiretoria: false,
    cancelar: true, registrarEnvio: true, excluirPedido: false, administrarQuadro: false, verSeguranca: false,
    editarFornecedor: false, agendar: true, cancelarAgendamento: false,
  },
  gestor: {
    verQuadro: true, criarPedido: true, editarPedido: true, aprovarTecnica: true, aprovarDiretoria: false,
    cancelar: true, registrarEnvio: true, excluirPedido: true, administrarQuadro: false, verSeguranca: false,
    editarFornecedor: true, agendar: true, cancelarAgendamento: true,
  },
  diretoria: {
    // CA-01 + P-07: a diretoria cancela, mas só na fase dela — quem cobra a
    // fase é `motivoDeDestino`/`sgcPodeMover`, porque cancelar é um movimento.
    verQuadro: true, criarPedido: false, editarPedido: false, aprovarTecnica: false, aprovarDiretoria: true,
    cancelar: true, registrarEnvio: false, excluirPedido: true, administrarQuadro: false, verSeguranca: true,
    editarFornecedor: true, agendar: false, cancelarAgendamento: true,
  },
  comercial: {
    // D-017: a única persona sem acesso ao quadro — fora do menu, fora da rota
    // e recusada no servidor (P-03, R-001, RN-021).
    verQuadro: false, criarPedido: false, editarPedido: false, aprovarTecnica: false, aprovarDiretoria: false,
    cancelar: false, registrarEnvio: false, excluirPedido: false, administrarQuadro: false, verSeguranca: false,
    editarFornecedor: false, agendar: false, cancelarAgendamento: false,
  },
};

/** RN-002: o nível da plataforma vale ALÉM da persona, nunca no lugar dela. */
export function permissoesDe(persona: Persona, acesso: NivelAcesso): Permissoes {
  const base = MATRIZ[persona] ?? MATRIZ.analista;
  const somenteLeitura = acesso === 'READ_ONLY';
  const operar = (valor: boolean) => valor && !somenteLeitura;
  return {
    verQuadro: base.verQuadro,
    criarPedido: operar(base.criarPedido),
    editarPedido: operar(base.editarPedido),
    aprovarTecnica: operar(base.aprovarTecnica),
    aprovarDiretoria: operar(base.aprovarDiretoria),
    cancelar: operar(base.cancelar),
    registrarEnvio: operar(base.registrarEnvio),
    excluirPedido: operar(base.excluirPedido),
    administrarQuadro: operar(base.administrarQuadro),
    verSeguranca: base.verSeguranca,
    editarFornecedor: operar(base.editarFornecedor),
    agendar: operar(base.agendar),
    cancelarAgendamento: operar(base.cancelarAgendamento),
    somenteProprios: acesso === 'RESTRICTED',
    somenteLeitura,
  };
}

export interface ItemDeMenu {
  grupo: string;
  to: string;
  label: string;
}

const MENU: readonly (ItemDeMenu & { exige: keyof Permissoes })[] = [
  { grupo: 'Compras', to: '/quadro', label: 'Quadro de compras', exige: 'verQuadro' },
  { grupo: 'Compras', to: '/pedidos/novo', label: 'Novo pedido', exige: 'criarPedido' },
  { grupo: 'Compras', to: '/agenda', label: 'Agenda', exige: 'verQuadro' },
  { grupo: 'Compras', to: '/notificacoes', label: 'Notificações', exige: 'verQuadro' },
  { grupo: 'Cadastros', to: '/fornecedores', label: 'Fornecedores', exige: 'verQuadro' },
  { grupo: 'Cadastros', to: '/coberturas', label: 'Coberturas', exige: 'administrarQuadro' },
  { grupo: 'Administração', to: '/seguranca', label: 'Segurança', exige: 'verSeguranca' },
];

/**
 * O menu que a pessoa enxerga (P-03, RN-021). Fica aqui, e não no
 * `AdminLayout`, porque é regra de permissão — o layout só desenha o que esta
 * lista devolver. A persona comercial recebe zero itens de compras.
 *
 * `Coberturas` é da spec 003 e abre para admin e gestor; enquanto a 003 não
 * entra, o item leva à página em construção, como hoje.
 */
export function menuParaPersona(permissoes: Permissoes): ItemDeMenu[] {
  const podeCobertura = permissoes.administrarQuadro || permissoes.aprovarTecnica;
  return MENU
    .filter((item) => (item.to === '/coberturas' ? podeCobertura : permissoes[item.exige]))
    .map(({ grupo, to, label }) => ({ grupo, to, label }));
}
