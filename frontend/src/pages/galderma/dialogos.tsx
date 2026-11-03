// Spec 014 — os diálogos da mesa Galderma: cabeçalho da negociação (C-001,
// C-018), item da proposta (C-012), importação da planilha (C-009), histórico
// de decisões (RF-006), extrato por filial (C-021) e a geração dos pedidos
// (C-014..C-016). Cada um recebe pronto o que mostra e devolve a decisão: quem
// chama o servidor é a página.
import * as React from 'react';
import {
  Alert, Button, CheckRow, Code, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Input, LabelledField, Pagination, RowMeta, RowTitle, SelectMenu, Table, Td, Textarea, Th, Tr,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { fmtDataHora, moeda, numeroPt } from '@/lib/formato';
import {
  origensPossiveis, rotuloCompetencia, SEM_PRODUTO, validarCabecalho, type Cabecalho, type ItemProposta, type Negociacao, type PedidoDaFilial,
  type ProdutoGalderma,
} from '@/lib/galderma';

const un = (v: number) => numeroPt(v, 0);

/* ─────────────── cabeçalho ─────────────── */

export function DialogoNegociacao({
  aberto, titulo, inicial, filiais, origens, criando, salvando, erro, onFechar, onSalvar,
}: {
  aberto: boolean;
  titulo: string;
  inicial: Cabecalho;
  filiais: { codfilial: string; filial: string }[];
  origens: Negociacao[];
  criando: boolean;
  salvando: boolean;
  erro: string;
  onFechar: () => void;
  onSalvar: (c: Cabecalho) => void;
}) {
  const [c, setC] = React.useState(inicial);
  // A página monta o diálogo a cada abertura: o estado nasce de `inicial`.
  const [aviso, setAviso] = React.useState('');
  const alternarFilial = (codfilial: string) => setC((atual) => ({
    ...atual, filiais: atual.filiais.includes(codfilial) ? atual.filiais.filter((f) => f !== codfilial) : [...atual.filiais, codfilial],
  }));
  const opcoesOrigem = [{ value: '0', label: 'Nenhuma — negociação nova' },
    ...origensPossiveis(origens, c.competencia).map((o) => ({ value: String(o.id), label: `${o.descricao} (${rotuloCompetencia(o.competencia)})` }))];

  function salvar() {
    const msg = validarCabecalho(c);
    if (msg) { setAviso(msg); return; }
    onSalvar(c);
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>A negociação é mensal e o pedido é digitado por filial.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelledField label="Competência" obrigatorio>
              <Input type="month" value={c.competencia} disabled={!criando && c.idPai > 0} onChange={(e) => setC({ ...c, competencia: e.target.value, idPai: 0 })} />
            </LabelledField>
            <LabelledField label="Data do pedido" obrigatorio>
              <DatePicker value={c.dataPedido} onChange={(v) => setC({ ...c, dataPedido: v })} aria-label="Data do pedido" />
            </LabelledField>
            <LabelledField label="Descrição" className="sm:col-span-2">
              <Input value={c.descricao} maxLength={200} onChange={(e) => setC({ ...c, descricao: e.target.value })} />
            </LabelledField>
            <LabelledField label="Cobertura alvo (dias)" hint="Vazio ou zero vale 35.">
              <Input type="number" min={1} value={c.coberturaAlvoDias || ''} onChange={(e) => setC({ ...c, coberturaAlvoDias: Number(e.target.value) || 0 })} />
            </LabelledField>
            <LabelledField label="Meta de sell-out (R$)" hint="Informativa: digitada uma vez, nunca calculada.">
              <Input type="number" min={0} step="0.01" value={c.metaSelloutValor || ''} onChange={(e) => setC({ ...c, metaSelloutValor: Number(e.target.value) || 0 })} />
            </LabelledField>
          </div>
          <div className="mt-3 grid gap-1">
            <RowMeta>Filiais participantes</RowMeta>
            {filiais.map((f) => (
              <CheckRow key={f.codfilial} marcado={c.filiais.includes(f.codfilial)} onToggle={() => alternarFilial(f.codfilial)}>{`${f.codfilial} · ${f.filial}`}</CheckRow>
            ))}
          </div>
          <div className="mt-3">
            <CheckRow marcado={c.transitoComoCompra} onToggle={() => setC({ ...c, transitoComoCompra: !c.transitoComoCompra })}
              hint="Desmarcado (o padrão): só a compra do mês desconta da proposta.">
              Considerar o que está em trânsito como compra do mês
            </CheckRow>
          </div>
          {criando ? (
            <LabelledField label="Criar a partir de" className="mt-3" hint="Só negociação convertida da mesma competência, sem outra complementar: o que ela pediu desconta da sugestão e do saldo.">
              <SelectMenu label="Criar a partir de" value={String(c.idPai)} options={opcoesOrigem} onChange={(v) => setC({ ...c, idPai: Number(v) })} />
            </LabelledField>
          ) : null}
          <LabelledField label="Observação" className="mt-3">
            <Textarea value={c.observacao} maxLength={1000} onChange={(e) => setC({ ...c, observacao: e.target.value })} />
          </LabelledField>
          {aviso || erro ? <Alert tone="error" className="mt-3">{aviso || erro}</Alert> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── item da proposta ─────────────── */

const CAMPOS_ITEM: { campo: keyof ItemProposta; rotulo: string; moeda?: boolean }[] = [
  { campo: 'precoSellout', rotulo: 'Preço sell-out (R$)', moeda: true },
  { campo: 'precoNet', rotulo: 'Preço net (R$)', moeda: true },
  { campo: 'precoLista', rotulo: 'Preço de lista cheio (R$)', moeda: true },
  { campo: 'precoListaDesc', rotulo: 'Preço de lista com desconto (R$)', moeda: true },
  { campo: 'estoqueInicial', rotulo: 'Estoque inicial informado' },
  { campo: 'mediaSellout', rotulo: 'Média de sell-out' },
  { campo: 'previsaoSellout', rotulo: 'Previsão de sell-out' },
  { campo: 'propostaSellin', rotulo: 'Proposta de sell-in' },
  { campo: 'metaSellinValor', rotulo: 'Meta de sell-in (R$)', moeda: true },
];

export function DialogoItem({
  aberto, inicial, produtos, salvando, erro, onFechar, onSalvar,
}: {
  aberto: boolean;
  inicial: ItemProposta;
  produtos: ProdutoGalderma[];
  salvando: boolean;
  erro: string;
  onFechar: () => void;
  onSalvar: (item: ItemProposta) => void;
}) {
  const [item, setItem] = React.useState(inicial);
  const [aviso, setAviso] = React.useState('');
  const opcoes = produtos.map((p) => ({ value: String(p.codprod), label: `${p.codprod} · ${p.descricao}`, hint: p.ean }));
  function escolher(codprod: string) {
    const p = produtos.find((x) => String(x.codprod) === codprod);
    setItem({ ...item, codprod: Number(codprod), descricao: p?.descricao ?? '', ean: p?.ean ?? '' });
  }
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{inicial.id ? 'Editar item da proposta' : 'Adicionar item da proposta'}</DialogTitle>
          <DialogDescription>O que a Galderma propôs para este produto. A posição de cada filial vem do ERP.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <LabelledField label="Produto" obrigatorio>
            {inicial.id ? <RowTitle>{`${item.codprod} · ${item.descricao}`}</RowTitle>
              : <SelectMenu label="Produto" value={item.codprod ? String(item.codprod) : ''} options={opcoes} onChange={escolher} placeholder="Escolha no catálogo Galderma" />}
          </LabelledField>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {CAMPOS_ITEM.map(({ campo, rotulo, moeda: m }) => (
              <LabelledField key={campo} label={rotulo}>
                <Input type="number" min={0} step={m ? '0.01' : '1'} value={item[campo] ? String(item[campo]) : ''}
                  onChange={(e) => setItem({ ...item, [campo]: Number(e.target.value) || 0 })} />
              </LabelledField>
            ))}
          </div>
          <LabelledField label="Observação" className="mt-3">
            <Textarea value={item.observacao} maxLength={500} onChange={(e) => setItem({ ...item, observacao: e.target.value })} />
          </LabelledField>
          {aviso || erro ? <Alert tone="error" className="mt-3">{aviso || erro}</Alert> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button variant="primary" disabled={salvando} onClick={() => (item.codprod > 0 ? onSalvar(item) : setAviso(SEM_PRODUTO))}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── importação ─────────────── */

export interface ResultadoImportacao { lidas: number; gravadas: number; semProduto: { ean: string; sku: string }[] }

export function DialogoImportar({
  aberto, importando, resultado, erro, onFechar, onArquivo,
}: {
  aberto: boolean;
  importando: boolean;
  resultado: ResultadoImportacao | null;
  erro: string;
  onFechar: () => void;
  onArquivo: (texto: string) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar a planilha da Galderma</DialogTitle>
          <DialogDescription>
            Arquivo separado por ponto e vírgula (no Excel: Salvar como → CSV). Duas linhas de cabeçalho; EAN na 2ª coluna; números no formato 1,234.56.
            Reimportar atualiza só o que a planilha traz.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input type="file" accept=".csv,.txt" disabled={importando} aria-label="Arquivo da planilha"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) onArquivo(await f.text()); e.target.value = ''; }} />
          {importando ? <RowMeta>Importando…</RowMeta> : null}
          {resultado ? (
            <div className="mt-3 grid gap-2">
              <Alert tone={resultado.semProduto.length ? 'warn' : 'success'}>
                {`${resultado.lidas} linhas lidas · ${resultado.gravadas} gravadas · ${resultado.semProduto.length} sem produto`}
              </Alert>
              {resultado.semProduto.map((s) => <RowMeta key={s.ean}>{`EAN ${s.ean} · SKU ${s.sku || '—'} — sem produto no ERP`}</RowMeta>)}
            </div>
          ) : null}
          {erro ? <Alert tone="error" className="mt-3">{erro}</Alert> : null}
        </DialogBody>
        <DialogFooter><Button onClick={onFechar}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── histórico de decisões ─────────────── */

export function DialogoHistorico({
  aberto, linhas, pagina, porPagina, carregando, onPagina, onFechar,
}: {
  aberto: boolean;
  linhas: Record<string, unknown>[];
  pagina: number;
  porPagina: number;
  carregando: boolean;
  onPagina: (p: number) => void;
  onFechar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de decisões</DialogTitle>
          <DialogDescription>Cada mudança do pedido por filial, da mais recente para a mais antiga.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {linhas.length === 0 && !carregando ? <EmptyState title="Nenhuma decisão registrada." /> : (
            <Table>
              <tbody>
                {linhas.map((l) => (
                  <Tr key={String(l.ID)}>
                    <Td>
                      <RowTitle>{`${String(l.DESCRICAO || `Produto ${l.CODPROD}`)} · Filial ${String(l.CODFILIAL)} — de ${String(l.ANTES)} para ${String(l.DEPOIS)}`}</RowTitle>
                      <RowMeta>{`${String(l.POR_NOME || '—')} · ${fmtDataHora(String(l.EM))}`}</RowMeta>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={pagina} lastPage={linhas.length < porPagina ? pagina : pagina + 1} total={linhas.length} unit="decisões nesta página"
            busy={carregando} onPrevious={() => onPagina(Math.max(1, pagina - 1))} onNext={() => onPagina(pagina + 1)} />
        </DialogBody>
        <DialogFooter><Button onClick={onFechar}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── extrato e geração ─────────────── */

function ExtratoDaFilial({ pedido }: { pedido: PedidoDaFilial }) {
  return (
    <div className="grid gap-1">
      <RowTitle>{`${pedido.codfilial} · ${pedido.filial}`}</RowTitle>
      <Table>
        <thead><Tr><Th>Código</Th><Th>Produto</Th><Th numeric>Quantidade</Th><Th numeric>Preço com desconto</Th><Th numeric>Valor</Th></Tr></thead>
        <tbody>
          {pedido.produtos.map((p) => (
            <Tr key={p.codprod}>
              <Td><Code>{p.codprod}</Code></Td><Td>{p.descricao}</Td><Td numeric>{un(p.qtdPedida)}</Td>
              <Td numeric>{p.precoCusto ? moeda(p.precoCusto) : <Dash />}</Td><Td numeric>{moeda(p.valor)}</Td>
            </Tr>
          ))}
          <Tr><Td /><Td><RowTitle>Total</RowTitle></Td><Td numeric><RowTitle>{un(pedido.unidades)}</RowTitle></Td><Td /><Td numeric><RowTitle>{moeda(pedido.valor)}</RowTitle></Td></Tr>
        </tbody>
      </Table>
    </div>
  );
}

export function DialogoExtrato({ aberto, pedidos, onFechar }: { aberto: boolean; pedidos: PedidoDaFilial[]; onFechar: () => void }) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Extrato por filial</DialogTitle>
          <DialogDescription>O pedido gravado de cada filial, a preço com desconto da proposta.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {pedidos.length === 0 ? <EmptyState title="Nenhuma filial com pedido." /> : <div className="grid gap-4">{pedidos.map((p) => <ExtratoDaFilial key={p.codfilial} pedido={p} />)}</div>}
        </DialogBody>
        <DialogFooter><Button onClick={onFechar}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoGerar({
  aberto, pedidos, jaGeradas, gerando, erro, gerados, onFechar, onConfirmar,
}: {
  aberto: boolean;
  pedidos: PedidoDaFilial[];
  jaGeradas: string[];
  gerando: boolean;
  erro: string;
  gerados: { filial: string; cardId: number }[];
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  const concluido = gerados.length > 0 && !erro && !gerando;
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !gerando && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{concluido ? 'Pedidos gerados' : 'Gerar os pedidos no quadro de compras'}</DialogTitle>
          <DialogDescription>
            {concluido ? 'Cada filial tem o seu pedido na Análise do quadro de compras.'
              : 'Um pedido por filial com pedido gravado, na Análise, com os itens e o preço com desconto. Depois disso a negociação fica somente leitura para sempre.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {concluido ? (
            <Table><tbody>{gerados.map((g) => <Tr key={g.cardId}><Td>{g.filial}</Td><Td numeric><Code prefix="pedido">{g.cardId}</Code></Td></Tr>)}</tbody></Table>
          ) : (
            <Table>
              <thead><Tr><Th>Filial</Th><Th numeric>Produtos</Th><Th numeric>Unidades</Th><Th numeric>Valor</Th><Th>Situação</Th></Tr></thead>
              <tbody>
                {pedidos.map((p) => (
                  <Tr key={p.codfilial}>
                    <Td>{`${p.codfilial} · ${p.filial}`}</Td><Td numeric>{p.produtos.length}</Td><Td numeric>{un(p.unidades)}</Td><Td numeric>{moeda(p.valor)}</Td>
                    <Td>{jaGeradas.includes(p.codfilial) ? 'já gerada' : 'a gerar'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          {erro ? <Alert tone="error" className="mt-3">{`${erro} O que já nasceu fica; gere de novo para completar só o que faltou.`}</Alert> : null}
        </DialogBody>
        <DialogFooter>
          {concluido ? <Button variant="primary" onClick={onFechar}>Fechar</Button> : (
            <>
              <Button variant="ghost" disabled={gerando} onClick={onFechar}>Cancelar</Button>
              <Button variant="primary" disabled={gerando || pedidos.length === 0} onClick={onConfirmar}>{gerando ? 'Gerando…' : 'Gerar pedidos'}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
