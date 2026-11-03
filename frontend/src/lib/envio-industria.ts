// O que o card mostra no Envio para Indústria e no Enviado para Indústria
// (R-141, C-048/C-049 da 002), no molde do `EnvioIndustriaPanel` do legado:
// o resumo do que vai ao fornecedor, o texto do "Copiar itens" e o próximo
// movimento. Puro, testado em tests/envio-industria.test.mjs.
//
// O arquivo de importação do WinThor NÃO é refeito aqui: o formato do SGC 2 é
// o de `textoImportacaoWinthor` (lib/carrinho.ts, RN-023 da 011), já aceito.
import { numeroPt } from './formato.ts';

export interface ItemDoEnvio {
  codprod: number;
  descricao: string;
  embalagem: string;
  qtPedida: number;
  precoCusto: number;
}

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/** Só vai ao fornecedor o que tem quantidade (RN-KAN-46 do legado: `QT_PEDIDA > 0`). */
export function itensDoEnvio<T extends ItemDoEnvio>(itens: readonly T[]): T[] {
  return (itens ?? []).filter((item) => numero(item.qtPedida) > 0);
}

export function totaisDoEnvio(itens: readonly ItemDoEnvio[]): { produtos: number; quantidade: number; valor: number } {
  const enviados = itensDoEnvio(itens);
  return {
    produtos: enviados.length,
    quantidade: enviados.reduce((soma, item) => soma + numero(item.qtPedida), 0),
    valor: enviados.reduce((soma, item) => soma + numero(item.qtPedida) * numero(item.precoCusto), 0),
  };
}

/**
 * "Copiar itens" (PW:5207-5231): código, produto, embalagem, quantidade e
 * custo separados por tabulação, com cabeçalho — cola direto numa planilha ou
 * no corpo do e-mail. Sem a marca "Comercial": isto vai para o fornecedor.
 */
export function textoCopiarItens(itens: readonly ItemDoEnvio[]): string {
  const linhas = itensDoEnvio(itens).map((item) => [
    String(item.codprod),
    item.descricao,
    item.embalagem,
    numeroPt(item.qtPedida),
    numeroPt(item.precoCusto, 2),
  ].join('\t'));
  return ['Código\tProduto\tEmb.\tQtd\tCusto un.', ...linhas].join('\n');
}

/**
 * O próximo movimento do Enviado (PW:10888-10905): Em Trânsito para BN só
 * com nota vinculada — a MESMA condição de `pendencias-transito.sql`, que é
 * quem barra de verdade. Aqui só se avisa antes do clique.
 */
export function proximoDoEnviado(notasVinculadas: number): { liberado: boolean; texto: string } {
  const n = Math.max(0, Math.trunc(numero(notasVinculadas)));
  if (n === 0) return { liberado: false, texto: 'Vincule a nota fiscal para liberar' };
  return { liberado: true, texto: `${n} ${n === 1 ? 'nota vinculada' : 'notas vinculadas'}` };
}
