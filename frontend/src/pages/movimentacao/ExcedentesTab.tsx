// Spec 013 — aba Excedentes (RF-007): cobertura acima do teto da curva. A
// consulta traz a população com giro da filial (até 3.000) e a tela classifica
// — curva pelo faturamento, alvo e teto pela régua única (R-089) — e pagina em
// memória: a curva é da população, não da página (D-006 da 011). Duas chamadas.
import * as React from 'react';
import {
  Alert, Badge, Code, Dash, EmptyState, Field, GradeKpi, Kpi, Pagination, Panel, RowMeta, RowTitle, SelectMenu,
  Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { moeda, numeroPt } from '@/lib/formato';
import { coberturaDeLinha } from '@/lib/cobertura';
import {
  PERIODOS_CONSUMO, TETO_EXCEDENTES, classificarExcedentes, linhaExcedenteDe, paginaLocal, resumoExcedentes,
  totalDe, ultimaPagina,
} from '@/lib/movimentacao';
import { useCarga, usePagina, type FiltrosMov } from './carga';

const OPCOES_PERIODO = PERIODOS_CONSUMO.map((d) => ({ value: String(d), label: `Últimos ${d} dias` }));
const OPCOES_VISAO = [{ value: 'excedentes', label: 'Somente excedentes' }, { value: 'todos', label: 'Todos com giro' }];

export default function ExcedentesTab({ filtros }: { filtros: FiltrosMov }) {
  const [periodo, setPeriodo] = React.useState('90');
  const [visao, setVisao] = React.useState('excedentes');
  const [pagina, setPagina] = usePagina(JSON.stringify([filtros, periodo, visao]));

  const carregar = React.useCallback(async () => {
    const [rows, coberturas] = await Promise.all([
      linhas('sgcWintMovExcedentes', { ...filtros, diasPeriodo: Number(periodo), limite: TETO_EXCEDENTES, offset: 0 }),
      linhas('sgcCoberturaListar', { nivel: '', situacao: 'ativa', limite: 500, offset: 0 }),
    ]);
    return { classificados: classificarExcedentes(rows.map(linhaExcedenteDe), coberturas.map(coberturaDeLinha)), total: totalDe(rows) };
  }, [filtros, periodo]);
  const { dados, erro, carregando } = useCarga(carregar);

  const classificados = React.useMemo(() => dados?.classificados ?? [], [dados]);
  const resumo = React.useMemo(() => resumoExcedentes(classificados), [classificados]);
  const visiveis = visao === 'excedentes' ? classificados.filter((e) => e.excedente) : classificados;
  const pagina50 = paginaLocal(visiveis, pagina);

  return (
    <>
      <GradeKpi>
        <Kpi rotulo="Itens excedentes" valor={carregando ? <Dash /> : numeroPt(resumo.itens)} hint={`de ${numeroPt(resumo.comGiro)} produtos com giro na filial ${filtros.codfilial}`} />
        <Kpi rotulo="Valor acima do alvo" valor={carregando ? <Dash /> : moeda(resumo.valor)} hint="quantidade acima do alvo × custo da última entrada" />
        <Kpi rotulo="Cobertura média" valor={carregando || resumo.coberturaMedia === null ? <Dash /> : `${numeroPt(resumo.coberturaMedia, 1)} d`} hint="dos excedentes" />
        <Kpi rotulo="Sem parametrização" valor={carregando ? <Dash /> : numeroPt(resumo.semRegra)} hint="excedentes cobrados pelo padrão de 35 dias" />
      </GradeKpi>

      <Panel className="mt-4">
        <Toolbar>
          <Field label="Período de consumo" className="w-52">
            <SelectMenu label="Período de consumo" value={periodo} onChange={setPeriodo} options={OPCOES_PERIODO} />
          </Field>
          <Field label="Exibir" className="w-52">
            <SelectMenu label="Exibir" value={visao} onChange={setVisao} options={OPCOES_VISAO} />
          </Field>
        </Toolbar>
        {dados && dados.total >= TETO_EXCEDENTES ? (
          <Toolbar className="border-0">
            <Alert tone="warn">A filial tem mais de {numeroPt(TETO_EXCEDENTES)} produtos com giro: a análise considerou só os {numeroPt(TETO_EXCEDENTES)} de maior cobertura. Filtre por fornecedor ou departamento.</Alert>
          </Toolbar>
        ) : null}
        {erro ? <Toolbar className="border-0"><Alert tone="error">Não foi possível ler o ERP: {erro}</Alert></Toolbar> : null}

        {!carregando && visiveis.length === 0 && !erro ? (
          <EmptyState title={visao === 'excedentes' ? 'Nenhum excedente neste recorte' : 'Nenhum produto com giro neste recorte'} hint="Troque o período, a filial ou o fornecedor." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Curva</Th>
                <Th numeric>Estoque + trânsito</Th>
                <Th numeric>Consumo / dia</Th>
                <Th>Cobertura</Th>
                <Th numeric>Acima do alvo</Th>
                <Th>Régua</Th>
              </tr>
            </thead>
            <tbody>
              {pagina50.map((e) => (
                <Tr key={e.codprod}>
                  <Td>
                    <RowTitle>{e.descricao}</RowTitle>
                    <RowMeta><Code prefix="cód.">{e.codprod}</Code> · {e.fornecedor || '—'}</RowMeta>
                  </Td>
                  <Td><Badge tone={e.curva === 'A' ? 'accent' : 'neutral'}>{e.curva}</Badge></Td>
                  <Td numeric>
                    {numeroPt(e.estoqueAtual + e.estoqueTransito)}
                    <RowMeta>{numeroPt(e.estoqueAtual)} + {numeroPt(e.estoqueTransito)} a caminho</RowMeta>
                  </Td>
                  <Td numeric>{numeroPt(e.consumoDiario, 2)}<RowMeta>{numeroPt(e.vendaPeriodo)} vendidos</RowMeta></Td>
                  <Td>
                    <Status tone={e.excedente ? 'alert' : 'live'}>{e.coberturaDias === null ? '—' : `${numeroPt(e.coberturaDias, 1)} d`}</Status>
                    <RowMeta>{e.excedente && e.diasAcimaDoTeto !== null ? `${numeroPt(e.diasAcimaDoTeto, 1)} d acima do teto` : 'dentro do teto'}</RowMeta>
                  </Td>
                  <Td numeric>
                    {e.quantidadeExcedente > 0 ? numeroPt(e.quantidadeExcedente) : <Dash />}
                    {e.quantidadeExcedente > 0 ? <RowMeta>{moeda(e.valorExcedente)}</RowMeta> : null}
                  </Td>
                  <Td>{e.origemRegra}<RowMeta>alvo {numeroPt(e.alvoDias)} d · teto {numeroPt(e.tetoDias, e.tetoDias % 1 ? 1 : 0)} d</RowMeta></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={pagina}
          lastPage={ultimaPagina(visiveis.length)}
          total={visiveis.length}
          unit={visao === 'excedentes' ? 'excedentes' : 'produtos com giro'}
          busy={carregando}
          onPrevious={() => setPagina(pagina - 1)}
          onNext={() => setPagina(pagina + 1)}
        />
      </Panel>
    </>
  );
}
