// "Análise para aprovação" nas fases Aprovação Técnica e Diretoria (R-150,
// C-047 da 002), no molde do legado (PipeWorkspace.tsx:10215-10316): a faixa
// de decisão em cima e os indicadores do pedido recolhidos, cada um abrindo
// os produtos que o compõem (o drill-in). Fica ANTES do bloco Itens, que é da
// Análise e segue em leitura nas aprovações.
//
// Os números vêm dos itens (`lib/aprovacao.ts`), sem execução nova. O compras
// × vendas do fornecedor (R-156, P-1: sem meta de compras) é a única leitura a
// mais, e só quando a seção abre: `sgcWintComprasVsVendas` da 009, no período
// de vendas do pedido.
import * as React from 'react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  CartaoLinha, Disclosure, GradeMini, ListaCartoes, MetaDot, MiniCartao, Panel, PanelHeader, SecaoRecolhivel,
} from '@/components/page';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import { linhas } from '@/lib/mitra-api';
import { mesesDoPeriodo } from '@/lib/compras';
import { analiseParaAprovacao, comprasVsVendasDoFornecedor, type ComprasVsVendas, type Indicador } from '@/lib/aprovacao';
import { rotuloPercentual } from '@/lib/resumo-do-pedido';
import { usePedido } from './pedido-contexto';

const dias = (valor: number | null) => (valor === null ? '—' : `${numeroPt(valor)} d`);

export default function BlocoAprovacao(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const [indicadoresAbertos, setIndicadoresAbertos] = React.useState(false);
  const [detalhe, setDetalhe] = React.useState('');
  const [cvAberto, setCvAberto] = React.useState(false);
  const [cv, setCv] = React.useState<{ estado: 'nada' | 'lendo' | 'pronto' | 'erro'; dados: ComprasVsVendas | null; erro: string }>({ estado: 'nada', dados: null, erro: '' });

  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  const analise = React.useMemo(
    () => analiseParaAprovacao(pedido.itens, mesesDoPeriodo(capa?.periodoInicio ?? '', capa?.periodoFim ?? '')),
    [pedido.itens, capa?.periodoInicio, capa?.periodoFim],
  );
  if (!capa) return null;

  async function abrirComprasVsVendas() {
    setCvAberto((atual) => !atual);
    if (cv.estado !== 'nada' || !capa) return;
    setCv({ estado: 'lendo', dados: null, erro: '' });
    try {
      const ranking = await linhas('sgcWintComprasVsVendas', {
        codfilial: capa.codfilial, dataInicio: capa.periodoInicio, dataFim: capa.periodoFim, limite: 1000,
      });
      setCv({ estado: 'pronto', dados: comprasVsVendasDoFornecedor(ranking, capa.codfornec, analise.total), erro: '' });
    } catch (falha) {
      setCv({ estado: 'erro', dados: null, erro: falha instanceof Error ? falha.message : 'Não foi possível ler o WinThor.' });
    }
  }
  const pct = (valor: number | null) => (valor === null ? '—' : rotuloPercentual(valor));

  const porChave = Object.fromEntries(analise.indicadores.map((ind) => [ind.chave, ind]));
  const acima = porChave.cobertura as Indicador;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Análise para aprovação" hint={`Pedido em análise: ${moeda(analise.total)}`} />
        <div className="p-4">
          <GradeMini colunas={4}>
            <MiniCartao rotulo="Itens" valor={analise.indicadores[0].quantidade} hint={`${porChave.comercial.quantidade} do comercial`} />
            <MiniCartao
              rotulo="Cobertura média"
              valor={dias(analise.coberturaApos)}
              hint={`atual ${dias(analise.coberturaAtual)}`}
              title="Média da cobertura dos itens com venda: hoje e depois de a compra chegar."
            />
            <MiniCartao
              rotulo="Acima do limite"
              valor={acima.quantidade}
              tone={acima.quantidade > 0 ? 'attention' : 'neutral'}
              hint={moeda(porChave['cobertura-valor'].quantidade)}
              title="Itens cuja cobertura passa o limite da curva, com o valor deles."
            />
            <MiniCartao rotulo="Preço especial" valor={moeda(analise.especialValor)} hint={`${rotuloPercentual(analise.especialPct)} do pedido`} />
          </GradeMini>
        </div>
      </Panel>

      <SecaoRecolhivel
        titulo="Compras × vendas do fornecedor"
        resumo={`Na filial, de ${fmtData(capa.periodoInicio)} a ${fmtData(capa.periodoFim)} — consulta o WinThor ao abrir`}
        aberta={cvAberto}
        onToggle={() => void abrirComprasVsVendas()}
      >
        {cv.estado === 'lendo' || cv.estado === 'nada' ? (
          <p className="text-[12px] text-ink-secondary">Consultando o WinThor...</p>
        ) : cv.estado === 'erro' ? (
          <p className="text-[12px] text-destructive">{cv.erro}</p>
        ) : !cv.dados ? (
          <p className="text-[12px] text-ink-secondary">O fornecedor não teve compra nem venda nesta filial no período.</p>
        ) : (
          <GradeMini colunas={4}>
            <MiniCartao rotulo="Comprado" valor={moeda(cv.dados.comprado)} hint="no período" />
            <MiniCartao rotulo="Vendido" valor={moeda(cv.dados.vendido)} hint="no período" />
            <MiniCartao rotulo="Compras × vendas" valor={pct(cv.dados.pctAtual)} hint="hoje" />
            <MiniCartao
              rotulo="Depois deste pedido"
              valor={pct(cv.dados.pctApos)}
              tone={(cv.dados.pctApos ?? 0) > 100 ? 'attention' : 'neutral'}
              hint={`+${moeda(analise.total)}`}
            />
          </GradeMini>
        )}
      </SecaoRecolhivel>

      <SecaoRecolhivel
        titulo="Indicadores do pedido"
        resumo={`${analise.indicadores.length} indicadores · ${porChave.acima.quantidade} acima e ${porChave.abaixo.quantidade} abaixo da sugestão · ${porChave.ruptura.quantidade} em ruptura`}
        aberta={indicadoresAbertos}
        onToggle={() => setIndicadoresAbertos((atual) => !atual)}
      >
        <div className="-m-4">
          {analise.indicadores.map((ind) => (
            <Disclosure
              key={ind.chave}
              titulo={ind.rotulo}
              resumo={ind.emValor ? moeda(ind.quantidade) : String(ind.quantidade)}
              aberta={detalhe === ind.chave}
              onToggle={() => setDetalhe((atual) => (atual === ind.chave ? '' : ind.chave))}
            >
              {ind.produtos.length === 0 ? (
                <p className="text-[12px] text-ink-secondary">Nenhum item neste indicador.</p>
              ) : (
                <div className="-mx-4">
                  <ListaCartoes rotulo={ind.rotulo}>
                    {ind.produtos.map((p) => (
                      <CartaoLinha
                        key={p.codprod}
                        titulo={p.descricao}
                        meta={<>Código {p.codprod} <MetaDot /> pedida {numeroPt(p.qtPedida)} <MetaDot /> sugerida {numeroPt(p.qtSugerida)}</>}
                        valor={moeda(p.valor)}
                        valorMeta={`cobertura ${dias(p.coberturaAtual)} → ${dias(p.coberturaApos)}`}
                      />
                    ))}
                  </ListaCartoes>
                </div>
              )}
            </Disclosure>
          ))}
        </div>
      </SecaoRecolhivel>
    </div>
  );
}
