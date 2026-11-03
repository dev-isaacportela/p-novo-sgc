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
  AlternaOpcoes, Badge, Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, EmptyState, Input, Panel, TextLink,
} from '@/components/page';
import { hojeIso, moeda } from '@/lib/formato';
import { arredondarPorCaixa, custoPadraoDe } from '@/lib/compras';
import type { ModeloPrevisao } from '@/lib/previsao';
import { quantidadeNaReferencia, rotuloDaQuantidade, unidadesDaDigitada, type ReferenciaSugestao } from '@/lib/ressuprimento';
import { tabelasVigentes } from '@/lib/custo-do-item';
import { estaNoPedido } from '@/lib/resumo-pedido';
import { AnaliseProdutoDialogo } from '@/pages/compras-inteligentes/analise-produto';
import { useAnaliseProduto } from '@/pages/compras-inteligentes/use-analise-produto';
import { ClientesQueCompraram } from '@/pages/compras-inteligentes/clientes-ui';
import { linhas } from '@/lib/mitra-api';
import { janelaDosClientes, type NotaDoProduto } from '@/lib/clientes-produto';
import { useRascunho } from './rascunho-contexto';
import { SeletorDeCusto } from './SeletorDeCusto';

const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function DrillProduto({ codprod, onFechar }: { codprod: number; onFechar: () => void }) {
  const r = useRascunho();
  const [modelo, setModelo] = React.useState<ModeloPrevisao>('bestfit');
  // R-138: a quantidade do bloco do topo e a simulação seguem a mesma referência (C-037), em caixas como a tela ampla.
  const [referencia, setReferencia] = React.useState<ReferenciaSugestao>('caixas');
  const capa = r.capa;
  const analise = useAnaliseProduto({ codfornec: capa?.codfornec ?? 0, codfilial: capa?.codfilial ?? '', codprod, modelo });
  const fornecedor = capa?.fornecedor ?? '';

  // R-135: as notas de venda válida do produto nos 6 meses do gráfico, sem o público — uma consulta ao abrir.
  const codfilial = capa?.codfilial ?? '';
  const [notas, setNotas] = React.useState<{ chave: string; linhas: NotaDoProduto[] | null; erro: string } | null>(null);
  const chaveNotas = `${codprod}|${codfilial}`;
  React.useEffect(() => {
    if (!codprod || !codfilial) return;
    let vivo = true;
    const janela = janelaDosClientes(hojeIso());
    linhas('sgcWintProdutoVendasNotas', { codprod, codfilial, dataInicio: janela.inicio, dataFim: janela.fim, incluirPublico: 0 }).then(
      (rows) => { if (vivo) setNotas({ chave: chaveNotas, linhas: rows as unknown as NotaDoProduto[], erro: '' }); },
      () => { if (vivo) setNotas({ chave: chaveNotas, linhas: [], erro: 'Não foi possível carregar os clientes deste produto.' }); },
    );
    return () => { vivo = false; };
  }, [codprod, codfilial, chaveNotas]);
  const notasDoProduto = notas && notas.chave === chaveNotas ? notas : null;

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
      referencia={referencia}
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
      depoisDoGrafico={(
        <ClientesQueCompraram
          notas={notasDoProduto?.linhas ?? null}
          erro={notasDoProduto?.erro}
          hoje={analise.hoje}
          unidadesPorCaixa={analise.linha.unidadesPorCaixa}
        />
      )}
      rotuloAdicionar="Adicionar ao pedido"
      topo={<ItemNoPedido codprod={codprod} unPorCaixa={analise.linha.unidadesPorCaixa} referencia={referencia} onReferencia={setReferencia} />}
    />
  );
}

/** O campo de quantidade estreito, à direita, com "cx" ou "un." dentro (R-138, C-037). */
function CampoQuantidade({ unidades, unPorCaixa, referencia, disabled, rotulo, onUnidades }: {
  unidades: number; unPorCaixa: number; referencia: ReferenciaSugestao; disabled: boolean; rotulo: string; onUnidades: (un: number) => void;
}) {
  const sufixo = rotuloDaQuantidade(unPorCaixa, referencia);
  return (
    <span className="relative block">
      <Input
        type="number"
        min={0}
        className="pr-9 text-right"
        aria-label={`${rotulo} (${sufixo})`}
        value={String(quantidadeNaReferencia(unidades, unPorCaixa, referencia))}
        disabled={disabled}
        onChange={(e) => onUnidades(Math.max(0, unidadesDaDigitada(Number(e.target.value) || 0, unPorCaixa, referencia)))}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ink-muted">{sufixo}</span>
    </span>
  );
}

/**
 * "Item no pedido" (R-133; layout da R-138): UMA linha alinhada pela base —
 * [Qtd.] [Custo] [Observação, que estica] [ação] —, rótulos na mesma altura,
 * campos e botão da altura do Input; a sugestão vira um link abaixo da linha;
 * em tela estreita, os campos empilham.
 */
function ItemNoPedido({ codprod, unPorCaixa, referencia, onReferencia }: {
  codprod: number; unPorCaixa: number; referencia: ReferenciaSugestao; onReferencia: (r: ReferenciaSugestao) => void;
}) {
  const r = useRascunho();
  const hoje = hojeIso();
  const item = r.itens.find((i) => i.codprod === codprod && estaNoPedido(i)) ?? null;
  const montado = r.analise?.montados.find((m) => m.codprod === codprod) ?? null;
  const [qt, setQt] = React.useState<number | null>(null);
  const [observacao, setObservacao] = React.useState('');
  // Em caixas, a sugestão fecha a caixa (como a Caixa cheia da tela ampla).
  const sugestao = referencia === 'caixas' ? arredondarPorCaixa(montado?.qtSugerida ?? 0, unPorCaixa) : montado?.qtSugerida ?? 0;
  const quantidade = qt ?? sugestao;
  const padrao = custoPadraoDe(r.analise?.custos, codprod);
  const tabelas = tabelasVigentes(r.analise?.especiais ?? [], codprod, hoje);
  const caixa = unPorCaixa > 1 ? unPorCaixa : 0;
  const textoSug = caixa ? `${fmt(montado?.qtSugerida ?? 0)} un. · ${fmt(Math.ceil((montado?.qtSugerida ?? 0) / caixa))} cx` : `${fmt(sugestao)} un.`;
  const linha = 'flex flex-col gap-3 sm:flex-row sm:items-end';
  const rotulo = 'text-[12px] font-semibold text-ink-secondary';

  return (
    <Panel>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-title text-[13px] font-bold text-ink">
            {item ? `No pedido: ${fmt(item.qtPedida)} un. · ${moeda(item.qtPedida * item.precoCusto)}` : 'Este produto não está no pedido'}
          </span>
          <Badge tone={item ? 'accent' : 'neutral'}>{item ? 'no pedido' : 'fora do pedido'}</Badge>
          {r.alterados.includes(codprod) ? <span className="text-[12px] text-attention">alteração não salva</span> : null}
          {unPorCaixa > 1 ? (
            <span className="ml-auto">
              <AlternaOpcoes rotulo="Unidade da quantidade" valor={referencia} onValor={onReferencia} opcoes={[{ value: 'unidades', label: 'Unidades' }, { value: 'caixas', label: 'Caixas' }]} />
            </span>
          ) : null}
        </div>

        <div className={linha}>
          <div className="flex flex-col gap-1 sm:w-32 sm:shrink-0">
            <span className={rotulo}>Qtd.</span>
            <CampoQuantidade
              rotulo="Quantidade"
              unidades={item ? item.qtPedida : quantidade}
              unPorCaixa={unPorCaixa}
              referencia={referencia}
              disabled={r.bloqueado}
              onUnidades={(un) => (item ? r.alterar(codprod, { qtPedida: un }) : setQt(un))}
            />
          </div>
          {item ? (
            <div className="flex flex-col gap-1 sm:w-64 sm:shrink-0">
              <span className={rotulo}>Custo</span>
              <SeletorDeCusto
                rotulo={item.descricao}
                tipoPreco={item.tipoPreco}
                precoCusto={item.precoCusto}
                padrao={padrao}
                tabelas={tabelas}
                disabled={r.bloqueado}
                altura="h-9"
                onEscolher={(custo) => r.alterar(codprod, custo)}
              />
            </div>
          ) : null}
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={rotulo}>Observação</span>
            <Input
              value={item ? item.observacao : observacao}
              maxLength={500}
              disabled={r.bloqueado}
              onChange={(e) => (item ? r.alterar(codprod, { observacao: e.target.value }) : setObservacao(e.target.value))}
            />
          </label>
          {item ? (
            <Button variant="primary" className="sm:shrink-0" disabled={r.bloqueado || r.alterados.length === 0} onClick={() => void r.salvar()}>
              Salvar
            </Button>
          ) : (
            <Button
              variant="primary"
              className="sm:shrink-0"
              disabled={r.bloqueado || !montado || quantidade <= 0}
              title={!montado ? 'Carregando a análise do pedido...' : undefined}
              onClick={() => r.adicionar(codprod, quantidade, observacao.trim() ? { observacao: observacao.trim() } : {})}
            >
              <Plus aria-hidden />
              Adicionar
            </Button>
          )}
        </div>

        {montado ? (
          <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-ink-secondary">
            <TextLink
              className="text-[12px]"
              disabled={r.bloqueado}
              onClick={() => (item ? r.alterar(codprod, { qtPedida: sugestao }) : setQt(sugestao))}
            >
              {`usar sugestão (${textoSug})`}
            </TextLink>
            <span>{item ? 'As mudanças entram no rascunho; Salvar grava o pedido.' : 'Adicionar põe o produto no rascunho do pedido.'}</span>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
