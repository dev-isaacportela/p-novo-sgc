// O que a Análise do Produto (R-123) calcula sobre um SKU já carregado — a
// previsão por modelo (R-124), a sugestão projetada e as sugestões de preço
// especial por cliente (R-125). R-133: saiu da página da 011 para a mesma
// janela, aberta do pedido, fazer a MESMA conta. Regra pura (só compõe as
// funções de `previsao.ts`, `custo-especial.ts` e `ressuprimento-detalhe.ts`).
import { JANELA_DIAS, type LinhaRessuprimento } from './ressuprimento.ts';
import { desconsideradasPorMes, historicoSemPublico, type DadosDoSku, type VendaDesconsiderada } from './ressuprimento-detalhe.ts';
import { modeloEscolhido, preverVendas, serieFechada, sugestaoProjetada } from './previsao.ts';
import type { ModeloPrevisao, Previsao, SugestaoProjetada } from './previsao.ts';
import { oportunidadesDoItem, sugestaoPorCliente } from './custo-especial.ts';
import type { CustoEspecial, Oportunidade, SugestaoCliente, VendaCliente } from './custo-especial.ts';

/** A previsão do SKU sobre os meses fechados, sem as vendas desconsideradas (e sem o público, com o seletor marcado — R-131). */
export function previsaoDoSku(
  dados: DadosDoSku | undefined,
  codprod: number,
  hoje: string,
  desconsideradas: VendaDesconsiderada[],
  semPublico: boolean,
): Previsao | null {
  if (!codprod || !dados?.pronto) return null;
  return preverVendas(serieFechada(
    historicoSemPublico(dados.historico, semPublico),
    hoje,
    desconsideradasPorMes((desconsideradas ?? []).filter((v) => v.codprod === codprod)),
  ));
}

/** A sugestão com a projeção do modelo escolhido. */
export function projetadaDoSku(previsao: Previsao | null, linha: LinhaRessuprimento | null, modelo: ModeloPrevisao): SugestaoProjetada | null {
  const r = previsao ? modeloEscolhido(previsao, modelo) : null;
  return r && linha ? sugestaoProjetada(r.previsao, linha) : null;
}

/** R-128: a economia é contra o custo padrão do Gestão de Custos, sem fallback para o ERP. */
export function oportunidadesDaLinha(l: LinhaRessuprimento, custos: CustoEspecial[], vendas: VendaCliente[]): Oportunidade[] {
  if ((custos ?? []).length === 0) return [];
  return oportunidadesDoItem({
    codprod: Number(l.medida.CODPROD), custoAtual: Number(l.custo?.valor ?? 0), custoUltimaEntrada: 0,
    sugerida: l.sugerida, coberturaDias: l.coberturaDias,
  }, custos, vendas, JANELA_DIAS);
}

/** As sugestões por cliente do produto aberto, com a projeção do modelo escolhido. */
export function sugestoesDaLinha(
  linha: LinhaRessuprimento | null,
  oportunidades: Oportunidade[],
  previsao: Previsao | null,
  modelo: ModeloPrevisao,
): SugestaoCliente[] {
  if (!linha || (oportunidades ?? []).length === 0) return [];
  const r = previsao ? modeloEscolhido(previsao, modelo) : null;
  const sku = {
    quantidade: linha.sugerida, projecaoMensal: r?.previsao ?? 0, coberturaDias: linha.coberturaDias, consumoDiario: linha.consumoDiario,
    unidadesPorCaixa: linha.unidadesPorCaixa, serie: previsao?.serie.pontos ?? [],
  };
  return oportunidades.map((o) => sugestaoPorCliente(o, sku));
}
