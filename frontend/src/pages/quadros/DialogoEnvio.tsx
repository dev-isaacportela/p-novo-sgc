// Diálogo de "Registrar envio" (EN-01 a EN-04): canal, contato, data, número
// do pedido no ERP e observação.
//
// RN-012: por e-mail o destinatário sai dos contatos CADASTRADOS do fornecedor
// (spec 001) — nunca um endereço digitado na hora. `sgcFornecedorCarregar` é
// JAVASCRIPT e devolve `{ fornecedor, contatos… }`, então se chama com `acao`;
// fornecedor sem contato cadastrado não sai por e-mail, e é assim mesmo que
// deve ser.
import * as React from 'react';

import { acao } from '@/lib/mitra-api';
import { validarEnvio, type PedidoCapa } from '@/lib/pedido';
import { hojeIso } from '@/lib/formato';
import { DatePicker } from '@/components/DatePicker';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Field, LabelledField, Input, SelectMenu, Textarea,
} from '@/components/page';

type Registro = Record<string, unknown>;

export interface ContatoDeEnvio {
  email: string;
  nome: string;
}

export interface DadosDoEnvio {
  canal: 'email' | 'plataforma';
  contato: string;
  data: string;
  numped: string;
  obs: string;
}

const CANAIS = [
  { value: 'email', label: 'E-mail', hint: 'Sai para o contato escolhido, com cópia para compras@benenutri.com' },
  { value: 'plataforma', label: 'Plataforma do fornecedor', hint: 'Nenhum e-mail é disparado; o registro fica no pedido' },
];

/**
 * Contatos de envio da linha de produto e link da plataforma (EN-01, EN-02 A,
 * C-09 da revisão): a origem é `sgcFornecedorCarregar` da spec 001.
 */
function useContatos(codfornec: number | undefined, aberto: boolean) {
  const [contatos, setContatos] = React.useState<ContatoDeEnvio[]>([]);
  const [plataforma, setPlataforma] = React.useState('');
  React.useEffect(() => {
    if (!aberto || !codfornec) return;
    let vivo = true;
    acao('sgcFornecedorCarregar', { codfornec }).then(
      (dados) => {
        if (!vivo) return;
        const registros: Registro[] = Array.isArray(dados.contatos) ? dados.contatos : [];
        setContatos(registros
          .filter((registro) => String(registro.EMAIL ?? '').includes('@'))
          .map((registro) => ({ email: String(registro.EMAIL), nome: String(registro.NOME ?? registro.EMAIL) })));
        setPlataforma(String((dados.fornecedor as Registro | null)?.LINK_PLATAFORMA ?? ''));
      },
      () => {
        if (!vivo) return;
        setContatos([]);
        setPlataforma('');
      },
    );
    return () => {
      vivo = false;
    };
  }, [codfornec, aberto]);
  return { contatos, plataforma };
}

export interface DialogoEnvioProps {
  aberto: boolean;
  onFechar: () => void;
  pedido: PedidoCapa | null;
  onConfirmar: (dados: DadosDoEnvio) => Promise<void>;
}

export default function DialogoEnvio({ aberto, onFechar, pedido, onConfirmar }: DialogoEnvioProps) {
  const { contatos, plataforma } = useContatos(pedido?.CODFORNEC, aberto);
  const [canal, setCanal] = React.useState<'email' | 'plataforma'>('email');
  const [contato, setContato] = React.useState('');
  const [data, setData] = React.useState(hojeIso);
  const [numped, setNumped] = React.useState('');
  const [obs, setObs] = React.useState('');
  const [erros, setErros] = React.useState<ReturnType<typeof validarEnvio>['erros']>({});
  const [falha, setFalha] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);

  // Abrir o diálogo repõe o formulário — ajuste durante a renderização, como
  // no DatePicker, em vez de um efeito que só espelha uma prop.
  const [ultimoAberto, setUltimoAberto] = React.useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setCanal('email');
      setContato('');
      setData(hojeIso());
      setNumped(String(pedido?.NUMPED_WINTHOR ?? ''));
      setObs('');
      setErros({});
      setFalha(null);
    }
  }

  async function confirmar() {
    const alvo = canal === 'email' ? contato : plataforma || 'plataforma do fornecedor';
    const validacao = validarEnvio(
      { canal, contato: alvo, data, numped },
      canal === 'email' ? contatos.map((c) => c.email) : [alvo],
    );
    setErros(validacao.erros);
    if (!validacao.ok) return;
    setGravando(true);
    try {
      await onConfirmar({ canal, contato: alvo, data, numped: numped.trim(), obs: obs.trim() });
      onFechar();
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : 'Não foi possível registrar o envio.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar envio à indústria</DialogTitle>
          <DialogDescription>
            O envio fica gravado no pedido e na lista de comunicações, com canal, data, destinatário e número do pedido.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {falha ? <Alert tone="error">{falha}</Alert> : null}
          <Field label="Canal" obrigatorio hint={erros.canal}>
            <SelectMenu
              label="Canal do envio"
              value={canal}
              onChange={(valor) => setCanal(valor as 'email' | 'plataforma')}
              options={CANAIS}
            />
          </Field>
          {canal === 'email' ? (
            <Field label="Contato do fornecedor" obrigatorio hint={erros.contato}>
              <SelectMenu
                label="Contato de envio"
                value={contato}
                onChange={setContato}
                options={contatos.map((item) => ({ value: item.email, label: item.nome, hint: item.email }))}
                placeholder={contatos.length ? 'Escolha o contato' : 'Nenhum contato cadastrado'}
                disabled={!contatos.length}
              />
            </Field>
          ) : (
            <Alert tone="info">
              {plataforma
                ? `O registro guarda o endereço da plataforma: ${plataforma}`
                : 'O fornecedor não tem link de plataforma cadastrado; o registro guarda apenas o canal.'}
            </Alert>
          )}
          {canal === 'email' && !contatos.length ? (
            <Alert tone="warn">
              O fornecedor não tem contato de envio cadastrado. Cadastre na parametrização do fornecedor antes de enviar por e-mail.
            </Alert>
          ) : null}
          <Field label="Data do envio" obrigatorio hint={erros.data}>
            <DatePicker value={data} onChange={setData} aria-label="Data do envio" />
          </Field>
          <LabelledField label="Número do pedido no ERP" obrigatorio hint={erros.numped} hintTone="error">
            <Input value={numped} onChange={(evento) => setNumped(evento.target.value)} placeholder="998877" inputMode="numeric" />
          </LabelledField>
          <LabelledField label="Observação">
            <Textarea value={obs} onChange={(evento) => setObs(evento.target.value)} rows={3} />
          </LabelledField>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={gravando}>Voltar</Button>
          <Button variant="primary" onClick={confirmar} disabled={gravando}>
            {gravando ? 'Registrando...' : 'Registrar envio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
