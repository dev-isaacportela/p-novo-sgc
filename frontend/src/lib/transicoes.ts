// A tabela de transições do fluxo de compras (F-03 A) e o motivo de cada
// recusa — regra pura, espelho exato da SQL ligada `sgcPodeMover`
// (backend/add-005-quadro-compras.mjs).
//
// `motivoDeDestino` decide NA MESMA ORDEM do `CASE` da SQL (D-002): é essa
// ordem que faz a tela e o servidor darem a mesma resposta para o mesmo caso,
// e é o que o teste de 500 combinações (RNF-005) compara, no backend, com a
// SQL de verdade.
//
// Módulo puro de propósito: só `import type` daqui para fora, para o
// `node --test` do frontend e o smoke do backend o carregarem direto.

import type { NivelAcesso, Persona } from './permissoes';

export type ChaveFase =
  | 'analise' | 'tecnica' | 'diretoria' | 'envio' | 'enviado'
  | 'transito' | 'faturamento' | 'bo' | 'concluido' | 'cancelado';

/** Ordem do funil (F-01). */
export const FASES: readonly ChaveFase[] = [
  'analise', 'tecnica', 'diretoria', 'envio', 'enviado',
  'transito', 'faturamento', 'bo', 'concluido', 'cancelado',
];

/** RF-009 — 22 pares liberados: 14 do fluxo e 8 para Canceladas. RN-008: as finais não têm saída. */
export const TRANSICOES: Readonly<Record<ChaveFase, readonly ChaveFase[]>> = {
  analise: ['tecnica', 'cancelado'],
  tecnica: ['diretoria', 'analise', 'cancelado'],
  diretoria: ['envio', 'tecnica', 'analise', 'cancelado'],
  envio: ['enviado', 'diretoria', 'cancelado'],
  enviado: ['transito', 'cancelado'],
  transito: ['faturamento', 'cancelado'],
  faturamento: ['bo', 'concluido', 'cancelado'],
  bo: ['faturamento', 'concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

export interface EstadoPedido {
  souCriador: boolean;
  temMotivoCancelamento: boolean;
  temMotivoTecnico: boolean;
  temMotivoDiretoria: boolean;
  envioRegistrado: boolean;
}

/** Os textos de recusa. São os MESMOS da SQL — o teste compara caractere a caractere. */
export const MOTIVOS: Readonly<Record<string, string>> = {
  comercial: 'Seu perfil não tem acesso ao quadro de compras.',
  leitura: 'Seu acesso é somente leitura.',
  restrito: 'Seu acesso permite operar apenas os pedidos que você criou.',
  diretoria: 'Você só movimenta pedidos na fase Aprovação da Diretoria.',
  semTecnica: 'O pedido precisa passar pela Aprovação Técnica antes de ir para a Aprovação da Diretoria.',
  semTransicao: 'Esta transição não existe no fluxo de compras.',
  cancelar: 'Use a ação "Cancelar compra" para informar o motivo.',
  reprovar: 'Para devolver o pedido para análise, use a ação Reprovar e informe o motivo.',
  envio: 'Registre o envio do pedido (plataforma ou e-mail) antes de mover para Enviado para Indústria.',
  excluir: 'Excluir pedido é da gerência, da diretoria ou do administrador. Para encerrar um pedido, use "Cancelar compra".',
  // Onda 2 (R-030/R-046): as travas de Trânsito e de conclusão são SÓ do
  // servidor — `motivoDeDestino` não ganha ramo novo (o espelho síncrono
  // custaria uma SF por cartão do quadro). Os textos ficam aqui porque são os
  // mesmos de `M` em backend/add-005-quadro-compras.mjs e de
  // backend/sql/pendencias-{transito,conclusao-nf}.sql; a lib mostra a frase do
  // gancho na faixa de aviso do card.
  transito: 'Vincule ao menos uma nota fiscal ao pedido antes de mover para Em Trânsito para BN.',
  conclusaoNf: 'Decida as N conferências de nota fiscal pendentes antes de concluir o pedido.',
  boEntrada: 'Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O.',
};

const permitida = (origem: ChaveFase, destino: ChaveFase) =>
  (TRANSICOES[origem] ?? []).includes(destino);

/**
 * `null` = destino livre; texto = destino desabilitado com esse motivo (RF-010:
 * nunca some da lista).
 *
 * A saída da Análise (`analise → tecnica`) tem uma segunda trava, assíncrona,
 * que NÃO mora aqui: alertas, justificativas, cobertura e prazo são da spec
 * 003 e vivem no `antesDeMover` (`sgcAnaliseSair`) e no bloco `PENDENCIAS` da
 * SQL. Aqui o par é livre — é o que o teste de equivalência compara.
 */
export function motivoDeDestino(
  persona: Persona,
  acesso: NivelAcesso,
  origem: ChaveFase,
  destino: ChaveFase,
  pedido: EstadoPedido,
): string | null {
  if (persona === 'comercial') return MOTIVOS.comercial;
  if (acesso === 'READ_ONLY') return MOTIVOS.leitura;
  if (acesso === 'RESTRICTED' && !pedido.souCriador) return MOTIVOS.restrito;
  if (persona === 'diretoria' && origem !== 'diretoria') return MOTIVOS.diretoria;
  if (!permitida(origem, destino)) {
    return origem === 'analise' && destino === 'diretoria' ? MOTIVOS.semTecnica : MOTIVOS.semTransicao;
  }
  if (destino === 'cancelado' && !pedido.temMotivoCancelamento) return MOTIVOS.cancelar;
  if (origem === 'tecnica' && destino === 'analise' && !pedido.temMotivoTecnico) return MOTIVOS.reprovar;
  if (origem === 'diretoria' && destino === 'analise' && !pedido.temMotivoDiretoria) return MOTIVOS.reprovar;
  if (origem === 'envio' && destino === 'enviado' && !pedido.envioRegistrado) return MOTIVOS.envio;
  return null;
}

/** RF-027 — espelho de tela do `sgcPodeExcluir`; quem decide de verdade é o servidor. */
export function motivoDeExcluir(
  persona: Persona,
  acesso: NivelAcesso,
  pedido: Pick<EstadoPedido, 'souCriador'>,
): string | null {
  if (persona === 'comercial') return MOTIVOS.comercial;
  if (acesso === 'READ_ONLY') return MOTIVOS.leitura;
  if (acesso === 'RESTRICTED' && !pedido.souCriador) return MOTIVOS.restrito;
  if (persona === 'admin' || persona === 'gestor' || persona === 'diretoria') return null;
  return MOTIVOS.excluir;
}
