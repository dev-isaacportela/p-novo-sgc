// Spec 009 — as molduras de bloco que as quatro abas de `/analises` repetem.
//
// Um bloco tem três estados (RF-002/RF-003/C-002) e um par Gráfico/Tabela
// (RF-022/C-024): `erro` mostra a falha COM a ação de tentar de novo, `vazio`
// diz "sem dados no período" — frase diferente de "não foi possível carregar" —
// e `ok` desenha. A tabela sai da MESMA série do gráfico, nunca de uma segunda
// consulta.
//
// Mora aqui, e não em `components/`, porque é vocabulário desta feature: o
// `PainelGrafico`, o `AlternaVisao` e o `corDeSerie` do design system (§8.7)
// continuam sendo os primitivos — isto é só a montagem deles.
import * as React from 'react';
import {
  Alert, AlternaVisao, Bar, BarChart, CartesianGrid, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, Dash, LabelList, Line, LineChart, PainelGrafico, Table, Td, TextLink, Th, Tr, XAxis, YAxis, type ChartConfig,
} from '@/components/page';
import { corDeSerie } from '@/components/page';
import type { Bloco, PontoComparativo, PontoSerie } from '@/lib/analises';

/** R-116: toda barra e todo ponto de linha mostram o seu valor escrito em cima; sem valor, nada. */
const rotuloDeValor = (valor: unknown) => (valor === null || valor === undefined ? '' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

const VAZIO = 'Sem dados no período.';

/** Cabeçalho de estado comum aos dois painéis: erro, vazio ou o desenho. */
function Conteudo({
  bloco, aoRecarregar, poucosPontos, children,
}: {
  bloco: Bloco<unknown>;
  aoRecarregar?: () => void;
  poucosPontos?: boolean;
  children: React.ReactNode;
}) {
  if (bloco.estado === 'erro') {
    return (
      <Alert tone="error">
        Não foi possível carregar este bloco. {bloco.erro}
        {aoRecarregar ? <> <TextLink onClick={aoRecarregar}>Tentar de novo</TextLink></> : null}
      </Alert>
    );
  }
  if (bloco.estado === 'vazio') return <Alert tone="info">{VAZIO}</Alert>;
  // §12.3: menos de dois pontos não vira gráfico — uma frase diz o que falta.
  if (poucosPontos) return <Alert tone="info">Um ponto só não vira gráfico: veja a tabela ao lado.</Alert>;
  return <>{children}</>;
}

const numeroBr = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// Os dois pontos vêm de `@/lib/analises` — é lá que as funções que os MONTAM
// (serieSimples, serieComparativa, serieDoFunil) moram, e duas declarações do
// mesmo formato divergem no primeiro campo novo. Reexportados porque as abas
// tipam as próprias séries por este arquivo.
export type { PontoComparativo, PontoSerie };

/**
 * Bloco de uma série. `formatar` é de quem chama (moeda, quantidade, dias) e
 * vale para o gráfico E para a tabela — os dois leem o mesmo número.
 */
export function PainelSerie({
  titulo, hint, rotulo, serie, bloco, indiceSerie = 0, tipo = 'barra',
  formatar = numeroBr, rodape, aoRecarregar, largura,
}: {
  titulo: string;
  hint?: React.ReactNode;
  rotulo: string;
  serie: PontoSerie[];
  bloco: Bloco<unknown>;
  indiceSerie?: number;
  tipo?: 'barra' | 'linha';
  formatar?: (valor: number) => string;
  rodape?: React.ReactNode;
  aoRecarregar?: () => void;
  largura?: 'padrao' | 'total';
}) {
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');
  const config = { value: { label: rotulo, color: corDeSerie(indiceSerie) } } satisfies ChartConfig;

  return (
    <PainelGrafico
      titulo={titulo}
      hint={hint}
      largura={largura}
      acoes={<AlternaVisao visao={visao} onVisao={setVisao} />}
      rodape={rodape}
    >
      {visao === 'tabela' ? (
        <div className="h-full overflow-auto">
          <Table>
            <thead>
              <Tr><Th>{titulo}</Th><Th numeric>{rotulo}</Th></Tr>
            </thead>
            <tbody>
              {serie.length === 0 ? (
                <Tr><Td colSpan={2}>{VAZIO}</Td></Tr>
              ) : serie.map((ponto) => (
                <Tr key={ponto.name}>
                  <Td>{ponto.name}</Td>
                  <Td numeric>{ponto.value === 0 ? <Dash /> : formatar(ponto.value)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <Conteudo bloco={bloco} aoRecarregar={aoRecarregar} poucosPontos={serie.length < 2}>
          <ChartContainer config={config} className="h-full w-full">
            {tipo === 'linha' ? (
              <LineChart data={serie}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false}>
                  <LabelList dataKey="value" position="top" formatter={rotuloDeValor} className="fill-ink text-[10px]" />
                </Line>
              </LineChart>
            ) : (
              <BarChart data={serie}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={4}>
                  <LabelList dataKey="value" position="top" formatter={rotuloDeValor} className="fill-ink text-[10px]" />
                </Bar>
              </BarChart>
            )}
          </ChartContainer>
        </Conteudo>
      )}
    </PainelGrafico>
  );
}

/** Bloco de duas séries lado a lado (comprado × vendido). Legenda a partir daqui. */
export function PainelComparativo({
  titulo, hint, rotuloA, rotuloB, serie, bloco, formatar = numeroBr, rodape, aoRecarregar,
}: {
  titulo: string;
  hint?: React.ReactNode;
  rotuloA: string;
  rotuloB: string;
  serie: PontoComparativo[];
  bloco: Bloco<unknown>;
  formatar?: (valor: number) => string;
  rodape?: React.ReactNode;
  aoRecarregar?: () => void;
}) {
  const [visao, setVisao] = React.useState<'grafico' | 'tabela'>('grafico');
  const config = {
    a: { label: rotuloA, color: corDeSerie(0) },
    b: { label: rotuloB, color: corDeSerie(1) },
  } satisfies ChartConfig;

  return (
    <PainelGrafico
      titulo={titulo}
      hint={hint}
      largura="total"
      altura="alta"
      acoes={<AlternaVisao visao={visao} onVisao={setVisao} />}
      rodape={rodape}
    >
      {visao === 'tabela' ? (
        <div className="h-full overflow-auto">
          <Table>
            <thead>
              <Tr><Th>Fornecedor</Th><Th numeric>{rotuloA}</Th><Th numeric>{rotuloB}</Th></Tr>
            </thead>
            <tbody>
              {serie.length === 0 ? (
                <Tr><Td colSpan={3}>{VAZIO}</Td></Tr>
              ) : serie.map((ponto) => (
                <Tr key={ponto.name}>
                  <Td>{ponto.name}</Td>
                  <Td numeric>{ponto.a === 0 ? <Dash /> : formatar(ponto.a)}</Td>
                  <Td numeric>{ponto.b === 0 ? <Dash /> : formatar(ponto.b)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <Conteudo bloco={bloco} aoRecarregar={aoRecarregar} poucosPontos={serie.length < 2}>
          <ChartContainer config={config} className="h-full w-full">
            <BarChart data={serie}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={64} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="a" fill="var(--color-a)" radius={4}>
                <LabelList dataKey="a" position="top" formatter={rotuloDeValor} className="fill-ink text-[10px]" />
              </Bar>
              <Bar dataKey="b" fill="var(--color-b)" radius={4}>
                <LabelList dataKey="b" position="top" formatter={rotuloDeValor} className="fill-ink text-[10px]" />
              </Bar>
            </BarChart>
          </ChartContainer>
        </Conteudo>
      )}
    </PainelGrafico>
  );
}

/** Bloco que nasce tabela (uma lista, não uma série): mesmos três estados. */
export function PainelLista({
  titulo, hint, bloco, rodape, aoRecarregar, children,
}: {
  titulo: string;
  hint?: React.ReactNode;
  bloco: Bloco<unknown>;
  rodape?: React.ReactNode;
  aoRecarregar?: () => void;
  children: React.ReactNode;
}) {
  return (
    <PainelGrafico titulo={titulo} hint={hint} altura="alta" rodape={rodape}>
      <div className="h-full overflow-auto">
        <Conteudo bloco={bloco} aoRecarregar={aoRecarregar}>{children}</Conteudo>
      </div>
    </PainelGrafico>
  );
}
