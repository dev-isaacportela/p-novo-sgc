// Spec 013 — o plano de ação de um produto numa filial, numa aba (RF-011).
// Salvar = uma escrita guardada + uma releitura: a escrita recusada devolve 0
// linhas sem erro (D-03), e é a releitura que diz se gravou (C-024). Quem só lê
// vê o formulário inteiro desabilitado, com o motivo — não escondido.
import * as React from 'react';
import { DatePicker } from '@/components/DatePicker';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Field, LabelledField, SelectMenu, Textarea,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtDataHora } from '@/lib/formato';
import {
  STATUS_PLANO, planoDeLinha, resultadoDoSalvamento, validarPlano,
  type OrigemPlano, type PlanoAcao, type StatusPlano,
} from '@/lib/movimentacao';

export interface AlvoPlano {
  origem: OrigemPlano;
  codprod: number;
  codfilial: string;
  descricao: string;
}

interface Formulario {
  fato: string;
  causa: string;
  acao: string;
  responsavelId: string;
  dataAcompanhamento: string;
  status: StatusPlano;
}

const formularioDe = (plano: PlanoAcao | null): Formulario => ({
  fato: plano?.fato ?? '',
  causa: plano?.causa ?? '',
  acao: plano?.acao ?? '',
  responsavelId: plano?.responsavelId ? String(plano.responsavelId) : '',
  dataAcompanhamento: plano?.dataAcompanhamento ?? '',
  status: plano?.status ?? 'aberto',
});

const agora = () => new Date().toISOString().slice(0, 19);

export default function PlanoAcaoDialogo({
  alvo, plano, podeGravar, responsaveis, onFechar, onGravado,
}: {
  alvo: AlvoPlano | null;
  plano: PlanoAcao | null;
  podeGravar: boolean;
  responsaveis: { value: string; label: string }[];
  onFechar: () => void;
  onGravado: (mensagem: string) => void;
}) {
  const [form, setForm] = React.useState<Formulario>(() => formularioDe(plano));
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  const alterar = (campo: keyof Formulario) => (valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  async function reler(): Promise<PlanoAcao | null> {
    if (!alvo) return null;
    const [linha] = await linhas('sgcMovPlanosListar', {
      origem: alvo.origem, codfilial: alvo.codfilial, codprods: String(alvo.codprod), limite: 1, offset: 0,
    });
    return linha ? planoDeLinha(linha) : null;
  }

  async function salvar() {
    if (!alvo) return;
    const invalido = validarPlano(form);
    if (invalido) { setErro(invalido); return; }
    setSalvando(true);
    setErro('');
    try {
      await linhas('sgcEscMovPlanoSalvar', {
        origem: alvo.origem, codprod: alvo.codprod, codfilial: alvo.codfilial, descricao: alvo.descricao,
        fato: form.fato.trim(), causa: form.causa.trim(), acao: form.acao.trim(),
        responsavelId: Number(form.responsavelId) || 0, dataAcompanhamento: form.dataAcompanhamento,
        status: form.status, agora: agora(),
      });
      const resultado = resultadoDoSalvamento(
        { fato: form.fato.trim(), causa: form.causa.trim(), acao: form.acao.trim(), status: form.status },
        await reler(),
      );
      if (!resultado.ok) { setErro(resultado.mensagem); return; }
      onGravado(resultado.mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o plano.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!plano || !window.confirm('Remover o plano de ação deste produto?')) return;
    setSalvando(true);
    setErro('');
    try {
      await linhas('sgcEscMovPlanoExcluir', { id: plano.id });
      if (await reler()) { setErro('O plano não foi removido: seu perfil não pode registrar plano de ação.'); return; }
      onGravado('Plano de ação removido.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover o plano.');
    } finally {
      setSalvando(false);
    }
  }

  const bloqueado = !podeGravar || salvando;

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Plano de ação</DialogTitle>
          <DialogDescription>
            {alvo ? `${alvo.descricao} · cód. ${alvo.codprod} · filial ${alvo.codfilial} · ${alvo.origem === 'sem_venda' ? 'Sem venda' : 'A vencer'}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!podeGravar ? <Alert tone="info">Você só consulta: o plano de ação é registrado por compras, gestão e diretoria, com acesso de edição.</Alert> : null}
          <LabelledField label="Fato" hint="O que está acontecendo com o produto.">
            <Textarea value={form.fato} onChange={(e) => alterar('fato')(e.target.value)} disabled={bloqueado} rows={2} />
          </LabelledField>
          <LabelledField label="Causa">
            <Textarea value={form.causa} onChange={(e) => alterar('causa')(e.target.value)} disabled={bloqueado} rows={2} />
          </LabelledField>
          <LabelledField label="Ação" hint="Preencha ao menos um entre fato, causa e ação.">
            <Textarea value={form.acao} onChange={(e) => alterar('acao')(e.target.value)} disabled={bloqueado} rows={2} />
          </LabelledField>
          <Field label="Responsável">
            <SelectMenu
              label="Responsável"
              value={form.responsavelId}
              onChange={alterar('responsavelId')}
              options={[{ value: '', label: 'Sem responsável' }, ...responsaveis]}
              placeholder="Sem responsável"
              disabled={bloqueado}
            />
          </Field>
          <Field label="Acompanhar em">
            <DatePicker value={form.dataAcompanhamento} onChange={alterar('dataAcompanhamento')} disabled={bloqueado} aria-label="Data de acompanhamento" />
          </Field>
          <Field label="Situação">
            <SelectMenu
              label="Situação"
              value={form.status}
              onChange={(v) => alterar('status')(v)}
              options={STATUS_PLANO.map((s) => ({ value: s.value, label: s.label }))}
              disabled={bloqueado}
            />
          </Field>
          {plano?.atualizadoEm ? (
            <Alert tone="info">Última atualização em {fmtDataHora(plano.atualizadoEm)}{plano.atualizadoPorNome ? ` por ${plano.atualizadoPorNome}` : ''}.</Alert>
          ) : null}
          {erro ? <Alert tone="error">{erro}</Alert> : null}
        </DialogBody>
        <DialogFooter>
          {plano && podeGravar ? <Button variant="danger" onClick={remover} disabled={salvando}>Remover plano</Button> : null}
          <Button onClick={onFechar}>{podeGravar ? 'Cancelar' : 'Fechar'}</Button>
          {podeGravar ? <Button variant="primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar plano'}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
