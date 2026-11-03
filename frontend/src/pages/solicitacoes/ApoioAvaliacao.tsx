// Apoio à avaliação (spec 017, RN-SOL-19 do legado), dentro da janela Avaliar
// da fila (P-01): as vendas do produto na filial da solicitação — o gráfico da
// R-139 (`VendasNaFilial`), que "vale para todo o SGC" —, os cinco clientes que
// mais compraram nos mesmos meses (a regra da R-135), onde está o cliente da
// solicitação e o que está a caminho na filial.
//
// RNF-01: três leituras ao abrir, todas já publicadas pelo add-013 — o
// histórico mensal (dentro do `VendasNaFilial`, com o cache dele), as notas por
// cliente e a posição por filial (os dois caches abaixo, por chave, enquanto a
// página estiver aberta). RN-06: cada uma falha sozinha e diz que falhou; o
// apoio informa, não trava a decisão.
import * as React from 'react';
import { Code, EmptyState, RowMeta, Table, Td, Th, Tr } from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtData, hojeIso } from '@/lib/formato';
import type { NotaDoProduto } from '@/lib/clientes-produto';
import {
  cincoMaiores, clienteNoApoio, clientesDoApoio, estoqueNoApoio, fraseDoCliente, janelaDoApoio, listaParcial,
  type EstoqueDaFilial,
} from '@/lib/solicitacoes-apoio';
import { cn } from '@/lib/utils';
import { VendasNaFilial } from '@/pages/compras-inteligentes/vendas-filial-ui';

const notasPorChave = new Map<string, Promise<NotaDoProduto[]>>();
const estoquesPorProduto = new Map<number, Promise<EstoqueDaFilial[]>>();

function lembrar<K, T>(cache: Map<K, Promise<T>>, chave: K, buscar: () => Promise<T>): Promise<T> {
  let pedido = cache.get(chave);
  if (!pedido) {
    pedido = buscar();
    pedido.catch(() => cache.delete(chave));
    cache.set(chave, pedido);
  }
  return pedido;
}

/** Uma leitura com o seu próprio estado: `undefined` carregando, `null` falhou. */
type Leitura<T> = { chave: string; valor: T | null } | null;
const valorDe = <T,>(leitura: Leitura<T>, chave: string): T | null | undefined =>
  (leitura && leitura.chave === chave ? leitura.valor : undefined);

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function ApoioAvaliacao({
  codprod,
  codfilial,
  filial,
  codcli,
}: {
  codprod: number;
  codfilial: string;
  filial: string;
  codcli: number;
}) {
  const hoje = hojeIso();
  const janela = React.useMemo(() => janelaDoApoio(hoje), [hoje]);

  const chaveNotas = `${codprod}|${codfilial}|${janela.inicio}|${janela.fim}`;
  const [leituraNotas, setLeituraNotas] = React.useState<Leitura<NotaDoProduto[]>>(null);
  const [leituraEstoques, setLeituraEstoques] = React.useState<Leitura<EstoqueDaFilial[]>>(null);

  React.useEffect(() => {
    let vivo = true;
    lembrar(notasPorChave, chaveNotas, () => linhas('sgcWintProdutoVendasNotas', {
      codprod, codfilial, dataInicio: janela.inicio, dataFim: janela.fim, incluirPublico: 0,
    }).then((rows) => rows as unknown as NotaDoProduto[])).then(
      (valor) => { if (vivo) setLeituraNotas({ chave: chaveNotas, valor }); },
      () => { if (vivo) setLeituraNotas({ chave: chaveNotas, valor: null }); },
    );
    return () => { vivo = false; };
  }, [chaveNotas, codprod, codfilial, janela.inicio, janela.fim]);

  React.useEffect(() => {
    let vivo = true;
    lembrar(estoquesPorProduto, codprod, () => linhas('sgcWintProdutoEstoqueFiliais', { codprod })
      .then((rows) => rows as unknown as EstoqueDaFilial[])).then(
      (valor) => { if (vivo) setLeituraEstoques({ chave: String(codprod), valor }); },
      () => { if (vivo) setLeituraEstoques({ chave: String(codprod), valor: null }); },
    );
    return () => { vivo = false; };
  }, [codprod]);

  const notas = valorDe(leituraNotas, chaveNotas);
  const estoques = valorDe(leituraEstoques, String(codprod));
  const clientes = React.useMemo(() => clientesDoApoio(notas ?? [], janela.meses), [notas, janela.meses]);
  const cinco = cincoMaiores(clientes);
  const posicao = clienteNoApoio(clientes, codcli);
  // Sem cliente é dito na hora; o resto espera as notas (carregando não é "não comprou").
  const frase = posicao.situacao === 'sem_cliente' || notas ? fraseDoCliente(posicao) : null;
  const estoque = estoques ? estoqueNoApoio(estoques, codfilial) : null;
  const semEstoque = estoques === undefined
    ? 'estoque: carregando...'
    : estoques === null ? 'estoque: não foi possível ler' : 'sem posição de estoque nesta filial';

  return (
    <section className="flex flex-col gap-3" aria-label="Apoio à avaliação">
      <div>
        <h3 className="font-title text-[15px] font-bold text-ink">Apoio à avaliação</h3>
        <RowMeta>{`Venda válida do produto em ${filial}, sem órgão público e sem venda entre filiais.`}</RowMeta>
      </div>

      <VendasNaFilial
        codprod={codprod}
        codfilial={codfilial}
        filial={filial}
        estoque={estoque ? estoque.disponivel : null}
        semEstoque={semEstoque}
        semPublico
      />

      <div className="flex flex-col gap-2 rounded-xl border border-rule-row bg-card px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[12px] font-semibold text-ink">Os 5 clientes que mais compraram · mesmos meses do gráfico</span>
          {estoque ? (
            <span className="text-[12px] text-ink-secondary">
              a caminho <span className="font-semibold text-ink">{`${quantidade(estoque.aCaminho)} un.`}</span> (pedido + trânsito)
            </span>
          ) : null}
        </div>

        {notas === undefined ? (
          <EmptyState title="Carregando os clientes..." />
        ) : notas === null ? (
          <EmptyState title="Não foi possível carregar os clientes deste produto." />
        ) : cinco.length === 0 ? (
          <EmptyState title="Nenhuma venda a cliente privado nesta filial nos meses do gráfico" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th numeric>Qtd.</Th>
                <Th numeric>Notas</Th>
                <Th numeric>Última</Th>
              </tr>
            </thead>
            <tbody>
              {cinco.map((c) => {
                const daSolicitacao = posicao.situacao === 'entre_os_cinco' && c.codcli === Number(codcli);
                return (
                  <Tr
                    key={c.codcli}
                    aria-selected={daSolicitacao}
                    className={cn('border-l-4', daSolicitacao ? 'border-l-primary bg-accent' : 'border-l-transparent')}
                  >
                    <Td className="py-2">
                      <Code>{c.codcli}</Code> <span className="font-semibold text-ink">{c.cliente}</span>
                      {daSolicitacao ? <RowMeta>cliente desta solicitação</RowMeta> : null}
                    </Td>
                    <Td numeric className="py-2 whitespace-nowrap">{`${quantidade(c.quantidade)} un.`}</Td>
                    <Td numeric className="py-2">{c.notas.length}</Td>
                    <Td numeric className="py-2 whitespace-nowrap">{fmtData(c.ultimaCompra)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {frase ? <RowMeta>{frase}</RowMeta> : null}
        {listaParcial(notas ?? null) ? (
          <RowMeta>Lista parcial: a filial tem mais de 3.000 notas deste produto na janela, e as mais recentes ficaram de fora.</RowMeta>
        ) : null}
      </div>
    </section>
  );
}
