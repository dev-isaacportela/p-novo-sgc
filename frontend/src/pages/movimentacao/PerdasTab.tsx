// Spec 013 — aba Perdas (RF-017, RF-018): o lote que venceu com saldo, com o
// custo da perda (o da entrada do lote, RN-016) e o rastro. Duas chamadas: a
// lista (página) e o resumo por filial, que ignora a filial escolhida (C-035).
import * as React from 'react';
import {
  Alert, Code, Dash, EmptyState, Field, GradeGraficos, GradeKpi, Kpi, Pagination, Panel, RowMeta, RowTitle,
  SelectMenu, Status, Table, Td, TextLink, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import {
  JANELAS_PERDA, TAMANHO_PAGINA, alternarFilial, rotaTransferencia, rotuloParadoSemVenda, tomParadoSemVenda, totalDe,
  ultimaPagina,
} from '@/lib/movimentacao';
import { useCarga, usePagina, type FiltrosMov } from './carga';
import { GraficoFiliais } from './comuns';
import LoteHistoricoDialogo from './LoteHistoricoDialogo';

const OPCOES_JANELA = JANELAS_PERDA.map((d) => ({ value: String(d), label: d === 0 ? 'Todo o histórico' : `Venceu nos últimos ${d} dias` }));
const OPCOES_UNIVERSO = [
  { value: '0', label: 'Produtos de venda' },
  { value: '1', label: 'Inclui bonificação e silenciados' },
];

type Linha = Record<string, unknown>;

export default function PerdasTab({ filtros, onFilial }: { filtros: FiltrosMov; onFilial: (codfilial: string) => void }) {
  const [janela, setJanela] = React.useState('0');
  const [universo, setUniverso] = React.useState('0');
  const [pagina, setPagina] = usePagina(JSON.stringify([filtros, janela, universo]));
  const [lote, setLote] = React.useState<Linha | null>(null);
  const { codfornec, codepto, busca, incluirPublico } = filtros;

  const carregarLista = React.useCallback(() => linhas('sgcWintMovPerdas', {
    ...filtros, diasVencidos: Number(janela), incluirExcecoes: Number(universo),
    limite: TAMANHO_PAGINA, offset: (pagina - 1) * TAMANHO_PAGINA,
  }), [filtros, janela, universo, pagina]);
  const carregarResumo = React.useCallback(() => linhas('sgcWintMovPerdasFiliais', {
    codfilial: '', codfornec, codepto, busca, incluirPublico, diasVencidos: Number(janela), incluirExcecoes: Number(universo),
  }), [codfornec, codepto, busca, incluirPublico, janela, universo]);
  const lista = useCarga(carregarLista);
  const resumo = useCarga(carregarResumo);

  const rows = lista.dados ?? [];
  const total = totalDe(rows);
  const vazio = lista.carregando ? <Dash /> : null;

  return (
    <>
      <GradeKpi>
        <Kpi rotulo="Perda no recorte" valor={vazio ?? moeda(totalDe(rows, 'TOTAL_VALOR'))} hint={`${numeroPt(total)} lotes de ${numeroPt(totalDe(rows, 'TOTAL_PRODUTOS'))} produtos`} />
        <Kpi rotulo="Quantidade perdida" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_QT'))} hint="saldo dos lotes vencidos" />
        <Kpi rotulo="Veio de transferência" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_COM_TRANSFERENCIA'))} hint={moeda(totalDe(rows, 'TOTAL_VALOR_TRANSFERIDO'))} />
        <Kpi rotulo="Nunca vendidos" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_NUNCA_VENDIDOS'))} hint={moeda(totalDe(rows, 'TOTAL_VALOR_NUNCA_VENDIDO'))} />
      </GradeKpi>

      <div className="mt-4">
        <GradeGraficos>
          <GraficoFiliais
            titulo="Perda por filial"
            rotulo="Valor perdido"
            pontos={(resumo.dados ?? []).map((r) => ({ codfilial: String(r.CODFILIAL), nome: String(r.FILIAL ?? r.CODFILIAL), valor: Number(r.VALOR_PERDA) }))}
            formatar={(v) => moeda(v)}
            formatarEixo={(v) => `R$ ${v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}`}
            filialAtiva={filtros.codfilial}
            onFilial={(codfilial) => onFilial(alternarFilial(filtros.codfilial, codfilial))}
            indiceSerie={1}
          />
        </GradeGraficos>
      </div>

      <Panel className="mt-4">
        <Toolbar>
          <Field label="Quando venceu" className="w-56">
            <SelectMenu label="Quando venceu" value={janela} onChange={setJanela} options={OPCOES_JANELA} />
          </Field>
          <Field label="Universo" className="w-64">
            <SelectMenu label="Universo" value={universo} onChange={setUniverso} options={OPCOES_UNIVERSO} />
          </Field>
        </Toolbar>
        {lista.erro ? <Toolbar className="border-0"><Alert tone="error">Não foi possível ler o ERP: {lista.erro}</Alert></Toolbar> : null}

        {!lista.carregando && rows.length === 0 && !lista.erro ? (
          <EmptyState title="Nenhuma perda no recorte" hint="Amplie a janela de vencimento ou inclua bonificação e silenciados." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Lote</Th>
                <Th>Origem</Th>
                <Th>Parado sem venda</Th>
                <Th numeric>Perdido</Th>
                <Th numeric>Valor da perda</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nunca = !r.DT_ULT_VENDA;
                const diasSemVenda = r.DIAS_SEM_VENDA === null || r.DIAS_SEM_VENDA === undefined ? null : Number(r.DIAS_SEM_VENDA);
                const veioDeOutra = r.FILIAL_ENTRADA && String(r.FILIAL_ENTRADA) !== String(r.CODFILIAL);
                return (
                  <Tr key={`${r.CODFILIAL}-${r.CODPROD}-${r.NUMLOTE}`}>
                    <Td>
                      <RowTitle>{String(r.DESCRICAO)}</RowTitle>
                      <RowMeta><Code prefix="cód.">{String(r.CODPROD)}</Code> · filial {String(r.CODFILIAL)} · {String(r.FORNECEDOR || '—')}</RowMeta>
                    </Td>
                    <Td>
                      <TextLink onClick={() => setLote(r)}>{String(r.NUMLOTE || 'sem lote')}</TextLink>
                      <RowMeta>venceu {fmtData(String(r.DTVALIDADE))} · há {numeroPt(r.DIAS_VENCIDO as number)} dias</RowMeta>
                    </Td>
                    <Td>
                      {veioDeOutra ? rotaTransferencia(`Filial ${r.FILIAL_ENTRADA}`, `Filial ${r.CODFILIAL}`) : r.FILIAL_ENTRADA ? `Filial ${r.FILIAL_ENTRADA}` : <Dash />}
                      <RowMeta>{r.DT_ENTRADA ? `Entrou em ${fmtData(String(r.DT_ENTRADA))}${r.NUMNOTA_ENTRADA ? ` · NF ${r.NUMNOTA_ENTRADA}` : ''}` : 'entrada não encontrada'}</RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomParadoSemVenda(diasSemVenda, nunca)}>{nunca ? 'Nunca vendido' : rotuloParadoSemVenda(diasSemVenda)}</Status>
                      {r.DT_ULT_VENDA ? <RowMeta>última venda {fmtData(String(r.DT_ULT_VENDA))}</RowMeta> : null}
                    </Td>
                    <Td numeric>{numeroPt(r.QT_PERDIDA as number)}<RowMeta>{String(r.UNIDADE ?? '')}</RowMeta></Td>
                    <Td numeric>{moeda(r.VALOR_PERDA as number)}<RowMeta>{moeda(r.CUSTO_UNITARIO as number)} / un.</RowMeta></Td>
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
          unit="lotes vencidos"
          busy={lista.carregando}
          onPrevious={() => setPagina(pagina - 1)}
          onNext={() => setPagina(pagina + 1)}
        />
      </Panel>

      {lote ? <LoteHistoricoDialogo key={`${lote.CODPROD}-${lote.NUMLOTE}`} lote={lote} onFechar={() => setLote(null)} /> : null}
    </>
  );
}
