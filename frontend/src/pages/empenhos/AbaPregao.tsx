// C-007: a aba Pregão do card — o pregão, o alerta de vigência e os OUTROS
// empenhos do mesmo pregão (o deste card fora), paginados.
import * as React from 'react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';

import { linhas } from '@/lib/mitra-api';
import { fmtData, moeda } from '@/lib/formato';
import { diasAte, hojeEmBrasilia, nivelDoPrazo, outrosEmpenhos } from '@/lib/empenhos';
import { Dash, EmptyState, Pagination, Status, Table, Td, Th, Tr } from '@/components/page';
import { cargaDoCard, useEmpenho } from '@/pages/empenhos/contexto';
import { pct } from '@/pages/empenhos/operacoes';

const POR_PAGINA = 10;
const TOM = { vencido: 'alert', critico: 'alert', atencao: 'attention' } as const;

export function TabelaEmpenhos({ empenhos }: { empenhos: Record<string, unknown>[] }) {
  return (
    <Table>
      <thead>
        <Tr><Th>Empenho</Th><Th>Filial</Th><Th>Recebimento</Th><Th>Limite</Th><Th>Fase</Th><Th numeric>Valor</Th><Th numeric>CMV</Th></Tr>
      </thead>
      <tbody>
        {empenhos.map((l) => (
          <Tr key={String(l.ID)}>
            <Td>{String(l.NUM_EMPENHO || '') || 'sem número'}</Td>
            <Td>{String(l.CODFILIAL ?? '')}</Td>
            <Td>{fmtData(String(l.DT_RECEBIMENTO ?? ''))}</Td>
            <Td>{l.DT_LIMITE ? fmtData(String(l.DT_LIMITE)) : <Dash />}</Td>
            <Td>{String(l.FASE_NOME ?? '')}</Td>
            <Td numeric>{moeda(Number(l.VL_TOTAL) || 0)}</Td>
            <Td numeric>{l.CMV_PERC === null || l.CMV_PERC === undefined ? <Dash /> : pct(Number(l.CMV_PERC))}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function AbaPregao({ ctx }: { ctx: ExtensaoContexto }) {
  const valor = useEmpenho();
  const carga = cargaDoCard(valor, ctx.card.id);
  const idPregao = Number(carga?.empenho?.ID_PREGAO) || 0;
  const [pagina, setPagina] = React.useState(1);
  const [dados, setDados] = React.useState<{ linhas: Record<string, unknown>[]; total: number } | null>(null);

  React.useEffect(() => {
    if (!idPregao) return undefined;
    let vivo = true;
    linhas('sgcEmpPregaoEmpenhos', { idPregao, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA })
      .then((rows) => vivo && setDados({ linhas: rows, total: Number(rows[0]?.TOTAL_REGISTROS) || 0 }))
      .catch(() => vivo && setDados({ linhas: [], total: 0 }));
    return () => {
      vivo = false;
    };
  }, [idPregao, pagina]);

  if (!carga) return <EmptyState title="Carregando o pregão..." />;
  const e = carga.empenho;
  if (!e) return <EmptyState title="Este card não tem pregão vinculado." />;
  const vigencia = nivelDoPrazo(diasAte(hojeEmBrasilia(), String(e.DT_VIGENCIA_FIM ?? '')), 'vigencia');
  const cardDoEmpenho = Number(e.ID_CARD) || ctx.card.id;
  const outros = outrosEmpenhos(dados?.linhas ?? [], cardDoEmpenho);
  const ultima = Math.max(1, Math.ceil((dados?.total ?? 0) / POR_PAGINA));

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
        <div><dt className="text-[12px] text-ink-secondary">Edital</dt><dd className="font-semibold text-ink">{String(e.CODIGO_EDITAL ?? '')}</dd></div>
        <div><dt className="text-[12px] text-ink-secondary">Órgão</dt><dd className="text-ink">{String(e.ORGAO ?? '')} ({String(e.CODCLI ?? '')})</dd></div>
        <div>
          <dt className="text-[12px] text-ink-secondary">Fim da vigência</dt>
          <dd className="flex flex-wrap items-center gap-2 text-ink">
            {e.DT_VIGENCIA_FIM ? fmtData(String(e.DT_VIGENCIA_FIM)) : <Dash />}
            {vigencia ? <Status tone={TOM[vigencia.nivel]}>{vigencia.texto}</Status> : null}
          </dd>
        </div>
      </dl>
      <h3 className="font-title text-[14px] font-bold text-ink">Outros empenhos do pregão</h3>
      {dados === null ? <p className="text-[13px] text-ink-secondary">Carregando...</p> : outros.length === 0 ? (
        <p className="text-[13px] text-ink-secondary">Nenhum outro empenho neste pregão.</p>
      ) : (
        <>
          <TabelaEmpenhos empenhos={outros} />
          {dados.total > POR_PAGINA ? (
            <Pagination page={pagina} lastPage={ultima} total={dados.total} unit="empenhos" onPrevious={() => setPagina((p) => p - 1)} onNext={() => setPagina((p) => p + 1)} />
          ) : null}
        </>
      )}
    </div>
  );
}
