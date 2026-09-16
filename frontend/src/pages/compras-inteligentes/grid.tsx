// A grade de ressuprimento da spec 011 (RF-001, RF-014..RF-016, RF-023).
//
// Arquivo próprio — e não um pedaço de `ComprasInteligentesPage.tsx` — porque a
// tela inteira num arquivo só passa das 800 linhas do `max-lines`.
//
// Tudo aqui é local: filtrar, ordenar, paginar e ligar o seletor de licitação
// não custam nenhuma execução (RNF-005). A linha já chega calculada por
// `montarRessuprimento`; esta camada só desenha e coleta a quantidade.
import * as React from 'react';
import { Eye, PlusCircle, Receipt, RotateCcw, SlidersHorizontal, VolumeX } from 'lucide-react';

import {
  Code, Dash, IconButton, Input, Pagination, RowMeta, RowTitle, Status, Table, Td, Th, Tr,
} from '@/components/page';
import { arredondarPorCaixa } from '@/lib/compras';
import { fmtData } from '@/lib/formato';
import type { LinhaRessuprimento, StatusRessuprimento } from '@/lib/ressuprimento';
import { ROTULO_STATUS } from '@/lib/ressuprimento';

const POR_PAGINA = 25;

/** §8.4: estado dentro de tabela é ponto + texto, nunca só a cor. */
const TOM_STATUS: Record<StatusRessuprimento, 'alert' | 'attention' | 'live'> = {
  ruptura: 'alert',
  elevada_exposicao: 'alert',
  baixa_exposicao: 'attention',
  excesso: 'attention',
  adequado: 'live',
};

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const consumo = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dinheiro = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface AcoesDaGrade {
  onDetalhe: (linha: LinhaRessuprimento) => void;
  onParametros: (linha: LinhaRessuprimento) => void;
  onSilenciar: (linha: LinhaRessuprimento) => void;
  onRestaurar: (linha: LinhaRessuprimento) => void;
  onVendas: (linha: LinhaRessuprimento) => void;
  onAdicionar: (linha: LinhaRessuprimento, quantidade: number) => void;
}

export function GradeRessuprimento({
  linhas,
  quantidades,
  onQuantidade,
  podeOperar,
  podeParametrizar,
  motivoBloqueio,
  acoes,
}: {
  linhas: LinhaRessuprimento[];
  quantidades: Record<number, number>;
  onQuantidade: (codprod: number, valor: number) => void;
  podeOperar: boolean;
  podeParametrizar: boolean;
  /** Por que os controles estão desabilitados — vai no `title`, nunca escondido (§9.4). */
  motivoBloqueio: string;
  acoes: AcoesDaGrade;
}) {
  const [pagina, setPagina] = React.useState(1);
  const ultima = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, ultima);
  const visiveis = linhas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // A lista mudou de tamanho (filtro, aba, seletor de licitação): volta à primeira.
  const [tamanho, setTamanho] = React.useState(linhas.length);
  if (tamanho !== linhas.length) {
    setTamanho(linhas.length);
    setPagina(1);
  }

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Produto</Th>
            <Th>Situação</Th>
            <Th>Curva</Th>
            <Th numeric>Consumo/dia</Th>
            <Th numeric>Estoque</Th>
            <Th numeric>Trânsito</Th>
            <Th numeric>Cobertura</Th>
            <Th numeric>Gatilho</Th>
            <Th numeric>Sugestão</Th>
            <Th numeric className="w-28">Quantidade</Th>
            <Th numeric>Custo</Th>
            <Th className="w-36 text-right">Ações</Th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((linha) => {
            const codprod = Number(linha.medida.CODPROD);
            const escolhida = quantidades[codprod] ?? linha.sugerida;
            return (
              <Tr key={codprod}>
                <Td>
                  <RowTitle>{String(linha.medida.DESCRICAO)}</RowTitle>
                  <RowMeta>
                    <Code prefix="cód.">{codprod}</Code>
                    {` · ${String(linha.medida.EMBALAGEM) || '—'} · ${String(linha.medida.UNIDADE) || '—'}`}
                  </RowMeta>
                  {linha.silenciado ? (
                    <Status tone="off">
                      <span title={linha.motivoSilencio || 'Silenciado'}>
                        {`Silenciado até ${fmtData(linha.silenciadoAte)}`}
                      </span>
                    </Status>
                  ) : null}
                </Td>
                <Td>
                  <Status tone={TOM_STATUS[linha.status]}>{ROTULO_STATUS[linha.status]}</Status>
                </Td>
                <Td>
                  <span title={`Alvo de cobertura: ${linha.coberturaDias} dias (${linha.parametros.origemCobertura})`}>
                    {linha.curva}
                  </span>
                </Td>
                <Td numeric>{linha.consumoDiario > 0 ? consumo(linha.consumoDiario) : <Dash />}</Td>
                <Td numeric>{quantidade(linha.estoqueAtual)}</Td>
                <Td numeric>{linha.emTransito > 0 ? quantidade(linha.emTransito) : <Dash />}</Td>
                <Td numeric>
                  {linha.coberturaAtualDias === null
                    ? <span title="Sem giro: não há consumo para dividir"><Dash /></span>
                    : `${Math.round(linha.coberturaAtualDias)} d`}
                </Td>
                <Td numeric>
                  {linha.diasDeGatilho === null
                    ? <span title="Sem giro: não há consumo para dividir"><Dash /></span>
                    : linha.urgente
                      ? (
                        <Status tone="alert">
                          <span title={`Urgente: gatilho de ${linha.parametros.gatilhoDias} dias`}>
                            {`${linha.diasDeGatilho} d · urgente`}
                          </span>
                        </Status>
                      )
                      : `${linha.diasDeGatilho} d`}
                </Td>
                <Td numeric>{linha.sugerida > 0 ? quantidade(linha.sugerida) : <Dash />}</Td>
                <Td numeric>
                  <Input
                    type="number"
                    min={0}
                    className="text-right"
                    aria-label={`Quantidade de ${linha.medida.DESCRICAO}`}
                    value={String(escolhida)}
                    disabled={!podeOperar}
                    title={podeOperar ? `Sobe para a caixa cheia de ${linha.unidadesPorCaixa} un.` : motivoBloqueio}
                    onChange={(evento) => onQuantidade(codprod, Number(evento.target.value) || 0)}
                    onBlur={(evento) => onQuantidade(
                      codprod,
                      arredondarPorCaixa(Number(evento.target.value) || 0, linha.unidadesPorCaixa),
                    )}
                  />
                  <RowMeta>
                    {linha.unidadesPorCaixa > 1
                      ? `${(escolhida / linha.unidadesPorCaixa).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cx`
                      : 'unidade avulsa'}
                  </RowMeta>
                </Td>
                <Td numeric>{dinheiro(Number(linha.medida.CUSTO_ULT_ENTRADA))}</Td>
                <Td className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <IconButton label="Ver o detalhe do produto" onClick={() => acoes.onDetalhe(linha)}>
                      <Eye aria-hidden />
                    </IconButton>
                    <IconButton
                      label={podeOperar ? 'Escolher as vendas que não contam na demanda' : motivoBloqueio}
                      disabled={!podeOperar}
                      onClick={() => acoes.onVendas(linha)}
                    >
                      <Receipt aria-hidden />
                    </IconButton>
                    <IconButton
                      label={podeParametrizar ? 'Parâmetros deste produto' : motivoBloqueio}
                      disabled={!podeParametrizar}
                      onClick={() => acoes.onParametros(linha)}
                    >
                      <SlidersHorizontal aria-hidden />
                    </IconButton>
                    {linha.silenciado ? (
                      <IconButton
                        label={podeParametrizar ? 'Devolver o produto à fila de compra' : motivoBloqueio}
                        disabled={!podeParametrizar}
                        onClick={() => acoes.onRestaurar(linha)}
                      >
                        <RotateCcw aria-hidden />
                      </IconButton>
                    ) : (
                      <IconButton
                        label={podeParametrizar ? 'Silenciar o produto por um prazo' : motivoBloqueio}
                        disabled={!podeParametrizar}
                        onClick={() => acoes.onSilenciar(linha)}
                      >
                        <VolumeX aria-hidden />
                      </IconButton>
                    )}
                    <IconButton
                      label={podeOperar ? 'Jogar no carrinho' : motivoBloqueio}
                      disabled={!podeOperar || escolhida <= 0}
                      onClick={() => acoes.onAdicionar(linha, escolhida)}
                    >
                      <PlusCircle aria-hidden />
                    </IconButton>
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      <Pagination
        page={paginaAtual}
        lastPage={ultima}
        total={linhas.length}
        unit="produtos"
        onPrevious={() => setPagina((p) => Math.max(1, p - 1))}
        onNext={() => setPagina((p) => Math.min(ultima, p + 1))}
      />
    </>
  );
}
