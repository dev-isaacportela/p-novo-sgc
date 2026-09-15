// Spec 001 (fornecedores) — T-025: diálogo "Documento". `uploadFilePublicMitra`
// na escolha do arquivo devolve `publicUrl`; a tela guarda só nome, tipo,
// vencimento e o endereço (RF-010). Aviso de endereço público ANTES do envio
// (UI-06, RN-011). Vencimento no DatePicker do projeto (UI-03 B, spec 004).
import { useRef, useState } from 'react';
import { uploadFilePublicMitra } from 'mitra-interactions-sdk';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, LabelledField, Input, SelectMenu, Alert,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import type { DocumentoEdit } from './tipos';
import { novaChave } from './tipos';

const TIPOS = [
  { value: 'Documento', label: 'Documento' },
  { value: 'Modelo de envio de pedido', label: 'Modelo de envio de pedido' },
];

function documentoVazio(): DocumentoEdit {
  return { chave: novaChave(), tipo: 'Documento', nome: '', endereco: '', vencimento: '' };
}

export default function DocumentoDialogo({
  open,
  onOpenChange,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvar: (documento: DocumentoEdit) => void;
}) {
  const [rascunho, setRascunho] = useState<DocumentoEdit>(documentoVazio);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reajusta o rascunho ao abrir — durante a renderização (padrão do
  // DatePicker.tsx neste projeto), não em efeito.
  const [abertoAnterior, setAbertoAnterior] = useState(open);
  if (open !== abertoAnterior) {
    setAbertoAnterior(open);
    if (open) {
      setRascunho(documentoVazio());
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
      setRascunho((r) => ({ ...r, endereco: url, nome: r.nome || arquivo.name }));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao enviar o arquivo.');
    } finally {
      setEnviando(false);
    }
  }

  const podeSalvar = rascunho.nome.trim() && rascunho.endereco.trim();

  function salvar() {
    if (!podeSalvar) return;
    onSalvar(rascunho);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Documento</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Alert tone="info">O arquivo enviado fica em um endereço público.</Alert>

          <LabelledField label="Arquivo" obrigatorio hint={enviando ? 'Enviando…' : rascunho.endereco ? 'Arquivo enviado.' : 'Nenhum arquivo escolhido ainda.'}>
            <input
              ref={inputRef}
              type="file"
              onChange={escolherArquivo}
              disabled={enviando}
              className="text-[13px] text-ink-secondary file:mr-3 file:rounded-xl file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-[13px] file:font-semibold"
            />
          </LabelledField>

          <LabelledField label="Nome" obrigatorio>
            <Input value={rascunho.nome} onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))} placeholder="Ex.: Contrato comercial 2026" />
          </LabelledField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabelledField label="Tipo">
              <SelectMenu label="Tipo" value={rascunho.tipo} onChange={(v) => setRascunho((r) => ({ ...r, tipo: v }))} options={TIPOS} />
            </LabelledField>
            <LabelledField label="Vencimento" hint="Opcional">
              <DatePicker value={rascunho.vencimento} onChange={(v) => setRascunho((r) => ({ ...r, vencimento: v }))} />
            </LabelledField>
          </div>

          {erro ? <Alert tone="error">{erro}</Alert> : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={!podeSalvar || enviando}>Adicionar documento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
