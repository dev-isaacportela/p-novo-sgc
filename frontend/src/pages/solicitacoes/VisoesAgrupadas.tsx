// Visões agrupadas da fila (spec 017, RN-SOL-16 do legado): Por vendedor, Por
// fornecedor e Por filial. Quem agrupa é o servidor (P-08), sobre a fila inteira
// com os MESMOS filtros e o mesmo recorte do comercial da lista detalhada —
// duas execuções (`sgcSolicitacoesAgrupar` + `…Total`), só quando a visão é
// escolhida (RNF-02). Abrir o grupo é filtrar a lista (P-07): quem aplica o
// filtro é a página, por `onAbrir`.
import * as React from 'react';
import { Alert, Code, EmptyState, Pagination, RowMeta, Table, Td, TextLink, Th, Tr } from '@/components/page';
import { linha, linhas } from '@/lib/mitra-api';
import { fmtData } from '@/lib/formato';
import {
  COLUNAS_SITUACAO, ROTULO_DIMENSAO, filtroDoGrupo, linhaDoGrupo, particaoConfere,
  type Dimensao, type FiltroDoGrupo, type GrupoDeSolicitacoes,
} from '@/lib/solicitacoes-visoes';

const LIMITE = 20;

export default function VisoesAgrupadas({
  dimensao,
  filtros,
  onAbrir,
  onTotal,
}: {
  dimensao: Dimensao;
  /** Os filtros da lista, já com os padrões ('' no texto, '0' no número). */
  filtros: Record<string, string>;
  onAbrir: (filtro: FiltroDoGrupo) => void;
  /** O número de grupos, para a linha de contagens do cabeçalho. */
  onTotal?: (total: number) => void;
}) {
  const [pagina, setPagina] = React.useState(1);
  const [grupos, setGrupos] = React.useState<GrupoDeSolicitacoes[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const chaveFiltros = JSON.stringify(filtros);

  React.useEffect(() => {
    let vivo = true;
    const entrada = { ...JSON.parse(chaveFiltros), dimensao, limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) };
    Promise.all([linhas('sgcSolicitacoesAgrupar', entrada), linha('sgcSolicitacoesAgruparTotal', entrada)])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setGrupos(rows.map((r) => linhaDoGrupo(dimensao, r)));
        const contagem = Number(totalRow?.TOTAL ?? 0);
        setTotal(contagem);
        onTotal?.(contagem);
        setErro('');
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível agrupar as solicitações.');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [dimensao, chaveFiltros, pagina, onTotal]);

  const lastPage = Math.max(1, Math.ceil(total / LIMITE));
  const somaQueNaoFecha = grupos.some((g) => !particaoConfere(g));

  return (
    <>
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {somaQueNaoFecha ? (
        <Alert tone="warn">Em algum grupo as situações não somam o total — avise o TI; os números podem estar incompletos.</Alert>
      ) : null}

      {!carregando && grupos.length === 0 && !erro ? (
        <EmptyState title="Nenhuma solicitação para agrupar" hint="Ajuste a busca ou os filtros — o agrupamento conta só o que passa neles." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{ROTULO_DIMENSAO[dimensao]}</Th>
              <Th numeric>Total</Th>
              {/* Cabeçalho das situações quebra em duas linhas: em uma só, as dez colunas passam da largura do painel. */}
              {COLUNAS_SITUACAO.map((c) => <Th key={c.campo} numeric className="whitespace-normal">{c.label}</Th>)}
              <Th numeric>Mais recente</Th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <Tr key={grupo.chave}>
                <Td>
                  <TextLink
                    onClick={() => onAbrir(filtroDoGrupo(dimensao, grupo))}
                    title="Ver as solicitações deste grupo na lista"
                    className="text-left whitespace-nowrap"
                  >
                    {grupo.rotulo}
                  </TextLink>
                  <RowMeta>
                    {dimensao === 'vendedor' ? null : <><Code prefix="cód.">{grupo.chave}</Code> · </>}
                    {`${grupo.produtos} ${grupo.produtos === 1 ? 'produto' : 'produtos'}`}
                  </RowMeta>
                </Td>
                <Td numeric className="font-semibold text-ink">{grupo.total.toLocaleString('pt-BR')}</Td>
                {COLUNAS_SITUACAO.map((c) => (
                  <Td key={c.campo} numeric>{grupo[c.campo].toLocaleString('pt-BR')}</Td>
                ))}
                <Td numeric className="whitespace-nowrap">{fmtData(grupo.ultima)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pagination
        page={pagina}
        lastPage={lastPage}
        total={total}
        unit="grupos"
        busy={carregando}
        onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
        onNext={() => { setCarregando(true); setPagina((p) => Math.min(lastPage, p + 1)); }}
      />
    </>
  );
}
