// Spec 014 — a tabela da mesa: uma linha por produto (o consolidado do grupo,
// RN-PG-46) que abre o bloco por filial (RN-PG-47) com o único número digitável,
// o pedido da filial (RF-005). Digitar simula (C-007), sair do campo ou Enter
// confirma; fora da caixa fechada não grava e mostra "use M" (C-006).
import * as React from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, Wand2 } from 'lucide-react';
import { Code, Dash, IconButton, Input, RowMeta, RowTitle, Status, Table, Td, Th, TextLink, Tr } from '@/components/page';
import { moeda, numeroPt } from '@/lib/formato';
import {
  avisoDeCaixa, chave, quantidadeDigitada, ROTULO_TOM, sugestaoEmCaixa, tomCobertura, type LinhaFilial, type LinhaMesa, type TomCobertura,
} from '@/lib/galderma';

const un = (v: number) => numeroPt(v, 0);
const dias = (v: number | null) => (v === null ? 'sem giro' : `${numeroPt(v, 1)} d`);

const TOM_STATUS: Record<TomCobertura, 'live' | 'off' | 'attention' | 'alert'> = {
  'sem-giro': 'off', ruptura: 'alert', atencao: 'attention', adequado: 'live', excesso: 'attention',
};

/** C-020: o semáforo da cobertura com o texto ao lado, nunca só a cor. */
function Cobertura({ dias: d, alvo }: { dias: number | null; alvo: number }) {
  const tom = tomCobertura(d, alvo);
  return <Status tone={TOM_STATUS[tom]}>{d === null ? 'sem giro' : `${numeroPt(d, 0)} d · ${ROTULO_TOM[tom]}`}</Status>;
}

/** Negativo em destaque (RN-PG-47): ruptura projetada. */
const Num = ({ v }: { v: number }) => (v < 0 ? <span className="text-destructive">{un(v)}</span> : <>{un(v)}</>);

function CampoPedido({
  linha, unidadesPorCaixa, editavel, onSimular, onConfirmar,
}: {
  linha: LinhaFilial;
  unidadesPorCaixa: number;
  editavel: boolean;
  onSimular: (quantidade: number | null) => void;
  onConfirmar: (quantidade: number) => void;
}) {
  const [texto, setTexto] = React.useState(linha.pedido ? String(linha.pedido) : '');
  const [aviso, setAviso] = React.useState('');

  function confirmar() {
    const q = quantidadeDigitada(texto);
    const msg = avisoDeCaixa(q, unidadesPorCaixa);
    if (msg) { setAviso(msg); return; }
    setAviso('');
    onConfirmar(q);
  }
  const sugerido = Number(aviso.split('use ')[1] ?? 0);
  return (
    <div className="flex min-w-[7rem] flex-col items-end gap-1">
      <Input
        type="number" min={0} step={unidadesPorCaixa > 1 ? unidadesPorCaixa : 1}
        className="w-24 text-right" aria-label={`Pedido da filial ${linha.filial}`} value={texto} disabled={!editavel}
        onChange={(e) => { setTexto(e.target.value); setAviso(''); onSimular(quantidadeDigitada(e.target.value)); }}
        onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setTexto(linha.pedidoGravado ? String(linha.pedidoGravado) : ''); onSimular(null); } }}
      />
      {aviso ? (
        <RowMeta>
          <span className="text-attention">{aviso}</span>{' '}
          <TextLink onClick={() => { setTexto(String(sugerido)); setAviso(''); onConfirmar(sugerido); }}>usar</TextLink>
        </RowMeta>
      ) : null}
    </div>
  );
}

function BlocoFiliais({
  linha, alvo, editavel, onSimular, onConfirmar,
}: {
  linha: LinhaMesa;
  alvo: number;
  editavel: boolean;
  onSimular: (codfilial: string, quantidade: number | null) => void;
  onConfirmar: (codfilial: string, quantidade: number) => void;
}) {
  return (
    <Table>
      <thead>
        <Tr>
          <Th className="min-w-[11rem]">Filial</Th><Th numeric>Estoque</Th><Th numeric>Trânsito</Th><Th numeric>Venda no mês</Th>
          <Th numeric>Falta vender</Th><Th>Cobertura</Th><Th numeric>Sugestão</Th><Th numeric>Pedido</Th><Th numeric>Custo</Th><Th>Cob. futura</Th>
        </Tr>
      </thead>
      <tbody>
        {linha.filiais.map((f) => (
          <Tr key={f.codfilial}>
            <Td><RowTitle>{f.filial}</RowTitle>{f.qtdHerdada ? <RowMeta>{`herdado ${un(f.qtdHerdada)}`}</RowMeta> : null}</Td>
            <Td numeric><span title={`Físico ${un(f.qtestFisico)} − bloqueado ${un(f.qtBloqueada)} − reservado ${un(f.qtReservada)}`}>{un(f.qtest)}</span>{f.qtestFisico !== f.qtest ? <RowMeta>{`de ${un(f.qtestFisico)} físico`}</RowMeta> : null}</Td>
            <Td numeric>{f.emTransito ? un(f.emTransito) : <Dash />}<RowMeta>{`total ${un(f.estoqueTotal)}`}</RowMeta></Td>
            <Td numeric>{un(f.vendaMes)}<RowMeta>{`média tri. ${un(f.mediaTrimestre)}`}</RowMeta></Td>
            <Td numeric><Num v={f.difProjecaoVenda} /><RowMeta>{'líquido '}<Num v={f.estoqueLiquido} /></RowMeta></Td>
            <Td><Cobertura dias={f.coberturaDias} alvo={alvo} /></Td>
            <Td numeric>
              <span className="inline-flex items-center gap-1">
                {un(f.sugestaoCobertura)}
                {editavel && f.sugestaoCobertura > 0 ? (
                  <IconButton label={`Usar a sugestão em caixa fechada (${un(sugestaoEmCaixa(f.sugestaoCobertura, linha.unidadesPorCaixa))})`}
                    onClick={() => onConfirmar(f.codfilial, sugestaoEmCaixa(f.sugestaoCobertura, linha.unidadesPorCaixa))}><Wand2 /></IconButton>
                ) : null}
              </span>
            </Td>
            <Td numeric>
              {/* RN-PG-56: a chave inclui o gravado — gravou ou trocou de negociação, o rascunho volta ao gravado. */}
              <CampoPedido key={`${f.codfilial}|${f.pedidoGravado}`} linha={f} unidadesPorCaixa={linha.unidadesPorCaixa} editavel={editavel}
                onSimular={(q) => onSimular(f.codfilial, q)} onConfirmar={(q) => onConfirmar(f.codfilial, q)} />
            </Td>
            <Td numeric>{f.custoPedido ? moeda(f.custoPedido) : <Dash />}</Td>
            <Td>{dias(f.coberturaFuturaDias)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

/**
 * O topo da mesa: a proposta de sell-in como uma barra — o comprado no mês e o
 * pedido em cima dela, o resto é o saldo. SVG com as cores por token (`fill-*`),
 * nunca `style`; o texto ao lado diz os números (a barra não é a única leitura).
 */
export function BarraDaProposta({ proposta, comprado, pedido, saldo }: { proposta: number; comprado: number; pedido: number; saldo: number }) {
  const total = Math.max(proposta, comprado + pedido, 1);
  const pctComprado = (Math.max(0, comprado) / total) * 100;
  const pctPedido = (Math.max(0, pedido) / total) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-2.5 w-full overflow-hidden rounded-full" role="img"
        aria-label={`Proposta de ${un(proposta)} unidades: comprado no mês ${un(comprado)}, pedido ${un(pedido)}, saldo ${un(saldo)}`}>
        <rect x="0" y="0" width="100" height="4" className="fill-muted" />
        <rect x="0" y="0" width={pctComprado} height="4" className="fill-ink-muted" />
        <rect x={pctComprado} y="0" width={pctPedido} height="4" className="fill-primary" />
      </svg>
      <RowMeta>
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
          <strong className="text-ink">{`Proposta ${un(proposta)} un.`}</strong>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" aria-hidden />{`Pedido ${un(pedido)}`}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-ink-muted" aria-hidden />{`Comprado no mês ${un(comprado)}`}</span>
          <span>{`Saldo depois do pedido ${un(saldo)}`}</span>
        </span>
      </RowMeta>
    </div>
  );
}

export function TabelaMesa({
  linhas, alvo, editavel, onSimular, onConfirmar, onEditarItem, onRemoverItem,
}: {
  linhas: LinhaMesa[];
  alvo: number;
  editavel: boolean;
  onSimular: (chave: string, quantidade: number | null) => void;
  onConfirmar: (linha: LinhaMesa, codfilial: string, quantidade: number) => void;
  onEditarItem: (linha: LinhaMesa) => void;
  onRemoverItem: (linha: LinhaMesa) => void;
}) {
  // RN-PG-57: um produto aberto por vez.
  const [aberto, setAberto] = React.useState<number | null>(null);
  return (
    <Table>
      <thead>
        <Tr>
          <Th className="min-w-[15rem]">Produto</Th><Th numeric>Proposta sell-in</Th><Th numeric>Saldo a comprar</Th>
          <Th numeric>Estoque + trânsito</Th><Th numeric>Venda no mês</Th><Th numeric>Previsão sell-out</Th>
          <Th numeric>Sugestão</Th><Th numeric>Pedido total</Th><Th>Cobertura futura</Th><Th><span className="sr-only">Ações</span></Th>
        </Tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const g = l.grupo;
          const estaAberto = aberto === l.item.id;
          return (
            <React.Fragment key={l.item.id}>
              <Tr aria-expanded={estaAberto} onClick={() => setAberto(estaAberto ? null : l.item.id)}
                className={estaAberto ? 'cursor-pointer border-l-4 border-l-primary bg-accent' : 'cursor-pointer border-l-4 border-l-transparent'}>
                <Td>
                  <span className="inline-flex items-start gap-1.5">
                    {estaAberto ? <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden />}
                    <span>
                      <RowTitle>{l.item.descricao}</RowTitle>
                      <RowMeta><Code prefix="cód.">{l.item.codprod}</Code>{` · caixa ${l.unidadesPorCaixa}`}</RowMeta>
                    </span>
                  </span>
                </Td>
                <Td numeric>{un(l.item.propostaSellin)}<RowMeta>{`comprado ${un(g.compraMes)}`}</RowMeta></Td>
                <Td numeric>
                  <span title={`Sem o pedido: ${un(g.saldoAComprar)}`} className={g.saldoAComprarSimulado < 0 ? 'text-attention' : undefined}>{un(g.saldoAComprarSimulado)}</span>
                </Td>
                <Td numeric>{un(g.estoqueTotal)}</Td>
                <Td numeric>{un(g.vendaMes)}<RowMeta>{`média tri. ${un(g.mediaTrimestre)}`}</RowMeta></Td>
                <Td numeric>
                  {l.item.previsaoSellout ? un(l.item.previsaoSellout) : <Dash />}
                  <RowMeta>{'falta vender '}{g.difProjecaoVenda > g.estoqueTotal ? <span className="text-destructive">{un(g.difProjecaoVenda)}</span> : un(g.difProjecaoVenda)}</RowMeta>
                </Td>
                <Td numeric>{un(g.sugestaoCobertura)}</Td>
                <Td numeric>
                  {un(g.pedidoTotal)}
                  <RowMeta>{g.desvioProposta === 0 ? 'igual ao saldo' : `${g.desvioProposta > 0 ? '+' : '−'}${un(Math.abs(g.desvioProposta))} vs saldo`}</RowMeta>
                </Td>
                <Td>
                  <Cobertura dias={g.coberturaFuturaDias} alvo={alvo} />
                  <RowMeta>{`hoje ${dias(g.coberturaDias)}`}</RowMeta>
                </Td>
                <Td>
                  <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Editar o item" disabled={!editavel} onClick={() => onEditarItem(l)}><Pencil /></IconButton>
                    <IconButton label="Remover o item" tone="danger" disabled={!editavel} onClick={() => onRemoverItem(l)}><Trash2 /></IconButton>
                  </span>
                </Td>
              </Tr>
              {estaAberto ? (
                <Tr>
                  <Td colSpan={10} className="bg-muted/40">
                    <BlocoFiliais linha={l} alvo={alvo} editavel={editavel}
                      onSimular={(codfilial, q) => onSimular(chave(l.item.id, codfilial), q)}
                      onConfirmar={(codfilial, q) => onConfirmar(l, codfilial, q)} />
                  </Td>
                </Tr>
              ) : null}
            </React.Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}
