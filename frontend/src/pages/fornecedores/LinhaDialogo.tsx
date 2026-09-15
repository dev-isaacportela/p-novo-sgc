// Spec 001 (fornecedores) — T-024: diálogo "Linha de produto". Nome, contatos
// (nome + e-mail) e faixas (de, até, rótulo, parcelas) na mesma folha — sem
// diálogo dentro de diálogo (design.md §9.5).
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, IconButton, LabelledField, Input, Panel, PanelHeader, Alert,
} from '@/components/page';
import { rotuloFaixa } from '@/lib/fornecedor';
import type { LinhaEdit, ContatoEdit, FaixaEdit } from './tipos';
import { novaChave } from './tipos';

function linhaVazia(): LinhaEdit {
  return { chave: novaChave(), nome: '', contatos: [], faixas: [] };
}

export default function LinhaDialogo({
  open,
  linha,
  onOpenChange,
  onSalvar,
}: {
  open: boolean;
  linha: LinhaEdit | null;
  onOpenChange: (open: boolean) => void;
  onSalvar: (linha: LinhaEdit) => void;
}) {
  const [rascunho, setRascunho] = useState<LinhaEdit>(() => linha ?? linhaVazia());
  // Reajusta o rascunho ao abrir — durante a renderização (padrão do
  // DatePicker.tsx neste projeto), não em efeito: evita o cascading render
  // de um useEffect que só espelha uma prop.
  const [abertoAnterior, setAbertoAnterior] = useState(open);
  if (open !== abertoAnterior) {
    setAbertoAnterior(open);
    if (open) setRascunho(linha ?? linhaVazia());
  }

  function adicionarContato() {
    setRascunho((r) => ({ ...r, contatos: [...r.contatos, { chave: novaChave(), nome: '', email: '' }] }));
  }
  function atualizarContato(chave: string, campo: keyof ContatoEdit, valor: string) {
    setRascunho((r) => ({ ...r, contatos: r.contatos.map((c) => (c.chave === chave ? { ...c, [campo]: valor } : c)) }));
  }
  function removerContato(chave: string) {
    setRascunho((r) => ({ ...r, contatos: r.contatos.filter((c) => c.chave !== chave) }));
  }

  function adicionarFaixa() {
    setRascunho((r) => ({ ...r, faixas: [...r.faixas, { chave: novaChave(), valorDe: 0, valorAte: 0, rotulo: 'Opção única', parcelas: '' }] }));
  }
  function atualizarFaixa(chave: string, campo: keyof FaixaEdit, valor: string) {
    setRascunho((r) => ({
      ...r,
      faixas: r.faixas.map((f) => {
        if (f.chave !== chave) return f;
        if (campo === 'valorDe' || campo === 'valorAte') return { ...f, [campo]: Number(valor) || 0 };
        return { ...f, [campo]: valor };
      }),
    }));
  }
  function removerFaixa(chave: string) {
    setRascunho((r) => ({ ...r, faixas: r.faixas.filter((f) => f.chave !== chave) }));
  }

  function salvar() {
    if (!rascunho.nome.trim()) return;
    onSalvar(rascunho);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Linha de produto</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <LabelledField label="Nome da linha" obrigatorio>
            <Input
              value={rascunho.nome}
              onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))}
              placeholder="Ex.: Nutrição Enteral"
            />
          </LabelledField>

          <Panel>
            <PanelHeader title="Contatos de envio" hint="Só contato cadastrado recebe o pedido (EN-02 A).">
              <Button size="sm" onClick={adicionarContato}><Plus aria-hidden />Adicionar contato</Button>
            </PanelHeader>
            <div className="flex flex-col gap-3 p-4">
              {rascunho.contatos.length === 0 ? (
                <p className="text-[13px] text-ink-secondary">Nenhum contato ainda.</p>
              ) : (
                rascunho.contatos.map((contato) => (
                  <div key={contato.chave} className="flex flex-wrap items-end gap-2">
                    <LabelledField label="Nome" className="min-w-40 flex-1">
                      <Input value={contato.nome} onChange={(e) => atualizarContato(contato.chave, 'nome', e.target.value)} />
                    </LabelledField>
                    <LabelledField label="E-mail" className="min-w-56 flex-[2]" obrigatorio>
                      <Input value={contato.email} onChange={(e) => atualizarContato(contato.chave, 'email', e.target.value)} />
                    </LabelledField>
                    <IconButton label="Remover contato" tone="danger" onClick={() => removerContato(contato.chave)}>
                      <Trash2 aria-hidden />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Faixas de prazo de pagamento" hint="O limite inferior conta; o superior não (RN-010).">
              <Button size="sm" onClick={adicionarFaixa}><Plus aria-hidden />Adicionar faixa</Button>
            </PanelHeader>
            <div className="flex flex-col gap-3 p-4">
              {rascunho.faixas.length === 0 ? (
                <p className="text-[13px] text-ink-secondary">Nenhuma faixa ainda.</p>
              ) : (
                rascunho.faixas.map((faixa) => (
                  <div key={faixa.chave} className="flex flex-col gap-1 rounded-xl border border-rule-table p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <LabelledField label="De (R$)" className="w-28">
                        <Input type="number" min="0" value={faixa.valorDe} onChange={(e) => atualizarFaixa(faixa.chave, 'valorDe', e.target.value)} />
                      </LabelledField>
                      <LabelledField label="Até (R$)" hint="0 = sem teto" className="w-28">
                        <Input type="number" min="0" value={faixa.valorAte} onChange={(e) => atualizarFaixa(faixa.chave, 'valorAte', e.target.value)} />
                      </LabelledField>
                      <LabelledField label="Rótulo da opção" className="min-w-36 flex-1">
                        <Input value={faixa.rotulo} onChange={(e) => atualizarFaixa(faixa.chave, 'rotulo', e.target.value)} />
                      </LabelledField>
                      <LabelledField label="Parcelas" hint="Ex.: 30/60/90" className="w-32" obrigatorio>
                        <Input value={faixa.parcelas} onChange={(e) => atualizarFaixa(faixa.chave, 'parcelas', e.target.value)} />
                      </LabelledField>
                      <IconButton label="Remover faixa" tone="danger" onClick={() => removerFaixa(faixa.chave)}>
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                    <p className="text-[12px] text-ink-secondary">{rotuloFaixa(faixa.valorDe, faixa.valorAte)}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {!rascunho.nome.trim() ? <Alert tone="warn">Informe o nome da linha para salvar.</Alert> : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={!rascunho.nome.trim()}>Salvar linha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
