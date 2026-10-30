// Régua de ressuprimento da spec 011 (compras inteligentes): o que a medida do
// WinThor mais os parâmetros de compra dizem sobre comprar ou não comprar.
//
// R-083: o servidor devolve MEDIDA (estoque, trânsito, venda, consumo ponderado,
// lead medido) e a FÓRMULA roda aqui — é o único jeito de o parâmetro por SKU
// valer, porque o parâmetro vive no Mitra e a medida no Oracle. Módulo puro,
// sem React e sem SDK: é o que `frontend/tests/ressuprimento.test.mjs` exercita.
//
// R-111: este módulo **não importa** `lib/cobertura.ts`. O alvo por curva chega
// como função injetada pela tela (`alvoDaCurvaDias`), e assim a 011 e a 012
// param de depender da ordem de merge — o teste puro usa um stub de três linhas.
//
// Nenhuma régua é reimplementada: a curva ABC, o arredondamento por caixa e as
// unidades por caixa são as da 003 (R-088).

// Extensão explícita, como em `compras.ts`: `allowImportingTsExtensions` está
// ligado e é assim que o `node --test` de frontend/tests/ resolve o módulo.
import { arredondarPorCaixa, curvaPorValor, origemUnidadesPorCaixa, piorCurva, unidadesPorCaixa } from './compras.ts';
import type { CurvaAbc, ItemPedido, OrigemUnidadesPorCaixa } from './compras.ts';

export type StatusRessuprimento =
  'ruptura' | 'excesso' | 'elevada_exposicao' | 'baixa_exposicao' | 'adequado';

export const JANELA_DIAS = 153;              // R-082
export const PESO_RECENCIA_DIA = 0.85;       // R-082 (aplicado na consulta)
export const LEAD_TIME_PADRAO_DIAS = 9;      // O4-02 / R-086
export const COBERTURA_PADRAO_DIAS = 35;     // RN-004, na falta de regra alcançável
export const GATILHO_PADRAO_DIAS = 15;       // O4-02 / R-086
export const SILENCIO_PADRAO_DIAS = 30;      // O4-02 / R-086
export const TOLERANCIA_ADERENCIA = 0.2;     // R-092 / RN-018

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Linha de `sgcWintRessuprimento` (colunas UPPERCASE) — medida, nunca decisão. */
export interface MedidaRessuprimento {
  CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string;
  CODEPTO: number; CODSEC: number; UN_POR_CAIXA_ERP: number;
  CUSTO_ULT_ENTRADA: number; DT_ULT_ENTRADA: string; DT_ULT_SAIDA: string;
  /** Layout legado (R-117): custo ATUAL do ERP e código de fábrica — opcionais para a medida antiga continuar válida. */
  CUSTO_ATUAL?: number; CODFAB?: string;
  ESTOQUE_TOTAL: number; QT_BLOQUEADA: number; QT_INDENIZ: number; QT_RESERV: number;
  ESTOQUE_ATUAL: number; QT_PEDIDA_ERP: number; QT_TRANSITO: number; ESTOQUE_EM_TRANSITO: number;
  LEAD_TIME_MEDIDO: number;          // 0 = não medido
  VENDA_PERIODO: number; VENDA_PUBLICA: number;
  /** R-122: valor vendido e margem da janela (PCMOV: QT × PUNIT e QT × (PUNIT − CUSTOFIN)); opcionais para a medida antiga continuar válida. */
  FATURAMENTO_PERIODO?: number; RENTABILIDADE_PERIODO?: number;
  CONSUMO_DIARIO: number; CONSUMO_DIARIO_PUBLICO: number; VOLATILIDADE_DIARIA: number;
}

/** Linha de `sgcParametrosCompraListar`; `codprod 0` é a linha do fornecedor. */
export interface ParametroCompra {
  codprod: number; coberturaDias: number; leadTimeDias: number; gatilhoDias: number;
  silenciadoAte: string; motivoSilencio: string;
}

export interface ParametrosResolvidos {
  coberturaDias: number; leadTimeDias: number; gatilhoDias: number;
  origemCobertura: 'sku' | 'fornecedor' | 'curva';
  origemLeadTime: 'sku' | 'fornecedor' | 'medido' | 'padrao';
}

/** Linha de `sgcParametrosCompraListar` (UPPERCASE) -> o objeto da regra. */
export function parametroDeLinha(linha: Record<string, unknown>): ParametroCompra {
  return {
    codprod: numero(linha.CODPROD),
    coberturaDias: numero(linha.COBERTURA_DIAS),
    leadTimeDias: numero(linha.LEAD_TIME_DIAS),
    gatilhoDias: numero(linha.GATILHO_DIAS),
    silenciadoAte: String(linha.SILENCIADO_ATE ?? ''),
    motivoSilencio: String(linha.MOTIVO_SILENCIO ?? ''),
  };
}

/**
 * RN-003/RN-004/RN-005. `0` em qualquer campo significa "herda" — é por isso
 * que a precedência é por valor, não por existência da linha: o legado guardava
 * a linha do SKU com zeros e o ignorava.
 */
export function resolverParametros(
  doSku: ParametroCompra | null,
  doFornecedor: ParametroCompra | null,
  leadTimeMedido: number,
  alvoDaCurvaEmDias: number,
): ParametrosResolvidos {
  const skuCobertura = numero(doSku?.coberturaDias);
  const fornCobertura = numero(doFornecedor?.coberturaDias);
  const alvo = numero(alvoDaCurvaEmDias);

  const cobertura = skuCobertura > 0
    ? { coberturaDias: skuCobertura, origemCobertura: 'sku' as const }
    : fornCobertura > 0
      ? { coberturaDias: fornCobertura, origemCobertura: 'fornecedor' as const }
      : { coberturaDias: alvo > 0 ? alvo : COBERTURA_PADRAO_DIAS, origemCobertura: 'curva' as const };

  const skuLead = numero(doSku?.leadTimeDias);
  const fornLead = numero(doFornecedor?.leadTimeDias);
  const medido = numero(leadTimeMedido);

  const lead = skuLead > 0
    ? { leadTimeDias: skuLead, origemLeadTime: 'sku' as const }
    : fornLead > 0
      ? { leadTimeDias: fornLead, origemLeadTime: 'fornecedor' as const }
      : medido > 0
        // RN-003: lead medido tem mínimo de 1 dia — entrega no mesmo dia da
        // emissão não é "lead zero", é um dia.
        ? { leadTimeDias: Math.max(1, Math.ceil(medido)), origemLeadTime: 'medido' as const }
        : { leadTimeDias: LEAD_TIME_PADRAO_DIAS, origemLeadTime: 'padrao' as const };

  const skuGatilho = numero(doSku?.gatilhoDias);
  const fornGatilho = numero(doFornecedor?.gatilhoDias);
  const gatilhoDias = skuGatilho > 0 ? skuGatilho : fornGatilho > 0 ? fornGatilho : GATILHO_PADRAO_DIAS;

  return { ...cobertura, ...lead, gatilhoDias };
}

/** RN-013: `''` não silencia; comparação de texto AAAA-MM-DD, sem fuso. */
export function estaSilenciado(silenciadoAte: string, hoje: string): boolean {
  const ate = String(silenciadoAte ?? '').slice(0, 10);
  if (ate.trim() === '') return false;
  return ate >= String(hoje ?? '').slice(0, 10);
}

/** RN-013: o padrão são 30 dias a partir de hoje. */
export function dataDeSilencio(hoje: string, dias = SILENCIO_PADRAO_DIAS): string {
  const base = Date.parse(`${String(hoje ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(base)) return '';
  return new Date(base + dias * 86400000).toISOString().slice(0, 10);
}

export interface Ressuprimento {
  consumoDiario: number; estoqueAtual: number; emTransito: number;
  leadTimeDias: number; coberturaDias: number; gatilhoDias: number;
  estoqueSeguranca: number; pontoDePedido: number; estoqueMaximo: number;
  sugerida: number;
  coberturaAtualDias: number | null; diasDeGatilho: number | null;
  status: StatusRessuprimento; urgente: boolean;
}

/**
 * RN-006 a RN-009 e RN-011. O consumo já vem medido do servidor (RN-001); aqui
 * só se decide se a parte pública fica dentro ou fora (o seletor da tela, que
 * recalcula sem nova consulta).
 */
export function calcularRessuprimento(
  medida: MedidaRessuprimento,
  parametros: ParametrosResolvidos,
  opcoes: { unidadesPorCaixa: number; desconsiderarLicitacao: boolean },
): Ressuprimento {
  const total = numero(medida?.CONSUMO_DIARIO);
  const publico = numero(medida?.CONSUMO_DIARIO_PUBLICO);
  // RN-011: nunca negativo — medida pública maior que a total é dado sujo, não
  // demanda negativa.
  const consumoDiario = opcoes.desconsiderarLicitacao ? Math.max(0, total - publico) : total;

  const estoqueAtual = Math.max(0, numero(medida?.ESTOQUE_ATUAL));
  const emTransito = Math.max(0, numero(medida?.ESTOQUE_EM_TRANSITO));
  const { leadTimeDias, coberturaDias, gatilhoDias } = parametros;

  // RN-006.
  const estoqueSeguranca = leadTimeDias * consumoDiario;
  const pontoDePedido = 2 * leadTimeDias * consumoDiario;
  const estoqueMaximo = coberturaDias * consumoDiario;

  // RN-007. Trânsito manda: o que já está a caminho não se compra de novo.
  const vendaPeriodo = opcoes.desconsiderarLicitacao
    ? Math.max(0, numero(medida?.VENDA_PERIODO) - numero(medida?.VENDA_PUBLICA))
    : numero(medida?.VENDA_PERIODO);
  const bruta = emTransito > 0 || (vendaPeriodo <= 0 && consumoDiario <= 0)
    ? 0
    : Math.max(0, Math.ceil(estoqueMaximo - estoqueAtual - emTransito));
  const sugerida = arredondarPorCaixa(bruta, opcoes.unidadesPorCaixa);

  // RN-008: sem consumo as duas NÃO EXISTEM — é `null`, nunca o 9999 do legado.
  const coberturaAtualDias = consumoDiario > 0 ? estoqueAtual / consumoDiario : null;
  const diasDeGatilho = consumoDiario > 0
    ? Math.floor((estoqueAtual + emTransito - estoqueSeguranca) / consumoDiario - leadTimeDias)
    : null;

  // RN-009: a ordem é a regra. Ruptura antes de excesso (disponível 0 com
  // máximo 0 é ruptura, não excesso); elevada antes de baixa.
  const status: StatusRessuprimento = estoqueAtual <= 0
    ? 'ruptura'
    : estoqueAtual + emTransito > estoqueMaximo
      ? 'excesso'
      : estoqueAtual <= pontoDePedido && coberturaAtualDias !== null && coberturaAtualDias < leadTimeDias
        ? 'elevada_exposicao'
        : estoqueAtual <= pontoDePedido
          ? 'baixa_exposicao'
          : 'adequado';

  // RF-015: o gatilho não recorta a lista, sinaliza e ordena (D-011).
  const urgente = diasDeGatilho !== null && diasDeGatilho <= gatilhoDias;

  return {
    consumoDiario, estoqueAtual, emTransito,
    leadTimeDias, coberturaDias, gatilhoDias,
    estoqueSeguranca, pontoDePedido, estoqueMaximo,
    sugerida, coberturaAtualDias, diasDeGatilho, status, urgente,
  };
}

const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');

/** "Por que comprar" do carrinho — a frase que explica a sugestão. */
export function motivoDaSugestao(r: Ressuprimento): string {
  if (r.status === 'ruptura') {
    return `Ruptura — sem estoque, consumo de ${r.consumoDiario.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un./dia`;
  }
  if (r.estoqueAtual <= r.pontoDePedido) {
    const cobertura = r.coberturaAtualDias === null ? 'sem giro' : `cobertura de ${inteiro(r.coberturaAtualDias)} dias`;
    return `Abaixo do ponto de pedido (${inteiro(r.pontoDePedido)} un.); ${cobertura}`;
  }
  if (r.urgente && r.diasDeGatilho !== null) return `Gatilho em ${r.diasDeGatilho} dias`;
  return `Estoque máximo de ${inteiro(r.estoqueMaximo)} un. não atingido`;
}

/** A cobertura que o item terá com a quantidade escolhida (R-112). Sem consumo, `null`. */
export function coberturaFuturaComCompra(r: Ressuprimento, quantidade: number): number | null {
  if (r.consumoDiario <= 0) return null;
  return (r.estoqueAtual + r.emTransito + Math.max(0, numero(quantidade))) / r.consumoDiario;
}

/** RN-018: sugerida > 0 e 0,8 × sugerida <= pedida <= 1,2 × sugerida (inclusive). */
export function aderenteASugestao(qtSugerida: number, qtPedida: number): boolean {
  const sugerida = numero(qtSugerida);
  const pedida = numero(qtPedida);
  if (sugerida <= 0) return false;
  return pedida >= sugerida * (1 - TOLERANCIA_ADERENCIA) && pedida <= sugerida * (1 + TOLERANCIA_ADERENCIA);
}

export interface LinhaRessuprimento extends Ressuprimento {
  medida: MedidaRessuprimento;
  /** R-122: a curva que vale (alvo de cobertura, item do pedido, ordem) é a PIOR das duas. */
  curva: CurvaAbc; curvaFaturamento: CurvaAbc; curvaRentabilidade: CurvaAbc;
  parametros: ParametrosResolvidos; unidadesPorCaixa: number; silenciado: boolean;
  silenciadoAte: string; motivoSilencio: string;
  /** R-120: de onde veio a caixa — Gestão de Custos, cadastro do ERP, embalagem ou avulso. */
  origemCaixa: OrigemUnidadesPorCaixa;
}

export interface CurvasDaLinha { faturamento: CurvaAbc; rentabilidade: CurvaAbc; curva: CurvaAbc }

/**
 * RN-010 (R-122): duas curvas pela mesma régua — a de FATURAMENTO (valor
 * vendido na janela) e a de RENTABILIDADE (margem da janela) — e a que vale é
 * a pior das duas, como no sistema antigo. Medida sem as duas colunas (SF
 * ainda não republicada) cai na régua antiga, venda × custo, nas duas.
 */
export function curvasDoRessuprimento(medidas: MedidaRessuprimento[]): Map<number, CurvasDaLinha> {
  const lista = medidas ?? [];
  const antiga = (m: MedidaRessuprimento) => Math.max(0, numero(m.VENDA_PERIODO)) * Math.max(0, numero(m.CUSTO_ULT_ENTRADA));
  const faturamento = curvaPorValor(lista.map((m) => ({
    codprod: numero(m.CODPROD),
    valor: m.FATURAMENTO_PERIODO === undefined ? antiga(m) : numero(m.FATURAMENTO_PERIODO),
  })));
  const rentabilidade = curvaPorValor(lista.map((m) => ({
    codprod: numero(m.CODPROD),
    valor: m.RENTABILIDADE_PERIODO === undefined ? antiga(m) : numero(m.RENTABILIDADE_PERIODO),
  })));
  const mapa = new Map<number, CurvasDaLinha>();
  for (const m of lista) {
    const codprod = numero(m.CODPROD);
    const fat = faturamento.get(codprod) ?? 'C';
    const rent = rentabilidade.get(codprod) ?? 'C';
    mapa.set(codprod, { faturamento: fat, rentabilidade: rent, curva: piorCurva(fat, rent) });
  }
  return mapa;
}

/** O alvo em dias da curva do item. A TELA injeta; esta lib não conhece `SGC_COBERTURA`. */
export type AlvoDaCurva = (
  alvo: { codprod: number; codsec: number; codepto: number; codfornec: number },
  curva: CurvaAbc,
) => number;

/**
 * A única chamada que a tela faz por carga: curvas (a régua da 003, duas vezes,
 * e a pior das duas) -> alvo da curva (injetado) -> precedência dos parâmetros -> as sete grandezas.
 * RN-004, RN-010.
 */
export function montarRessuprimento(
  medidas: MedidaRessuprimento[],
  parametros: ParametroCompra[],
  alvoDaCurvaDias: AlvoDaCurva,
  unidadesPorCaixaPorProduto: Map<number, number>,
  opcoes: { codfornec: number; hoje: string; desconsiderarLicitacao: boolean },
): LinhaRessuprimento[] {
  const lista = medidas ?? [];
  const curvas = curvasDoRessuprimento(lista);
  const doFornecedor = (parametros ?? []).find((p) => numero(p.codprod) === 0) ?? null;
  const porSku = new Map((parametros ?? []).filter((p) => numero(p.codprod) > 0).map((p) => [numero(p.codprod), p]));

  return lista.map((medida) => {
    const codprod = numero(medida.CODPROD);
    const daLinha = curvas.get(codprod) ?? { faturamento: 'C' as const, rentabilidade: 'C' as const, curva: 'C' as const };
    const curva = daLinha.curva;
    const doSku = porSku.get(codprod) ?? null;
    const alvo = alvoDaCurvaDias(
      { codprod, codsec: numero(medida.CODSEC), codepto: numero(medida.CODEPTO), codfornec: numero(opcoes.codfornec) },
      curva,
    );
    const resolvidos = resolverParametros(doSku, doFornecedor, numero(medida.LEAD_TIME_MEDIDO), alvo);
    const daGestao = unidadesPorCaixaPorProduto?.get(codprod);
    const porCaixa = unidadesPorCaixa(medida, daGestao);
    const calculo = calcularRessuprimento(medida, resolvidos, {
      unidadesPorCaixa: porCaixa,
      desconsiderarLicitacao: opcoes.desconsiderarLicitacao,
    });
    return {
      ...calculo,
      medida,
      curva,
      curvaFaturamento: daLinha.faturamento,
      curvaRentabilidade: daLinha.rentabilidade,
      parametros: resolvidos,
      unidadesPorCaixa: porCaixa,
      origemCaixa: origemUnidadesPorCaixa(medida, daGestao),
      silenciado: estaSilenciado(doSku?.silenciadoAte ?? '', opcoes.hoje),
      silenciadoAte: doSku?.silenciadoAte ?? '',
      motivoSilencio: doSku?.motivoSilencio ?? '',
    };
  });
}

/**
 * RF-014 / D-012: "a comprar" é sugestão > 0 e não silenciado — sugestão zero é
 * "não há o que comprar", e listar seria oferecer um botão que não faz nada.
 * Urgentes primeiro (RF-015), depois por dias de gatilho.
 */
export function aComprar(linhas: LinhaRessuprimento[]): LinhaRessuprimento[] {
  return (linhas ?? [])
    .filter((l) => l.sugerida > 0 && !l.silenciado)
    .sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      const ga = a.diasDeGatilho ?? Number.POSITIVE_INFINITY;
      const gb = b.diasDeGatilho ?? Number.POSITIVE_INFINITY;
      if (ga !== gb) return ga - gb;
      if (a.sugerida !== b.sugerida) return b.sugerida - a.sugerida;
      return String(a.medida.DESCRICAO).localeCompare(String(b.medida.DESCRICAO), 'pt-BR');
    });
}

/**
 * R-112: o item nascido do carrinho é gravado INTEIRO. A remontagem da Análise
 * preserva o item existente (RN-017), então campo que nascer vazio fica vazio
 * para sempre — e um `COBERTURA_LIMITE` zerado deixaria a trava de cobertura da
 * 003 cega.
 */
export function itemDoCarrinho(
  linha: LinhaRessuprimento,
  quantidade: number,
  coberturaLimite: number,
): ItemPedido {
  const m = linha.medida;
  return {
    codprod: numero(m.CODPROD),
    descricao: String(m.DESCRICAO ?? ''),
    embalagem: String(m.EMBALAGEM ?? ''),
    unidade: String(m.UNIDADE ?? ''),
    codepto: numero(m.CODEPTO),
    codsec: numero(m.CODSEC),
    unPorCaixa: linha.unidadesPorCaixa,
    qtVendaTotal: numero(m.VENDA_PERIODO),
    qtVendaLicitacao: numero(m.VENDA_PUBLICA),
    qtEstoque: linha.estoqueAtual,
    qtTransito: linha.emTransito,
    qtSugerida: linha.sugerida,
    qtPedida: Math.max(0, numero(quantidade)),
    precoCusto: numero(m.CUSTO_ULT_ENTRADA),
    tipoPreco: 'padrao',
    curvaAbc: linha.curva,
    coberturaDias: coberturaFuturaComCompra(linha, quantidade) ?? 0,
    coberturaLimite: numero(coberturaLimite),
    coberturaJustificativa: '',
    observacao: '',
    status: 'montagem',
    // Onda 3 (008): item do carrinho nunca nasce de solicitação.
    idSolicitacao: 0,
    solicitacaoDe: '',
  };
}

export interface EntradaCarrinho {
  linha: LinhaRessuprimento;
  quantidade: number;
  codfornec: number;
  codfilial: string;
  fornecedor: string;
  filial: string;
}

export interface GrupoCarrinho {
  codfornec: number; codfilial: string; fornecedor: string; filial: string;
  prioridade: 'normal' | 'alta'; total: number;
  itens: { linha: LinhaRessuprimento; quantidade: number }[];
}

/** RN-015: um grupo por fornecedor + filial; prioridade alta com ruptura no grupo. */
export function agruparCarrinho(itens: EntradaCarrinho[]): GrupoCarrinho[] {
  const grupos = new Map<string, GrupoCarrinho>();
  for (const entrada of itens ?? []) {
    const chave = `${numero(entrada.codfornec)}|${String(entrada.codfilial)}`;
    const grupo = grupos.get(chave) ?? {
      codfornec: numero(entrada.codfornec),
      codfilial: String(entrada.codfilial),
      fornecedor: String(entrada.fornecedor ?? ''),
      filial: String(entrada.filial ?? ''),
      prioridade: 'normal' as const,
      total: 0,
      itens: [],
    };
    grupo.itens.push({ linha: entrada.linha, quantidade: Math.max(0, numero(entrada.quantidade)) });
    grupo.total += Math.max(0, numero(entrada.quantidade)) * numero(entrada.linha.medida.CUSTO_ULT_ENTRADA);
    if (entrada.linha.status === 'ruptura') grupo.prioridade = 'alta';
    grupos.set(chave, grupo);
  }
  for (const grupo of grupos.values()) grupo.total = Math.round(grupo.total * 100) / 100;
  return [...grupos.values()];
}

/* ── Layout legado (R-117): visões, completar compra, ordem, movimentação, nível ── */

export type VisaoRessuprimento = 'comprar' | 'completar' | 'todos' | 'transito';

export const ROTULO_VISAO: Record<VisaoRessuprimento, string> = {
  comprar: 'A comprar',
  completar: 'Completar compra',
  todos: 'Todos',
  transito: 'Em trânsito',
};

/**
 * RN-020 / C-027: "completar compra" é o que NÃO está na fila hoje mas entra
 * nela no próximo ciclo — sugestão 0, sem trânsito, com giro, e a cobertura
 * atual dentro de `cobertura alvo + lead time`. Serve para fechar o pedido
 * mínimo do fornecedor com o que vai faltar em breve, nunca com o que sobra.
 * Menor cobertura primeiro: é o que fura antes.
 */
export function completarCompra(linhas: LinhaRessuprimento[]): LinhaRessuprimento[] {
  return (linhas ?? [])
    .filter((l) => l.sugerida <= 0 && !l.silenciado && l.emTransito <= 0 && l.consumoDiario > 0
      && l.coberturaAtualDias !== null && l.coberturaAtualDias <= l.coberturaDias + l.leadTimeDias)
    .sort((a, b) => {
      const ca = a.coberturaAtualDias ?? Number.POSITIVE_INFINITY;
      const cb = b.coberturaAtualDias ?? Number.POSITIVE_INFINITY;
      if (ca !== cb) return ca - cb;
      return String(a.medida.DESCRICAO).localeCompare(String(b.medida.DESCRICAO), 'pt-BR');
    });
}

/** RN-020: o complemento proposto é UMA caixa cheia (ou 1 unidade, no avulso). */
export function quantidadeParaCompletar(l: LinhaRessuprimento): number {
  return l.unidadesPorCaixa > 1 ? l.unidadesPorCaixa : 1;
}

/** RF-014: em trânsito é quem tem trânsito, silenciado ou não. */
export function emTransito(linhas: LinhaRessuprimento[]): LinhaRessuprimento[] {
  return (linhas ?? []).filter((l) => l.emTransito > 0);
}

/** As linhas de uma visão; "todos" é a lista inteira, na ordem de chegada. */
export function linhasDaVisao(linhas: LinhaRessuprimento[], visao: VisaoRessuprimento): LinhaRessuprimento[] {
  if (visao === 'comprar') return aComprar(linhas);
  if (visao === 'completar') return completarCompra(linhas);
  if (visao === 'transito') return emTransito(linhas);
  return [...(linhas ?? [])];
}

/** C-026: a contagem que cada card de visão mostra. */
export function contarVisoes(linhas: LinhaRessuprimento[]): Record<VisaoRessuprimento, number> {
  return {
    comprar: aComprar(linhas).length,
    completar: completarCompra(linhas).length,
    todos: (linhas ?? []).length,
    transito: emTransito(linhas).length,
  };
}

/**
 * C-038: a ordem da lista. `padrao` mantém a ordem da visão (urgentes primeiro
 * em "a comprar", menor cobertura em "completar", descrição nas demais).
 */
export type OrdemLista = 'padrao' | 'codigo' | 'nome' | 'curva';

export const OPCOES_ORDEM: { value: OrdemLista; label: string }[] = [
  { value: 'padrao', label: 'Ordem padrão' },
  { value: 'codigo', label: 'Código' },
  { value: 'nome', label: 'Nome' },
  { value: 'curva', label: 'Curva' },
];

export function ordenarLinhas(linhas: LinhaRessuprimento[], ordem: OrdemLista): LinhaRessuprimento[] {
  const lista = [...(linhas ?? [])];
  if (ordem === 'codigo') return lista.sort((a, b) => numero(a.medida.CODPROD) - numero(b.medida.CODPROD));
  if (ordem === 'nome') return lista.sort((a, b) => String(a.medida.DESCRICAO).localeCompare(String(b.medida.DESCRICAO), 'pt-BR'));
  if (ordem === 'curva') {
    return lista.sort((a, b) => a.curva.localeCompare(b.curva)
      || String(a.medida.DESCRICAO).localeCompare(String(b.medida.DESCRICAO), 'pt-BR'));
  }
  return lista;
}

/** C-038: os filtros de movimentação do legado que a medida já responde sem nova consulta. */
export type FiltroMovimentacao = '' | 'com_venda' | 'sem_venda' | 'com_estoque' | 'sem_estoque' | 'com_transito';

export const OPCOES_MOVIMENTACAO: { value: FiltroMovimentacao; label: string }[] = [
  { value: '', label: 'Qualquer movimentação' },
  { value: 'com_venda', label: 'Com venda na janela' },
  { value: 'sem_venda', label: 'Sem venda na janela' },
  { value: 'com_estoque', label: 'Com estoque disponível' },
  { value: 'sem_estoque', label: 'Sem estoque disponível' },
  { value: 'com_transito', label: 'Com trânsito' },
];

export function filtrarMovimentacao(linhas: LinhaRessuprimento[], filtro: FiltroMovimentacao): LinhaRessuprimento[] {
  const lista = linhas ?? [];
  if (filtro === 'com_venda') return lista.filter((l) => numero(l.medida.VENDA_PERIODO) > 0);
  if (filtro === 'sem_venda') return lista.filter((l) => numero(l.medida.VENDA_PERIODO) <= 0);
  if (filtro === 'com_estoque') return lista.filter((l) => l.estoqueAtual > 0);
  if (filtro === 'sem_estoque') return lista.filter((l) => l.estoqueAtual <= 0);
  if (filtro === 'com_transito') return lista.filter((l) => l.emTransito > 0);
  return lista;
}

/** C-031: nível de cobertura = disponível ÷ máximo, em %. Sem máximo (sem giro), `null`. */
export function nivelDeCobertura(l: Pick<Ressuprimento, 'estoqueAtual' | 'estoqueMaximo'>): number | null {
  if (!(l.estoqueMaximo > 0)) return null;
  return (l.estoqueAtual / l.estoqueMaximo) * 100;
}

/** C-037: a referência da sugestão — unidades ou caixas — é só leitura; a quantidade digitada é sempre em unidades. */
export type ReferenciaSugestao = 'unidades' | 'caixas';

export function textoDaSugestao(sugerida: number, unidadesPorCaixa: number, referencia: ReferenciaSugestao): string {
  const un = `${Math.round(numero(sugerida)).toLocaleString('pt-BR')} un.`;
  if (!(unidadesPorCaixa > 1)) return un;
  const cx = `${(numero(sugerida) / unidadesPorCaixa).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cx`;
  return referencia === 'caixas' ? `${cx} · ${un}` : `${un} · ${cx}`;
}

/** Os filtros locais da lista (C-038): nenhum deles custa execução. */
export interface FiltrosLista {
  situacao: '' | StatusRessuprimento;
  ordem: OrdemLista;
  movimentacao: FiltroMovimentacao;
  soSilenciados: boolean;
}

export const FILTROS_INICIAIS: FiltrosLista = { situacao: '', ordem: 'padrao', movimentacao: '', soSilenciados: false };

/* ── RF-023 / C-024: a exportação é do que está na tela, por lib/csv.ts (R-037) ── */

export const COLUNAS_CSV: string[] = [
  'Produto', 'Situação', 'Curva', 'Curva fat.', 'Curva rent.', 'Consumo diário', 'Estoque disponível',
  'Trânsito', 'Cobertura atual', 'Dias de gatilho', 'Sugestão', 'Custo',
];

export const ROTULO_STATUS: Record<StatusRessuprimento, string> = {
  ruptura: 'Ruptura',
  excesso: 'Excesso',
  elevada_exposicao: 'Elevada exposição',
  baixa_exposicao: 'Baixa exposição',
  adequado: 'Adequado',
};

/** Vírgula decimal — o que o Excel em pt-BR lê sem configurar nada. */
const decimal = (valor: number, casas = 2) => valor.toFixed(casas).replace('.', ',');

export function linhaCsv(l: LinhaRessuprimento): (string | number)[] {
  return [
    `${l.medida.DESCRICAO} (${l.medida.CODPROD})`,
    ROTULO_STATUS[l.status],
    l.curva,
    l.curvaFaturamento,
    l.curvaRentabilidade,
    decimal(l.consumoDiario, 4),
    decimal(l.estoqueAtual, 3),
    decimal(l.emTransito, 3),
    l.coberturaAtualDias === null ? 'sem giro' : decimal(l.coberturaAtualDias, 1),
    l.diasDeGatilho === null ? 'sem giro' : l.diasDeGatilho,
    decimal(l.sugerida, 3),
    decimal(numero(l.medida.CUSTO_ULT_ENTRADA), 2),
  ];
}
