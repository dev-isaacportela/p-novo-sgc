// Spec 001 (fornecedores) — T-023: parametrização em painéis. Uma chamada
// (sgcFornecedorCarregar, RNF-002); "Salvar" valida com lib/fornecedor.ts
// antes de chamar sgcFornecedorSalvar (mesmas mensagens do servidor, D-009).
//
// Modo leitura da analista (RF-013, C-003 — verificação manual): a persona
// atual (sgcPersonaAtual) é da spec 002, ainda não publicada neste worktree;
// esta tela não desabilita campos por antecipação. A regra que quebra
// produção continua garantida — o servidor recusa e devolve o motivo em
// Alert — mas falta a UI proativa de somente-leitura até a 002 chegar
// (pendência registrada no relatório da 001).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { acao, linhas as linhasSf } from '@/lib/mitra-api';
import {
  PageHeader, Panel, PanelHeader, Button, LabelledField, Input, SelectMenu, Table, Th, Td, Tr,
  Status, Dash, IconButton, Alert, EmptyState, Badge,
} from '@/components/page';
import { formatarCnpj, normalizarCnpj, rotuloPrazoEntrega, slaEfetivo, documentoVencido, validarParametrizacao } from '@/lib/fornecedor';
import { fmtDataHora, hojeIso } from '@/lib/formato';
import LinhaDialogo from './LinhaDialogo';
import DocumentoDialogo from './DocumentoDialogo';
import type { FornecedorForm, LinhaEdit, DocumentoEdit } from './tipos';

interface FilialEdit { codfilial: string; filial: string }
interface ErpFilial { CODFILIAL: string; FILIAL: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

function formVazio(codfornec: number): FornecedorForm {
  return {
    codfornec, fornecedor: '', cnpj: '', cnpjFormatado: '', prazoEntregaDias: 0, prazoEntregaTipo: 'uteis',
    pedidoMinimo: 0, fechamentoDiaInicio: 1, fechamentoDiaFim: 1, linkPlataforma: '', validadeMinimaDias: 0,
    slaAnaliseDias: 0, slaFaturamentoDias: 0, ativo: true,
  };
}

function montarForm(f: Linha): FornecedorForm {
  return {
    codfornec: Number(f.CODFORNEC), fornecedor: String(f.FORNECEDOR ?? ''), cnpj: String(f.CNPJ ?? ''),
    cnpjFormatado: String(f.CNPJ_FORMATADO ?? '') || formatarCnpj(String(f.CNPJ ?? '')),
    prazoEntregaDias: Number(f.PRAZO_ENTREGA_DIAS) || 0, prazoEntregaTipo: String(f.PRAZO_ENTREGA_TIPO ?? 'uteis'),
    pedidoMinimo: Number(f.PEDIDO_MINIMO) || 0, fechamentoDiaInicio: Number(f.FECHAMENTO_DIA_INICIO) || 1,
    fechamentoDiaFim: Number(f.FECHAMENTO_DIA_FIM) || 1, linkPlataforma: String(f.LINK_PLATAFORMA ?? ''),
    validadeMinimaDias: Number(f.VALIDADE_MINIMA_DIAS) || 0, slaAnaliseDias: Number(f.SLA_ANALISE_DIAS) || 0,
    slaFaturamentoDias: Number(f.SLA_FATURAMENTO_DIAS) || 0, ativo: Number(f.ATIVO) !== 0,
  };
}

function montarLinhas(linhasRaw: Linha[], contatosRaw: Linha[], faixasRaw: Linha[]): LinhaEdit[] {
  return linhasRaw.map((l) => ({
    chave: String(l.ID),
    nome: String(l.NOME ?? ''),
    contatos: contatosRaw.filter((c) => Number(c.LINHA_ID) === Number(l.ID))
      .map((c) => ({ chave: String(c.ID), nome: String(c.NOME ?? ''), email: String(c.EMAIL ?? '') })),
    faixas: faixasRaw.filter((f) => Number(f.LINHA_ID) === Number(l.ID))
      .map((f) => ({ chave: String(f.ID), valorDe: Number(f.VALOR_DE) || 0, valorAte: Number(f.VALOR_ATE) || 0, rotulo: String(f.ROTULO ?? ''), parcelas: String(f.PARCELAS ?? '') })),
  }));
}

export default function FornecedorPage() {
  const { codfornec: codfornecParam } = useParams<{ codfornec: string }>();
  const codfornec = Number(codfornecParam) || 0;
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [novo, setNovo] = useState(false);

  const [form, setForm] = useState<FornecedorForm>(() => formVazio(codfornec));
  const [filiais, setFiliais] = useState<FilialEdit[]>([]);
  const [linhasState, setLinhasState] = useState<LinhaEdit[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoEdit[]>([]);
  const [log, setLog] = useState<Linha[]>([]);

  const [filiaisErp, setFiliaisErp] = useState<ErpFilial[]>([]);
  const [filialEscolhida, setFilialEscolhida] = useState('');

  const [linhaDialogoAberto, setLinhaDialogoAberto] = useState(false);
  const [linhaEditando, setLinhaEditando] = useState<LinhaEdit | null>(null);
  const [documentoDialogoAberto, setDocumentoDialogoAberto] = useState(false);

  useEffect(() => {
    linhasSf('sgcWintFiliais').then((rows) => setFiliaisErp(rows as unknown as ErpFilial[])).catch(() => setFiliaisErp([]));
  }, []);

  const carregar = useCallback(async () => {
    try {
      const dados = await acao('sgcFornecedorCarregar', { codfornec });
      setErro('');
      const f = dados.fornecedor as Linha | null;
      if (f) {
        setNovo(false);
        setForm(montarForm(f));
      } else {
        setNovo(true);
        setForm(formVazio(codfornec));
        const doErp = await linhasSf('sgcWintFornecedores', { busca: String(codfornec) });
        const encontrado = doErp.find((r) => Number(r.CODFORNEC) === codfornec);
        if (encontrado) {
          setForm((atual) => ({ ...atual, fornecedor: String(encontrado.FORNECEDOR ?? ''), cnpj: normalizarCnpj(String(encontrado.CGC ?? '')) }));
        }
      }
      setFiliais(((dados.filiais as Linha[]) ?? []).map((x) => ({ codfilial: String(x.CODFILIAL), filial: String(x.FILIAL ?? '') })));
      setLinhasState(montarLinhas((dados.linhas as Linha[]) ?? [], (dados.contatos as Linha[]) ?? [], (dados.faixas as Linha[]) ?? []));
      setDocumentos(((dados.documentos as Linha[]) ?? []).map((d) => ({
        chave: String(d.ID), tipo: String(d.TIPO ?? 'Documento'), nome: String(d.NOME ?? ''),
        endereco: String(d.ENDERECO ?? ''), vencimento: String(d.VENCIMENTO ?? ''),
      })));
      setLog((dados.log as Linha[]) ?? []);
    } finally {
      setCarregando(false);
    }
  }, [codfornec]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function adicionarFilial() {
    if (!filialEscolhida) return;
    const filial = filiaisErp.find((f) => f.CODFILIAL === filialEscolhida);
    setFiliais((atual) => [...atual, { codfilial: filialEscolhida, filial: filial?.FILIAL ?? '' }]);
    setFilialEscolhida('');
  }
  function removerFilial(codfilialRemover: string) {
    setFiliais((atual) => atual.filter((f) => f.codfilial !== codfilialRemover));
  }

  function novaLinha() {
    setLinhaEditando(null);
    setLinhaDialogoAberto(true);
  }
  function editarLinha(linha: LinhaEdit) {
    setLinhaEditando(linha);
    setLinhaDialogoAberto(true);
  }
  function salvarLinha(linha: LinhaEdit) {
    setLinhasState((atual) => (atual.some((l) => l.chave === linha.chave) ? atual.map((l) => (l.chave === linha.chave ? linha : l)) : [...atual, linha]));
  }
  function removerLinha(chave: string) {
    setLinhasState((atual) => atual.filter((l) => l.chave !== chave));
  }

  function adicionarDocumento(documento: DocumentoEdit) {
    setDocumentos((atual) => [documento, ...atual]);
  }
  function removerDocumento(chave: string) {
    setDocumentos((atual) => atual.filter((d) => d.chave !== chave));
  }

  async function salvar() {
    const validacao = validarParametrizacao({
      fornecedor: { cnpj: form.cnpj, pedidoMinimo: form.pedidoMinimo, fechamentoDiaInicio: form.fechamentoDiaInicio, fechamentoDiaFim: form.fechamentoDiaFim },
      linhas: linhasState.map((l) => ({ nome: l.nome, contatos: l.contatos, faixas: l.faixas })),
    });
    if (!validacao.ok) {
      setErro(validacao.error ?? 'Dado inválido.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        fornecedor: {
          codfornec: form.codfornec, fornecedor: form.fornecedor, cnpj: normalizarCnpj(form.cnpj), cnpjFormatado: formatarCnpj(form.cnpj),
          prazoEntregaDias: form.prazoEntregaDias, prazoEntregaTipo: form.prazoEntregaTipo, pedidoMinimo: form.pedidoMinimo,
          fechamentoDiaInicio: form.fechamentoDiaInicio, fechamentoDiaFim: form.fechamentoDiaFim, linkPlataforma: form.linkPlataforma,
          validadeMinimaDias: form.validadeMinimaDias, slaAnaliseDias: form.slaAnaliseDias, slaFaturamentoDias: form.slaFaturamentoDias,
          ativo: form.ativo ? 1 : 0,
        },
        filiais: filiais.map((f) => ({ codfilial: f.codfilial, filial: f.filial })),
        linhas: linhasState.map((l) => ({
          nome: l.nome,
          contatos: l.contatos.map((c) => ({ nome: c.nome, email: c.email })),
          faixas: l.faixas.map((fx) => ({ valorDe: fx.valorDe, valorAte: fx.valorAte, rotulo: fx.rotulo, parcelas: fx.parcelas })),
        })),
        documentos: documentos.map((d) => ({ tipo: d.tipo, nome: d.nome, endereco: d.endereco, vencimento: d.vencimento })),
      };
      const resultado = await acao('sgcFornecedorSalvar', { payload });
      if (!resultado.ok) {
        setErro(String(resultado.error ?? 'Não foi possível salvar.'));
        return;
      }
      setSalvoEm(new Date());
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  const sla = slaEfetivo({ analise: form.slaAnaliseDias, faturamento: form.slaFaturamentoDias });
  const hoje = hojeIso();
  const filiaisDisponiveis = filiaisErp.filter((f) => !filiais.some((x) => x.codfilial === f.CODFILIAL));

  return (
    <>
      <PageHeader
        module="Cadastros"
        title={carregando ? 'Fornecedor' : (form.fornecedor || `Fornecedor ${codfornec}`)}
        description={<span className="text-[12px] text-ink-secondary">Código {codfornec}</span>}
        actions={<>
          <Button onClick={() => navigate('/fornecedores')}>Voltar</Button>
          <Button variant="primary" onClick={salvar} disabled={salvando || carregando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </>}
      />

      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {salvoEm ? <Alert tone="success">{`Salvo às ${salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</Alert> : null}
      {novo && !carregando ? <Alert tone="info">Fornecedor sem parametrização ainda — os campos abaixo começam em branco.</Alert> : null}

      {carregando ? (
        <Panel><p className="p-6 text-center text-[13px] text-ink-secondary">Carregando…</p></Panel>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Identificação e prazos" />
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <LabelledField label="CNPJ" obrigatorio hint={form.cnpj ? formatarCnpj(form.cnpj) : undefined}>
                <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: normalizarCnpj(e.target.value) }))} maxLength={14} />
              </LabelledField>
              <LabelledField label="Prazo de entrega (dias)">
                <Input type="number" min="0" value={form.prazoEntregaDias} onChange={(e) => setForm((f) => ({ ...f, prazoEntregaDias: Number(e.target.value) || 0 }))} />
              </LabelledField>
              <LabelledField label="Tipo de prazo">
                <SelectMenu label="Tipo de prazo" value={form.prazoEntregaTipo} onChange={(v) => setForm((f) => ({ ...f, prazoEntregaTipo: v }))}
                  options={[{ value: 'uteis', label: 'Dias úteis' }, { value: 'corridos', label: 'Dias corridos' }]} />
                <p className="mt-1 text-[12px] text-ink-secondary">{rotuloPrazoEntrega(form.prazoEntregaDias, form.prazoEntregaTipo) || <Dash />}</p>
              </LabelledField>
              <LabelledField label="Pedido mínimo (R$)" obrigatorio>
                <Input type="number" min="0" step="0.01" value={form.pedidoMinimo} onChange={(e) => setForm((f) => ({ ...f, pedidoMinimo: Number(e.target.value) || 0 }))} />
              </LabelledField>
              <LabelledField label="Fechamento — dia inicial" obrigatorio>
                <Input type="number" min="1" max="31" value={form.fechamentoDiaInicio} onChange={(e) => setForm((f) => ({ ...f, fechamentoDiaInicio: Number(e.target.value) || 1 }))} />
              </LabelledField>
              <LabelledField label="Fechamento — dia final" obrigatorio hint="Pode virar o mês (ex.: 28 a 5)">
                <Input type="number" min="1" max="31" value={form.fechamentoDiaFim} onChange={(e) => setForm((f) => ({ ...f, fechamentoDiaFim: Number(e.target.value) || 1 }))} />
              </LabelledField>
              <LabelledField label="Link da plataforma de pedidos" className="sm:col-span-2 lg:col-span-3">
                <Input value={form.linkPlataforma} onChange={(e) => setForm((f) => ({ ...f, linkPlataforma: e.target.value }))} />
              </LabelledField>
              <LabelledField label="Validade mínima (dias)">
                <Input type="number" min="0" value={form.validadeMinimaDias} onChange={(e) => setForm((f) => ({ ...f, validadeMinimaDias: Number(e.target.value) || 0 }))} />
              </LabelledField>
              <LabelledField label="SLA de análise (dias úteis)" hint={sla.analise.origem === 'padrao' ? 'padrão do sistema (1 dia útil)' : 'parametrizado'}>
                <Input type="number" min="0" value={form.slaAnaliseDias} onChange={(e) => setForm((f) => ({ ...f, slaAnaliseDias: Number(e.target.value) || 0 }))} />
              </LabelledField>
              <LabelledField label="SLA de faturamento (dias úteis)" hint={sla.faturamento.origem === 'padrao' ? 'padrão do sistema (5 dias úteis)' : 'parametrizado'}>
                <Input type="number" min="0" value={form.slaFaturamentoDias} onChange={(e) => setForm((f) => ({ ...f, slaFaturamentoDias: Number(e.target.value) || 0 }))} />
              </LabelledField>
              <LabelledField label="Situação">
                <SelectMenu label="Situação" value={form.ativo ? '1' : '0'} onChange={(v) => setForm((f) => ({ ...f, ativo: v === '1' }))}
                  options={[{ value: '1', label: 'Ativo' }, { value: '0', label: 'Inativo' }]} />
              </LabelledField>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Filiais atendidas" />
            <div className="flex flex-wrap items-end gap-2 px-4 pt-4">
              <div className="w-64">
                <SelectMenu label="Filial" placeholder="Escolha uma filial" value={filialEscolhida} onChange={setFilialEscolhida}
                  options={filiaisDisponiveis.map((f) => ({ value: f.CODFILIAL, label: f.FILIAL }))} />
              </div>
              <Button onClick={adicionarFilial} disabled={!filialEscolhida}><Plus aria-hidden />Adicionar</Button>
            </div>
            {filiais.length === 0 ? (
              <EmptyState title="Nenhuma filial atendida ainda" />
            ) : (
              <Table>
                <thead><tr><Th>Código</Th><Th>Filial</Th><Th aria-hidden /></tr></thead>
                <tbody>
                  {filiais.map((f) => (
                    <Tr key={f.codfilial}>
                      <Td>{f.codfilial}</Td>
                      <Td>{f.filial}</Td>
                      <Td><IconButton label="Remover filial" tone="danger" onClick={() => removerFilial(f.codfilial)}><Trash2 aria-hidden /></IconButton></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Linhas de produto">
              <Button size="sm" onClick={novaLinha}><Plus aria-hidden />Nova linha</Button>
            </PanelHeader>
            {linhasState.length === 0 ? (
              <EmptyState title="Nenhuma linha de produto ainda" />
            ) : (
              <Table>
                <thead><tr><Th>Nome</Th><Th numeric>Contatos</Th><Th numeric>Faixas</Th><Th aria-hidden /></tr></thead>
                <tbody>
                  {linhasState.map((l) => (
                    <Tr key={l.chave}>
                      <Td>{l.nome}</Td>
                      <Td numeric>{l.contatos.length}</Td>
                      <Td numeric>{l.faixas.length}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <IconButton label="Editar linha" onClick={() => editarLinha(l)}><Pencil aria-hidden /></IconButton>
                          <IconButton label="Remover linha" tone="danger" onClick={() => removerLinha(l.chave)}><Trash2 aria-hidden /></IconButton>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Documentos">
              <Button size="sm" onClick={() => setDocumentoDialogoAberto(true)}><Plus aria-hidden />Novo documento</Button>
            </PanelHeader>
            {documentos.length === 0 ? (
              <EmptyState title="Nenhum documento ainda" />
            ) : (
              <Table>
                <thead><tr><Th>Nome</Th><Th>Tipo</Th><Th>Vencimento</Th><Th aria-hidden /></tr></thead>
                <tbody>
                  {documentos.map((d) => (
                    <Tr key={d.chave}>
                      <Td><a href={d.endereco} target="_blank" rel="noreferrer" className="text-primary hover:underline">{d.nome}</a></Td>
                      <Td><Badge>{d.tipo}</Badge></Td>
                      <Td>
                        {d.vencimento ? (
                          documentoVencido(d.vencimento, hoje) ? <Status tone="alert">Vencido</Status> : d.vencimento
                        ) : <Dash />}
                      </Td>
                      <Td><IconButton label="Remover documento" tone="danger" onClick={() => removerDocumento(d.chave)}><Trash2 aria-hidden /></IconButton></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Histórico de alterações" hint="últimas 20 alterações" />
            {log.length === 0 ? (
              <EmptyState title="Nenhuma alteração registrada ainda" />
            ) : (
              <Table>
                <thead><tr><Th>Quando</Th><Th>Quem</Th><Th>Campo</Th><Th>De</Th><Th>Para</Th></tr></thead>
                <tbody>
                  {log.map((linhaLog) => (
                    <Tr key={String(linhaLog.ID)}>
                      <Td>{fmtDataHora(String(linhaLog.EM ?? ''))}</Td>
                      <Td>{String(linhaLog.POR_NOME ?? '') || <Dash />}</Td>
                      <Td>{String(linhaLog.CAMPO ?? '')}</Td>
                      <Td>{String(linhaLog.DE ?? '') || <Dash />}</Td>
                      <Td>{String(linhaLog.PARA ?? '') || <Dash />}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
      )}

      <LinhaDialogo open={linhaDialogoAberto} linha={linhaEditando} onOpenChange={setLinhaDialogoAberto} onSalvar={salvarLinha} />
      <DocumentoDialogo open={documentoDialogoAberto} onOpenChange={setDocumentoDialogoAberto} onSalvar={adicionarDocumento} />
    </>
  );
}
