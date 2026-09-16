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
  /** Coberturas (003): admin e gestor veem a tela; READ_ONLY continua vendo, só não grava (D-12). */
  verCoberturas: boolean;
  somenteProprios: boolean;
  somenteLeitura: boolean;
  // Consumidas pela spec 004 (B-02): a agenda não tem matriz própria.
  agendar: boolean;
  cancelarAgendamento: boolean;
  // Onda 2 (R-028/R-038 do 000): NF, faturamento e trânsito são operados por
  // admin/analista/gestor; diretoria só lê (não zera com READ_ONLY, como
  // verCoberturas/verSeguranca); comercial não vê nenhuma. B.O. é visto por
  // todas as personas (O2-06), inclusive comercial; opera admin/analista/gestor.
  verNotasFiscais: boolean;
  operarNf: boolean;
  verFaturamentoPendente: boolean;
  registrarContato: boolean;
  verNfsAtraso: boolean;
  verBo: boolean;
  operarBo: boolean;
  // Onda 3 (R-056/R-061 do 000): solicitações do comercial (008) e análises
  // (009). `ver*` não zera com READ_ONLY; `criar*`/`avaliar*` zeram, como toda
  // escrita. `verRelatorios`/`salvarRelatorio` saíram com a tela de relatórios
  // salvos, adiada em 2026-09-16 (R-114). `criarSolicitacao` NÃO vai para
  // analista nem gestor: o autor É o vendedor (RN-002 da 008) — comprador
  // registrando criaria demanda sem vendedor por trás. O recorte "o comercial
  // só vê as suas" não é chave: é o recorte do servidor (RF-019 da 008).
  verSolicitacoes: boolean;
  criarSolicitacao: boolean;
  avaliarSolicitacao: boolean;
  verAnalises: boolean;
}

/** Quem faz o quê, por persona (a tabela do plan.md § Regras puras). */
const MATRIZ: Record<Persona, Omit<Permissoes, 'somenteProprios' | 'somenteLeitura'>> = {
  admin: {
    verQuadro: true, criarPedido: true, editarPedido: true, aprovarTecnica: true, aprovarDiretoria: true,
    cancelar: true, registrarEnvio: true, excluirPedido: true, administrarQuadro: true, verSeguranca: true,
    editarFornecedor: true, verCoberturas: true, agendar: true, cancelarAgendamento: true,
    verNotasFiscais: true, operarNf: true, verFaturamentoPendente: true, registrarContato: true,
    verNfsAtraso: true, verBo: true, operarBo: true,
    verSolicitacoes: true, criarSolicitacao: true, avaliarSolicitacao: true,
    verAnalises: true,
  },
  analista: {
    verQuadro: true, criarPedido: true, editarPedido: true, aprovarTecnica: false, aprovarDiretoria: false,
    cancelar: true, registrarEnvio: true, excluirPedido: false, administrarQuadro: false, verSeguranca: false,
    editarFornecedor: false, verCoberturas: false, agendar: true, cancelarAgendamento: false,
    verNotasFiscais: true, operarNf: true, verFaturamentoPendente: true, registrarContato: true,
    verNfsAtraso: true, verBo: true, operarBo: true,
    verSolicitacoes: true, criarSolicitacao: false, avaliarSolicitacao: true,
    verAnalises: true,
  },
  gestor: {
    verQuadro: true, criarPedido: true, editarPedido: true, aprovarTecnica: true, aprovarDiretoria: false,
    cancelar: true, registrarEnvio: true, excluirPedido: true, administrarQuadro: false, verSeguranca: false,
    editarFornecedor: true, verCoberturas: true, agendar: true, cancelarAgendamento: true,
    verNotasFiscais: true, operarNf: true, verFaturamentoPendente: true, registrarContato: true,
    verNfsAtraso: true, verBo: true, operarBo: true,
    verSolicitacoes: true, criarSolicitacao: false, avaliarSolicitacao: true,
    verAnalises: true,
  },
  diretoria: {
    // CA-01 + P-07: a diretoria cancela, mas só na fase dela — quem cobra a
    // fase é `motivoDeDestino`/`sgcPodeMover`, porque cancelar é um movimento.
    verQuadro: true, criarPedido: false, editarPedido: false, aprovarTecnica: false, aprovarDiretoria: true,
    cancelar: true, registrarEnvio: false, excluirPedido: true, administrarQuadro: false, verSeguranca: true,
    editarFornecedor: true, verCoberturas: false, agendar: false, cancelarAgendamento: true,
    // R-038: a diretoria lê NF/faturamento/atraso, mas não opera nem registra contato.
    verNotasFiscais: true, operarNf: false, verFaturamentoPendente: true, registrarContato: false,
    verNfsAtraso: true, verBo: true, operarBo: false,
    verSolicitacoes: true, criarSolicitacao: false, avaliarSolicitacao: false,
    verAnalises: true,
  },
  comercial: {
    // D-017: a única persona sem acesso ao quadro — fora do menu, fora da rota
    // e recusada no servidor (P-03, R-001, RN-021).
    verQuadro: false, criarPedido: false, editarPedido: false, aprovarTecnica: false, aprovarDiretoria: false,
    cancelar: false, registrarEnvio: false, excluirPedido: false, administrarQuadro: false, verSeguranca: false,
    editarFornecedor: false, verCoberturas: false, agendar: false, cancelarAgendamento: false,
    // O2-06/R-028: o comercial só vê o painel de B.O. — nada de NF/faturamento/trânsito.
    verNotasFiscais: false, operarNf: false, verFaturamentoPendente: false, registrarContato: false,
    verNfsAtraso: false, verBo: true, operarBo: false,
    verSolicitacoes: true, criarSolicitacao: true, avaliarSolicitacao: false,
    verAnalises: false,
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
    verCoberturas: base.verCoberturas,
    agendar: operar(base.agendar),
    cancelarAgendamento: operar(base.cancelarAgendamento),
    // Onda 2: ver* não zera com READ_ONLY (como verCoberturas/verSeguranca);
    // operar*/registrarContato zeram, como toda escrita.
    verNotasFiscais: base.verNotasFiscais,
    operarNf: operar(base.operarNf),
    verFaturamentoPendente: base.verFaturamentoPendente,
    registrarContato: operar(base.registrarContato),
    verNfsAtraso: base.verNfsAtraso,
    verBo: base.verBo,
    operarBo: operar(base.operarBo),
    // Onda 3: mesma divisão — ver* atravessa READ_ONLY, o resto zera.
    verSolicitacoes: base.verSolicitacoes,
    criarSolicitacao: operar(base.criarSolicitacao),
    avaliarSolicitacao: operar(base.avaliarSolicitacao),
    verAnalises: base.verAnalises,
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
  // Onda 3 (R-056/R-063): com este item o comercial passa a ter DOIS de menu
  // — Solicitações e Produtos em B.O.
  { grupo: 'Compras', to: '/solicitacoes', label: 'Solicitações', exige: 'verSolicitacoes' },
  { grupo: 'Compras', to: '/agenda', label: 'Agenda', exige: 'verQuadro' },
  { grupo: 'Compras', to: '/notificacoes', label: 'Notificações', exige: 'verQuadro' },
  // Onda 2 (R-028): visível a todas as personas, inclusive comercial (único
  // item de menu que ela recebe, C-013 do plan da 007).
  { grupo: 'Compras', to: '/bo', label: 'Produtos em B.O.', exige: 'verBo' },
  { grupo: 'Cadastros', to: '/fornecedores', label: 'Fornecedores', exige: 'verQuadro' },
  { grupo: 'Cadastros', to: '/coberturas', label: 'Coberturas', exige: 'verCoberturas' },
  // Onda 2 (R-028): NF/faturamento/atraso — diretoria lê, comercial não vê nada.
  { grupo: 'Fiscal', to: '/notas-fiscais', label: 'Notas fiscais', exige: 'verNotasFiscais' },
  { grupo: 'Fiscal', to: '/faturamentos-pendentes', label: 'Faturamentos pendentes', exige: 'verFaturamentoPendente' },
  { grupo: 'Fiscal', to: '/nfs-em-atraso', label: 'NFs em atraso', exige: 'verNfsAtraso' },
  // Onda 3 (R-061/R-063): grupo novo, entre Fiscal e Administração. O comercial
  // não chega à rota — fora do menu E porteiro na tela. "Relatórios" entraria
  // aqui ao lado; a tela foi adiada (R-114) e o grupo fica só com Análises.
  { grupo: 'Gestão', to: '/analises', label: 'Análises', exige: 'verAnalises' },
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
  return MENU
    .filter((item) => permissoes[item.exige])
    .map(({ grupo, to, label }) => ({ grupo, to, label }));
}
