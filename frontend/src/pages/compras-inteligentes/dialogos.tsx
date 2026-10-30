// Diálogos da tela de compras inteligentes (spec 011): parâmetros (fornecedor
// e produto), silenciamento e vendas desconsideradas. A "Análise do Produto"
// (o antigo detalhe do SKU) mora em `analise-produto.tsx` (R-123) e reaproveita
// daqui o corpo `VendasDoProduto`.
//
// Arquivo próprio pelo mesmo motivo do `grid.tsx`: o `max-lines` 800 não cabe a
// tela inteira num arquivo só.
//
// Custo de execução: o corpo de vendas custa 1 chamada ao abrir (RNF-003).
// Escrita nenhuma acontece aqui — quem chama as `sgcEsc*` é a página, que
// depois RELÊ o que o banco devolveu (D-03).
import * as React from 'react';

import {
  Alert, Button, ChipContagem, Code, Dash, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, GradeMini, Input, LabelledField, MiniCartao, RowMeta, Status, Table, Td,
  Textarea, Th, Tr,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { linhas } from '@/lib/mitra-api';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { dataDeSilencio } from '@/lib/ressuprimento';
import type { LinhaRessuprimento } from '@/lib/ressuprimento';
import { mesesDeVendas, resumoDeVendas, vendasDoMes } from '@/lib/ressuprimento-detalhe';
import type { VendaDoProduto } from '@/lib/ressuprimento-detalhe';

const quantidade = (valor: unknown) => Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/* ─────────────────── Parâmetros de compra (RF-010 / C-010, C-011) ─────────────────── */

export interface AlvoParametro {
  /** `0` = a linha do fornecedor, que vale para todos os produtos dele. */
  codprod: number;
  titulo: string;
  coberturaDias: number;
  leadTimeDias: number;
  gatilhoDias: number;
}

export function ParametrosDialogo({
  alvo,
  onFechar,
  onSalvar,
}: {
  alvo: AlvoParametro | null;
  onFechar: () => void;
  onSalvar: (valores: { codprod: number; coberturaDias: number; leadTimeDias: number; gatilhoDias: number }) => Promise<void>;
}) {
  const [cobertura, setCobertura] = React.useState('0');
  const [lead, setLead] = React.useState('0');
  const [gatilho, setGatilho] = React.useState('0');
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const chave = alvo ? `${alvo.codprod}` : '';
  const [ultimaChave, setUltimaChave] = React.useState(chave);
  if (chave !== ultimaChave) {
    setUltimaChave(chave);
    setCobertura(String(alvo?.coberturaDias ?? 0));
    setLead(String(alvo?.leadTimeDias ?? 0));
    setGatilho(String(alvo?.gatilhoDias ?? 0));
    setErro('');
  }

  if (!alvo) return null;

  async function salvar() {
    const valores = {
      codprod: alvo!.codprod,
      coberturaDias: Number(cobertura) || 0,
      leadTimeDias: Number(lead) || 0,
      gatilhoDias: Number(gatilho) || 0,
    };
    if (valores.coberturaDias < 0 || valores.leadTimeDias < 0 || valores.gatilhoDias < 0) {
      setErro('Nenhum dos três pode ser negativo.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await onSalvar(valores);
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar os parâmetros.');
    } finally {
      setSalvando(false);
    }
  }

  const herda = 'Zero significa herdar: do fornecedor, e na falta dele da regra geral.';

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alvo.titulo}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}
            <LabelledField label="Cobertura (dias)" hint={`${herda} Sem parâmetro, vale o alvo da curva do produto.`}>
              <Input type="number" min={0} value={cobertura} title={herda} onChange={(e) => setCobertura(e.target.value)} />
            </LabelledField>
            <LabelledField label="Lead time (dias)" hint={`${herda} Sem parâmetro, vale o lead medido e, na falta dele, 9 dias.`}>
              <Input type="number" min={0} value={lead} title={herda} onChange={(e) => setLead(e.target.value)} />
            </LabelledField>
            <LabelledField label="Gatilho (dias)" hint={`${herda} Sem parâmetro, 15 dias. É o que marca o produto como urgente.`}>
              <Input type="number" min={0} value={gatilho} title={herda} onChange={(e) => setGatilho(e.target.value)} />
            </LabelledField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────── Silenciar o produto (RF-011) ────────────────────────── */

export function SilenciarDialogo({
  linha,
  onFechar,
  onSilenciar,
}: {
  linha: LinhaRessuprimento | null;
  onFechar: () => void;
  onSilenciar: (valores: { codprod: number; silenciadoAte: string; motivo: string }) => Promise<void>;
}) {
  const [ate, setAte] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const codprod = linha ? Number(linha.medida.CODPROD) : 0;
  const [ultimo, setUltimo] = React.useState(codprod);
  if (codprod !== ultimo) {
    setUltimo(codprod);
    // RN-013: o padrão são 30 dias a partir de hoje.
    setAte(dataDeSilencio(hojeIso()));
    setMotivo('');
    setErro('');
  }

  if (!linha) return null;

  async function salvar() {
    if (!ate || motivo.trim().length < 3) {
      setErro('A data e o motivo são obrigatórios — é o motivo que explica a ausência na próxima semana.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await onSilenciar({ codprod, silenciadoAte: ate, motivo: motivo.trim() });
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível silenciar o produto.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Silenciar ${linha.medida.DESCRICAO}`}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}
            <Alert tone="info">
              O produto sai da aba &quot;A comprar&quot; até a data escolhida e continua na aba &quot;Todos&quot;,
              marcado com o motivo. Você pode devolvê-lo à fila a qualquer momento.
            </Alert>
            <LabelledField label="Silenciar até" obrigatorio>
              <DatePicker value={ate} onChange={setAte} min={hojeIso()} aria-label="Silenciar até" />
            </LabelledField>
            <LabelledField label="Motivo" obrigatorio hint="Fica visível na lista, ao lado do produto.">
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </LabelledField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Silenciar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────── Vendas desconsideradas (RF-012 / C-013) ──────────────────── */

/* ─────────────── Vendas do produto (RF-012 / C-013) — corpo reaproveitado ─────────────── */

/** O que a janela de vendas e a aba Vendas da Análise do Produto recebem. */
export interface VendasDoProdutoProps {
  linha: LinhaRessuprimento;
  codfilial: string;
  periodo: { inicio: string; fim: string };
  /** Os `NUMTRANSITEM` que voltaram do banco — nunca o que a tela achou que gravou (D-03). */
  desconsideradas: number[];
  onDesconsiderar: (venda: { numtransitem: number; codprod: number; dtmov: string; quantidade: number; motivo: string }) => Promise<void>;
  onReconsiderar: (numtransitem: number) => Promise<void>;
  /** Quantas vendas voltaram (a aba "Vendas (N)" da Análise do Produto). */
  onContagem?: (total: number) => void;
  onOcupado?: (ocupado: boolean) => void;
}

/**
 * R-123: o corpo da aba Vendas do legado — as três métricas, a nota, os meses
 * em pílula, a tabela com cliente e vendedor e as ações. UMA execução ao abrir
 * (RNF-003); a linha desconsiderada leva o fundo de atenção.
 */
export function VendasDoProduto({
  linha,
  codfilial,
  periodo,
  desconsideradas,
  onDesconsiderar,
  onReconsiderar,
  onContagem,
  onOcupado,
}: VendasDoProdutoProps) {
  const [vendas, setVendas] = React.useState<VendaDoProduto[]>([]);
  const [pronto, setPronto] = React.useState(false);
  const [mes, setMes] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);

  const codprod = Number(linha.medida.CODPROD);

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcWintProdutoVendas', { codprod, codfilial, dataInicio: periodo.inicio, dataFim: periodo.fim }).then(
      (rows) => {
        if (!vivo) return;
        const lista = rows as unknown as VendaDoProduto[];
        setVendas(lista);
        onContagem?.(lista.length);
      },
      () => vivo && setErro('Não foi possível carregar as vendas deste produto.'),
    ).finally(() => vivo && setPronto(true));
    return () => { vivo = false; };
    // `onContagem` é um setState da janela: estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codprod, codfilial, periodo.inicio, periodo.fim]);

  const ocupar = (valor: boolean) => { setOcupado(valor); onOcupado?.(valor); };

  async function marcar(venda: VendaDoProduto) {
    if (motivo.trim().length < 3) {
      setErro('Escreva o motivo antes de desconsiderar a venda.');
      return;
    }
    ocupar(true);
    setErro('');
    try {
      await onDesconsiderar({
        numtransitem: Number(venda.NUMTRANSITEM), codprod, dtmov: String(venda.DTMOV), quantidade: Number(venda.QUANTIDADE), motivo: motivo.trim(),
      });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível desconsiderar a venda.');
    } finally {
      ocupar(false);
    }
  }

  async function devolver(numtransitem: number) {
    ocupar(true);
    setErro('');
    try {
      await onReconsiderar(numtransitem);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível reconsiderar a venda.');
    } finally {
      ocupar(false);
    }
  }

  const resumo = resumoDeVendas(vendas, desconsideradas);
  const meses = mesesDeVendas(vendas);
  const visiveis = vendasDoMes(vendas, mes);

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <GradeMini colunas={3}>
        <MiniCartao rotulo="Vendas listadas" valor={pronto ? resumo.listadas.toLocaleString('pt-BR') : <Dash />} />
        <MiniCartao rotulo="Qtd. desconsiderada" valor={pronto ? `${quantidade(resumo.quantidadeDesconsiderada)} un.` : <Dash />} />
        <MiniCartao rotulo="Valor desconsiderado" valor={pronto ? moeda(resumo.valorDesconsiderado) : <Dash />} />
      </GradeMini>
      <RowMeta>Desconsiderar uma venda remove a quantidade dela da tendência e da projeção deste produto.</RowMeta>

      {meses.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mês das vendas">
          <ChipContagem ativo={mes === ''} onClick={() => setMes('')}>Todos os meses</ChipContagem>
          {meses.map((m) => (
            <ChipContagem key={m.mes} ativo={mes === m.mes} onClick={() => setMes(m.mes)}>
              {`${m.rotulo} · ${m.vendas} ${m.vendas === 1 ? 'venda' : 'vendas'} · ${moeda(m.valor)}`}
            </ChipContagem>
          ))}
        </div>
      ) : null}

      <LabelledField
        label="Motivo"
        obrigatorio
        hint="A venda desconsiderada sai da demanda na origem: a lista inteira é recalculada."
      >
        <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </LabelledField>

      {!pronto ? (
        <EmptyState title="Carregando…" />
      ) : visiveis.length === 0 ? (
        <EmptyState title="Nenhuma venda encontrada para o período atual." hint="A janela da tela são os últimos 153 dias." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Emissão</Th>
              <Th numeric>Quantidade</Th>
              <Th numeric>Valor</Th>
              <Th>Cód. cliente</Th>
              <Th>Cliente</Th>
              <Th>Cód. vend.</Th>
              <Th>Vendedor</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((venda) => {
              const numtransitem = Number(venda.NUMTRANSITEM);
              const fora = desconsideradas.includes(numtransitem);
              return (
                <Tr key={numtransitem} className={fora ? 'bg-attention-bg' : undefined}>
                  <Td>{fmtData(String(venda.DTMOV))}</Td>
                  <Td numeric>{quantidade(venda.QUANTIDADE)}</Td>
                  <Td numeric>{moeda(Number(venda.VALOR_TOTAL))}</Td>
                  <Td><Code>{String(venda.CODCLI)}</Code></Td>
                  <Td>
                    {String(venda.CLIENTE) || <Dash />}
                    {Number(venda.PUBLICO) === 1 ? <RowMeta><Status tone="attention">Órgão público</Status></RowMeta> : null}
                    {fora ? <RowMeta><Status tone="off">Fora da demanda</Status></RowMeta> : null}
                  </Td>
                  <Td>{Number(venda.CODUSUR) > 0 ? <Code>{String(venda.CODUSUR)}</Code> : <Dash />}</Td>
                  <Td>{String(venda.VENDEDOR ?? '') || <Dash />}</Td>
                  <Td className="text-right">
                    {fora ? (
                      <Button size="sm" disabled={ocupado} onClick={() => void devolver(numtransitem)}>
                        Reconsiderar
                      </Button>
                    ) : (
                      <Button size="sm" disabled={ocupado} onClick={() => void marcar(venda)}>
                        Desconsiderar
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/** A janela de vendas do painel: o mesmo corpo, com título e Fechar. */
export function VendasDialogo({
  linha,
  onFechar,
  ...corpo
}: Omit<VendasDoProdutoProps, 'linha' | 'onContagem' | 'onOcupado'> & {
  linha: LinhaRessuprimento | null;
  onFechar: () => void;
}) {
  const [ocupado, setOcupado] = React.useState(false);
  if (!linha) return null;
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{`Vendas de ${linha.medida.DESCRICAO}`}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VendasDoProduto linha={linha} {...corpo} onOcupado={setOcupado} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={ocupado}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
