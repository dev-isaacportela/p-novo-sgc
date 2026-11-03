// Regra pura do quadro de empenhos (spec 015). Espelho do ramo do gancho
// `RAMO_PODE_MOVER_EMPENHOS` (backend/add-017-empenhos.mjs): a tela desabilita
// com a MESMA frase, o servidor recusa. `motivoDeDestinoEmpenho` decide na
// mesma ordem do CASE da SQL.
//
// Módulo puro: só `import type` e funções puras de `lib/`, para o `node --test`
// carregá-lo direto.

import type { NivelAcesso, Persona } from './permissoes';
import { diasUteisEntre, somarDiasUteis } from './dias-uteis.ts';
import { diasEntre, somarDias } from './data.ts';

export type ChaveEmpenho =
  | 'emp_analise' | 'emp_tecnica' | 'emp_diretoria' | 'emp_pedidos' | 'emp_envio'
  | 'emp_aguardando' | 'emp_transito' | 'emp_pendencia' | 'emp_concluido' | 'emp_cancelado';

/** C-002: a ordem do quadro (a chave é o contrato; o nome o administrador muda). */
export const FASES_EMPENHO: readonly ChaveEmpenho[] = [
  'emp_analise', 'emp_tecnica', 'emp_diretoria', 'emp_pedidos', 'emp_envio',
  'emp_aguardando', 'emp_transito', 'emp_pendencia', 'emp_concluido', 'emp_cancelado',
];
export const FINAIS_EMPENHO: readonly ChaveEmpenho[] = ['emp_concluido', 'emp_cancelado'];

export type Papel = 'EMPENHO' | 'FORNECEDOR' | 'TRANSFERENCIA' | '';

/** As MESMAS frases de `MENSAGENS_EMPENHO` no add-017 (o smoke compara as duas). */
export const MENSAGENS_EMPENHO = {
  comercial: 'Seu perfil não tem acesso ao quadro de empenhos.',
  leitura: 'Seu acesso é somente leitura.',
  restrito: 'Seu acesso só permite mover os cards que você criou.',
  diretoria: 'Você só movimenta cards na fase Aprovação da Diretoria.',
  semTransicao: 'Esta passagem não existe no fluxo do empenho.',
  analise: 'Há itens sem decisão fechada, sem preço do contrato ou com transferência sem filial.',
  tecnica: 'A aprovação técnica ainda não foi registrada.',
  diretoriaAprov: 'A aprovação da diretoria ainda não foi registrada, ou o empenho não foi desmembrado.',
  reprovar: 'Reprove com o motivo pelo botão Reprovar.',
  nadaAPedir: 'Este empenho tem itens a comprar ou transferir: aprove e desmembre.',
  reagrupar: 'O empenho volta a ser um só quando todos os pedidos terminarem.',
  cancelar: 'Cancele pelo botão Cancelar empenho, com o motivo.',
  envio: 'Informe o número e a data do pedido à indústria.',
  previsao: 'Informe a previsão de chegada.',
  recebido: 'Marque o recebimento na BN.',
  pendenciaAberta: 'Feche as pendências abertas antes de avançar.',
  semPendencia: 'Abra uma pendência para mover o pedido para Pedidos com Pendência.',
  excluir: 'Só se exclui o empenho na Análise, sem pedido, por admin, gestor ou diretoria.',
} as const;
const M = MENSAGENS_EMPENHO;

/** RN-008: os pares por papel — os MESMOS de `PARES_EMPENHO` no add-017. */
export const PARES_EMPENHO: Readonly<Record<Exclude<Papel, ''>, readonly string[]>> = {
  EMPENHO: ['emp_analise>emp_tecnica', 'emp_tecnica>emp_diretoria', 'emp_tecnica>emp_analise',
    'emp_diretoria>emp_pedidos', 'emp_diretoria>emp_concluido', 'emp_diretoria>emp_analise',
    'emp_pedidos>emp_concluido', 'emp_pedidos>emp_cancelado',
    'emp_analise>emp_cancelado', 'emp_tecnica>emp_cancelado', 'emp_diretoria>emp_cancelado'],
  FORNECEDOR: ['emp_analise>emp_envio', 'emp_envio>emp_aguardando', 'emp_aguardando>emp_transito', 'emp_transito>emp_concluido',
    'emp_envio>emp_pendencia', 'emp_aguardando>emp_pendencia', 'emp_transito>emp_pendencia', 'emp_pendencia>emp_transito',
    'emp_aguardando>emp_envio', 'emp_transito>emp_aguardando',
    'emp_analise>emp_cancelado', 'emp_envio>emp_cancelado', 'emp_aguardando>emp_cancelado',
    'emp_transito>emp_cancelado', 'emp_pendencia>emp_cancelado'],
  TRANSFERENCIA: ['emp_analise>emp_pendencia', 'emp_pendencia>emp_transito', 'emp_transito>emp_pendencia',
    'emp_transito>emp_concluido', 'emp_analise>emp_cancelado', 'emp_pendencia>emp_cancelado', 'emp_transito>emp_cancelado'],
};

/** O card em chaves, como o gancho o vê (lido de `sgcEmpCarregar`). */
export interface EstadoEmpenho {
  papel: Papel;
  souCriador: boolean;
  tecEm: string;
  dirEm: string;
  reprovFase: string;
  desmembradoEm: string;
  cancMotivo: string;
  numPedido: string;
  dtPedido: string;
  dtPrevisao: string;
  dtRecebido: string;
  itens: number;
  itensAbertos: number;
  itensAPedir: number;
  pendAbertas: number;
  pedidos: number;
  pedidosFinais: number;
  pedidosCancelados: number;
}

export const ESTADO_VAZIO: EstadoEmpenho = {
  papel: '', souCriador: false, tecEm: '', dirEm: '', reprovFase: '', desmembradoEm: '', cancMotivo: '',
  numPedido: '', dtPedido: '', dtPrevisao: '', dtRecebido: '',
  itens: 0, itensAbertos: 0, itensAPedir: 0, pendAbertas: 0, pedidos: 0, pedidosFinais: 0, pedidosCancelados: 0,
};

const entradaDoPedido = (papel: Papel, par: string) =>
  (papel === 'FORNECEDOR' && par === 'emp_analise>emp_envio') || (papel === 'TRANSFERENCIA' && par === 'emp_analise>emp_pendencia');

const AVANCO_SEM_PENDENCIA = ['emp_envio>emp_aguardando', 'emp_aguardando>emp_transito', 'emp_transito>emp_concluido', 'emp_pendencia>emp_transito'];

/** `null` = livre; texto = destino desabilitado com esse motivo. A ordem é a do CASE de `PODE_MOVER`/`MOTIVO_MOVER`. */
export function motivoDeDestinoEmpenho(
  persona: Persona, acesso: NivelAcesso, origem: ChaveEmpenho, destino: ChaveEmpenho, e: EstadoEmpenho,
): string | null {
  const par = `${origem}>${destino}`;
  if (persona === 'comercial') return M.comercial;
  if (acesso === 'READ_ONLY') return M.leitura;
  if (acesso === 'RESTRICTED' && !e.souCriador) return M.restrito;
  if (persona === 'diretoria' && origem !== 'emp_diretoria' && !entradaDoPedido(e.papel, par)) return M.diretoria;
  if (!e.papel || !PARES_EMPENHO[e.papel].includes(par)) return M.semTransicao;

  const todosCancelados = e.pedidos > 0 && e.pedidosCancelados === e.pedidos;
  if (par === 'emp_pedidos>emp_cancelado') return e.cancMotivo || todosCancelados ? null : M.reagrupar;
  if (destino === 'emp_cancelado') return e.cancMotivo ? null : M.cancelar;
  if (par === 'emp_analise>emp_tecnica') return e.itens === 0 || e.itensAbertos > 0 ? M.analise : null;
  if (par === 'emp_tecnica>emp_diretoria') return e.tecEm ? null : M.tecnica;
  if (par === 'emp_tecnica>emp_analise') return e.reprovFase === 'tecnica' ? null : M.reprovar;
  if (par === 'emp_diretoria>emp_analise') return e.reprovFase === 'diretoria' ? null : M.reprovar;
  if (par === 'emp_diretoria>emp_pedidos') return e.dirEm && e.desmembradoEm ? null : M.diretoriaAprov;
  if (par === 'emp_diretoria>emp_concluido') {
    if (!e.dirEm) return M.diretoriaAprov;
    return e.itensAPedir > 0 ? M.nadaAPedir : null;
  }
  if (par === 'emp_pedidos>emp_concluido') {
    return e.pedidos > 0 && e.pedidosFinais === e.pedidos && e.pedidosCancelados < e.pedidos ? null : M.reagrupar;
  }
  if (AVANCO_SEM_PENDENCIA.includes(par) && e.pendAbertas > 0) return M.pendenciaAberta;
  if (par === 'emp_envio>emp_aguardando') return e.numPedido && e.dtPedido ? null : M.envio;
  if (par === 'emp_aguardando>emp_transito') return e.dtPrevisao ? null : M.previsao;
  if (par === 'emp_transito>emp_concluido') return e.dtRecebido ? null : M.recebido;
  if (destino === 'emp_pendencia') return e.pendAbertas > 0 ? null : M.semPendencia;
  return null;
}

/** C-034: o rascunho (Análise, sem pedido) por admin, gestor ou diretoria; o card sem empenho também por quem o criou. */
export function motivoDeExcluirEmpenho(persona: Persona, acesso: NivelAcesso, origem: ChaveEmpenho | null, e: EstadoEmpenho): string | null {
  if (persona === 'comercial') return M.comercial;
  if (acesso === 'READ_ONLY') return M.leitura;
  if (acesso === 'RESTRICTED' && !e.souCriador) return M.restrito;
  const gerencia = persona === 'admin' || persona === 'gestor' || persona === 'diretoria';
  if (e.papel === '' && (gerencia || e.souCriador)) return null;
  if (e.papel === 'EMPENHO' && origem === 'emp_analise' && e.pedidos === 0 && gerencia) return null;
  return M.excluir;
}

/** A resposta de `sgcEmpCarregar` (colunas UPPERCASE). */
export interface CargaEmpenho {
  ok?: boolean;
  papel?: string;
  empenho?: Record<string, unknown> | null;
  itens?: Record<string, unknown>[];
  pedidos?: Record<string, unknown>[];
  pendencias?: Record<string, unknown>[];
  pedido?: Record<string, unknown> | null;
}

const txt = (valor: unknown) => (valor === null || valor === undefined ? '' : String(valor));

/** A carga do card → o estado que o gancho lê (as mesmas contagens de `contextoEmpenho`). */
export function estadoDaCarga(carga: CargaEmpenho | null | undefined, cardId: number, souCriador: boolean): EstadoEmpenho {
  const e = carga?.empenho;
  if (!carga?.ok || !e) return { ...ESTADO_VAZIO, souCriador };
  const papel = (['EMPENHO', 'FORNECEDOR', 'TRANSFERENCIA'].includes(txt(carga.papel)) ? carga.papel : '') as Papel;
  const itens = (carga.itens ?? []).map(itemDeLinha);
  const pedidos = carga.pedidos ?? [];
  const p = carga.pedido ?? {};
  const fase = (l: Record<string, unknown>) => txt(l.FASE);
  return {
    papel, souCriador,
    tecEm: txt(e.TEC_EM), dirEm: txt(e.DIR_EM), reprovFase: txt(e.REPROV_FASE),
    desmembradoEm: txt(e.DESMEMBRADO_EM), cancMotivo: txt(e.CANC_MOTIVO),
    numPedido: txt(p.NUM_PEDIDO), dtPedido: txt(p.DT_PEDIDO), dtPrevisao: txt(p.DT_PREVISAO), dtRecebido: txt(p.DT_RECEBIDO),
    itens: itens.length,
    itensAbertos: itens.filter((item) => validarDecisao(item) !== '' || !(item.precoVenda > 0)).length,
    itensAPedir: itens.filter((item) => item.qtCompra > 0 || item.qtTransferencia > 0).length,
    pendAbertas: (carga.pendencias ?? []).filter((pd) => n(pd.ID_CARD) === cardId && txt(pd.STATUS) === 'ABERTA').length,
    pedidos: pedidos.length,
    pedidosFinais: pedidos.filter((pd) => (FINAIS_EMPENHO as readonly string[]).includes(fase(pd))).length,
    pedidosCancelados: pedidos.filter((pd) => fase(pd) === 'emp_cancelado').length,
  };
}

/* ─────────────── custo e CMV (RN-001, RN-002) ─────────────── */

export interface ItemEmpenho {
  codprod: number;
  descricao: string;
  embalagem: string;
  unidade: string;
  codfab: string;
  codfornec: number;
  fornecedor: string;
  qtEmpenho: number;
  precoVenda: number;
  custoNegociado: number;
  custoEspecial: number;
  custoPadrao: number;
  /** 'PADRAO' = pedir pelo padrão (C-016); '' = o negociado vale. */
  tipoCustoPedido: '' | 'PADRAO';
  qtCompra: number;
  qtTransferencia: number;
  qtEstoque: number;
  codfilialOrigem: string;
  observacao: string;
}

const n = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

/** Linha de `SGC_EMP_ITEM` (UPPERCASE, de `sgcEmpCarregar`) → item da tela. */
export function itemDeLinha(l: Record<string, unknown>): ItemEmpenho {
  return {
    codprod: n(l.CODPROD), descricao: String(l.DESCRICAO ?? ''), embalagem: String(l.EMBALAGEM ?? ''),
    unidade: String(l.UNIDADE ?? ''), codfab: String(l.CODFAB ?? ''), codfornec: n(l.CODFORNEC),
    fornecedor: String(l.FORNECEDOR ?? ''), qtEmpenho: n(l.QT_EMPENHO), precoVenda: n(l.PRECO_VENDA),
    custoNegociado: n(l.CUSTO_NEGOCIADO), custoEspecial: n(l.CUSTO_ESPECIAL), custoPadrao: n(l.CUSTO_PADRAO),
    tipoCustoPedido: String(l.TIPO_CUSTO_PEDIDO ?? '') === 'PADRAO' ? 'PADRAO' : '',
    qtCompra: n(l.QT_COMPRA), qtTransferencia: n(l.QT_TRANSFERENCIA), qtEstoque: n(l.QT_ESTOQUE),
    codfilialOrigem: String(l.CODFILIAL_ORIGEM ?? ''), observacao: String(l.OBSERVACAO ?? ''),
  };
}

type ItemCusto = Pick<ItemEmpenho, 'tipoCustoPedido' | 'custoNegociado' | 'custoEspecial' | 'custoPadrao'>;

/** RN-001 (P-06): a MESMA conta de `CUSTO_EFETIVO` no add-017. Zero no negociado é "não negociei". */
export function custoEfetivo(item: ItemCusto): number {
  const especial = n(item.custoEspecial) > 0 ? n(item.custoEspecial) : 0;
  if (item.tipoCustoPedido === 'PADRAO') return especial || n(item.custoPadrao);
  return (n(item.custoNegociado) > 0 ? n(item.custoNegociado) : 0) || especial || n(item.custoPadrao);
}

/** CMV do item (fração); sem preço do contrato, `null` (a tela mostra traço). */
export function cmvItem(item: ItemCusto & Pick<ItemEmpenho, 'precoVenda'>): number | null {
  return n(item.precoVenda) > 0 ? custoEfetivo(item) / n(item.precoVenda) : null;
}

/** RN-002: razão das somas pela quantidade empenhada (ou outra, no pedido desmembrado). */
export function totaisEmpenho(
  itens: (ItemCusto & Pick<ItemEmpenho, 'precoVenda' | 'qtEmpenho'>)[],
  quantidade: (item: Pick<ItemEmpenho, 'qtEmpenho'> & Partial<ItemEmpenho>) => number = (item) => n(item.qtEmpenho),
): { valor: number; custo: number; cmv: number | null } {
  let valor = 0;
  let custo = 0;
  for (const item of itens) {
    const qt = quantidade(item);
    valor += qt * n(item.precoVenda);
    custo += qt * custoEfetivo(item);
  }
  return { valor, custo, cmv: valor > 0 ? custo / valor : null };
}

export const CMV_REFERENCIA = 0.7;
/** C-013: aviso, nunca trava. */
export const cmvAcimaDaReferencia = (cmv: number | null) => cmv !== null && cmv > CMV_REFERENCIA;
export const AVISO_CMV = 'acima dos 70 % de referência';

/** C-012: o especial vigente do órgão (política do cliente ou de qualquer cliente) — o menor, se houver dois. */
export function custoEspecialDoOrgao(
  linhas: { CODPROD: number; CODCLI: number; CUSTO_ESPECIAL: number }[], codprod: number, codcli: number,
): number {
  const valores = linhas
    .filter((l) => n(l.CODPROD) === codprod && (n(l.CODCLI) === 0 || n(l.CODCLI) === codcli) && n(l.CUSTO_ESPECIAL) > 0)
    .map((l) => n(l.CUSTO_ESPECIAL));
  return valores.length ? Math.min(...valores) : 0;
}

/* ─────────────── prazo (RN-004) ─────────────── */

export type UnidadePrazo = 'CORRIDOS' | 'UTEIS';

/** C-010: recebimento + N dias (corridos ou úteis, sem feriado). Prazo negativo ou sem data: ''. */
export function dataLimite(recebimento: string, dias: number, unidade: UnidadePrazo): string {
  if (!recebimento || !Number.isInteger(dias) || dias < 0) return '';
  return unidade === 'UTEIS' ? somarDiasUteis(recebimento, dias) : somarDias(recebimento, dias);
}

/** O inverso: os dias entre recebimento e limite na mesma unidade; limite antes do recebimento: null. */
export function prazoEmDias(recebimento: string, limite: string, unidade: UnidadePrazo): number | null {
  if (!recebimento || !limite || limite < recebimento) return null;
  return unidade === 'UTEIS' ? diasUteisEntre(recebimento, limite) : diasEntre(recebimento, limite);
}

/* ─────────────── decisão e prontidão (RN-006, RN-007) ─────────────── */

const TOLERANCIA = 0.0005;
const un = (valor: number) => `${Number(valor.toFixed(3)).toLocaleString('pt-BR')} un.`;

type ItemDecisao = Pick<ItemEmpenho, 'qtEmpenho' | 'qtCompra' | 'qtTransferencia' | 'qtEstoque' | 'codfilialOrigem'>;

/** C-015: '' quando a decisão fecha; senão a frase do que falta. */
export function validarDecisao(item: ItemDecisao): string {
  const soma = n(item.qtCompra) + n(item.qtTransferencia) + n(item.qtEstoque);
  if (soma <= 0) return 'Distribua a quantidade entre as decisões';
  const diferenca = n(item.qtEmpenho) - soma;
  if (diferenca > TOLERANCIA) return `Faltam ${un(diferenca)} para fechar`;
  if (diferenca < -TOLERANCIA) return `A soma passou ${un(-diferenca)}`;
  if (n(item.qtTransferencia) > 0 && !String(item.codfilialOrigem || '').trim()) return 'Escolha a filial de origem da transferência';
  return '';
}

export type Origem = 'compra' | 'transferencia' | 'estoque';
/** RN-006: a maior das três; compra vence o empate, depois transferência. */
export function origemPrincipal(item: Pick<ItemEmpenho, 'qtCompra' | 'qtTransferencia' | 'qtEstoque'>): Origem {
  const compra = n(item.qtCompra);
  const transferencia = n(item.qtTransferencia);
  if (compra >= transferencia && compra >= n(item.qtEstoque)) return 'compra';
  return transferencia >= n(item.qtEstoque) ? 'transferencia' : 'estoque';
}

/** C-015: "Comprar tudo". */
export const comprarTudo = <T extends ItemDecisao>(item: T): T => ({ ...item, qtCompra: n(item.qtEmpenho), qtTransferencia: 0, qtEstoque: 0, codfilialOrigem: '' });

/** C-018 / RN-007: '' quando pronto; senão o motivo com até três produtos. */
export function prontidaoDaAnalise(itens: (ItemDecisao & Pick<ItemEmpenho, 'codprod' | 'descricao' | 'precoVenda'>)[]): string {
  if (!itens.length) return 'Acrescente ao menos um item ao empenho.';
  const abertos = itens.filter((item) => validarDecisao(item) !== '' || !(n(item.precoVenda) > 0));
  if (!abertos.length) return '';
  const citados = abertos.slice(0, 3).map((item) => `${item.codprod} ${item.descricao}`.trim()).join('; ');
  const resto = abertos.length > 3 ? ` e mais ${abertos.length - 3}` : '';
  return `${M.analise} Veja: ${citados}${resto}.`;
}

/* ─────────────── estoque das filiais (RN-005) ─────────────── */

export interface LinhaFilial { CODPROD: number; CODFILIAL: string; FILIAL: string; QT_DISPONIVEL: number; QT_VENDA_45D: number; DT_ULTIMA_VENDA: string | null }

/** C-014: cobertura em dias (arredondada) e se a filial importa (saldo ou venda). */
export function resumoDaFilial(l: Pick<LinhaFilial, 'QT_DISPONIVEL' | 'QT_VENDA_45D'>): { disponivel: number; cobertura: number | null; texto: string; relevante: boolean } {
  const disponivel = Math.max(0, n(l.QT_DISPONIVEL));
  const venda = n(l.QT_VENDA_45D);
  const cobertura = venda > 0 ? Math.round(disponivel / (venda / 45)) : null;
  return { disponivel, cobertura, texto: cobertura === null ? 'sem venda' : `${cobertura} d`, relevante: disponivel > 0 || venda > 0 };
}

/** C-014: a filial do contrato primeiro, depois as outras relevantes. */
export function filiaisDoItem(linhas: LinhaFilial[], codprod: number, codfilialContrato: string): LinhaFilial[] {
  const doItem = linhas.filter((l) => n(l.CODPROD) === codprod);
  const contrato = doItem.filter((l) => String(l.CODFILIAL) === String(codfilialContrato));
  const outras = doItem.filter((l) => String(l.CODFILIAL) !== String(codfilialContrato) && resumoDaFilial(l).relevante);
  return [...contrato, ...outras];
}

/* ─────────────── desmembramento e reagrupamento (RN-010, RN-012) ─────────────── */

export interface PedidoPlanejado { codfornec: number; fornecedor: string; itens: ItemEmpenho[]; valor: number; custo: number }

/** C-021 / C-022: um pedido por indústria com compra > 0; um de transferência se algum item transfere. */
export function planoDeDesmembramento(itens: ItemEmpenho[]): { fornecedores: PedidoPlanejado[]; transferencia: ItemEmpenho[] } {
  const porIndustria = new Map<number, PedidoPlanejado>();
  for (const item of itens) {
    if (!(n(item.qtCompra) > 0)) continue;
    const atual = porIndustria.get(item.codfornec) ?? { codfornec: item.codfornec, fornecedor: item.fornecedor, itens: [], valor: 0, custo: 0 };
    atual.itens.push(item);
    atual.valor += n(item.qtCompra) * n(item.precoVenda);
    atual.custo += n(item.qtCompra) * custoEfetivo(item);
    porIndustria.set(item.codfornec, atual);
  }
  return {
    fornecedores: [...porIndustria.values()].sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, 'pt-BR')),
    transferencia: itens.filter((item) => n(item.qtTransferencia) > 0),
  };
}

/** C-032 / RN-012: todos finais → Cancelados se todos cancelados, senão Concluídos; falta algum → null. */
export function destinoDoReagrupamento(fasesDosPedidos: string[]): ChaveEmpenho | null {
  if (!fasesDosPedidos.length || !fasesDosPedidos.every((f) => (FINAIS_EMPENHO as readonly string[]).includes(f))) return null;
  return fasesDosPedidos.every((f) => f === 'emp_cancelado') ? 'emp_cancelado' : 'emp_concluido';
}

/** C-029: abrir pendência em Envio, Aguardando ou Trânsito leva a Pedidos com Pendência. */
export const destinoAoAbrirPendencia = (fase: string | null): ChaveEmpenho | null =>
  fase === 'emp_envio' || fase === 'emp_aguardando' || fase === 'emp_transito' ? 'emp_pendencia' : null;

/** C-030: fechar a última aberta em Pedidos com Pendência volta ao Trânsito — nunca a Concluídos. */
export const destinoAoFecharPendencia = (fase: string | null, abertasRestantes: number): ChaveEmpenho | null =>
  fase === 'emp_pendencia' && abertasRestantes === 0 ? 'emp_transito' : null;

/* ─────────────── alertas de prazo (RN-013) ─────────────── */

export type NivelAlerta = 'vencido' | 'critico' | 'atencao';
const PESO: Record<NivelAlerta, number> = { atencao: 1, critico: 2, vencido: 3 };

/** C-035: dias restantes → nível e texto. Sem data (null): sem alerta. */
export function nivelDoPrazo(dias: number | null, tipo: 'entrega' | 'vigencia'): { nivel: NivelAlerta; texto: string } | null {
  if (dias === null || !Number.isFinite(dias)) return null;
  const nome = tipo === 'entrega' ? 'entrega' : 'vigência';
  if (dias < 0) return { nivel: 'vencido', texto: tipo === 'entrega' ? 'entrega atrasada' : 'vigência vencida' };
  if (dias === 0) return { nivel: 'critico', texto: `${nome} vence hoje` };
  if (dias <= 3) return { nivel: 'critico', texto: `${nome} em ${dias} d` };
  if (dias <= (tipo === 'entrega' ? 7 : 30)) return { nivel: 'atencao', texto: `${nome} em ${dias} d` };
  return null;
}

/** O pior dos dois; no empate, a vigência. */
export function alertaDoEmpenho(diasEntrega: number | null, diasVigencia: number | null): { nivel: NivelAlerta; texto: string } | null {
  const entrega = nivelDoPrazo(diasEntrega, 'entrega');
  const vigencia = nivelDoPrazo(diasVigencia, 'vigencia');
  if (!entrega) return vigencia;
  if (!vigencia) return entrega;
  return PESO[entrega.nivel] > PESO[vigencia.nivel] ? entrega : vigencia;
}

/** Dias de `hoje` até `data` (ISO); sem data: null. */
export const diasAte = (hoje: string, data: string | null | undefined): number | null =>
  String(data ?? '') ? diasEntre(hoje, String(data).slice(0, 10)) : null;

/** RN-013: hoje no fuso de Brasília, em ISO. */
export const hojeEmBrasilia = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

/* ─────────────── novo empenho, títulos e capa ─────────────── */

/** C-009: o que falta para criar; vazio = pode. */
export function validarNovoEmpenho(d: { idPregao: number; codfilial: string; dtRecebimento: string; itens: unknown[]; prazoInvalido?: boolean }): string[] {
  const falta: string[] = [];
  if (!(d.idPregao > 0)) falta.push('o pregão');
  if (!d.codfilial) falta.push('a filial do contrato');
  if (!d.dtRecebimento) falta.push('a data de recebimento');
  if (d.prazoInvalido) falta.push('um prazo válido');
  if (!d.itens.length) falta.push('ao menos um item');
  return falta;
}

export const tituloDoEmpenho = (edital: string, numEmpenho: string) => `${edital} · ${numEmpenho.trim() || 'sem número'}`;
export const tituloDoPedido = (edital: string, fornecedor: string) => `${edital} · ${fornecedor}`;
export const FORNECEDOR_TRANSFERENCIA = 'Transferência entre filiais';

/** C-007: os outros empenhos do pregão (o deste card fora). */
export const outrosEmpenhos = <T extends Record<string, unknown>>(lista: T[], cardId: number): T[] =>
  lista.filter((l) => n(l.ID_CARD) !== cardId);

/** C-032: "faltam N de M" no empenho; "pedido K de M" no pedido. */
export function textoSituacao(papel: Papel, pedidos: Record<string, unknown>[], cardId: number): string {
  if (!pedidos.length) return '';
  if (papel === 'EMPENHO') {
    const faltam = pedidos.filter((p) => !(FINAIS_EMPENHO as readonly string[]).includes(String(p.FASE))).length;
    return faltam ? `faltam ${faltam} de ${pedidos.length}` : `${pedidos.length} de ${pedidos.length} terminados`;
  }
  const posicao = pedidos.findIndex((p) => n(p.ID_CARD) === cardId);
  return posicao >= 0 ? `pedido ${posicao + 1} de ${pedidos.length}` : '';
}

/** C-023 / C-033 / C-029: motivo e descrição com ao menos 10 caracteres. */
export const TEXTO_MINIMO = 10;
export const textoCurto = (texto: string) => texto.trim().length < TEXTO_MINIMO;
