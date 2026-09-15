// Diálogo de processamento manual (spec 004, plan.md §Diálogo de
// processamento e §sgcAgendaProcessarManual — os quatro recortes). A
// validação do recorte roda na tela (lib/agenda.ts `recorte()`), a mesma
// função testada em frontend/tests/agenda.test.mjs; o servidor confere tudo
// de novo (persona, intervalo invertido) porque é ele quem grava.
import * as React from 'react';

import { acao } from '@/lib/mitra-api';
import { hojeIso } from '@/lib/formato';
import { recorte, type ModoProcessamento } from '@/lib/agenda';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Field, LabelledField, SelectMenu, Alert, Button, Input,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';

interface ProcessarDialogoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProcessado: (mensagem: string) => void;
}

const RECORTES: { value: ModoProcessamento; label: string; hint: string }[] = [
  { value: 'mes', label: 'Mês vigente', hint: 'Todos os agendamentos com data de análise dentro do mês atual.' },
  { value: 'intervalo', label: 'Intervalo de datas', hint: 'Agendamentos com data de análise entre as duas datas escolhidas.' },
  { value: 'dias', label: 'Próximos dias', hint: 'Agendamentos com data de análise de hoje até daqui a alguns dias.' },
  { value: 'agendamento', label: 'Um agendamento específico', hint: 'Processa um único agendamento pelo id, mesmo com data futura.' },
];

export function ProcessarDialogo({ open, onOpenChange, onProcessado }: ProcessarDialogoProps) {
  const [modo, setModo] = React.useState<ModoProcessamento>('mes');
  const [dataInicio, setDataInicio] = React.useState('');
  const [dataFim, setDataFim] = React.useState('');
  const [dias, setDias] = React.useState(7);
  const [idAgenda, setIdAgenda] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [processando, setProcessando] = React.useState(false);

  // Reinicia o formulário quando o diálogo abre — ajuste de estado durante a
  // renderização (mesmo padrão de DatePicker.tsx), não em efeito: aqui não há
  // chamada de rede nenhuma, só limpar campos, e um useEffect só para isso
  // aciona o lint set-state-in-effect à toa.
  const [aberturaVista, setAberturaVista] = React.useState(false);
  if (open !== aberturaVista) {
    setAberturaVista(open);
    if (open) {
      setModo('mes');
      setDataInicio('');
      setDataFim('');
      setDias(7);
      setIdAgenda('');
      setErro('');
    }
  }

  const recorteAtual = RECORTES.find((r) => r.value === modo) ?? RECORTES[0];

  async function processar() {
    const validado = recorte(modo, { dataInicio, dataFim, dias, idAgenda: Number(idAgenda) || 0 }, hojeIso());
    if ('erro' in validado) {
      setErro(validado.erro);
      return;
    }
    setErro('');
    setProcessando(true);
    try {
      const resposta = await acao('sgcAgendaProcessarManual', {
        modo, dataInicio: validado.dataInicio, dataFim: validado.dataFim, dias, idAgenda: validado.idAgenda,
      });
      if (resposta?.ok === false) {
        setErro(String(resposta.error || 'Não foi possível processar a agenda.'));
        return;
      }
      const processados = Number(resposta?.processados ?? 0);
      const comErro = Array.isArray(resposta?.erros) ? resposta.erros.length : 0;
      onOpenChange(false);
      onProcessado(
        comErro > 0
          ? `${processados} pedido(s) gerado(s); ${comErro} agendamento(s) com erro.`
          : `${processados} pedido(s) gerado(s).`,
      );
    } catch {
      setErro('Não foi possível processar a agenda agora.');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Processar agenda</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {erro ? <Alert tone="error">{erro}</Alert> : null}

          <Field label="Recorte" hint={recorteAtual.hint}>
            <SelectMenu
              label="Recorte" value={modo} onChange={(v) => setModo(v as ModoProcessamento)}
              options={RECORTES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>

          {modo === 'intervalo' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="De"><DatePicker value={dataInicio} onChange={setDataInicio} aria-label="Data de" /></Field>
              <Field label="Até"><DatePicker value={dataFim} onChange={setDataFim} aria-label="Data até" /></Field>
            </div>
          ) : null}

          {modo === 'dias' ? (
            <LabelledField label="Quantos dias, a partir de hoje">
              <Input type="number" min={1} value={dias} onChange={(e) => setDias(Number(e.target.value) || 1)} />
            </LabelledField>
          ) : null}

          {modo === 'agendamento' ? (
            <LabelledField label="Id do agendamento">
              <Input type="number" min={1} value={idAgenda} onChange={(e) => setIdAgenda(e.target.value)} />
            </LabelledField>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={processando}>Cancelar</Button>
          <Button variant="primary" onClick={processar} disabled={processando}>
            {processando ? 'Processando…' : 'Processar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
