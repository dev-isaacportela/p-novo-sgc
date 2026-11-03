// As operações do card de empenho que mexem em MAIS de um card: desmembrar
// (C-021), cancelar levando os pedidos (C-033), reagrupar (C-032) e a capa
// "faltam N de M". Cada card nasce por `api.cardCriar` (kbCardCriar) e anda por
// `api.cardMover` — o gancho confere cada movimento.
import type { Card, useKanban } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { carregarCustoPadrao } from '@/lib/custo-padrao-carga';
import { custoPadraoDe } from '@/lib/compras';
import { instanteIso } from '@/lib/pedido';
import {
  destinoDoReagrupamento, FINAIS_EMPENHO, FORNECEDOR_TRANSFERENCIA, itemDeLinha, planoDeDesmembramento, textoSituacao,
  tituloDoPedido, totaisEmpenho, custoEspecialDoOrgao, type CargaEmpenho, type ChaveEmpenho, type ItemEmpenho,
} from '@/lib/empenhos';
import type { MapaEmpenho } from '@/pages/empenhos/contexto';

type Api = ReturnType<typeof useKanban>;
const n = (valor: unknown) => Number(valor) || 0;
const finais = FINAIS_EMPENHO as readonly string[];

/** O motor recusou: a frase do gancho vira o erro da ação. */
async function mover(api: Api, cardId: number, faseId: number) {
  const r = await api.cardMover(cardId, faseId);
  if (!r.ok) throw new Error(r.error || 'O card não foi movido.');
}

/** A capa do card (RNF-003): título, campos e prazo por kbCardAtualizar, mantendo o resto. */
export async function atualizarCapa(api: Api, cardId: number, mudar: { titulo?: string; prazo?: string; valores?: Record<string, string> }) {
  const { card } = (await acao('kbCardDetalhe', { cardId })) as { card?: Card };
  if (!card) return;
  await api.cardAtualizar({
    cardId,
    titulo: mudar.titulo ?? card.titulo,
    valores: { ...card.valores, ...(mudar.valores ?? {}) },
    responsaveisIds: card.responsaveisIds,
    prazo: mudar.prazo ?? card.prazo,
  });
}

const percentual = (cmv: number | null) => (cmv === null ? '' : `${(cmv * 100).toFixed(2).replace('.', ',')} %`);
export const textoCmv = percentual;
/** CMV para ler na tela; sem preço, traço. */
export const pct = (cmv: number | null) => (cmv === null ? '—' : percentual(cmv));
/** Campo moeda da capa: texto com duas casas (Valores da lib são texto). */
export const valorDaCapa = (valor: number) => (Math.round(valor * 100) / 100).toFixed(2);

/**
 * C-021 / RN-010: um card por indústria (Envio para Indústria) e um de
 * transferência (Pedidos com Pendência, com uma pendência por item). Retomável:
 * indústria já registrada não gera de novo. Devolve quantos pedidos o empenho tem.
 */
export async function desmembrar(api: Api, card: Card, carga: CargaEmpenho, fases: MapaEmpenho, usuarioId: number): Promise<number> {
  const e = carga.empenho ?? {};
  const edital = String(e.CODIGO_EDITAL ?? '');
  const plano = planoDeDesmembramento((carga.itens ?? []).map(itemDeLinha));
  const ja = carga.pedidos ?? [];
  const existe = (tipo: string, codfornec: number) => ja.some((p) => String(p.TIPO) === tipo && n(p.CODFORNEC) === codfornec);
  const filhos: { tipo: 'FORNECEDOR' | 'TRANSFERENCIA'; codfornec: number; fornecedor: string; valor: number; cmv: number | null }[] = [
    ...plano.fornecedores.map((p) => ({ tipo: 'FORNECEDOR' as const, codfornec: p.codfornec, fornecedor: p.fornecedor, valor: p.valor, cmv: p.valor > 0 ? p.custo / p.valor : null })),
    ...(plano.transferencia.length
      ? [{ tipo: 'TRANSFERENCIA' as const, codfornec: 0, fornecedor: FORNECEDOR_TRANSFERENCIA, ...(() => {
          const t = totaisEmpenho(plano.transferencia, (i) => n(i.qtTransferencia));
          return { valor: t.valor, cmv: t.cmv };
        })() }]
      : []),
  ];
  const total = ja.length + filhos.filter((f) => !existe(f.tipo, f.codfornec)).length;
  let posicao = ja.length;
  for (const filho of filhos) {
    if (existe(filho.tipo, filho.codfornec)) continue;
    posicao += 1;
    const criado = await api.cardCriar({
      boardId: card.boardId,
      titulo: tituloDoPedido(edital, filho.fornecedor),
      valores: {
        orgao: String(e.ORGAO ?? ''), filial: String(e.FILIAL ?? ''), fornecedor: filho.fornecedor,
        valor_contrato: valorDaCapa(filho.valor), cmv: percentual(filho.cmv), situacao: `pedido ${posicao} de ${total}`,
      },
      responsaveisIds: usuarioId ? [usuarioId] : [],
      prazo: String(e.DT_LIMITE ?? ''),
    });
    if (!criado.ok || !criado.id) throw new Error(criado.error || 'O pedido não foi criado.');
    await linhas('sgcEscEmpPedidoRegistrar', {
      cardId: card.id, cardFilho: criado.id, tipo: filho.tipo, codfornec: filho.codfornec, fornecedor: filho.fornecedor, agora: instanteIso(),
    });
    if (filho.tipo === 'TRANSFERENCIA') await linhas('sgcEscEmpPendenciasTransferencia', { cardFilho: criado.id, agora: instanteIso() });
    await mover(api, criado.id, fases.faseIdDe(filho.tipo === 'TRANSFERENCIA' ? 'emp_pendencia' : 'emp_envio'));
  }
  if (total > 0) {
    await linhas('sgcEscEmpDesmembrado', { cardId: card.id, agora: instanteIso() });
    await atualizarCapa(api, card.id, { valores: { situacao: `faltam ${total} de ${total}` } });
  }
  return total;
}

/** C-033: grava o motivo no empenho e leva o empenho e todos os pedidos abertos a Cancelados. */
export async function cancelarEmpenho(api: Api, cardId: number, carga: CargaEmpenho, fases: MapaEmpenho, motivo: string) {
  await linhas('sgcEscEmpCancelar', { cardId, motivo, agora: instanteIso() });
  const conferido = (await acao('sgcEmpCarregar', { cardId })) as CargaEmpenho;
  if (!String(conferido.empenho?.CANC_MOTIVO ?? '')) throw new Error('O cancelamento não foi gravado: seu perfil não cancela este empenho nesta fase.');
  const cancelado = fases.faseIdDe('emp_cancelado');
  for (const p of conferido.pedidos ?? carga.pedidos ?? []) {
    if (!finais.includes(String(p.FASE))) await mover(api, n(p.ID_CARD), cancelado);
  }
  const pai = n(conferido.empenho?.ID_CARD);
  const faseDoPai = String(conferido.empenho?.FASE ?? '');
  if (pai && !finais.includes(faseDoPai)) await mover(api, pai, cancelado);
}

/**
 * C-032 / RN-012: depois que um pedido termina, o empenho volta a ser um só se
 * o último terminou; senão a capa diz quanto falta. Devolve o destino, se moveu.
 */
export async function reagruparSePreciso(api: Api, cardIdDoPedido: number, fases: MapaEmpenho): Promise<ChaveEmpenho | null> {
  const carga = (await acao('sgcEmpCarregar', { cardId: cardIdDoPedido })) as CargaEmpenho;
  const pai = n(carga.empenho?.ID_CARD);
  if (!pai || String(carga.empenho?.FASE) !== 'emp_pedidos') return null;
  const pedidos = carga.pedidos ?? [];
  const destino = destinoDoReagrupamento(pedidos.map((p) => String(p.FASE)));
  await atualizarCapa(api, pai, { valores: { situacao: textoSituacao('EMPENHO', pedidos, pai) } });
  if (destino) await mover(api, pai, fases.faseIdDe(destino));
  return destino;
}

export interface Produto { CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string; CODFAB: string; CODFORNEC: number; FORNECEDOR: string }

/** C-012: o item entra com o código de fábrica e a indústria do cadastro, o custo padrão e o especial do órgão. */
export async function itemDoProduto(produto: Produto, codcli: number): Promise<ItemEmpenho> {
  const codprod = Number(produto.CODPROD);
  const [custos, especiais] = await Promise.all([
    carregarCustoPadrao([codprod]),
    linhas('sgcCustoEspeciaisProdutos', { codprods: String(codprod) }).catch(() => []),
  ]);
  return {
    codprod, descricao: String(produto.DESCRICAO ?? ''), embalagem: String(produto.EMBALAGEM ?? ''), unidade: String(produto.UNIDADE ?? ''),
    codfab: String(produto.CODFAB ?? ''), codfornec: Number(produto.CODFORNEC) || 0, fornecedor: String(produto.FORNECEDOR ?? ''),
    qtEmpenho: 0, precoVenda: 0, custoNegociado: 0,
    custoEspecial: custoEspecialDoOrgao(especiais as { CODPROD: number; CODCLI: number; CUSTO_ESPECIAL: number }[], codprod, codcli),
    custoPadrao: custoPadraoDe(custos, codprod).valor, tipoCustoPedido: '',
    qtCompra: 0, qtTransferencia: 0, qtEstoque: 0, codfilialOrigem: '', observacao: '',
  };
}
