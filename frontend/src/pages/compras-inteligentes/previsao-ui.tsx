// "Análise de venda futura" com escolha de modelo (spec 011, R-124): o seletor
// (Best Fit por padrão, cada opção com a descrição e o MAD), os quatro KPIs,
// os fatos da série e as médias ajustadas. Vive no painel de detalhe e na
// janela Análise do Produto, sobre a `Previsao` que a página já calculou para
// o produto aberto — nenhuma consulta aqui.

import { Alert, EmptyState, GradeMini, MiniCartao, RowMeta, SelectMenu } from '@/components/page';
import { LIMITE_TS, MODELOS, PONTOS_MINIMOS, modeloEscolhido, textoDosParametros } from '@/lib/previsao';
import type { ModeloPrevisao, Previsao, SugestaoProjetada } from '@/lib/previsao';
import { textoDaSugestao } from '@/lib/ressuprimento';
import type { LinhaRessuprimento, ReferenciaSugestao } from '@/lib/ressuprimento';

const numero = (valor: number, casas = 2) => valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export function AnaliseVendaFutura({
  linha,
  previsao,
  modelo,
  onModelo,
  projetada,
  referencia,
  compacto = false,
}: {
  linha: LinhaRessuprimento;
  /** `null` enquanto o histórico do SKU não voltou. */
  previsao: Previsao | null;
  modelo: ModeloPrevisao;
  onModelo: (modelo: ModeloPrevisao) => void;
  projetada: SugestaoProjetada | null;
  referencia: ReferenciaSugestao;
  /** No painel lateral: texto em cima, seletor na largura toda e KPIs em duas colunas. */
  compacto?: boolean;
}) {
  const escolhido = previsao ? modeloEscolhido(previsao, modelo) : null;
  const vencedor = previsao?.suficiente ? previsao.modelos.find((m) => m.modelo === previsao.bestFit) ?? null : null;
  const opcoes = MODELOS.map((m) => {
    const calculado = previsao?.suficiente ? previsao.modelos.find((r) => r.modelo === m.value) ?? null : null;
    const mad = m.value === 'bestfit' ? vencedor?.mad : calculado?.mad;
    return {
      value: m.value,
      label: m.value === 'bestfit' && vencedor ? `Best Fit → ${vencedor.rotulo}` : m.label,
      // O MAD vem primeiro: a descrição longa é o que a lista corta.
      hint: `${mad === undefined ? '' : `MAD ${numero(mad)} · `}${m.descricao}`,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className={compacto ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'}>
        <RowMeta>Escolha o modelo matemático. O Best Fit compara o MAD histórico e usa automaticamente o menor erro.</RowMeta>
        <SelectMenu
          label="Modelo de previsão"
          value={modelo}
          onChange={(v) => onModelo(v as ModeloPrevisao)}
          options={opcoes}
          disabled={!previsao?.suficiente}
          className={compacto ? undefined : 'sm:w-72'}
        />
      </div>

      {!previsao ? (
        <EmptyState title="Carregando…" />
      ) : !previsao.suficiente || !escolhido ? (
        <Alert tone="info">
          {`Menos de ${PONTOS_MINIMOS} meses fechados com venda (${previsao.serie.pontos.length}): sem projeção por modelo. A sugestão segue o consumo ponderado por recência.`}
        </Alert>
      ) : (
        <>
          <GradeMini colunas={compacto ? 2 : 4}>
            <MiniCartao
              rotulo="Projeção mensal"
              valor={`${numero(escolhido.previsao)} un.`}
              hint={`${escolhido.rotulo}${textoDosParametros(escolhido) ? ` · ${textoDosParametros(escolhido)}` : ''}`}
            />
            <MiniCartao rotulo="MAD" valor={numero(escolhido.mad)} hint={`MAPE ${numero(escolhido.mape)} %`} />
            <MiniCartao
              rotulo="Tracking Signal"
              valor={numero(escolhido.ts)}
              tone={escolhido.sobControle ? 'neutral' : 'attention'}
              hint={`Limite ±${LIMITE_TS} · ${escolhido.sobControle ? 'sob controle' : 'fora de controle'}`}
            />
            <MiniCartao
              rotulo="Sugestão projetada"
              valor={projetada ? textoDaSugestao(projetada.sugestao, linha.unidadesPorCaixa, referencia) : '—'}
              hint={projetada ? `Demanda ${numero(projetada.demandaDiaria, 4)} un./dia · alvo no lead time ${numero(projetada.alvoLeadTime)} un.` : undefined}
            />
          </GradeMini>
          <RowMeta>
            {`${previsao.serie.pontos.length} ${previsao.serie.pontos.length === 1 ? 'mês usado' : 'meses usados'} · ${previsao.serie.outliersAjustados} ${previsao.serie.outliersAjustados === 1 ? 'outlier ajustado' : 'outliers ajustados'}`}
            {escolhido.semSazonalidade ? ' · sem meses para a sazonalidade: Holt' : ''}
            {` · médias da série ajustada: 3 m ${numero(previsao.medias.m3)} · 6 m ${numero(previsao.medias.m6)} · 12 m ${numero(previsao.medias.m12)}`}
          </RowMeta>
        </>
      )}
    </div>
  );
}
