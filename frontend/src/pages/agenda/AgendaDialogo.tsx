// Diálogo de novo/editar agendamento (spec 004, plan.md §Diálogo de
// novo/editar). Fornecedor só oferece ativos (RN-015); a filial vem de
// sgcFornecedorCarregar(codfornec).filiais (C-09, spec 001 é a fonte única —
// o listar só traz QT_FILIAIS). Participantes por kbUsuariosListar (lib).
import * as React from 'react';
import { X as IconeRemover } from 'lucide-react';

import { linhas, linha, acao } from '@/lib/mitra-api';
import { hojeIso } from '@/lib/formato';
import { localizarPorCriadoEm, periodoPadrao, validarAgendamento, type Recorrencia } from '@/lib/agenda';
import { DatePicker } from '@/components/DatePicker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Field, LabelledField, SelectMenu, Alert, Button, IconButton, Input, Textarea,
} from '@/components/page';

interface AgendaDialogoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idAgenda: number | null;
  onSalvo: () => void;
}

interface Fornecedor { CODFORNEC: number; FORNECEDOR: string }
interface Filial { CODFILIAL: string; FILIAL: string }
interface Usuario { ID: number; NOME: string; EMAIL: string }

const RECORRENCIA_OPCOES = [
  { value: 'nenhuma', label: 'Sem recorrência' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

const FORM_VAZIO = {
  codfornec: 0, fornecedor: '', codfilial: '', filial: '',
  dataAnalise: '', periodoDias: 45, periodoInicio: '', periodoFim: '',
  recorrencia: 'nenhuma' as Recorrencia, dataLimiteRecorrencia: '', observacao: '',
};

/**
 * `sgcEscAgendaInserir` é SQL puro e não devolve o id gerado (a plataforma só
 * devolve linhas de SELECT). Localiza o agendamento recém-gravado pelo trio
 * que acabou de submeter e pelo `criadoEm` exato desta chamada — NÃO pelo
 * maior ID: um agendamento antigo do mesmo trio (mesmo fornecedor/filial/
 * data) tem ID maior que zero mesmo quando o insert é recusado pela guarda
 * (fornecedor inativo, perfil sem permissão), e pegar o maior ID acabaria
 * sobrescrevendo os participantes dele (achado A5 da revisão). `null` aqui
 * significa "o insert não gravou nada".
 * ponytail: SF dedicada devolvendo o id evitaria a segunda chamada; adicionar
 * se este padrão se repetir em outra tela.
 */
async function localizarRecemCriado(codfornec: number, codfilial: string, dataAnalise: string, criadoEm: string): Promise<number | null> {
  const candidatos = await linhas('sgcAgendaListar', {
    codfornec, codfilial, dataInicio: dataAnalise, dataFim: dataAnalise,
    situacao: '', hoje: hojeIso(), limite: 50, offset: 0,
  });
  return localizarPorCriadoEm(candidatos as { ID: number; CRIADO_EM?: string | null }[], criadoEm);
}

export function AgendaDialogo({ open, onOpenChange, idAgenda, onSalvo }: AgendaDialogoProps) {
  const [form, setForm] = React.useState(FORM_VAZIO);
  const [participantes, setParticipantes] = React.useState<Usuario[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [filiais, setFiliais] = React.useState<Filial[]>([]);
  const [usuarios, setUsuarios] = React.useState<Usuario[]>([]);
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  // Reinicia erro/salvando/formulário (novo) durante a renderização, não num
  // efeito (mesmo padrão de DatePicker.tsx) — evita o lint set-state-in-effect
  // para um reset que não depende de rede nenhuma.
  const chaveAberta = open ? String(idAgenda ?? 'novo') : null;
  const [chaveVista, setChaveVista] = React.useState<string | null>(null);
  if (chaveAberta !== chaveVista) {
    setChaveVista(chaveAberta);
    if (chaveAberta !== null) {
      setErro('');
      setSalvando(false);
      if (idAgenda == null) {
        setForm(FORM_VAZIO);
        setParticipantes([]);
        setFiliais([]);
      }
    }
  }

  React.useEffect(() => {
    if (!open) return;
    linhas('sgcFornecedorListar', { busca: '', codfilial: '', ativo: 1, limite: 200, offset: 0 })
      .then((rows) => setFornecedores(rows as Fornecedor[]))
      .catch(() => setFornecedores([]));
    linhas('kbUsuariosListar', { busca: '', limite: 100, offset: 0 })
      .then((rows) => setUsuarios(rows as Usuario[]))
      .catch(() => setUsuarios([]));

    if (idAgenda == null) return;
    linha('sgcAgendaCarregar', { id: idAgenda }).then((row) => {
      if (!row) return;
      setForm({
        codfornec: Number(row.CODFORNEC), fornecedor: String(row.FORNECEDOR),
        codfilial: String(row.CODFILIAL), filial: String(row.FILIAL),
        dataAnalise: String(row.DATA_ANALISE), periodoDias: 45,
        periodoInicio: String(row.PERIODO_INICIO), periodoFim: String(row.PERIODO_FIM),
        recorrencia: (String(row.RECORRENCIA || 'nenhuma')) as Recorrencia,
        dataLimiteRecorrencia: String(row.DATA_LIMITE_RECORRENCIA || ''),
        observacao: String(row.OBSERVACAO || ''),
      });
      const ids = String(row.PARTICIPANTES_IDS || '').split(',').filter(Boolean).map(Number);
      // O separador é ', ' no MySQL, mas o GROUP_CONCAT do SQLite vira ',' — aceita os dois.
      const nomes = String(row.PARTICIPANTES_NOMES || '').split(/\s*,\s*/).filter(Boolean);
      setParticipantes(ids.map((id, i) => ({ ID: id, NOME: nomes[i] || `#${id}`, EMAIL: '' })));
      // Filiais atendidas pelo fornecedor já carregado — precisa de sgcFornecedorCarregar
      // porque sgcFornecedorListar só traz a contagem (C-09).
      acao('sgcFornecedorCarregar', { codfornec: Number(row.CODFORNEC) })
        .then((resp) => setFiliais((resp?.filiais as Filial[]) || []))
        .catch(() => setFiliais([]));
    });
  }, [open, idAgenda]);

  function alterarFornecedor(codfornecStr: string) {
    const codfornec = Number(codfornecStr) || 0;
    const encontrado = fornecedores.find((f) => f.CODFORNEC === codfornec);
    setForm((f) => ({ ...f, codfornec, fornecedor: encontrado?.FORNECEDOR || '', codfilial: '', filial: '' }));
    setFiliais([]);
    if (!codfornec) return;
    acao('sgcFornecedorCarregar', { codfornec })
      .then((resp) => setFiliais((resp?.filiais as Filial[]) || []))
      .catch(() => setFiliais([]));
  }

  function alterarFilial(codfilial: string) {
    const encontrada = filiais.find((f) => f.CODFILIAL === codfilial);
    setForm((f) => ({ ...f, codfilial, filial: encontrada?.FILIAL || '' }));
  }

  function alterarDataAnalise(dataAnalise: string) {
    const periodo = dataAnalise ? periodoPadrao(dataAnalise, form.periodoDias) : null;
    setForm((f) => ({ ...f, dataAnalise, ...(periodo ? { periodoInicio: periodo.inicio, periodoFim: periodo.fim } : {}) }));
  }

  function alterarDias(periodoDias: number) {
    const periodo = form.dataAnalise ? periodoPadrao(form.dataAnalise, periodoDias) : null;
    setForm((f) => ({ ...f, periodoDias, ...(periodo ? { periodoInicio: periodo.inicio, periodoFim: periodo.fim } : {}) }));
  }

  function adicionarParticipante(idStr: string) {
    const id = Number(idStr);
    const usuario = usuarios.find((u) => u.ID === id);
    if (!usuario || participantes.some((p) => p.ID === id)) return;
    setParticipantes((p) => [...p, usuario]);
  }

  function removerParticipante(id: number) {
    setParticipantes((p) => p.filter((x) => x.ID !== id));
  }

  async function salvar() {
    if (!form.codfornec || !form.codfilial || !form.dataAnalise) {
      setErro('Escolha fornecedor, filial e data da análise.');
      return;
    }
    const validacao = validarAgendamento({
      codfornec: form.codfornec, codfilial: form.codfilial, dataAnalise: form.dataAnalise,
      periodoInicio: form.periodoInicio, periodoFim: form.periodoFim,
      recorrencia: form.recorrencia, dataLimite: form.dataLimiteRecorrencia,
    });
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      const agora = new Date().toISOString().slice(0, 19);
      const payload = {
        codfornec: form.codfornec, fornecedor: form.fornecedor, codfilial: form.codfilial, filial: form.filial,
        dataAnalise: form.dataAnalise, periodoInicio: form.periodoInicio, periodoFim: form.periodoFim,
        recorrencia: form.recorrencia, dataLimiteRecorrencia: form.dataLimiteRecorrencia, observacao: form.observacao,
      };
      let id = idAgenda;
      if (id != null) {
        await acao('sgcEscAgendaAtualizar', { ...payload, id, atualizadoEm: agora });
      } else {
        await acao('sgcEscAgendaInserir', { ...payload, criadoEm: agora });
        id = await localizarRecemCriado(form.codfornec, form.codfilial, form.dataAnalise, agora);
        if (id == null) {
          setErro('O agendamento não foi gravado: confira o fornecedor (ativo?) e o seu perfil.');
          return;
        }
      }
      await acao('sgcEscAgendaParticipanteLimpar', { idAgenda: id });
      for (const participante of participantes) {
        await acao('sgcEscAgendaParticipanteInserir', { idAgenda: id, usuarioId: participante.ID, criadoEm: agora });
      }
      onSalvo();
    } catch {
      setErro('Não foi possível salvar o agendamento agora.');
    } finally {
      setSalvando(false);
    }
  }

  const usuariosDisponiveis = usuarios.filter((u) => !participantes.some((p) => p.ID === u.ID));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{idAgenda == null ? 'Novo agendamento' : 'Editar agendamento'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {erro ? <Alert tone="error">{erro}</Alert> : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fornecedor" obrigatorio>
              <SelectMenu
                label="Fornecedor" value={form.codfornec ? String(form.codfornec) : ''}
                onChange={alterarFornecedor} placeholder="Selecione o fornecedor"
                // O fornecedor do agendamento entra mesmo se ficou inativo (RN-015): editar
                // não pode mostrar o campo vazio nem obrigar a trocar de fornecedor.
                options={[
                  ...(form.codfornec && !fornecedores.some((f) => f.CODFORNEC === form.codfornec)
                    ? [{ value: String(form.codfornec), label: form.fornecedor || `Fornecedor ${form.codfornec}`, hint: 'inativo' }]
                    : []),
                  ...fornecedores.map((f) => ({ value: String(f.CODFORNEC), label: f.FORNECEDOR })),
                ]}
              />
            </Field>
            <Field label="Filial" obrigatorio>
              <SelectMenu
                label="Filial" value={form.codfilial} onChange={alterarFilial}
                placeholder="Selecione a filial" disabled={!form.codfornec}
                options={filiais.map((f) => ({ value: f.CODFILIAL, label: f.FILIAL }))}
              />
            </Field>
          </div>

          {/* Rótulos de uma linha só: um rótulo que quebra empurra o campo para
              baixo e desalinha a linha inteira. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
            <Field label="Data da análise" obrigatorio>
              <DatePicker value={form.dataAnalise} onChange={alterarDataAnalise} aria-label="Data da análise" />
            </Field>
            <Field label="Duração (dias)">
              <Input
                type="number" min={1} value={form.periodoDias}
                aria-label="Duração do período em dias"
                className="text-right"
                onChange={(e) => alterarDias(Number(e.target.value) || 1)}
              />
            </Field>
            <Field label="Recorrência">
              <SelectMenu
                label="Recorrência" value={form.recorrencia}
                onChange={(v) => setForm((f) => ({ ...f, recorrencia: v as Recorrencia }))}
                options={RECORRENCIA_OPCOES}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Período — início">
              <DatePicker value={form.periodoInicio} onChange={(v) => setForm((f) => ({ ...f, periodoInicio: v }))} aria-label="Período início" />
            </Field>
            <Field label="Período — fim">
              <DatePicker value={form.periodoFim} onChange={(v) => setForm((f) => ({ ...f, periodoFim: v }))} aria-label="Período fim" />
            </Field>
          </div>

          {form.recorrencia !== 'nenhuma' ? (
            <Field label="Data-limite da recorrência" hint="A recorrência para de gerar novas ocorrências depois desta data.">
              <DatePicker
                value={form.dataLimiteRecorrencia}
                onChange={(v) => setForm((f) => ({ ...f, dataLimiteRecorrencia: v }))}
                aria-label="Data-limite da recorrência"
              />
            </Field>
          ) : null}

          <Field label="Participantes">
            <SelectMenu
              label="Adicionar participante" value="" onChange={adicionarParticipante}
              placeholder="Selecionar participante" options={usuariosDisponiveis.map((u) => ({ value: String(u.ID), label: u.NOME, hint: u.EMAIL }))}
            />
            {participantes.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {participantes.map((p) => (
                  <li key={p.ID} className="inline-flex items-center gap-1 rounded-xl bg-accent py-0.5 pr-0.5 pl-2.5 text-[12px] text-accent-foreground">
                    <span>{p.NOME}</span>
                    <IconButton label={`Remover ${p.NOME}`} onClick={() => removerParticipante(p.ID)}>
                      <IconeRemover />
                    </IconButton>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>

          <LabelledField label="Observação" hint="Opcional.">
            <Textarea
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
            />
          </LabelledField>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
