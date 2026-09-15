// Diálogos da aba B.O. (spec 007) — separados de Bo.tsx porque o `max-lines`
// 800 do ESLint não cabe tudo num arquivo só.
//
// Cada diálogo é "burro": só coleta o dado e devolve por `onConfirmar`/
// `onSalvar` — quem chama a Server Function é Bo.tsx (mesmo padrão de
// BuscarProduto/DocumentoDialogo da 001/003). Exceção: o upload do arquivo
// (`uploadFilePublicMitra`) é do próprio diálogo, porque não passa por SF.
import * as React from 'react';
import { uploadFilePublicMitra } from 'mitra-interactions-sdk';
import {
  Alert, Button, CheckRow, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, Input, LabelledField, SelectMenu, Textarea,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { validarMarcacaoBo } from '@/lib/bo.ts';
import type { ItemPedido } from '@/lib/compras.ts';

/* ─────────────────────── Marcar itens em B.O. (RF-001..RF-004) ─────────────────────── */

interface RascunhoMarcacao {
  codprod: number;
  marcado: boolean;
  qtPendente: string;
  observacao: string;
}

export function MarcarItensDialogo({
  open,
  onOpenChange,
  itensDoPedido,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itensDoPedido: ItemPedido[];
  onConfirmar: (itens: { codprod: number; qtPendente: number; observacao: string }[]) => Promise<void>;
}) {
  const elegiveis = React.useMemo(() => itensDoPedido.filter((i) => i.status !== 'removido'), [itensDoPedido]);
  const [rascunho, setRascunho] = React.useState<RascunhoMarcacao[]>([]);
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const [abertoAnterior, setAbertoAnterior] = React.useState(open);
  if (open !== abertoAnterior) {
    setAbertoAnterior(open);
    if (open) {
      setRascunho(elegiveis.map((i) => ({ codprod: i.codprod, marcado: false, qtPendente: String(i.qtPedida), observacao: '' })));
      setErro('');
    }
  }

  function alterar(codprod: number, mudanca: Partial<RascunhoMarcacao>) {
    setRascunho((atual) => atual.map((item) => (item.codprod === codprod ? { ...item, ...mudanca } : item)));
  }

  async function confirmar() {
    const selecionados = rascunho.filter((r) => r.marcado);
    if (selecionados.length === 0) {
      setErro('Selecione ao menos um item.');
      return;
    }
    const itens = selecionados.map((r) => ({ codprod: r.codprod, qtPendente: Number(r.qtPendente) || 0, observacao: r.observacao }));
    // RN-001, regra de tela: mesma validação que o servidor faz, antes de gastar a chamada.
    const invalido = validarMarcacaoBo(itens, itensDoPedido.map((i) => ({
      CODPROD: i.codprod, DESCRICAO: i.descricao, QT_PEDIDA: i.qtPedida, STATUS: i.status,
    })));
    if (invalido) {
      setErro(invalido);
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await onConfirmar(itens);
      onOpenChange(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível marcar os itens.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Marcar itens em B.O.</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-2 overflow-y-auto">
          {elegiveis.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-secondary">Este pedido não tem itens.</p>
          ) : rascunho.map((r) => {
            const item = elegiveis.find((i) => i.codprod === r.codprod);
            if (!item) return null;
            return (
              <div key={r.codprod} className="rounded-xl border border-rule-row p-2">
                <CheckRow marcado={r.marcado} onToggle={() => alterar(r.codprod, { marcado: !r.marcado })} hint={`Pedidos: ${item.qtPedida}`}>
                  {item.descricao}
                </CheckRow>
                {r.marcado ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 pl-7 sm:grid-cols-2">
                    <LabelledField label="Quantidade pendente" obrigatorio>
                      <Input type="number" min={0} className="text-right" value={r.qtPendente} onChange={(e) => alterar(r.codprod, { qtPendente: e.target.value })} />
                    </LabelledField>
                    <LabelledField label="Observação" hint="Opcional">
                      <Input value={r.observacao} onChange={(e) => alterar(r.codprod, { observacao: e.target.value })} placeholder="Ex.: confirmado pelo representante" />
                    </LabelledField>
                  </div>
                ) : null}
              </div>
            );
          })}
          {erro ? <Alert tone="error">{erro}</Alert> : null}
        </DialogBody>
        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void confirmar()} disabled={salvando}>Marcar itens</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Registrar previsão (RF-006/RF-007) ─────────────────────── */

export function PrevisaoDialogo({
  open,
  onOpenChange,
  dtPrevisaoAtual,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dtPrevisaoAtual: string;
  onConfirmar: (dados: { dtPrevisao: string; observacao: string }) => Promise<void>;
}) {
  const [dtPrevisao, setDtPrevisao] = React.useState(dtPrevisaoAtual);
  const [observacao, setObservacao] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const [abertoAnterior, setAbertoAnterior] = React.useState(open);
  if (open !== abertoAnterior) {
    setAbertoAnterior(open);
    if (open) {
      setDtPrevisao(dtPrevisaoAtual);
      setObservacao('');
      setErro('');
    }
  }

  async function confirmar() {
    if (!dtPrevisao) {
      setErro('Informe a data prevista.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await onConfirmar({ dtPrevisao, observacao });
      onOpenChange(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar a previsão.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar previsão de liberação</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <LabelledField label="Previsão" obrigatorio hint="Registrar uma previsão nova reinicia a cobrança diária (RN-004).">
            <DatePicker value={dtPrevisao} onChange={setDtPrevisao} />
          </LabelledField>
          <LabelledField label="Observação" hint="Opcional">
            <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: confirmado pelo representante do fornecedor" />
          </LabelledField>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
        </DialogBody>
        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void confirmar()} disabled={salvando}>Registrar previsão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Anexar documento / carta de falta (RF-011) ─────────────────────── */

const TIPOS_DOCUMENTO = [
  { value: 'carta_falta', label: 'Carta de falta' },
  { value: 'outro', label: 'Outro' },
];

export function DocumentoBoDialogo({
  open,
  onOpenChange,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvar: (documento: { tipo: string; nomeArquivo: string; endereco: string }) => Promise<void>;
}) {
  const [tipo, setTipo] = React.useState('carta_falta');
  const [nomeArquivo, setNomeArquivo] = React.useState('');
  const [endereco, setEndereco] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState('');

  const [abertoAnterior, setAbertoAnterior] = React.useState(open);
  if (open !== abertoAnterior) {
    setAbertoAnterior(open);
    if (open) {
      setTipo('carta_falta');
      setNomeArquivo('');
      setEndereco('');
      setErro('');
    }
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    try {
      const resposta = await uploadFilePublicMitra({ file: arquivo });
      const url = (resposta as { result?: { publicUrl?: string } })?.result?.publicUrl;
      if (!url) throw new Error(`O envio de ${arquivo.name} não devolveu o endereço do arquivo.`);
      setEndereco(url);
      setNomeArquivo((atual) => atual || arquivo.name);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao enviar o arquivo.');
    } finally {
      setEnviando(false);
    }
  }

  const podeSalvar = nomeArquivo.trim() && endereco.trim();

  async function salvar() {
    if (!podeSalvar) return;
    setEnviando(true);
    setErro('');
    try {
      await onSalvar({ tipo, nomeArquivo: nomeArquivo.trim(), endereco: endereco.trim() });
      onOpenChange(false);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível anexar o documento.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anexar documento</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {/* UI-06/RN-011: o aviso de endereço público vem ANTES da escolha do arquivo. */}
          <Alert tone="info">O arquivo enviado fica em um endereço público.</Alert>

          <LabelledField label="Arquivo" obrigatorio hint={enviando ? 'Enviando…' : endereco ? 'Arquivo enviado.' : 'Nenhum arquivo escolhido ainda.'}>
            <input
              type="file"
              onChange={(e) => void escolherArquivo(e)}
              disabled={enviando}
              className="text-[13px] text-ink-secondary file:mr-3 file:rounded-xl file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-[13px] file:font-semibold"
            />
          </LabelledField>

          <LabelledField label="Nome" obrigatorio>
            <Input value={nomeArquivo} onChange={(e) => setNomeArquivo(e.target.value)} placeholder="Ex.: Carta de falta - Nestlé.pdf" />
          </LabelledField>

          <LabelledField label="Tipo">
            <SelectMenu label="Tipo" value={tipo} onChange={setTipo} options={TIPOS_DOCUMENTO} />
          </LabelledField>

          {erro ? <Alert tone="error">{erro}</Alert> : null}
        </DialogBody>
        <DialogFooter className="flex-col-reverse sm:flex-row">
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={!podeSalvar || enviando}>Anexar documento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
