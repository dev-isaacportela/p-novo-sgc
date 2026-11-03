// Os diálogos do card de empenho: um formulário pequeno com campos de texto,
// data e escolha. A recusa por texto curto (C-023, C-029, C-033) é da regra pura
// (`textoCurto`) e também do `WHERE` da escrita; aqui só se mostra o erro.
import * as React from 'react';

import { TEXTO_MINIMO, textoCurto } from '@/lib/empenhos';
import { hojeIso } from '@/lib/formato';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Field, Input, LabelledField, SelectMenu, Textarea, type SelectOption,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';

export type CampoDialogo =
  | { chave: string; tipo: 'texto'; rotulo: string; minimo?: boolean; longo?: boolean }
  | { chave: string; tipo: 'data'; rotulo: string; opcional?: boolean }
  | { chave: string; tipo: 'escolha'; rotulo: string; opcoes: SelectOption[] };

export interface DialogoFormularioProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao: string;
  campos: CampoDialogo[];
  rotuloConfirmar: string;
  perigo?: boolean;
  onConfirmar: (valores: Record<string, string>) => Promise<void>;
}

const inicial = (campos: CampoDialogo[]) =>
  Object.fromEntries(campos.map((c) => [c.chave, c.tipo === 'data' && !c.opcional ? hojeIso() : c.tipo === 'escolha' ? c.opcoes[0]?.value ?? '' : '']));

export function DialogoFormulario({ aberto, onFechar, titulo, descricao, campos, rotuloConfirmar, perigo, onConfirmar }: DialogoFormularioProps) {
  const [valores, setValores] = React.useState<Record<string, string>>(() => inicial(campos));
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);

  // Abrir limpa o formulário (ajuste durante a renderização, como o DialogoMotivo da 002).
  const [ultimoAberto, setUltimoAberto] = React.useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setValores(inicial(campos));
      setErro(null);
    }
  }

  const definir = (chave: string, valor: string) => setValores((atual) => ({ ...atual, [chave]: valor }));

  async function confirmar() {
    for (const campo of campos) {
      const valor = (valores[campo.chave] ?? '').trim();
      if (campo.tipo === 'texto' && campo.minimo && textoCurto(valor)) return setErro(`${campo.rotulo}: ao menos ${TEXTO_MINIMO} caracteres.`);
      if (campo.tipo === 'texto' && !campo.minimo && !valor) return setErro(`Informe ${campo.rotulo.toLowerCase()}.`);
      if (campo.tipo === 'data' && !campo.opcional && !valor) return setErro(`Informe ${campo.rotulo.toLowerCase()}.`);
    }
    setGravando(true);
    try {
      await onConfirmar(Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.trim()])));
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(estaAberto) => !estaAberto && !gravando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}
            {campos.map((campo) => {
              const valor = valores[campo.chave] ?? '';
              if (campo.tipo === 'data') {
                return (
                  <Field key={campo.chave} label={campo.rotulo} obrigatorio={!campo.opcional}>
                    <DatePicker value={valor} onChange={(v) => definir(campo.chave, v)} aria-label={campo.rotulo} />
                  </Field>
                );
              }
              if (campo.tipo === 'escolha') {
                return (
                  <Field key={campo.chave} label={campo.rotulo} obrigatorio>
                    <SelectMenu label={campo.rotulo} value={valor} onChange={(v) => definir(campo.chave, v)} options={campo.opcoes} />
                  </Field>
                );
              }
              return (
                <LabelledField key={campo.chave} label={campo.rotulo} obrigatorio
                  hint={campo.minimo ? `${valor.trim().length} de ao menos ${TEXTO_MINIMO} caracteres` : undefined}>
                  {campo.longo ? (
                    <Textarea value={valor} onChange={(e) => definir(campo.chave, e.target.value)} rows={4} />
                  ) : (
                    <Input value={valor} onChange={(e) => definir(campo.chave, e.target.value)} />
                  )}
                </LabelledField>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={gravando}>Voltar</Button>
          <Button variant={perigo ? 'danger' : 'primary'} onClick={confirmar} disabled={gravando}>
            {gravando ? 'Gravando...' : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
