// Spec 013 — aba Alerta de ruptura (RF-014..RF-016): quem consumiu o estoque
// mais rápido que o próprio histórico. A detecção e a severidade são do SQL; a
// tela só escolhe os cortes, mostra e exporta. Duas chamadas: a lista (página)
// e o resumo por filial, que não depende da filial, da severidade nem da página.
import * as React from 'react';
import { Download } from 'lucide-react';
import {
  Alert, Badge, Button, CheckRow, Code, Dash, EmptyState, Field, GradeGraficos, GradeKpi, Kpi, MoreFilters,
  Pagination, Panel, RowMeta, RowTitle, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { moeda, numeroPt, hojeIso } from '@/lib/formato';
import { baixarCsv, textoCsv } from '@/lib/csv';
import {
  CABECALHO_CSV_RUPTURA, LIMITE_EXPORTACAO, OPCOES_RUPTURA, PADRAO_RUPTURA, ROTULO_SEVERIDADE, TAMANHO_PAGINA,
  alternarFilial, linhasCsvRuptura, parametrosRuptura, rotuloDias, severidadeDe, tomCoberturaRitmo, tomSeveridade,
  totalDe, ultimaPagina, type EscolhasRuptura, type Severidade,
} from '@/lib/movimentacao';
import { useCarga, usePagina, type FiltrosMov } from './carga';
import { GraficoFiliais } from './comuns';

const OPCOES_SEVERIDADE = [
  { value: '', label: 'Todas as situações' },
  ...(Object.keys(ROTULO_SEVERIDADE) as Severidade[]).map((s) => ({ value: s, label: ROTULO_SEVERIDADE[s] })),
];
const opcoes = (valores: readonly number[], sufixo: string) => valores.map((v) => ({ value: String(v), label: `${String(v).replace('.', ',')}${sufixo}` }));

const numOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default function RupturaTab({ filtros, onFilial }: { filtros: FiltrosMov; onFilial: (codfilial: string) => void }) {
  const [escolhas, setEscolhas] = React.useState<EscolhasRuptura>(PADRAO_RUPTURA);
  const [severidade, setSeveridade] = React.useState('');
  const [pagina, setPagina] = usePagina(JSON.stringify([filtros, escolhas, severidade]));
  const [exportando, setExportando] = React.useState('');

  const parametros = React.useMemo(() => parametrosRuptura(escolhas), [escolhas]);
  const { codfornec, codepto, busca, incluirPublico } = filtros;

  const carregarLista = React.useCallback(() => linhas('sgcWintMovRuptura', {
    ...filtros, ...parametros, severidade, limite: TAMANHO_PAGINA, offset: (pagina - 1) * TAMANHO_PAGINA,
  }), [filtros, parametros, severidade, pagina]);
  const carregarResumo = React.useCallback(() => linhas('sgcWintMovRupturaFiliais', {
    codfilial: '', codfornec, codepto, busca, incluirPublico, ...parametros, severidade: '',
  }), [codfornec, codepto, busca, incluirPublico, parametros]);
  const lista = useCarga(carregarLista);
  const resumo = useCarga(carregarResumo);

  const rows = lista.dados ?? [];
  const total = totalDe(rows);
  const vazio = lista.carregando ? <Dash /> : null;
  const alterar = <K extends keyof EscolhasRuptura>(campo: K, valor: EscolhasRuptura[K]) => setEscolhas((e) => ({ ...e, [campo]: valor }));
  const ajustados = (Object.keys(PADRAO_RUPTURA) as (keyof EscolhasRuptura)[]).filter((k) => escolhas[k] !== PADRAO_RUPTURA[k]).length;

  async function exportar() {
    setExportando('Gerando o arquivo…');
    try {
      const todas = await linhas('sgcWintMovRuptura', { ...filtros, ...parametros, severidade, limite: LIMITE_EXPORTACAO, offset: 0 });
      const recorte = filtros.codfilial ? `filial ${filtros.codfilial}` : 'todas as filiais';
      const corpo = linhasCsvRuptura(todas, escolhas, recorte);
      if (!corpo.length) { setExportando('Nada para exportar neste recorte.'); return; }
      baixarCsv(`alerta-ruptura-${escolhas.diasJanela}d-${hojeIso()}.csv`, textoCsv(CABECALHO_CSV_RUPTURA, corpo));
      setExportando(todas.length >= LIMITE_EXPORTACAO ? `O arquivo saiu com o teto de ${numeroPt(LIMITE_EXPORTACAO)} linhas: filtre para ver o resto.` : '');
    } catch (e) {
      setExportando(e instanceof Error ? e.message : 'Não foi possível exportar.');
    }
  }

  return (
    <>
      <GradeKpi>
        <Kpi rotulo="Produtos em alerta" valor={vazio ?? numeroPt(total)} hint={`${numeroPt(totalDe(rows, 'TOTAL_SEM_HISTORICO'))} sem histórico · ${moeda(totalDe(rows, 'TOTAL_VALOR_ESTOQUE'))} em estoque`} />
        <Kpi rotulo="Já sem estoque" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_RUPTURA'))} hint="situação Ruptura" />
        <Kpi rotulo="Sem tempo de repor" valor={vazio ?? numeroPt(totalDe(rows, 'TOTAL_CRITICO'))} hint={`cobertura até ${escolhas.prazoReposicao} dias (prazo de reposição)`} />
        <Kpi rotulo="Desvio médio" valor={vazio ?? (rows[0]?.MEDIA_FATOR == null ? <Dash /> : `${numeroPt(rows[0].MEDIA_FATOR, 2)}×`)} hint="ritmo da janela ÷ ritmo histórico" />
      </GradeKpi>

      <div className="mt-4">
        <GradeGraficos>
          <GraficoFiliais
            titulo="Alertas por filial"
            rotulo="Alertas"
            pontos={(resumo.dados ?? []).map((r) => ({ codfilial: String(r.CODFILIAL), nome: String(r.FILIAL ?? r.CODFILIAL), valor: Number(r.ALERTAS) }))}
            formatar={(v) => numeroPt(v)}
            filialAtiva={filtros.codfilial}
            onFilial={(codfilial) => onFilial(alternarFilial(filtros.codfilial, codfilial))}
            indiceSerie={0}
          />
        </GradeGraficos>
      </div>

      <Panel className="mt-4">
        <Toolbar>
          <Field label="Situação" className="w-52">
            <SelectMenu label="Situação" value={severidade} onChange={(v) => setSeveridade(severidadeDe(v))} options={OPCOES_SEVERIDADE} />
          </Field>
          <MoreFilters label="Cortes da detecção" count={ajustados} onClear={() => setEscolhas(PADRAO_RUPTURA)}>
            <Field label="Janela recente">
              <SelectMenu label="Janela recente" value={String(escolhas.diasJanela)} onChange={(v) => alterar('diasJanela', Number(v))} options={opcoes(OPCOES_RUPTURA.diasJanela, ' dias')} />
            </Field>
            <Field label="Base histórica (antes da janela)">
              <SelectMenu label="Base histórica" value={String(escolhas.diasBase)} onChange={(v) => alterar('diasBase', Number(v))} options={opcoes(OPCOES_RUPTURA.diasBase, ' dias')} />
            </Field>
            <Field label="Gatilho de estoque consumido">
              <SelectMenu label="Gatilho" value={String(escolhas.limiarPerc)} onChange={(v) => alterar('limiarPerc', Number(v))} options={opcoes(OPCOES_RUPTURA.limiarPerc, ' %')} />
            </Field>
            <Field label="Desvio mínimo do ritmo">
              <SelectMenu label="Desvio mínimo" value={String(escolhas.fatorMinimo)} onChange={(v) => alterar('fatorMinimo', Number(v))} options={opcoes(OPCOES_RUPTURA.fatorMinimo, '×')} />
            </Field>
            <Field label="Prazo de reposição">
              <SelectMenu label="Prazo de reposição" value={String(escolhas.prazoReposicao)} onChange={(v) => alterar('prazoReposicao', Number(v))} options={opcoes(OPCOES_RUPTURA.prazoReposicao, ' dias')} />
            </Field>
            <Field label="Venda mínima na janela">
              <SelectMenu label="Venda mínima" value={String(escolhas.vendaMinima)} onChange={(v) => alterar('vendaMinima', Number(v))} options={opcoes(OPCOES_RUPTURA.vendaMinima, ' un.')} />
            </Field>
            <CheckRow marcado={escolhas.incluirSemHistorico} onToggle={() => alterar('incluirSemHistorico', !escolhas.incluirSemHistorico)} hint="Produto que não vendeu na base entra pelo gatilho só.">
              Incluir sem histórico
            </CheckRow>
            <CheckRow marcado={escolhas.incluirExcecoes} onToggle={() => alterar('incluirExcecoes', !escolhas.incluirExcecoes)} hint="Bonificação e produtos silenciados.">
              Incluir exceções
            </CheckRow>
          </MoreFilters>
          <Button onClick={exportar} disabled={total === 0 || lista.carregando} title={total === 0 ? 'Nada para exportar neste recorte.' : undefined}>
            <Download aria-hidden />
            Exportar CSV
          </Button>
        </Toolbar>
        {exportando ? <Toolbar className="border-0"><Alert tone="info">{exportando}</Alert></Toolbar> : null}
        {lista.erro ? <Toolbar className="border-0"><Alert tone="error">Não foi possível ler o ERP: {lista.erro}</Alert></Toolbar> : null}

        {!lista.carregando && rows.length === 0 && !lista.erro ? (
          <EmptyState title="Nenhum produto fora da curva" hint="Amplie a janela, baixe o gatilho ou o desvio mínimo nos cortes da detecção." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Situação</Th>
                <Th numeric>Consumido</Th>
                <Th numeric>Ritmo</Th>
                <Th>Cobertura no ritmo novo</Th>
                <Th numeric>Estoque</Th>
                <Th numeric>Repor</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const semHistorico = r.ORIGEM_CURVA === 'SEM_HISTORICO';
                const cobertura = numOuNulo(r.COBERTURA_COM_TRANSITO);
                return (
                  <Tr key={`${r.CODFILIAL}-${r.CODPROD}`}>
                    <Td>
                      <RowTitle>{r.DESCRICAO}</RowTitle>
                      <RowMeta><Code prefix="cód.">{r.CODPROD}</Code> · filial {r.CODFILIAL} · {r.FORNECEDOR || '—'}</RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomSeveridade(r.SEVERIDADE)}>{ROTULO_SEVERIDADE[severidadeDe(r.SEVERIDADE) || 'MEDIO']}</Status>
                      {semHistorico ? <RowMeta><Badge tone="neutral">Sem curva</Badge></RowMeta> : null}
                    </Td>
                    <Td numeric>
                      {numeroPt(r.PERC_CONSUMIDO, 1)} %
                      <RowMeta>{numeroPt(r.QT_VENDA_JANELA)} de {numeroPt(r.ESTOQUE_INICIAL)} em {rotuloDias(numOuNulo(r.DIAS_CONSUMO_REAL))}</RowMeta>
                    </Td>
                    <Td numeric>
                      {semHistorico ? <Dash /> : `${numeroPt(r.FATOR_ACELERACAO, 2)}×`}
                      <RowMeta>{semHistorico ? 'sem base histórica' : `esperado ${rotuloDias(numOuNulo(r.DIAS_ESPERADOS))}`}</RowMeta>
                    </Td>
                    <Td>
                      <Status tone={tomCoberturaRitmo(cobertura, escolhas.prazoReposicao)}>{rotuloDias(cobertura)}</Status>
                      <RowMeta>{Number(r.CLIENTES_JANELA) === 1 ? '1 cliente: pode ser pedido pontual' : `${numeroPt(r.CLIENTES_JANELA)} clientes`}</RowMeta>
                    </Td>
                    <Td numeric>{numeroPt(r.ESTOQUE_ATUAL)}<RowMeta>{numeroPt(r.QT_TRANSITO)} a caminho</RowMeta></Td>
                    <Td numeric>{Number(r.QT_REPOR_SUGERIDA) > 0 ? numeroPt(r.QT_REPOR_SUGERIDA) : <Dash />}<RowMeta>30 dias no ritmo novo</RowMeta></Td>
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
          unit="produtos em alerta"
          busy={lista.carregando}
          onPrevious={() => setPagina(pagina - 1)}
          onNext={() => setPagina(pagina + 1)}
        />
      </Panel>
    </>
  );
}
