// Spec 013 — aba Sem venda (RF-006): produto ativo com estoque e sem venda
// válida há N dias, com o valor parado e o plano de ação. Abrir custa três
// chamadas: a lista, os planos da PÁGINA (uma só, RNF-002) e o resumo dos planos.
import * as React from 'react';
import {
  Alert, Code, Dash, EmptyState, Field, GradeKpi, Kpi, Pagination, Panel, RowMeta, RowTitle, SelectMenu, Status,
  Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import {
  CORTES_SEM_VENDA, JANELA_MOVIMENTACAO_DIAS, TAMANHO_PAGINA, chavePlano, listaCodprods, mapaDePlanos,
  rotuloDiasSemVenda, tomDiasSemVenda, totalDe, ultimaPagina,
} from '@/lib/movimentacao';
import { useCarga, usePagina, type FiltrosMov } from './carga';
import { CelulaPlano } from './comuns';
import PlanoAcaoDialogo, { type AlvoPlano } from './PlanoAcaoDialogo';

const OPCOES_CORTE = CORTES_SEM_VENDA.map((d) => ({ value: String(d), label: `${d} dias ou mais` }));
const OPCOES_ESTOQUE = [{ value: '1', label: 'Somente com estoque' }, { value: '0', label: 'Todos' }];

export default function SemVendaTab({
  filtros, hoje, podeGravar, responsaveis,
}: {
  filtros: FiltrosMov;
  hoje: string;
  podeGravar: boolean;
  responsaveis: { value: string; label: string }[];
}) {
  const [corte, setCorte] = React.useState('90');
  const [estoque, setEstoque] = React.useState('1');
  const [pagina, setPagina] = usePagina(JSON.stringify([filtros, corte, estoque]));
  const [alvo, setAlvo] = React.useState<AlvoPlano | null>(null);
  const [aviso, setAviso] = React.useState('');

  const carregar = React.useCallback(async () => {
    const [rows, resumo] = await Promise.all([
      linhas('sgcWintMovSemVenda', {
        ...filtros, diasSemVenda: Number(corte), somenteComEstoque: Number(estoque), janelaDias: JANELA_MOVIMENTACAO_DIAS,
        limite: TAMANHO_PAGINA, offset: (pagina - 1) * TAMANHO_PAGINA,
      }),
      linhas('sgcMovPlanosResumo', { origem: 'sem_venda', codfilial: filtros.codfilial, hoje }),
    ]);
    const planos = rows.length
      ? await linhas('sgcMovPlanosListar', { origem: 'sem_venda', codfilial: filtros.codfilial, codprods: listaCodprods(rows), limite: TAMANHO_PAGINA, offset: 0 })
      : [];
    return { rows, planos: mapaDePlanos(planos), resumo: resumo[0] ?? {} };
  }, [filtros, corte, estoque, pagina, hoje]);
  const { dados, erro, carregando, recarregar } = useCarga(carregar);

  const rows = dados?.rows ?? [];
  const total = totalDe(rows);
  const comPlano = rows.filter((r) => dados?.planos.has(chavePlano(r.CODPROD, r.CODFILIAL))).length;
  const planoDoAlvo = alvo ? dados?.planos.get(chavePlano(alvo.codprod, alvo.codfilial)) ?? null : null;

  return (
    <>
      <GradeKpi>
        <Kpi rotulo="Produtos sem venda" valor={carregando ? <Dash /> : numeroPt(total)} hint={`corte de ${corte} dias, na filial ${filtros.codfilial}`} />
        <Kpi rotulo="Valor parado" valor={carregando ? <Dash /> : moeda(totalDe(rows, 'TOTAL_VALOR'))} hint="estoque × custo da última entrada, no recorte inteiro" />
        <Kpi rotulo="Com plano" valor={carregando ? <Dash /> : `${comPlano} de ${rows.length}`} hint="nesta página" />
        <Kpi rotulo="Acompanhamentos vencidos" valor={carregando ? <Dash /> : numeroPt(Number(dados?.resumo.VENCIDOS ?? 0))} hint="planos da filial com data passada e não concluídos" />
      </GradeKpi>

      <Panel className="mt-4">
        <Toolbar>
          <Field label="Sem venda há" className="w-52">
            <SelectMenu label="Sem venda há" value={corte} onChange={setCorte} options={OPCOES_CORTE} />
          </Field>
          <Field label="Estoque" className="w-52">
            <SelectMenu label="Estoque" value={estoque} onChange={setEstoque} options={OPCOES_ESTOQUE} />
          </Field>
        </Toolbar>
        {aviso ? <Toolbar className="border-0"><Alert tone="success">{aviso}</Alert></Toolbar> : null}
        {erro ? <Toolbar className="border-0"><Alert tone="error">Não foi possível ler o ERP: {erro}</Alert></Toolbar> : null}

        {!carregando && rows.length === 0 && !erro ? (
          <EmptyState title="Nenhum produto parado neste recorte" hint="Diminua o corte de dias, troque a filial ou tire o filtro de fornecedor." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th numeric>Estoque</Th>
                <Th numeric>Valor parado</Th>
                <Th>Última venda</Th>
                <Th>Última entrada</Th>
                <Th>Plano de ação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diasSemVenda = r.DIAS_SEM_VENDA === null || r.DIAS_SEM_VENDA === undefined ? null : Number(r.DIAS_SEM_VENDA);
                const plano = dados?.planos.get(chavePlano(r.CODPROD, r.CODFILIAL));
                return (
                  <Tr key={`${r.CODPROD}-${r.CODFILIAL}`}>
                    <Td>
                      <RowTitle>{r.DESCRICAO}</RowTitle>
                      <RowMeta><Code prefix="cód.">{r.CODPROD}</Code> · {r.FORNECEDOR || '—'}{r.DEPARTAMENTO ? ` · ${r.DEPARTAMENTO}` : ''}</RowMeta>
                    </Td>
                    <Td numeric>{numeroPt(r.ESTOQUE_ATUAL)}<RowMeta>{r.UNIDADE}</RowMeta></Td>
                    <Td numeric>{moeda(r.VALOR_PARADO)}<RowMeta>{moeda(r.CUSTO_ULT_ENTRADA)} / un.</RowMeta></Td>
                    <Td>
                      <Status tone={tomDiasSemVenda(diasSemVenda)}>{rotuloDiasSemVenda(diasSemVenda)}</Status>
                      {r.DT_ULT_VENDA ? <RowMeta>{fmtData(r.DT_ULT_VENDA)}</RowMeta> : null}
                    </Td>
                    <Td>{r.DT_ULT_ENTRADA ? <>{fmtData(r.DT_ULT_ENTRADA)}<RowMeta>há {numeroPt(r.DIAS_DESDE_ENTRADA)} dias</RowMeta></> : <Dash />}</Td>
                    <Td>
                      <CelulaPlano
                        plano={plano}
                        hoje={hoje}
                        onAbrir={() => setAlvo({ origem: 'sem_venda', codprod: Number(r.CODPROD), codfilial: String(r.CODFILIAL), descricao: String(r.DESCRICAO) })}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination
          page={pagina}
          lastPage={ultimaPagina(total)}
          total={total}
          unit="produtos sem venda"
          busy={carregando}
          onPrevious={() => setPagina(pagina - 1)}
          onNext={() => setPagina(pagina + 1)}
        />
      </Panel>

      {alvo ? (
        <PlanoAcaoDialogo
          key={chavePlano(alvo.codprod, alvo.codfilial)}
          alvo={alvo}
          plano={planoDoAlvo}
          podeGravar={podeGravar}
          responsaveis={responsaveis}
          onFechar={() => setAlvo(null)}
          onGravado={(mensagem) => { setAlvo(null); setAviso(mensagem); recarregar(); }}
        />
      ) : null}
    </>
  );
}
