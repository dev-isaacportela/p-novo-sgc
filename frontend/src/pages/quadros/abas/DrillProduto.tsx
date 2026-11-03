// O drill-in do produto no pedido (R-133): o nome do produto, na tela ampla,
// nos itens e nos cartões de solicitação, abre a MESMA janela Análise do
// Produto da 011 (`compras-inteligentes/analise-produto.tsx`), reaproveitada,
// com um bloco a mais no topo — "Item no pedido": quantidade, custo, total e
// observação editáveis, ou "Qtd. + Observação + Adicionar" quando o produto
// ainda não entrou. Tudo vai para o rascunho e só grava no Salvar.
//
// Só consulta ao abrir (`useAnaliseProduto`): abrir o card continua sendo
// `kbCardDetalhe` + `sgcPedidoCarregar`. A sugestão do bloco do topo é a da
// 003 (a do pedido); a simulação da janela segue a fórmula da 011.
import * as React from 'react';
import { Plus } from 'lucide-react';
import {
  Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, EmptyState, Input, LabelledField, MiniCartao, Panel,
} from '@/components/page';
import { hojeIso, moeda } from '@/lib/formato';
import { custoPadraoDe } from '@/lib/compras';
import type { ModeloPrevisao } from '@/lib/previsao';
import { tabelasVigentes } from '@/lib/custo-do-item';
import { estaNoPedido } from '@/lib/resumo-pedido';
import { AnaliseProdutoDialogo } from '@/pages/compras-inteligentes/analise-produto';
import { useAnaliseProduto } from '@/pages/compras-inteligentes/use-analise-produto';
import { useRascunho } from './rascunho-contexto';
import { SeletorDeCusto } from './SeletorDeCusto';

const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function DrillProduto({ codprod, onFechar }: { codprod: number; onFechar: () => void }) {
  const r = useRascunho();
  const [modelo, setModelo] = React.useState<ModeloPrevisao>('bestfit');
  const capa = r.capa;
  const analise = useAnaliseProduto({ codfornec: capa?.codfornec ?? 0, codfilial: capa?.codfilial ?? '', codprod, modelo });
  const fornecedor = capa?.fornecedor ?? '';

  // A sugestão do pedido (003) vem da análise do card: sem ela, o drill-in a pede ao abrir.
  const { analise: daAnalise, carregandoAnalise, montarAnalise } = r;
  React.useEffect(() => {
    if (codprod > 0 && !daAnalise && !carregandoAnalise) void montarAnalise();
  }, [codprod, daAnalise, carregandoAnalise, montarAnalise]);

  if (!analise.linha) {
    return (
      <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Análise do produto</DialogTitle></DialogHeader>
          <DialogBody>
            {analise.erro
              ? <EmptyState title={analise.erro} />
              : <EmptyState title="Carregando a análise do produto..." hint="Venda, estoque, trânsito, previsão e custos deste produto nesta filial." />}
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <AnaliseProdutoDialogo
      linha={analise.linha}
      codfilial={capa?.codfilial ?? ''}
      fornecedor={fornecedor}
      hoje={analise.hoje}
      dados={analise.dados}
      semPublico
      referencia="unidades"
      desconsideradas={analise.desconsideradas}
      periodo={analise.periodo}
      pedidoMinimo={0}
      podeOperar={!r.bloqueado}
      podeParametrizar={false}
      motivoBloqueio={r.bloqueado ? 'O pedido não pode ser editado agora.' : 'Os parâmetros de compra se ajustam na tela Compras inteligentes.'}
      onFechar={onFechar}
      onAdicionar={(_linha, quantidade) => r.adicionar(codprod, quantidade)}
      onParametros={() => undefined}
      onRestaurar={() => undefined}
      onDesconsiderar={analise.desconsiderar}
      onReconsiderar={analise.reconsiderar}
      previsao={analise.previsao}
      modelo={modelo}
      onModelo={setModelo}
      projetada={analise.projetada}
      sugestoesEspeciais={analise.sugestoes}
      onAdicionarEspecial={(tabela, quantidade) => r.adicionar(codprod, quantidade, { precoCusto: tabela.custoEspecial, tipoPreco: 'especial' })}
      lotesBloqueados={analise.lotes}
      excessosLista={analise.excessos}
      rotuloAdicionar="Adicionar ao pedido"
      topo={<ItemNoPedido codprod={codprod} />}
    />
  );
}

/** "Item no pedido": o item como está no rascunho, ou o que falta para ele entrar. */
function ItemNoPedido({ codprod }: { codprod: number }) {
  const r = useRascunho();
  const hoje = hojeIso();
  const item = r.itens.find((i) => i.codprod === codprod && estaNoPedido(i)) ?? null;
  const montado = r.analise?.montados.find((m) => m.codprod === codprod) ?? null;
  const [qt, setQt] = React.useState<number | null>(null);
  const [observacao, setObservacao] = React.useState('');
  const quantidade = qt ?? montado?.qtSugerida ?? 0;
  const padrao = custoPadraoDe(r.analise?.custos, codprod);
  const tabelas = tabelasVigentes(r.analise?.especiais ?? [], codprod, hoje);

  if (item) {
    return (
      <Panel>
        <div className="flex flex-col gap-3 p-4">
          <span className="font-title text-[13px] font-bold text-ink">Item no pedido</span>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <LabelledField label="Quantidade">
              <Input
                type="number"
                min={0}
                className="text-right"
                value={String(item.qtPedida)}
                disabled={r.bloqueado}
                onChange={(e) => r.alterar(codprod, { qtPedida: Math.max(0, Number(e.target.value) || 0) })}
              />
            </LabelledField>
            <LabelledField label="Custo">
              <SeletorDeCusto
                rotulo={item.descricao}
                tipoPreco={item.tipoPreco}
                precoCusto={item.precoCusto}
                padrao={padrao}
                tabelas={tabelas}
                disabled={r.bloqueado}
                onEscolher={(custo) => r.alterar(codprod, custo)}
              />
            </LabelledField>
            <MiniCartao rotulo="Total" valor={moeda(item.qtPedida * item.precoCusto)} hint={`sugestão do pedido ${fmt(item.qtSugerida)}`} />
            <LabelledField label="Observação">
              <Input value={item.observacao} maxLength={500} disabled={r.bloqueado} onChange={(e) => r.alterar(codprod, { observacao: e.target.value })} />
            </LabelledField>
          </div>
          <span className="text-[12px] text-ink-secondary">As mudanças entram no rascunho do pedido e gravam no Salvar.</span>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col gap-3 p-4">
        <span className="font-title text-[13px] font-bold text-ink">Este produto não está no pedido</span>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <LabelledField label="Qtd." hint={montado ? `sugestão do pedido ${fmt(montado.qtSugerida)}` : undefined}>
              <Input type="number" min={0} className="text-right" value={String(quantidade)} disabled={r.bloqueado} onChange={(e) => setQt(Math.max(0, Number(e.target.value) || 0))} />
            </LabelledField>
          </div>
          <div className="min-w-48 flex-1">
            <LabelledField label="Observação">
              <Input value={observacao} maxLength={500} disabled={r.bloqueado} onChange={(e) => setObservacao(e.target.value)} />
            </LabelledField>
          </div>
          <Button
            variant="primary"
            disabled={r.bloqueado || !montado || quantidade <= 0}
            title={!montado ? 'Carregando a análise do pedido...' : undefined}
            onClick={() => r.adicionar(codprod, quantidade, observacao.trim() ? { observacao: observacao.trim() } : {})}
          >
            <Plus aria-hidden />
            Adicionar
          </Button>
        </div>
      </div>
    </Panel>
  );
}
