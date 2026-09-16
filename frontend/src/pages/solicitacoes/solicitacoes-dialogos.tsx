// Diálogos de `/solicitacoes` (spec 008) — separados de SolicitacoesPage.tsx
// porque o `max-lines` 800 do ESLint não cabe tudo num arquivo só.
//
// Quem chama as Server Functions aqui é cada diálogo (o registro e a avaliação
// são a ação inteira, não um dado devolvido ao pai); o pai só relê a lista
// depois do `onGravado` — é a releitura que prova que gravou (D-03), nunca a
// resposta da escrita.
import * as React from 'react';
import { Check, Search } from 'lucide-react';
import {
  Alert, Button, Code, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, IconButton, Input, LabelledField, RowMeta, RowTitle, SearchInput, SelectMenu,
  Status, Table, Td, Textarea, Th, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { fmtDataHora } from '@/lib/formato';
import { buscaDeCliente, rotuloStatus, validarSolicitacao, type LinhaSolicitacao } from '@/lib/solicitacoes';

const agora = () => new Date().toISOString().slice(0, 19);

const PRIORIDADES = [
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

type Linha = Record<string, unknown>;

interface ProdutoEscolhido {
  codprod: number; descricao: string; embalagem: string; unidade: string;
  codfornec: number; fornecedor: string;
}
interface ClienteEscolhido { codcli: number; cliente: string; cnpj: string }

/* ─────────────────────── Nova solicitação (RF-001..RF-004) ─────────────────────── */

export function NovaSolicitacaoDialogo({
  open,
  onOpenChange,
  onGravado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGravado: () => void;
}) {
  const [filiais, setFiliais] = React.useState<{ value: string; label: string }[]>([]);
  const [codfilial, setCodfilial] = React.useState('');
  const [produto, setProduto] = React.useState<ProdutoEscolhido | null>(null);
  const [cliente, setCliente] = React.useState<ClienteEscolhido | null>(null);
  const [quantidade, setQuantidade] = React.useState('');
  const [prioridade, setPrioridade] = React.useState('normal');
  const [justificativa, setJustificativa] = React.useState('');

  const [termoProduto, setTermoProduto] = React.useState('');
  const [resultadosProduto, setResultadosProduto] = React.useState<Linha[]>([]);
  const [termoCliente, setTermoCliente] = React.useState('');
  const [resultadosCliente, setResultadosCliente] = React.useState<Linha[]>([]);

  const [buscando, setBuscando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erros, setErros] = React.useState<string[]>([]);

  // As filiais do ERP, uma vez por abertura (o mesmo seletor da NovoPedidoPage).
  React.useEffect(() => {
    let vivo = true;
    linhas('sgcWintFiliais')
      .then((rows) => {
        if (!vivo) return;
        setFiliais(rows.map((row) => ({ value: String(row.CODFILIAL), label: `${row.CODFILIAL} · ${row.FILIAL}` })));
      })
      .catch(() => { /* o seletor fica vazio e a validação cobra a filial */ });
    return () => { vivo = false; };
  }, []);

  async function buscarProduto() {
    const texto = termoProduto.trim();
    if (!texto) return;
    setBuscando(true);
    setErros([]);
    try {
      const soDigitos = /^\d+$/.test(texto);
      setResultadosProduto(await linhas('sgcWintBuscarProduto', {
        codprod: soDigitos ? Number(texto) : 0,
        busca: soDigitos ? '' : texto,
        codfilial: codfilial || '1',
      }));
    } catch (falha) {
      setErros([falha instanceof Error ? falha.message : 'Não foi possível buscar o produto no ERP.']);
    } finally {
      setBuscando(false);
    }
  }

  /** RN-004: o fornecedor é o DO PRODUTO, copiado no registro — nunca escolhido. */
  async function escolherProduto(row: Linha) {
    const codfornec = Number(row.CODFORNEC ?? 0);
    let fornecedor = '';
    try {
      const achados = await linhas('sgcWintFornecedores', { busca: String(codfornec) });
      fornecedor = String(achados.find((f) => Number(f.CODFORNEC) === codfornec)?.FORNECEDOR ?? '');
    } catch { /* sem o nome, o código já identifica o fornecedor */ }
    setProduto({
      codprod: Number(row.CODPROD ?? 0),
      descricao: String(row.DESCRICAO ?? ''),
      embalagem: String(row.EMBALAGEM ?? ''),
      unidade: String(row.UNIDADE ?? ''),
      codfornec,
      fornecedor,
    });
    setResultadosProduto([]);
    setTermoProduto('');
  }

  async function buscarCliente() {
    const { codcli, busca } = buscaDeCliente(termoCliente);
    if (codcli === 0 && busca === '') return;
    setBuscando(true);
    setErros([]);
    try {
      setResultadosCliente(await linhas('sgcWintClienteBuscar', { codcli, busca }));
    } catch (falha) {
      setErros([falha instanceof Error ? falha.message : 'Não foi possível buscar o cliente no ERP.']);
    } finally {
      setBuscando(false);
    }
  }

  async function gravar() {
    const entrada = {
      codprod: produto?.codprod ?? 0,
      quantidade: Number(quantidade) || 0,
      codfilial,
      justificativa,
    };
    // RN-001: a mesma validação do WHERE da escrita, antes de gastar a chamada
    // — e nada do que foi digitado se perde (C-003).
    const problemas = validarSolicitacao(entrada);
    if (problemas.length > 0) {
      setErros(problemas);
      return;
    }
    setSalvando(true);
    setErros([]);
    try {
      const filial = filiais.find((f) => f.value === codfilial);
      await acao('sgcEscSolicitacaoInserir', {
        codprod: entrada.codprod,
        descricao: produto?.descricao ?? '',
        embalagem: produto?.embalagem ?? '',
        unidade: produto?.unidade ?? '',
        codfornec: produto?.codfornec ?? 0,
        fornecedor: produto?.fornecedor ?? '',
        codfilial,
        filial: filial ? filial.label.split(' · ').slice(1).join(' · ') : '',
        quantidade: entrada.quantidade,
        justificativa,
        codcli: cliente?.codcli ?? 0,
        cliente: cliente?.cliente ?? '',
        cnpjCliente: cliente?.cnpj ?? '',
        prioridade,
        criadoEm: agora(),
      });
      onGravado();
      onOpenChange(false);
    } catch (falha) {
      setErros([falha instanceof Error ? falha.message : 'Não foi possível registrar a solicitação.']);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova solicitação</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 overflow-y-auto">
          {erros.length > 0 ? (
            <Alert tone="error">
              {erros.map((mensagem) => <span key={mensagem} className="block">{mensagem}</span>)}
            </Alert>
          ) : null}

          <LabelledField label="Filial" obrigatorio hint="A filial que vai receber o produto.">
            <SelectMenu
              label="Filial"
              placeholder="Escolha a filial"
              value={codfilial}
              onChange={setCodfilial}
              options={filiais}
            />
          </LabelledField>

          <div className="flex flex-col gap-2">
            <LabelledField label="Produto" obrigatorio hint="Código ou parte do nome, do cadastro do ERP.">
              <div className="flex items-end gap-2">
                <SearchInput
                  className="flex-1"
                  placeholder="Ex.: 5301 ou bebida lactea"
                  value={termoProduto}
                  onChange={(evento) => setTermoProduto(evento.target.value)}
                  onKeyDown={(evento) => { if (evento.key === 'Enter') { evento.preventDefault(); void buscarProduto(); } }}
                />
                <Button onClick={() => void buscarProduto()} disabled={buscando || !termoProduto.trim()}>
                  <Search aria-hidden />
                  Buscar
                </Button>
              </div>
            </LabelledField>

            {produto ? (
              <div className="rounded-xl border border-rule-row p-2">
                <RowTitle>{produto.descricao}</RowTitle>
                <RowMeta>
                  <Code prefix="cód.">{produto.codprod}</Code> · {produto.embalagem || '—'} · {produto.unidade || '—'}
                </RowMeta>
                <RowMeta>
                  Fornecedor <Code>{produto.codfornec}</Code> {produto.fornecedor}
                </RowMeta>
              </div>
            ) : null}

            {resultadosProduto.length > 0 ? (
              <Table>
                <thead>
                  <tr><Th>Produto</Th><Th className="w-16 text-right">Escolher</Th></tr>
                </thead>
                <tbody>
                  {resultadosProduto.map((row) => (
                    <Tr key={String(row.CODPROD)}>
                      <Td>
                        <RowTitle>{String(row.DESCRICAO ?? '')}</RowTitle>
                        <RowMeta><Code prefix="cód.">{String(row.CODPROD)}</Code> · {String(row.EMBALAGEM ?? '')}</RowMeta>
                      </Td>
                      <Td className="text-right">
                        <IconButton label="Escolher este produto" onClick={() => void escolherProduto(row)}>
                          <Check aria-hidden />
                        </IconButton>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <LabelledField label="Cliente" hint="Opcional — por código, parte do nome ou CNPJ. Sem cliente, a solicitação consta como “sem cliente informado”.">
              <div className="flex items-end gap-2">
                <SearchInput
                  className="flex-1"
                  placeholder="Ex.: 9201, nutrivida ou 12.345.678/0001-90"
                  value={termoCliente}
                  onChange={(evento) => setTermoCliente(evento.target.value)}
                  onKeyDown={(evento) => { if (evento.key === 'Enter') { evento.preventDefault(); void buscarCliente(); } }}
                />
                <Button onClick={() => void buscarCliente()} disabled={buscando || !termoCliente.trim()}>
                  <Search aria-hidden />
                  Buscar
                </Button>
              </div>
            </LabelledField>

            {cliente ? (
              <div className="rounded-xl border border-rule-row p-2">
                <RowTitle>{cliente.cliente}</RowTitle>
                <RowMeta><Code prefix="cód.">{cliente.codcli}</Code> · CNPJ {cliente.cnpj || '—'}</RowMeta>
              </div>
            ) : null}

            {resultadosCliente.length > 0 ? (
              <Table>
                <thead>
                  <tr><Th>Cliente</Th><Th className="w-16 text-right">Escolher</Th></tr>
                </thead>
                <tbody>
                  {resultadosCliente.map((row) => (
                    <Tr key={String(row.CODCLI)}>
                      <Td>
                        <RowTitle>{String(row.CLIENTE ?? '')}</RowTitle>
                        <RowMeta><Code prefix="cód.">{String(row.CODCLI)}</Code> · CNPJ {String(row.CNPJ ?? '').trim() || '—'}</RowMeta>
                      </Td>
                      <Td className="text-right">
                        <IconButton
                          label="Escolher este cliente"
                          onClick={() => {
                            setCliente({
                              codcli: Number(row.CODCLI ?? 0),
                              cliente: String(row.CLIENTE ?? ''),
                              cnpj: String(row.CNPJ ?? '').trim(),
                            });
                            setResultadosCliente([]);
                            setTermoCliente('');
                          }}
                        >
                          <Check aria-hidden />
                        </IconButton>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabelledField label="Quantidade" obrigatorio>
              <Input
                type="number"
                min={0}
                className="text-right"
                value={quantidade}
                onChange={(evento) => setQuantidade(evento.target.value)}
              />
            </LabelledField>
            <LabelledField label="Prioridade" hint="Ordena a fila; não muda nenhuma regra de aprovação.">
              <SelectMenu label="Prioridade" value={prioridade} onChange={setPrioridade} options={PRIORIDADES} />
            </LabelledField>
          </div>

          <LabelledField
            label="Justificativa"
            obrigatorio
            hint={`${justificativa.trim().length} de 10 caracteres — por que este produto precisa entrar no pedido.`}
            hintTone={justificativa.trim().length < 10 ? 'error' : 'muted'}
          >
            <Textarea
              rows={3}
              value={justificativa}
              onChange={(evento) => setJustificativa(evento.target.value)}
              placeholder="Ex.: Cliente 9201 pediu 24 unidades para o mês; estamos sem estoque desde a semana passada."
            />
          </LabelledField>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void gravar()} disabled={salvando}>
            Registrar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Avaliar (RF-005, RN-006) ─────────────────────── */

/**
 * O que o diálogo mostra — de propósito mais estreito que `LinhaSolicitacao`:
 * a mesma decisão é tomada da fila (`/solicitacoes`) e do bloco do pedido em
 * montagem (C-010), e o bloco carrega menos colunas. Uma decisão, um diálogo.
 */
export interface AlvoAvaliacao {
  ID: number; CODPROD: number; DESCRICAO: string; QUANTIDADE: number; UNIDADE: string;
  CODCLI: number; CLIENTE: string; CRIADO_POR_NOME: string; JUSTIFICATIVA: string;
  FORNECEDOR?: string; FILIAL?: string; CODFILIAL?: string;
}

export function AvaliarDialogo({
  solicitacao,
  onFechar,
  onGravado,
  somenteRecusa,
}: {
  solicitacao: AlvoAvaliacao;
  onFechar: () => void;
  onGravado: () => void;
  /** No bloco da montagem, aprovar é "Incluir no pedido" — aqui só se recusa. */
  somenteRecusa?: boolean;
}) {
  const [motivo, setMotivo] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  const motivoCurto = motivo.trim().length < 10;

  async function avaliar(status: 'aprovada' | 'recusada') {
    if (status === 'recusada' && motivoCurto) {
      setErro('A recusa precisa de um motivo com pelo menos 10 caracteres — é o que o vendedor vai ler.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const quando = agora();
      await acao('sgcEscSolicitacaoAvaliar', {
        id: solicitacao.ID, status, motivo: status === 'recusada' ? motivo : '', avaliadoEm: quando,
      });
      await acao('sgcEscSolicitacaoHistoricoInserir', {
        id: solicitacao.ID, idCard: 0, evento: status,
        detalhe: status === 'recusada' ? motivo : 'Aprovada na fila de solicitações.', em: quando,
      });
      onGravado();
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível avaliar a solicitação.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(estado) => !estado && onFechar()}>
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{somenteRecusa ? 'Recusar a solicitação' : 'Avaliar a solicitação'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 overflow-y-auto">
          {erro ? <Alert tone="error">{erro}</Alert> : null}

          <div className="rounded-xl border border-rule-row p-3">
            <RowTitle>{solicitacao.DESCRICAO}</RowTitle>
            <RowMeta>
              <Code prefix="cód.">{solicitacao.CODPROD}</Code> · {solicitacao.QUANTIDADE} {solicitacao.UNIDADE}
              {' '}· {solicitacao.FORNECEDOR} · {solicitacao.FILIAL || solicitacao.CODFILIAL}
            </RowMeta>
            <RowMeta>
              {Number(solicitacao.CODCLI) > 0
                ? <>Cliente <Code>{solicitacao.CODCLI}</Code> {solicitacao.CLIENTE}</>
                : 'Sem cliente informado'}
              {' '}· vendedor {solicitacao.CRIADO_POR_NOME}
            </RowMeta>
            {solicitacao.JUSTIFICATIVA ? <RowMeta>{solicitacao.JUSTIFICATIVA}</RowMeta> : null}
          </div>

          {somenteRecusa ? null : (
            <Alert tone="info">
              Aprovar põe a solicitação na fila daquele fornecedor e filial — não cria pedido nem item.
              O vínculo acontece na montagem, pelo bloco do pedido.
            </Alert>
          )}

          <LabelledField
            label="Motivo da recusa"
            hint={`${motivo.trim().length} de 10 caracteres — obrigatório só para recusar.`}
            hintTone={motivoCurto && motivo.length > 0 ? 'error' : 'muted'}
          >
            <Textarea
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ex.: Produto já coberto pelo pedido 998877, chega em 12 dias."
            />
          </LabelledField>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Fechar</Button>
          <Button
            variant="danger"
            onClick={() => void avaliar('recusada')}
            disabled={salvando || motivoCurto}
            title={motivoCurto ? 'Escreva o motivo da recusa (10 caracteres ou mais).' : undefined}
          >
            Recusar
          </Button>
          {somenteRecusa ? null : (
            <Button variant="primary" onClick={() => void avaliar('aprovada')} disabled={salvando}>
              Aprovar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Detalhe com histórico (RF-013, C-022) ─────────────────────── */

interface HistoricoLinha { ID: number; EVENTO: string; DETALHE: string; POR_NOME: string; EM: string }

const ROTULO_EVENTO: Record<string, string> = {
  criada: 'Criada', aprovada: 'Aprovada', recusada: 'Recusada',
  vinculada: 'Vinculada ao pedido', desvinculada: 'Desvinculada', cancelada: 'Cancelada',
};

const TOM_EVENTO: Record<string, 'live' | 'off' | 'attention' | 'alert'> = {
  criada: 'off', aprovada: 'live', recusada: 'alert',
  vinculada: 'live', desvinculada: 'attention', cancelada: 'off',
};

export function DetalheSolicitacaoDialogo({
  solicitacao,
  onFechar,
}: {
  solicitacao: LinhaSolicitacao;
  onFechar: () => void;
}) {
  const [historico, setHistorico] = React.useState<HistoricoLinha[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    acao('sgcSolicitacaoCarregar', { id: solicitacao.ID })
      .then((resposta) => {
        if (!vivo) return;
        if (resposta.ok === false) {
          setErro(String(resposta.erro ?? 'Não foi possível carregar a solicitação.'));
          return;
        }
        setHistorico((resposta.historico ?? []) as HistoricoLinha[]);
        setErro('');
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar a solicitação.');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [solicitacao.ID]);

  const status = rotuloStatus(solicitacao.STATUS);

  return (
    <Dialog open onOpenChange={(estado) => !estado && onFechar()}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Solicitação de {solicitacao.CRIADO_POR_NOME}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 overflow-y-auto">
          {erro ? <Alert tone="error">{erro}</Alert> : null}

          <div className="rounded-xl border border-rule-row p-3">
            <RowTitle>{solicitacao.DESCRICAO}</RowTitle>
            <RowMeta>
              <Code prefix="cód.">{solicitacao.CODPROD}</Code> · {solicitacao.QUANTIDADE} {solicitacao.UNIDADE}
              {' '}· {solicitacao.FORNECEDOR} · {solicitacao.FILIAL || solicitacao.CODFILIAL}
            </RowMeta>
            <RowMeta>
              {Number(solicitacao.CODCLI) > 0
                ? <>Cliente <Code>{solicitacao.CODCLI}</Code> {solicitacao.CLIENTE} · CNPJ {solicitacao.CNPJ_CLIENTE || '—'}</>
                : 'Sem cliente informado'}
            </RowMeta>
            {solicitacao.JUSTIFICATIVA ? <RowMeta>{solicitacao.JUSTIFICATIVA}</RowMeta> : null}
            {solicitacao.MOTIVO ? <RowMeta>Motivo da recusa: {solicitacao.MOTIVO}</RowMeta> : null}
            {solicitacao.TITULO_CARD ? <RowMeta>Pedido: {solicitacao.TITULO_CARD}</RowMeta> : null}
            <p className="mt-2">
              <Status tone={status.tom === 'accent' ? 'live' : status.tom === 'neutral' ? 'off' : status.tom}>
                {status.label}
              </Status>
            </p>
          </div>

          {carregando ? (
            <EmptyState title="Carregando o histórico..." />
          ) : historico.length === 0 ? (
            <EmptyState title="Sem histórico" hint="Nada aconteceu com esta solicitação além do registro." />
          ) : (
            <Table>
              <thead>
                <tr><Th>Evento</Th><Th>Detalhe</Th><Th>Quem</Th></tr>
              </thead>
              <tbody>
                {historico.map((evento, indice) => (
                  <Tr key={`${evento.ID}-${indice}`}>
                    <Td>
                      <Status tone={TOM_EVENTO[evento.EVENTO] ?? 'off'}>
                        {ROTULO_EVENTO[evento.EVENTO] ?? evento.EVENTO}
                      </Status>
                    </Td>
                    <Td><RowMeta>{evento.DETALHE || '—'}</RowMeta></Td>
                    <Td>
                      <RowMeta>{evento.POR_NOME || '—'}</RowMeta>
                      <RowMeta>{fmtDataHora(evento.EM)}</RowMeta>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
