// Diálogos da tela de compras inteligentes (spec 011): detalhe do SKU,
// parâmetros (fornecedor e produto), silenciamento e vendas desconsideradas.
//
// Arquivo próprio pelo mesmo motivo do `grid.tsx`: o `max-lines` 800 não cabe a
// tela inteira num arquivo só.
//
// Custo de execução: o detalhe custa 3 chamadas e só ao abrir (RNF-003); o
// diálogo de vendas custa 1 ao abrir. Escrita nenhuma acontece aqui — quem
// chama as `sgcEsc*` é a página, que depois RELÊ o que o banco devolveu (D-03).
import * as React from 'react';

import {
  Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, Input, LabelledField, Panel, PanelHeader, Status, Table, Td,
  Textarea, Th, Tr,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { linhas } from '@/lib/mitra-api';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { dataDeSilencio } from '@/lib/ressuprimento';
import type { LinhaRessuprimento } from '@/lib/ressuprimento';

type Registro = Record<string, unknown>;

const quantidade = (valor: unknown) => Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/* ───────────────────────── Detalhe do SKU (RF-020 / C-021) ───────────────────────── */

export function DetalheSku({
  linha,
  codfilial,
  onFechar,
}: {
  linha: LinhaRessuprimento | null;
  codfilial: string;
  onFechar: () => void;
}) {
  const [historico, setHistorico] = React.useState<Registro[]>([]);
  const [compras, setCompras] = React.useState<Registro[]>([]);
  const [filiais, setFiliais] = React.useState<Registro[]>([]);
  const [erro, setErro] = React.useState('');
  const [pronto, setPronto] = React.useState(false);

  const codprod = linha ? Number(linha.medida.CODPROD) : 0;

  // Trocou de produto: a tela volta ao zero antes da nova carga — ajuste de
  // estado durante a renderização, não em efeito.
  const [ultimo, setUltimo] = React.useState(codprod);
  if (codprod !== ultimo) {
    setUltimo(codprod);
    setHistorico([]);
    setCompras([]);
    setFiliais([]);
    setErro('');
    setPronto(false);
  }

  // Uma execução por bloco, e SÓ ao abrir o detalhe (RNF-003).
  React.useEffect(() => {
    if (!codprod) return;
    let vivo = true;
    Promise.all([
      linhas('sgcWintProdutoHistorico', { codprod, codfilial, meses: 12 }),
      linhas('sgcWintProdutoUltimasCompras', { codprod }),
      linhas('sgcWintProdutoEstoqueFiliais', { codprod }),
    ]).then(
      ([h, c, f]) => {
        if (!vivo) return;
        setHistorico(h);
        setCompras(c);
        setFiliais(f);
      },
      () => vivo && setErro('Não foi possível carregar o detalhe deste produto.'),
    ).finally(() => vivo && setPronto(true));
    return () => { vivo = false; };
  }, [codprod, codfilial]);

  if (!linha) return null;
  const m = linha.medida;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{String(m.DESCRICAO)}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}

            <Panel>
              <PanelHeader
                title="Posição de estoque"
                hint={`Código ${codprod} · ${String(m.EMBALAGEM) || '—'} · última saída ${fmtData(String(m.DT_ULT_SAIDA)) || '—'}`}
              />
              <Table>
                <thead>
                  <tr>
                    <Th numeric>Total</Th>
                    <Th numeric>Bloqueado</Th>
                    <Th numeric>Avariado</Th>
                    <Th numeric>Reservado</Th>
                    <Th numeric>Disponível</Th>
                    <Th numeric>Pedido ao ERP</Th>
                    <Th numeric>Em trânsito</Th>
                  </tr>
                </thead>
                <tbody>
                  <Tr>
                    <Td numeric>{quantidade(m.ESTOQUE_TOTAL)}</Td>
                    <Td numeric>{quantidade(m.QT_BLOQUEADA)}</Td>
                    <Td numeric>{quantidade(m.QT_INDENIZ)}</Td>
                    <Td numeric>{quantidade(m.QT_RESERV)}</Td>
                    <Td numeric>{quantidade(m.ESTOQUE_ATUAL)}</Td>
                    <Td numeric>{quantidade(m.QT_PEDIDA_ERP)}</Td>
                    <Td numeric>{quantidade(m.QT_TRANSITO)}</Td>
                  </Tr>
                </tbody>
              </Table>
            </Panel>

            <Panel>
              <PanelHeader title="Histórico dos últimos 12 meses" hint="Saídas, entradas e a parte pública das saídas." />
              {pronto && historico.length === 0 ? (
                <EmptyState title="Sem movimento nos 12 meses" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Mês</Th>
                      <Th numeric>Saídas</Th>
                      <Th numeric>Entradas</Th>
                      <Th numeric>Saídas públicas</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h) => (
                      <Tr key={String(h.MES)}>
                        <Td>{String(h.MES)}</Td>
                        <Td numeric>{quantidade(h.SAIDAS)}</Td>
                        <Td numeric>{quantidade(h.ENTRADAS)}</Td>
                        <Td numeric>{quantidade(h.SAIDAS_PUBLICAS)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Últimas compras" hint="As 10 entradas mais recentes deste produto, em qualquer filial." />
              {pronto && compras.length === 0 ? (
                <EmptyState title="Nenhuma entrada registrada" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Entrada</Th>
                      <Th>Nota</Th>
                      <Th>Filial</Th>
                      <Th numeric>Quantidade</Th>
                      <Th numeric>Preço</Th>
                      <Th numeric>Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {compras.map((c, indice) => (
                      <Tr key={`${String(c.NUMTRANSENT)}-${indice}`}>
                        <Td>{fmtData(String(c.DT_ENTRADA))}</Td>
                        <Td><Code>{String(c.NUMNOTA)}</Code></Td>
                        <Td>{String(c.CODFILIAL)}</Td>
                        <Td numeric>{quantidade(c.QUANTIDADE)}</Td>
                        <Td numeric>{moeda(Number(c.PRECO_UNITARIO))}</Td>
                        <Td numeric>{moeda(Number(c.VALOR_TOTAL))}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Estoque nas outras filiais" hint="Mesmo estoque líquido: total menos bloqueado, avariado e reservado." />
              {pronto && filiais.length === 0 ? (
                <EmptyState title="Sem estoque em nenhuma filial" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Filial</Th>
                      <Th numeric>Total</Th>
                      <Th numeric>Disponível</Th>
                      <Th numeric>Em trânsito</Th>
                      <Th numeric>Venda 3 meses</Th>
                      <Th>Última saída</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filiais.map((f) => (
                      <Tr key={String(f.CODFILIAL)}>
                        <Td>{String(f.FILIAL)}</Td>
                        <Td numeric>{quantidade(f.ESTOQUE_TOTAL)}</Td>
                        <Td numeric>{quantidade(f.ESTOQUE_ATUAL)}</Td>
                        <Td numeric>{quantidade(f.ESTOQUE_EM_TRANSITO)}</Td>
                        <Td numeric>{quantidade(f.VENDA_3_MESES)}</Td>
                        <Td>{f.DT_ULT_SAIDA ? fmtData(String(f.DT_ULT_SAIDA)) : <Dash />}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

export function VendasDialogo({
  linha,
  codfilial,
  periodo,
  desconsideradas,
  onFechar,
  onDesconsiderar,
  onReconsiderar,
}: {
  linha: LinhaRessuprimento | null;
  codfilial: string;
  periodo: { inicio: string; fim: string };
  /** Os `NUMTRANSITEM` que voltaram do banco — nunca o que a tela achou que gravou (D-03). */
  desconsideradas: number[];
  onFechar: () => void;
  onDesconsiderar: (venda: { numtransitem: number; codprod: number; dtmov: string; quantidade: number; motivo: string }) => Promise<void>;
  onReconsiderar: (numtransitem: number) => Promise<void>;
}) {
  const [vendas, setVendas] = React.useState<Registro[]>([]);
  const [motivo, setMotivo] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);

  const codprod = linha ? Number(linha.medida.CODPROD) : 0;

  // Uma execução ao abrir (RNF-003).
  React.useEffect(() => {
    if (!codprod) return;
    let vivo = true;
    linhas('sgcWintProdutoVendas', { codprod, codfilial, dataInicio: periodo.inicio, dataFim: periodo.fim }).then(
      (rows) => vivo && setVendas(rows),
      () => vivo && setErro('Não foi possível carregar as vendas deste produto.'),
    );
    return () => { vivo = false; };
  }, [codprod, codfilial, periodo.inicio, periodo.fim]);

  if (!linha) return null;

  async function marcar(venda: Registro) {
    if (motivo.trim().length < 3) {
      setErro('Escreva o motivo antes de desconsiderar a venda.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      await onDesconsiderar({
        numtransitem: Number(venda.NUMTRANSITEM),
        codprod,
        dtmov: String(venda.DTMOV),
        quantidade: Number(venda.QUANTIDADE),
        motivo: motivo.trim(),
      });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível desconsiderar a venda.');
    } finally {
      setOcupado(false);
    }
  }

  async function devolver(numtransitem: number) {
    setOcupado(true);
    setErro('');
    try {
      await onReconsiderar(numtransitem);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível reconsiderar a venda.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{`Vendas de ${linha.medida.DESCRICAO}`}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}
            <LabelledField
              label="Motivo"
              obrigatorio
              hint="A venda desconsiderada sai da demanda na origem: a lista inteira é recalculada."
            >
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </LabelledField>

            {vendas.length === 0 ? (
              <EmptyState title="Nenhuma venda no período" hint="A janela da tela são os últimos 153 dias." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Cliente</Th>
                    <Th numeric>Quantidade</Th>
                    <Th numeric>Valor</Th>
                    <Th>Situação</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {vendas.map((venda) => {
                    const numtransitem = Number(venda.NUMTRANSITEM);
                    const fora = desconsideradas.includes(numtransitem);
                    return (
                      <Tr key={numtransitem}>
                        <Td>{fmtData(String(venda.DTMOV))}</Td>
                        <Td>
                          {String(venda.CLIENTE) || <Dash />}
                          {Number(venda.PUBLICO) === 1 ? <Status tone="attention">Órgão público</Status> : null}
                        </Td>
                        <Td numeric>{quantidade(venda.QUANTIDADE)}</Td>
                        <Td numeric>{moeda(Number(venda.VALOR_TOTAL))}</Td>
                        <Td>
                          <Status tone={fora ? 'off' : 'live'}>{fora ? 'Fora da demanda' : 'Na demanda'}</Status>
                        </Td>
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
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={ocupado}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
