// A Análise do empenho (C-014..C-017): por item, o estoque e a venda de todas as
// filiais, a decisão em três destinos (comprar, transferir, usar estoque), o
// custo para pedir e o CMV na hora; salvar grava tudo numa execução
// (`sgcEmpItensGravar`, RNF-002). Fora da Análise a mesma tabela é só leitura.
import * as React from 'react';
import { useKanban } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import {
  cmvAcimaDaReferencia, cmvItem, comprarTudo, custoEfetivo, filiaisDoItem, origemPrincipal, resumoDaFilial, totaisEmpenho,
  validarDecisao, type ItemEmpenho, type LinhaFilial,
} from '@/lib/empenhos';
import {
  Alert, Button, CheckRow, Dash, Field, SelectMenu, Status, Table, Td, Th, Tr,
} from '@/components/page';
import { BuscaProduto, CampoNumero, ResumoCmv } from '@/pages/empenhos/itens';
import { atualizarCapa, itemDoProduto, pct, textoCmv, valorDaCapa } from '@/pages/empenhos/operacoes';

const ROTULO_ORIGEM = { compra: 'Comprar', transferencia: 'Transferir', estoque: 'Estoque' } as const;

function EstoqueDoItem({ linhasFiliais, codprod, codfilial }: { linhasFiliais: LinhaFilial[] | null; codprod: number; codfilial: string }) {
  if (linhasFiliais === null) return <p className="text-[12px] text-ink-secondary">Carregando o estoque das filiais...</p>;
  const filiais = filiaisDoItem(linhasFiliais, codprod, codfilial);
  if (!filiais.length) return <p className="text-[12px] text-ink-secondary">Nenhuma filial com saldo ou venda.</p>;
  return (
    <Table>
      <thead>
        <Tr><Th>Filial</Th><Th numeric>Disponível</Th><Th numeric>Venda 45 d</Th><Th numeric>Cobertura</Th><Th>Última venda</Th></Tr>
      </thead>
      <tbody>
        {filiais.map((f) => {
          const r = resumoDaFilial(f);
          return (
            <Tr key={f.CODFILIAL}>
              <Td>{f.CODFILIAL} — {f.FILIAL}{String(f.CODFILIAL) === String(codfilial) ? ' (contrato)' : ''}</Td>
              <Td numeric>{numeroPt(r.disponivel)}</Td>
              <Td numeric>{numeroPt(f.QT_VENDA_45D)}</Td>
              <Td numeric>{r.texto}</Td>
              <Td>{f.DT_ULTIMA_VENDA ? fmtData(String(f.DT_ULTIMA_VENDA)) : <Dash />}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default function Analise({ cardId, itensIniciais, codfilial, codcli, editavel, onSalvo, avisar }: {
  cardId: number;
  itensIniciais: ItemEmpenho[];
  codfilial: string;
  codcli: number;
  editavel: boolean;
  onSalvo: () => Promise<void>;
  avisar: (tone: 'success' | 'error', texto: string) => void;
}) {
  const api = useKanban();
  const [itens, setItens] = React.useState(itensIniciais);
  const [removidos, setRemovidos] = React.useState<number[]>([]);
  const [sujo, setSujo] = React.useState(false);
  const [gravando, setGravando] = React.useState(false);
  const [aberto, setAberto] = React.useState<number | null>(null);
  const [estoque, setEstoque] = React.useState<LinhaFilial[] | null>(null);
  const [filiais, setFiliais] = React.useState<{ value: string; label: string }[]>([]);
  const codigos = itens.map((i) => i.codprod).join(', ');

  // A seção nasce recolhida (R-126): estas leituras só rodam quando ela abre.
  React.useEffect(() => {
    if (!editavel) return undefined;
    let vivo = true;
    linhas('sgcWintFiliais')
      .then((rows) => vivo && setFiliais(rows.map((r) => ({ value: String(r.CODFILIAL), label: `${r.CODFILIAL} — ${r.FILIAL}` }))))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [editavel]);

  // C-014: uma consulta para todos os itens, quando a tabela abre (não por linha).
  React.useEffect(() => {
    if (!codigos) return undefined;
    let vivo = true;
    linhas('sgcWintEmpEstoqueFiliais', { codprods: codigos })
      .then((rows) => vivo && setEstoque(rows as LinhaFilial[]))
      .catch(() => vivo && setEstoque([]));
    return () => {
      vivo = false;
    };
  }, [codigos]);

  const mudar = (codprod: number, parte: Partial<ItemEmpenho>) => {
    setItens((atual) => atual.map((i) => (i.codprod === codprod ? { ...i, ...parte } : i)));
    setSujo(true);
  };

  async function salvar() {
    setGravando(true);
    try {
      const r = await acao('sgcEmpItensGravar', { cardId, itensJson: JSON.stringify(itens), removerJson: JSON.stringify(removidos) });
      if (!r.ok) throw new Error(String(r.erro || r.error || 'A análise não foi gravada.'));
      await atualizarCapa(api, cardId, { valores: { valor_contrato: valorDaCapa(Number(r.vlTotal) || 0), cmv: textoCmv(r.cmv === null ? null : Number(r.cmv)) } });
      setSujo(false);
      setRemovidos([]);
      avisar('success', `Análise salva: ${itens.length} item(ns).`);
      await onSalvo();
    } catch (erro) {
      avisar('error', erro instanceof Error ? erro.message : 'A análise não foi gravada.');
    } finally {
      setGravando(false);
    }
  }

  const totais = totaisEmpenho(itens);
  return (
    <div className="flex flex-col gap-3">
      <ResumoCmv itens={itens} />
      {editavel ? (
        <BuscaProduto
          jaTem={itens.map((i) => i.codprod)}
          onEscolher={async (p) => {
            const novo = await itemDoProduto(p, codcli);
            setItens((atual) => [...atual, novo]);
            setSujo(true);
          }}
        />
      ) : null}
      {itens.length === 0 ? <Alert tone="warn">O empenho ainda não tem item.</Alert> : null}
      {/* Um bloco por item, campos em grade: no painel do card não cabem doze colunas. */}
      <ul className="flex flex-col gap-3">
        {itens.map((item) => {
          const erro = validarDecisao(item);
          const cmv = cmvItem(item);
          const numero = (rotulo: string, chave: 'qtEmpenho' | 'precoVenda' | 'custoNegociado' | 'qtCompra' | 'qtTransferencia' | 'qtEstoque', dinheiro = false) => (
            <Field label={rotulo}>
              {editavel ? (
                <CampoNumero rotulo={rotulo} valor={item[chave]} onChange={(v) => mudar(item.codprod, { [chave]: v })} className="w-full text-right" />
              ) : (
                <span className="text-[13px] text-ink">{item[chave] ? (dinheiro ? moeda(item[chave]) : numeroPt(item[chave])) : <Dash />}</span>
              )}
            </Field>
          );
          return (
            <li key={item.codprod} className="rounded-xl border border-rule-row p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{item.codprod} — {item.descricao}</p>
                  <p className="text-[12px] text-ink-secondary">{item.fornecedor || 'sem indústria'} · fábrica {item.codfab || '—'} · {item.embalagem}</p>
                </div>
                {erro ? <Status tone="attention">{erro}</Status> : <Status tone="live">{ROTULO_ORIGEM[origemPrincipal(item)]}</Status>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {numero('Quantidade', 'qtEmpenho')}
                {numero('Preço do contrato', 'precoVenda', true)}
                {numero('Custo negociado', 'custoNegociado', true)}
                <Field label="Especial / padrão">
                  <span className="text-[13px] text-ink">{item.custoEspecial ? moeda(item.custoEspecial) : '—'} / {item.custoPadrao ? moeda(item.custoPadrao) : 'sem custo'}</span>
                </Field>
                <Field label="Custo efetivo"><span className="text-[13px] font-semibold text-ink">{moeda(custoEfetivo(item))}</span></Field>
                <Field label="CMV">{cmv === null ? <Dash /> : <Status tone={cmvAcimaDaReferencia(cmv) ? 'alert' : 'live'}>{pct(cmv)}</Status>}</Field>
                <Field label="Custo para pedir" className="col-span-2">
                  <CheckRow marcado={item.tipoCustoPedido === 'PADRAO'} disabled={!editavel}
                    onToggle={() => mudar(item.codprod, { tipoCustoPedido: item.tipoCustoPedido === 'PADRAO' ? '' : 'PADRAO' })}>
                    Pedir pelo padrão (ignora o negociado)
                  </CheckRow>
                </Field>
                {numero('Comprar da indústria', 'qtCompra')}
                {numero('Transferir de filial', 'qtTransferencia')}
                <Field label="Filial de origem">
                  {editavel ? (
                    <SelectMenu label="Filial de origem" value={item.codfilialOrigem} options={filiais.filter((f) => f.value !== codfilial)}
                      onChange={(v) => mudar(item.codprod, { codfilialOrigem: v })} placeholder="—" />
                  ) : <span className="text-[13px] text-ink">{item.codfilialOrigem || '—'}</span>}
                </Field>
                {numero('Usar o estoque', 'qtEstoque')}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAberto(aberto === item.codprod ? null : item.codprod)} aria-expanded={aberto === item.codprod}>
                  {aberto === item.codprod ? 'Ocultar filiais' : 'Estoque das filiais'}
                </Button>
                {editavel ? <Button size="sm" variant="ghost" onClick={() => mudar(item.codprod, comprarTudo(item))}>Comprar tudo</Button> : null}
                {editavel ? (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setItens((atual) => atual.filter((i) => i.codprod !== item.codprod));
                    setRemovidos((atual) => [...atual, item.codprod]);
                    setSujo(true);
                  }}>Remover</Button>
                ) : null}
              </div>
              {aberto === item.codprod ? <div className="mt-2"><EstoqueDoItem linhasFiliais={estoque} codprod={item.codprod} codfilial={codfilial} /></div> : null}
            </li>
          );
        })}
      </ul>
      {editavel ? (
        <div className="flex items-center justify-end gap-3">
          {sujo ? <span className="text-[12px] text-attention">Alterações não salvas · {moeda(totais.valor)} no contrato</span> : null}
          <Button variant="primary" onClick={salvar} disabled={!sujo || gravando}>{gravando ? 'Salvando...' : 'Salvar análise'}</Button>
        </div>
      ) : null}
    </div>
  );
}
