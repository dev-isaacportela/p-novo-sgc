// Diálogos da aba Notas fiscais (spec 005, T-045): registrar a nota pelo
// número, decidir uma conferência, registrar o contato com a indústria e
// enviar a cobrança por e-mail.
//
// Todos recebem o que a aba já carregou e devolvem o resultado por callback —
// nenhum deles recarrega a aba sozinho (RNF-001: uma execução de `sgcNfListar`
// por abertura, e depois só quando uma escrita acontece de fato).

import * as React from 'react';
import { Mail, Search } from 'lucide-react';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Field, Input, LabelledField, SelectMenu, Status, Table, Td, Textarea, Th, Tr,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { acao, linhas } from '@/lib/mitra-api';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { CANAIS_CONTATO } from '@/lib/nf';
import { resumoDaCobranca } from '@/lib/faturamento';
import { resumoComFila } from '@/lib/fila-email';

/* ─────────────── o que `sgcNfListar` devolve ─────────────── */

export interface PedidoDaAba {
  ID_CARD: number; TITULO: string; FASE: string;
  CODFORNEC: number; FORNECEDOR: string; CODFILIAL: string; FILIAL: string;
  NUMPED_WINTHOR: string; DT_ENVIO: string; EMAIL_ENVIO: string;
  VL_TOTAL: number; VL_FATURADO: number;
  PERC_FATURADO_VALOR: number; PERC_FATURADO_QTD: number;
  PRAZO_ACORDADO: string; VALIDADE_MINIMA: number;
}

export interface SugestaoDaAba {
  ID: number; NUMNOTA: number; SERIE: string; CODFORNEC: number; CODFILIAL: string;
  DT_EMISSAO: string; DT_ENTRADA: string; VL_TOTAL: number;
  ORIGEM: string; SCORE: number; MOTIVO: string; NUMPED_WINTHOR: string;
}

export interface NfDaAba {
  ID: number; NUMNOTA: number; SERIE: string; CHAVENFE: string;
  DT_EMISSAO: string; DT_ENTRADA: string; DT_RECEBIMENTO: string;
  VL_TOTAL: number; PRAZO_PARCELAS: string; ORIGEM: string; VINCULADO_EM: string;
}

export interface ItemDaAba {
  ID: number; ID_NF: number; CODPROD: number; CODFAB: string; EAN: string;
  DESCRICAO: string; QT_FATURADA: number; PRECO_FATURADO: number;
  NUMLOTE: string; DT_VALIDADE: string; CASADO_POR: string;
}

export interface OcorrenciaDaAba {
  ID: number; ID_NF: number; CODPROD: number; TIPO: string; RESULTADO: string;
  VALOR_ESPERADO: string; VALOR_ENCONTRADO: string; DELTA_PERC: number;
  DECISAO: string; JUSTIFICATIVA: string; DECIDIDO_NOME: string; DECIDIDO_EM: string;
}

export interface ContatoDaAba {
  ID: number; DT_CONTATO: string; CANAL: string; RESUMO: string;
  PREVISAO_FATURAMENTO: string; REGISTRADO_NOME: string;
}

/** RF-013: recusa sem justificativa de 10 caracteres o servidor nega. */
export const MINIMO_JUSTIFICATIVA = 10;

const agora = () => new Date().toISOString().slice(0, 19);

// R-026: a lista é fechada e mora em `lib/nf.ts`, junto do teste que a compara
// com o `IN` de `sgcEscContatoInserir`. Um canal a mais aqui (era o caso de
// "outro") é contato que a escrita recusa em silêncio (D-03).
const CANAIS = [...CANAIS_CONTATO];

/* ─────────────── registrar a nota pelo número (RF-005, O2-07) ─────────────── */

interface NotaDoErp {
  NUMTRANSENT: number; NUMNOTA: number; SERIE: string; CHAVENFE: string;
  CODFORNEC: number; CODFILIAL: string; VL_TOTAL: number; PRAZO: number;
  DT_EMISSAO: string; DT_ENTRADA: string;
}

export function DialogoRegistrarNf({
  aberto, onOpenChange, pedido, aoVincular,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  pedido: PedidoDaAba;
  aoVincular: (resposta: Record<string, unknown>) => Promise<void>;
}) {
  const [numero, setNumero] = React.useState('');
  const [achadas, setAchadas] = React.useState<NotaDoErp[] | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState('');

  // Limpeza na abertura como ajuste DURANTE a renderização (mesmo padrão do
  // DatePicker): em efeito, seria uma renderização em cascata a cada abertura.
  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setNumero('');
      setAchadas(null);
      setErro('');
    }
  }

  async function buscar() {
    const numnota = Number(numero.replace(/\D/g, ''));
    if (!numnota) {
      setErro('Informe o número da nota fiscal.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      // O2-07: a busca híbrida não exige entrada no armazém — é o caminho de
      // quando a nota existe no ERP mas ainda não foi recebida.
      const achados = await linhas('sgcWintNfBuscar', { numnota, codfornec: pedido.CODFORNEC });
      setAchadas(achados as unknown as NotaDoErp[]);
      if (achados.length === 0) setErro(`Nenhuma nota ${numnota} do fornecedor ${pedido.FORNECEDOR} no WinThor.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível consultar o WinThor.');
    } finally {
      setOcupado(false);
    }
  }

  async function vincular(nota: NotaDoErp) {
    setOcupado(true);
    setErro('');
    try {
      const resposta = await acao('sgcNfVincular', {
        cardId: pedido.ID_CARD, idSugestao: 0, numnota: nota.NUMNOTA, serie: nota.SERIE,
        codfornec: nota.CODFORNEC, codfilial: nota.CODFILIAL || pedido.CODFILIAL,
        origem: 'hibrida', itensJson: '',
      });
      if (!resposta.ok) {
        setErro(String(resposta.erro ?? 'Não foi possível vincular a nota.'));
        return;
      }
      await aoVincular(resposta as Record<string, unknown>);
      onOpenChange(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível vincular a nota.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar nota fiscal pelo número</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          <div className="flex items-end gap-2">
            <LabelledField
              label="Número da nota"
              hint={`Fornecedor ${pedido.FORNECEDOR} · a nota não precisa ter entrado no armazém.`}
              className="flex-1"
            >
              <Input
                value={numero}
                inputMode="numeric"
                onChange={(evento) => setNumero(evento.target.value)}
                onKeyDown={(evento) => { if (evento.key === 'Enter') void buscar(); }}
              />
            </LabelledField>
            <Button variant="primary" onClick={() => void buscar()} disabled={ocupado}>
              <Search aria-hidden />
              Buscar
            </Button>
          </div>

          {achadas && achadas.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Nota</Th>
                  <Th>Emissão</Th>
                  <Th>Entrada</Th>
                  <Th numeric>Valor</Th>
                  <Th className="w-28 text-right">Ação</Th>
                </tr>
              </thead>
              <tbody>
                {achadas.map((nota) => (
                  <Tr key={`${nota.NUMNOTA}-${nota.SERIE}-${nota.NUMTRANSENT}`}>
                    <Td>{nota.NUMNOTA}{nota.SERIE ? ` / ${nota.SERIE}` : ''}</Td>
                    <Td>{fmtData(nota.DT_EMISSAO)}</Td>
                    <Td>{nota.DT_ENTRADA ? fmtData(nota.DT_ENTRADA) : <Status tone="attention">Sem entrada</Status>}</Td>
                    <Td numeric>{moeda(nota.VL_TOTAL)}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="primary" onClick={() => void vincular(nota)} disabled={ocupado}>
                        Vincular
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={ocupado}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── decidir uma conferência (RF-011, RF-012, RF-013) ─────────────── */

export function DialogoDecidir({
  alvo, onFechar, cardId, aoDecidir, rotulo,
}: {
  alvo: { ocorrencia: OcorrenciaDaAba; decisao: 'aceito' | 'recusado' } | null;
  onFechar: () => void;
  cardId: number;
  rotulo: string;
  aoDecidir: () => Promise<void>;
}) {
  const [justificativa, setJustificativa] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState('');

  const [alvoAntes, setAlvoAntes] = React.useState(alvo);
  if (alvo !== alvoAntes) {
    setAlvoAntes(alvo);
    if (alvo) { setJustificativa(''); setErro(''); }
  }

  const recusa = alvo?.decisao === 'recusado';
  const faltam = MINIMO_JUSTIFICATIVA - justificativa.trim().length;

  async function decidir() {
    if (!alvo) return;
    setOcupado(true);
    setErro('');
    try {
      const resposta = await acao('sgcOcorrenciaDecidir', {
        cardId, idOcorrencia: alvo.ocorrencia.ID, modo: 'individual',
        decisao: alvo.decisao, justificativa: justificativa.trim(),
      });
      if (!resposta.ok) {
        setErro(String(resposta.erro ?? 'Não foi possível gravar a decisão.'));
        return;
      }
      await aoDecidir();
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar a decisão.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{recusa ? 'Recusar a conferência' : 'Aceitar a conferência'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          <p className="text-[13px] text-ink-secondary">{rotulo}</p>
          <LabelledField
            label="Justificativa"
            hint={recusa
              ? 'Obrigatória na recusa: pelo menos 10 caracteres, é o que a indústria vai ler na cobrança.'
              : 'Opcional ao aceitar.'}
          >
            <Textarea rows={4} value={justificativa} onChange={(evento) => setJustificativa(evento.target.value)} />
          </LabelledField>
          {recusa && faltam > 0 ? (
            <p className="text-[12px] text-attention">Faltam {faltam} caracteres.</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={ocupado}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => void decidir()}
            disabled={ocupado || (recusa && faltam > 0)}
          >
            {recusa ? 'Recusar' : 'Aceitar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── registrar contato com a indústria (RF-022) ─────────────── */

export function DialogoContato({
  aberto, onOpenChange, cardId, aoRegistrar,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  cardId: number;
  aoRegistrar: () => Promise<void>;
}) {
  const [canal, setCanal] = React.useState('email');
  const [resumo, setResumo] = React.useState('');
  const [previsao, setPrevisao] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState('');

  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setCanal('email');
      setResumo('');
      setPrevisao('');
      setErro('');
    }
  }

  async function registrar() {
    if (!resumo.trim()) {
      setErro('Escreva o que a indústria respondeu.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      await acao('sgcEscContatoInserir', {
        cardId, dtContato: agora(), canalContato: canal,
        resumo: resumo.trim(), previsao, criadoEm: agora(),
      });
      await aoRegistrar();
      onOpenChange(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar o contato.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar contato com a indústria</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          <Field label="Canal">
            <SelectMenu label="Canal" value={canal} onChange={setCanal} options={CANAIS} />
          </Field>
          <LabelledField label="O que ficou combinado" hint="Fica no histórico do pedido e na lista de faturamentos pendentes.">
            <Textarea rows={4} value={resumo} onChange={(evento) => setResumo(evento.target.value)} />
          </LabelledField>
          <LabelledField label="Previsão de faturamento" hint="Opcional — a data que a indústria prometeu.">
            <DatePicker value={previsao} onChange={setPrevisao} min={hojeIso()} />
          </LabelledField>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" onClick={() => void registrar()} disabled={ocupado}>Registrar contato</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── cobrança por e-mail (RF-023, RN-014) ─────────────── */

interface ContatoFornecedor { NOME: string; EMAIL: string }

export const COPIA_FIXA = 'compras@benenutri.com';

export function DialogoCobranca({
  aberto, onOpenChange, pedido, diasUteis, aoEnviar,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  pedido: PedidoDaAba;
  diasUteis: number;
  aoEnviar: (para: string) => Promise<void>;
}) {
  const [contatos, setContatos] = React.useState<ContatoFornecedor[] | null>(null);
  const [para, setPara] = React.useState('');
  const [assunto, setAssunto] = React.useState('');
  const [corpo, setCorpo] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState('');

  const [abertoAntes, setAbertoAntes] = React.useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setErro('');
      setPara(pedido.EMAIL_ENVIO || '');
      setAssunto(`Faturamento pendente — pedido ${pedido.NUMPED_WINTHOR || pedido.ID_CARD}`);
      setCorpo(
        `Prezados,\n\nO pedido ${pedido.NUMPED_WINTHOR || pedido.ID_CARD}, no valor de ${moeda(pedido.VL_TOTAL)},`
        + ` foi enviado em ${fmtData(pedido.DT_ENVIO)} e está há ${diasUteis} dias úteis sem faturamento completo.\n\n`
        + 'Podem confirmar a previsão de faturamento?\n\nObrigado,\nCompras Benenutri',
      );
    }
  }

  // Contatos da parametrização do fornecedor (spec 001): uma consulta por
  // abertura do diálogo, nunca por renderização.
  React.useEffect(() => {
    if (!aberto) return;
    acao('sgcFornecedorCarregar', { codfornec: pedido.CODFORNEC })
      .then((resposta) => setContatos((resposta.contatos as ContatoFornecedor[]) ?? []))
      .catch(() => setContatos([]));
  }, [aberto, pedido.CODFORNEC]);

  async function enviar() {
    if (!para.trim()) {
      setErro('Informe o e-mail da indústria.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      const resposta = await acao('sgcCobrancaEnviar', {
        cardId: pedido.ID_CARD, para: para.trim(), assunto: assunto.trim(), corpo,
      });
      if (!resposta.ok) {
        setErro(String(resposta.erro ?? 'Não foi possível enviar a cobrança.'));
        return;
      }
      // A-4 / R-043: a cobrança enviada vira contato no histórico. Fica AQUI,
      // e não no `aoEnviar` de cada tela, porque o diálogo é o mesmo nas duas
      // (a aba do pedido e /faturamentos-pendentes) — e o JS não grava contato
      // de propósito (D-005: quem grava é a tela, com `:VAR_USER`).
      const quando = agora();
      await acao('sgcEscContatoInserir', {
        cardId: pedido.ID_CARD, dtContato: quando, canalContato: 'email',
        resumo: resumoComFila(resumoDaCobranca(assunto.trim(), para.trim()), resposta.emailNaFila), previsao: '', criadoEm: quando,
      });
      await aoEnviar(para.trim());
      onOpenChange(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível enviar a cobrança.');
    } finally {
      setOcupado(false);
    }
  }

  const opcoes = [
    ...(pedido.EMAIL_ENVIO ? [{ value: pedido.EMAIL_ENVIO, label: pedido.EMAIL_ENVIO, hint: 'E-mail do envio do pedido' }] : []),
    ...(contatos ?? [])
      .filter((contato) => contato.EMAIL && contato.EMAIL !== pedido.EMAIL_ENVIO)
      .map((contato) => ({ value: contato.EMAIL, label: contato.EMAIL, hint: contato.NOME })),
  ];

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cobrar o faturamento por e-mail</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          {contatos !== null && opcoes.length === 0 ? (
            <EmptyState
              title="Nenhum contato cadastrado"
              hint="O fornecedor não tem contato de linha na parametrização; digite o e-mail abaixo."
            />
          ) : null}
          {opcoes.length > 0 ? (
            <Field label="Destinatário">
              <SelectMenu label="Destinatário" placeholder="Escolha um contato" value={para} onChange={setPara} options={opcoes} />
            </Field>
          ) : null}
          <LabelledField label="E-mail" hint={`Cópia fixa para ${COPIA_FIXA} — sempre, e sem duplicar o destinatário.`}>
            <Input value={para} onChange={(evento) => setPara(evento.target.value)} />
          </LabelledField>
          <LabelledField label="Assunto">
            <Input value={assunto} onChange={(evento) => setAssunto(evento.target.value)} />
          </LabelledField>
          <LabelledField label="Mensagem">
            <Textarea rows={8} value={corpo} onChange={(evento) => setCorpo(evento.target.value)} />
          </LabelledField>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" onClick={() => void enviar()} disabled={ocupado}>
            <Mail aria-hidden />
            Enviar cobrança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}