// O seletor de custo de um item do pedido (R-133), como no SGC legado: o custo
// padrão do Gestão de Custos (R-128), uma das tabelas de preço especial
// vigentes do produto (`sgcCustoEspeciaisProdutos`) ou um valor digitado
// (manual). O item guarda o valor e o tipo (`padrao` | `especial` | `manual`);
// a tabela escolhida não é gravada — ela se reconhece pelo custo.
// Regra pura, exercitada por `frontend/tests/custo-do-item.test.mjs`.

import type { CustoEspecial } from './custo-especial.ts';
import type { CustoPadrao, TipoPreco } from './compras.ts';

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

export interface TabelaVigente { politicaId: number; politicaNome: string; custo: number; dataFim: string }

/**
 * As tabelas do produto ainda vigentes hoje (sem data de fim, ou fim ≥ hoje),
 * uma por política e custo — a mesma política vale para vários clientes —, da
 * mais barata para a mais cara.
 */
export function tabelasVigentes(custos: CustoEspecial[], codprod: number, hoje: string): TabelaVigente[] {
  const vistas = new Map<string, TabelaVigente>();
  for (const c of custos ?? []) {
    if (numero(c.CODPROD) !== numero(codprod) || !(numero(c.CUSTO_ESPECIAL) > 0)) continue;
    const fim = String(c.DATA_FIM ?? '').slice(0, 10);
    if (fim && fim < hoje) continue;
    const chave = `${numero(c.POLITICA_ID)}-${numero(c.CUSTO_ESPECIAL)}`;
    if (!vistas.has(chave)) {
      vistas.set(chave, { politicaId: numero(c.POLITICA_ID), politicaNome: String(c.POLITICA_NOME ?? ''), custo: numero(c.CUSTO_ESPECIAL), dataFim: fim });
    }
  }
  return [...vistas.values()].sort((a, b) => a.custo - b.custo || a.politicaId - b.politicaId);
}

/** O valor do seletor: 'padrao', 'manual' ou 'esp:<política>:<custo>'. */
export const chaveDaTabela = (t: Pick<TabelaVigente, 'politicaId' | 'custo'>): string => `esp:${numero(t.politicaId)}:${numero(t.custo)}`;

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export interface OpcaoDeCusto { value: string; label: string; hint?: string }

/**
 * As opções do menu. Item gravado como especial com um custo que nenhuma
 * tabela vigente tem (a tabela venceu) ganha a sua própria opção, para o menu
 * nunca mostrar outra escolha que não a do item.
 */
export function opcoesDeCusto(padrao: CustoPadrao, tabelas: TabelaVigente[], atual?: { tipoPreco: TipoPreco; precoCusto: number }): OpcaoDeCusto[] {
  const opcoes: OpcaoDeCusto[] = [{
    value: 'padrao',
    // Antes da análise carregar, o item em padrão mostra o custo que já tem.
    label: padrao.origem === 'gestao' ? `Padrão ${moeda(padrao.valor)}`
      : padrao.origem === 'erro' ? 'Padrão — erro custo'
        : padrao.origem === 'carregando' ? (atual?.tipoPreco === 'padrao' && numero(atual.precoCusto) > 0 ? `Padrão ${moeda(numero(atual.precoCusto))}` : 'Padrão')
          : 'Padrão — sem custo',
    hint: 'Gestão de Custos',
  }];
  for (const t of tabelas ?? []) {
    opcoes.push({ value: chaveDaTabela(t), label: `${t.politicaNome || `Política ${t.politicaId}`} ${moeda(t.custo)}`, hint: t.dataFim ? `especial até ${t.dataFim.split('-').reverse().join('/')}` : 'especial' });
  }
  if (atual?.tipoPreco === 'especial' && !(tabelas ?? []).some((t) => t.custo === numero(atual.precoCusto))) {
    opcoes.push({ value: `esp:0:${numero(atual.precoCusto)}`, label: `Especial ${moeda(numero(atual.precoCusto))}`, hint: 'tabela fora da vigência' });
  }
  opcoes.push({ value: 'manual', label: 'Manual', hint: 'digitar o custo' });
  return opcoes;
}

/** O valor do seletor para o item como ele está. */
export function escolhaDoItem(item: { tipoPreco: TipoPreco; precoCusto: number }, tabelas: TabelaVigente[]): string {
  if (item.tipoPreco === 'manual') return 'manual';
  if (item.tipoPreco !== 'especial') return 'padrao';
  const tabela = (tabelas ?? []).find((t) => t.custo === numero(item.precoCusto));
  return tabela ? chaveDaTabela(tabela) : `esp:0:${numero(item.precoCusto)}`;
}

/**
 * O que a escolha grava no item. Manual mantém o custo atual até a pessoa
 * digitar outro; padrão sem custo no Gestão de Custos vira 0 ("Sem custo").
 */
export function custoDaEscolha(escolha: string, padrao: CustoPadrao, custoAtual: number): { precoCusto: number; tipoPreco: TipoPreco } {
  if (escolha === 'manual') return { precoCusto: numero(custoAtual), tipoPreco: 'manual' };
  if (escolha.startsWith('esp:')) return { precoCusto: numero(escolha.split(':')[2]), tipoPreco: 'especial' };
  return { precoCusto: padrao.origem === 'gestao' ? padrao.valor : 0, tipoPreco: 'padrao' };
}

/** O selo da linha: ESP, MAN ou nada. */
export function seloDoCusto(tipo: TipoPreco): 'ESP' | 'MAN' | null {
  return tipo === 'especial' ? 'ESP' : tipo === 'manual' ? 'MAN' : null;
}
