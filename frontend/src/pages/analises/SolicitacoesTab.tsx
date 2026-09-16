// Spec 009 — aba Solicitações de `/analises`: o funil, as duas aderências, o
// tempo médio até a avaliação e o ranking por vendedor (RF-015, RF-016, C-016,
// C-017, RN-009, RN-010).
//
// Duas execuções por carga (RNF-001): o funil e o ranking. O resumo NÃO é uma
// terceira consulta — sai do funil já agregado, por `resumoSolicitacoes`
// (D-009), que lê as DUAS dimensões: a decisão (`STATUS`) separa quem espera
// avaliação de quem foi recusada, porque a situação de atendimento devolve
// `sem_pedido` para as duas (R-076).
import * as React from 'react';
import { linhas } from '@/lib/mitra-api';
import { DatePicker } from '@/components/DatePicker';
import {
  Dash, Field, GradeGraficos, GradeKpi, Kpi, Panel, PanelHeader, RowTitle, Table, Td, Th,
  Toolbar, Tr,
} from '@/components/page';
import {
  intervaloPadrao, resultadosDosBlocos, resumoSolicitacoes, serieDasPendentes, serieDoFunil,
  type Bloco, type FunilRow,
} from '@/lib/analises';
import { fmtData } from '@/lib/formato';
import { PainelLista, PainelSerie } from './blocos';

const LIMITE = 50;
type Generica = Record<string, string | number | null>;

const inteiro = (valor: unknown) => Number(valor ?? 0);
const pct = (valor: number | null) => (valor === null ? null : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

export default function SolicitacoesTab({ codfilial }: { codfilial: string }) {
  const padrao = React.useMemo(() => intervaloPadrao(), []);
  const [dataInicio, setDataInicio] = React.useState(padrao.dataInicio);
  const [dataFim, setDataFim] = React.useState(padrao.dataFim);
  const [blocos, setBlocos] = React.useState<Record<string, Bloco<Generica>>>({});
  const [recarga, setRecarga] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    const periodo = { codfilial, dataInicio, dataFim };
    Promise.allSettled([
      linhas('sgcSolicitacoesFunil', periodo),
      linhas('sgcSolicitacoesPorVendedor', { ...periodo, limite: LIMITE }),
    ]).then((resultados) => {
      if (!vivo) return;
      setBlocos(resultadosDosBlocos(['funil', 'vendedores'], resultados as PromiseSettledResult<Generica[]>[]));
    });
    return () => { vivo = false; };
  }, [codfilial, dataInicio, dataFim, recarga]);

  const bloco = (nome: string): Bloco<Generica> => blocos[nome] ?? { estado: 'vazio', linhas: [], erro: '' };
  const funil = bloco('funil').linhas as unknown as FunilRow[];
  const resumo = resumoSolicitacoes(funil);
  const vendedores = bloco('vendedores').linhas;
  const periodoTexto = `${fmtData(dataInicio)} a ${fmtData(dataFim)}`;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <Toolbar>
          <Field label="De" className="w-44">
            <DatePicker value={dataInicio} onChange={setDataInicio} max={dataFim} aria-label="Início do período" />
          </Field>
          <Field label="Até" className="w-44">
            <DatePicker value={dataFim} onChange={setDataFim} min={dataInicio} aria-label="Fim do período" />
          </Field>
        </Toolbar>
      </Panel>

      <GradeKpi>
        <Kpi rotulo="Solicitações no período" valor={resumo.total.toLocaleString('pt-BR')} hint={periodoTexto} />
        <Kpi
          rotulo="Aderência geral"
          valor={pct(resumo.aderenciaGeralPct) ?? <Dash />}
          hint={`${resumo.atendidas} atendidas de ${resumo.total}`}
        />
        <Kpi
          rotulo="Aderência de fluxo"
          valor={pct(resumo.aderenciaFluxoPct) ?? <Dash />}
          hint={`Sem as ${resumo.pendentes} esperando avaliação e as ${resumo.recusadas} recusadas`}
        />
        <Kpi
          rotulo="Tempo até a avaliação"
          valor={resumo.tempoMedioAvaliacaoDias === null ? <Dash /> : `${resumo.tempoMedioAvaliacaoDias} dias`}
          hint={`${resumo.emFluxo} em andamento no fluxo`}
        />
      </GradeKpi>

      <GradeGraficos>
        <PainelSerie
          titulo="Funil por situação de atendimento"
          hint={`Onde está cada solicitação do período · ${periodoTexto}`}
          rotulo="Solicitações"
          serie={serieDoFunil(funil)}
          bloco={bloco('funil')}
          aoRecarregar={() => setRecarga((n) => n + 1)}
          rodape={
            <p className="text-[12px] text-ink-secondary">
              Quem ainda não virou pedido aparece como “Sem pedido” — o painel ao lado separa essas por decisão.
            </p>
          }
        />

        <PainelSerie
          titulo="Sem pedido, por decisão"
          hint="Esperando avaliação, recusada, cancelada ou aprovada na fila"
          rotulo="Solicitações"
          indiceSerie={2}
          serie={serieDasPendentes(funil)}
          bloco={bloco('funil')}
          aoRecarregar={() => setRecarga((n) => n + 1)}
          rodape={
            <p className="text-[12px] text-ink-secondary">
              Todas têm a MESMA situação de atendimento: só a decisão as separa.
            </p>
          }
        />

        <PainelLista
          titulo="Ranking por vendedor"
          hint={`Por contagem de solicitações, sem valor em reais · ${periodoTexto}`}
          bloco={bloco('vendedores')}
          aoRecarregar={() => setRecarga((n) => n + 1)}
          rodape={<p className="text-[12px] text-ink-secondary">Os {LIMITE} com mais solicitações.</p>}
        >
          <Table>
            <thead>
              <Tr>
                <Th>Vendedor</Th><Th numeric>Total</Th><Th numeric>Pendentes</Th><Th numeric>Em fluxo</Th>
                <Th numeric>Atendidas</Th><Th numeric>Não atendidas</Th><Th numeric>Recusadas</Th><Th numeric>Aderência</Th>
              </Tr>
            </thead>
            <tbody>
              {vendedores.map((v) => (
                <Tr key={String(v.USUARIO_ID)}>
                  <Td><RowTitle>{v.VENDEDOR}</RowTitle></Td>
                  <Td numeric>{inteiro(v.TOTAL)}</Td>
                  <Td numeric>{inteiro(v.PENDENTES) || <Dash />}</Td>
                  <Td numeric>{inteiro(v.EM_FLUXO) || <Dash />}</Td>
                  <Td numeric>{inteiro(v.ATENDIDAS) || <Dash />}</Td>
                  <Td numeric>{inteiro(v.NAO_ATENDIDAS) || <Dash />}</Td>
                  <Td numeric>{inteiro(v.RECUSADAS) || <Dash />}</Td>
                  <Td numeric>{v.ADERENCIA_PCT === null ? <Dash /> : `${inteiro(v.ADERENCIA_PCT)} %`}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </PainelLista>
      </GradeGraficos>

      <Panel>
        <PanelHeader
          title="Funil em números"
          hint="A tabela é a versão acessível do gráfico: mesmos pares, mesma ordem."
        />
        <Table>
          <thead>
            <Tr><Th>Decisão</Th><Th>Situação de atendimento</Th><Th numeric>Solicitações</Th><Th numeric>Avaliadas</Th></Tr>
          </thead>
          <tbody>
            {funil.length === 0 ? (
              <Tr><Td colSpan={4}>Sem dados no período.</Td></Tr>
            ) : funil.map((l) => (
              <Tr key={`${l.STATUS}-${l.SITUACAO}`}>
                <Td>{l.STATUS}</Td>
                <Td>{l.SITUACAO}</Td>
                <Td numeric>{inteiro(l.QTD)}</Td>
                <Td numeric>{inteiro(l.QTD_AVALIADAS) || <Dash />}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
