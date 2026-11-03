// Bloco Itens do pedido aberto (spec 003; R-133 no desenho do SGC legado): o
// cabeçalho da análise de produtos com "Abrir tela ampla" e Recalcular, a
// lista enxuta dos itens (Produto, Pedido, Custo, Total) para quem só confere,
// o prazo de pagamento e o total. A tabela larga — a análise e a edição dos
// itens — vive na tela ampla (`TelaAmpla.tsx`).
//
// O estado (lista, edições, análise) é do `RascunhoProvider`; salvar continua
// sendo TRÊS chamadas (RNF-001). Montar a análise não grava nada (D-014).

import * as React from 'react';
import { ListPlus, Maximize2, RefreshCw } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, Code, Dash, EmptyState, Panel, PanelHeader, RowMeta, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { moeda } from '@/lib/formato';
import { custoPadraoDe, itemDeProdutoBuscado } from '@/lib/compras';
import { AVISO_ERRO_CUSTO, carregarCustoPadrao } from '@/lib/custo-padrao-carga';
import { contagemDeSaida } from '@/lib/analise-pedido';
import { seloDoCusto } from '@/lib/custo-do-item';
import { estaNoPedido, plural } from '@/lib/resumo-pedido';
import { coberturaDeLinha } from '@/lib/cobertura';
import { linhas } from '@/lib/mitra-api';
import { usePedido } from './pedido-contexto';
import { useRascunho } from './rascunho-contexto';
import BuscarProduto from './BuscarProduto';
import PrazoPagamento from './PrazoPagamento';
import TelaAmpla from './TelaAmpla';

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export default function AbaItens(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const r = useRascunho();
  const [buscando, setBuscando] = React.useState(false);
  const [telaAmpla, setTelaAmpla] = React.useState(false);

  const capa = r.capa;
  const noPedido = React.useMemo(() => r.itens.filter(estaNoPedido), [r.itens]);
  const saida = r.analise ? contagemDeSaida(r.analise.montados.map((base) => ({ base }))) : null;
  const reprovados = new Set((capa?.reprovacoes ?? []).flatMap((rep) => rep.produtos));

  function abrirTelaAmpla() {
    setTelaAmpla(true);
    // A análise só consulta quando a tela ampla abre pela primeira vez (ou ao recalcular).
    if (!r.analise && !r.carregandoAnalise) void r.montarAnalise();
  }

  // Recarregar o pedido (salvar, remover, incluir solicitação) mantém a capa e
  // a lista à vista: a tela ampla não pode fechar no meio da edição.
  if (r.carregando && !capa) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando os itens...</p>;
  }
  if (!capa) {
    return <Alert tone="error">{pedido.erro || 'Este card não tem um pedido de compra associado.'}</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      {r.erro && !telaAmpla ? <Alert tone="error">{r.erro}</Alert> : null}
      {r.avisoCusto && !telaAmpla ? <Alert tone="error">{r.avisoCusto}</Alert> : null}

      <Panel>
        <PanelHeader
          title={`Itens do pedido — ${moeda(r.total)}`}
          hint={r.salvoEm
            ? `Salvo às ${r.salvoEm}. ${plural(noPedido.length, 'item', 'itens')} no pedido.`
            : `${plural(noPedido.length, 'item', 'itens')} no pedido${r.alterados.length > 0 ? `, ${r.alterados.length} com alteração não salva` : ''}.`}
        >
          <Button variant="primary" size="sm" onClick={() => void r.salvar()} disabled={r.bloqueado || r.alterados.length === 0}>
            Salvar
          </Button>
        </PanelHeader>

        {/* O cabeçalho da análise de produtos: a tabela larga saiu do card estreito (R-133). */}
        <Toolbar>
          <span className="w-full text-[13px] text-ink-secondary">
            {r.carregandoAnalise
              ? 'Montando a análise...'
              : saida
                ? `${plural(saida.com, 'produto com saída', 'produtos com saída')} · ${saida.sem} sem saída`
                : 'Análise de produtos ainda não carregada'}
          </span>
          <Button size="sm" variant="primary" onClick={abrirTelaAmpla}>
            <Maximize2 aria-hidden />
            Abrir tela ampla
          </Button>
          <Button size="sm" onClick={() => void r.montarAnalise()} disabled={r.carregandoAnalise}>
            <RefreshCw aria-hidden />
            {r.analise ? 'Recalcular' : 'Montar a análise'}
          </Button>
          <Button size="sm" onClick={() => setBuscando(true)} disabled={r.bloqueado}>
            <ListPlus aria-hidden />
            Adicionar produto
          </Button>
        </Toolbar>

        {noPedido.length === 0 ? (
          <EmptyState
            title="Nenhum item no pedido ainda"
            hint="A tela ampla traz os produtos deste fornecedor nesta filial, com venda, estoque, trânsito, sugestão e cobertura já calculados. Nada é gravado até você salvar."
            action={<Button variant="primary" onClick={abrirTelaAmpla}>Abrir tela ampla</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th numeric>Pedido</Th>
                <Th numeric>Custo</Th>
                <Th numeric>Total</Th>
              </tr>
            </thead>
            <tbody>
              {noPedido.map((item) => {
                const selo = seloDoCusto(item.tipoPreco);
                return (
                  <Tr key={item.codprod}>
                    <Td className="min-w-0">
                      <span className="font-semibold break-words text-ink">{item.descricao}</span>
                      <RowMeta>
                        <Code prefix="cód.">{item.codprod}</Code> · {item.embalagem || '—'}
                      </RowMeta>
                      {item.solicitacaoDe || reprovados.has(item.codprod) ? (
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]">
                          {item.solicitacaoDe ? <Status tone="live">{`comercial · ${item.solicitacaoDe}`}</Status> : null}
                          {reprovados.has(item.codprod) ? <Status tone="alert">reprovado</Status> : null}
                        </span>
                      ) : null}
                    </Td>
                    <Td numeric className="whitespace-nowrap">{quantidade(item.qtPedida)}</Td>
                    <Td numeric className="whitespace-nowrap">
                      {item.precoCusto > 0 ? moeda(item.precoCusto) : <Dash />}
                      {selo ? <span className="block text-[11px] font-semibold text-attention">{selo}</span> : null}
                    </Td>
                    <Td numeric className="whitespace-nowrap">{moeda(item.qtPedida * item.precoCusto)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <PrazoPagamento
        cardId={ctx.card.id}
        codfornec={capa.codfornec}
        codfilial={capa.codfilial}
        vlTotal={r.total}
        prazoPadrao={capa.prazoPadrao}
        prazoAcordado={capa.prazoAcordado}
        prazoJustificativa={capa.prazoJustificativa}
        bloqueado={r.bloqueado}
        onSalvo={(prazo) => pedido.definirCapa({ ...capa, ...prazo })}
      />

      {buscando ? (
        <BuscarProduto
          codfilial={capa.codfilial}
          jaNaLista={r.itens.map((item) => item.codprod)}
          onFechar={() => setBuscando(false)}
          onEscolher={(linha) => {
            setBuscando(false);
            void (async () => {
              // D-32 (R-104): a parametrização da análise vale também ao produto da busca;
              // sem a análise carregada, uma leitura dela.
              const coberturas = r.analise?.coberturas
                ?? (await linhas('sgcCoberturaListar', { nivel: '', limite: 500, offset: 0 }).catch(() => [])).map(coberturaDeLinha);
              const novo = itemDeProdutoBuscado(linha, coberturas, capa.codfornec);
              // R-128: o custo do produto acrescentado vem do Gestão de Custos (1 execução).
              const custos = await carregarCustoPadrao([novo.codprod]);
              if (custos === null) r.setErro(AVISO_ERRO_CUSTO);
              r.adicionarItem({ ...novo, precoCusto: custoPadraoDe(custos, novo.codprod).valor });
            })();
          }}
        />
      ) : null}

      <TelaAmpla
        aberta={telaAmpla}
        onFechar={() => setTelaAmpla(false)}
        titulo={`${capa.fornecedor} · ${capa.filial || capa.codfilial}`}
      />
    </div>
  );
}
