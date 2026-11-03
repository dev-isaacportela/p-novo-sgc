// Spec 013 — aba A vencer (RF-008..RF-010): lotes com saldo por validade, com o
// bloqueio (quanto, quem, quando — nunca o motivo, RN-008) e o aviso de lotes
// que somam mais que o estoque. O plano é por produto: os lotes dividem (C-022).
import * as React from 'react';
import {
  Alert, Code, Dash, EmptyState, Field, GradeKpi, Kpi, Pagination, Panel, RowMeta, RowTitle, SelectMenu, Status,
  Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import {
  HORIZONTES_VALIDADE, TAMANHO_PAGINA, chavePlano, listaCodprods, mapaDePlanos, rotuloBloqueio, rotuloPrazo,
  textoResponsavelBloqueio, tomPrazo, totalDe, ultimaPagina,
} from '@/lib/movimentacao';
import { useCarga, usePagina, type FiltrosMov } from './carga';
import { CelulaPlano } from './comuns';
import PlanoAcaoDialogo, { type AlvoPlano } from './PlanoAcaoDialogo';

const OPCOES_SITUACAO = [
  { value: 'TODOS', label: 'Vencidos e a vencer' },
  { value: 'A_VENCER', label: 'Só a vencer' },
  { value: 'VENCIDOS', label: 'Só vencidos' },
];
const OPCOES_HORIZONTE = HORIZONTES_VALIDADE.map((d) => ({ value: String(d), label: `Até ${d} dias` }));
const OPCOES_BLOQUEIO = [
  { value: 'TODOS', label: 'Todos os lotes' },
  { value: 'BLOQUEADOS', label: 'Só bloqueados' },
  { value: 'LIVRES', label: 'Só livres' },
];

export default function AVencerTab({
  filtros, hoje, podeGravar, responsaveis,
}: {
  filtros: FiltrosMov;
  hoje: string;
  podeGravar: boolean;
  responsaveis: { value: string; label: string }[];
}) {
  const [situacao, setSituacao] = React.useState('TODOS');
  const [horizonte, setHorizonte] = React.useState('90');
  const [bloqueio, setBloqueio] = React.useState('TODOS');
  const [pagina, setPagina] = usePagina(JSON.stringify([filtros, situacao, horizonte, bloqueio]));
  const [alvo, setAlvo] = React.useState<AlvoPlano | null>(null);
  const [aviso, setAviso] = React.useState('');

  const carregar = React.useCallback(async () => {
    const [rows, resumo] = await Promise.all([
      linhas('sgcWintMovAVencer', {
        ...filtros, situacao, diasHorizonte: Number(horizonte), bloqueio,
        limite: TAMANHO_PAGINA, offset: (pagina - 1) * TAMANHO_PAGINA,
      }),
      linhas('sgcMovPlanosResumo', { origem: 'a_vencer', codfilial: filtros.codfilial, hoje }),
    ]);
    const planos = rows.length
      ? await linhas('sgcMovPlanosListar', { origem: 'a_vencer', codfilial: filtros.codfilial, codprods: listaCodprods(rows), limite: TAMANHO_PAGINA, offset: 0 })
      : [];
    return { rows, planos: mapaDePlanos(planos), resumo: resumo[0] ?? {} };
  }, [filtros, situacao, horizonte, bloqueio, pagina, hoje]);
  const { dados, erro, carregando, recarregar } = useCarga(carregar);

  const rows = dados?.rows ?? [];
  const total = totalDe(rows);
  const vazio = carregando ? <Dash /> : null;
  const planoDoAlvo = alvo ? dados?.planos.get(chavePlano(alvo.codprod, alvo.codfilial)) ?? null : null;

  return (
    <>
      <GradeKpi>
        <Kpi rotulo="Lotes no recorte" valor={vazio ?? numeroPt(total)} hint={`${moeda(totalDe(rows, 'TOTAL_VALOR'))} em risco · ${numeroPt(totalDe(rows, 'TOTAL_ATE_30'))} vencem em até 30 dias`} />
        <Kpi rotulo="Vencidos" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_VENCIDOS'))} hint={moeda(totalDe(rows, 'TOTAL_VALOR_VENCIDO'))} />
        <Kpi rotulo="Bloqueados" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_BLOQUEADOS'))} hint={`${moeda(totalDe(rows, 'TOTAL_VALOR_BLOQUEADO'))} bloqueados · ${numeroPt(totalDe(rows, 'TOTAL_DIVERGENTES'))} lote(s) somando mais que o estoque`} />
        <Kpi rotulo="Acompanhamentos vencidos" valor={vazio ?? numeroPt(Number(dados?.resumo.VENCIDOS ?? 0))} hint="planos da filial com data passada e não concluídos" />
      </GradeKpi>

      <Panel className="mt-4">
        <Toolbar>
          <Field label="Situação" className="w-52">
            <SelectMenu label="Situação" value={situacao} onChange={setSituacao} options={OPCOES_SITUACAO} />
          </Field>
          <Field label="Janela de validade" className="w-44" hint={situacao === 'VENCIDOS' ? 'Não vale para vencidos.' : undefined}>
            <SelectMenu label="Janela de validade" value={horizonte} onChange={setHorizonte} options={OPCOES_HORIZONTE} disabled={situacao === 'VENCIDOS'} />
          </Field>
          <Field label="Bloqueio do lote" className="w-44">
            <SelectMenu label="Bloqueio do lote" value={bloqueio} onChange={setBloqueio} options={OPCOES_BLOQUEIO} />
          </Field>
        </Toolbar>
        {aviso ? <Toolbar className="border-0"><Alert tone="success">{aviso}</Alert></Toolbar> : null}
        {erro ? <Toolbar className="border-0"><Alert tone="error">Não foi possível ler o ERP: {erro}</Alert></Toolbar> : null}

        {!carregando && rows.length === 0 && !erro ? (
          <EmptyState title="Nenhum lote neste recorte" hint="Amplie a janela de validade ou troque a filial." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Lote</Th>
                <Th>Prazo</Th>
                <Th numeric>Saldo</Th>
                <Th>Bloqueio</Th>
                <Th numeric>Valor em risco</Th>
                <Th>Plano de ação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diasParaVencer = r.DIAS_PARA_VENCER === null || r.DIAS_PARA_VENCER === undefined ? null : Number(r.DIAS_PARA_VENCER);
                const bloq = rotuloBloqueio(r);
                const quem = textoResponsavelBloqueio(r, fmtData);
                return (
                  <Tr key={`${r.CODPROD}-${r.NUMLOTE}`}>
                    <Td>
                      <RowTitle>{r.DESCRICAO}</RowTitle>
                      <RowMeta><Code prefix="cód.">{r.CODPROD}</Code> · {r.FORNECEDOR || '—'}</RowMeta>
                    </Td>
                    <Td>{r.NUMLOTE || <Dash />}<RowMeta>validade {fmtData(r.DTVALIDADE)}</RowMeta></Td>
                    <Td><Status tone={tomPrazo(diasParaVencer)}>{rotuloPrazo(diasParaVencer)}</Status></Td>
                    <Td numeric>
                      {numeroPt(r.QT_LOTE)}
                      <RowMeta>{numeroPt(r.QT_DISPONIVEL)} disponível</RowMeta>
                      {Number(r.DIVERGENTE) === 1 ? (
                        <RowMeta><Status tone="attention">lotes somam {numeroPt(r.QT_TOTAL_LOTES)}</Status> · estoque {numeroPt(r.ESTOQUE_PRODUTO)}</RowMeta>
                      ) : null}
                    </Td>
                    <Td>
                      {bloq ? <Status tone={bloq.tom}>{bloq.texto}</Status> : <Dash />}
                      {bloq && quem ? <RowMeta>{quem}</RowMeta> : null}
                    </Td>
                    <Td numeric>{moeda(r.VALOR_EM_RISCO)}{Number(r.VALOR_BLOQUEADO) > 0 ? <RowMeta>{moeda(r.VALOR_BLOQUEADO)} bloqueados</RowMeta> : null}</Td>
                    <Td>
                      <CelulaPlano
                        plano={dados?.planos.get(chavePlano(r.CODPROD, r.CODFILIAL))}
                        hoje={hoje}
                        onAbrir={() => setAlvo({ origem: 'a_vencer', codprod: Number(r.CODPROD), codfilial: String(r.CODFILIAL), descricao: String(r.DESCRICAO) })}
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
          unit="lotes"
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
