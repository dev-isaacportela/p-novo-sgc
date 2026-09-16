// Spec 009 — os diálogos de `/relatorios`: salvar, editar e excluir.
//
// Escrita guardada recusada devolve 0 linhas e NENHUM erro (D-03 da onda 1):
// por isso quem chama RELÊ a galeria depois de cada uma e compara com o que
// esperava, em vez de confiar no silêncio. O erro aparece em `Alert`, nunca em
// toast (UI-02 A).
import * as React from 'react';
import { acao } from '@/lib/mitra-api';
import {
  Alert, Button, CheckRow, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, Input, LabelledField, Textarea,
} from '@/components/page';
import { tituloValido } from '@/lib/relatorio';

export interface RelatorioSalvo {
  ID: number;
  TITULO: string;
  DESCRICAO: string;
  CONFIG_JSON: string;
  COMPARTILHADO: number;
  CRIADO_POR: number;
  CRIADO_POR_NOME: string;
  CRIADO_EM: string;
  ATUALIZADO_EM: string;
  PODE_EDITAR: number;
}

const agoraIso = () => new Date().toISOString().slice(0, 19);

/**
 * Salvar (novo) e editar (existente) são o MESMO formulário: o que muda é a
 * server function e a conferência da releitura.
 */
export function DialogoRelatorio({
  aberto, onFechar, relatorio, configJson, aoSalvar,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** `null` = relatório novo. */
  relatorio: RelatorioSalvo | null;
  /** O recorte que está na tela, já serializado. */
  configJson: string;
  /** Relê a galeria e devolve a lista nova — é ela que confirma a gravação. */
  aoSalvar: () => Promise<RelatorioSalvo[]>;
}) {
  const [titulo, setTitulo] = React.useState('');
  const [descricao, setDescricao] = React.useState('');
  const [compartilhado, setCompartilhado] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);

  // Ajuste de estado durante a RENDERIZAÇÃO (não em efeito): cada abertura do
  // diálogo recomeça o formulário do relatório que está sendo editado, sem
  // pintar uma vez com o texto da abertura anterior.
  const chave = aberto ? `${relatorio?.ID ?? 0}` : '';
  const [ultimaChave, setUltimaChave] = React.useState(chave);
  if (chave !== ultimaChave) {
    setUltimaChave(chave);
    if (aberto) {
      setTitulo(relatorio?.TITULO ?? '');
      setDescricao(relatorio?.DESCRICAO ?? '');
      setCompartilhado(relatorio ? Number(relatorio.COMPARTILHADO) === 1 : true);
      setErro('');
    }
  }

  async function salvar() {
    if (!tituloValido(titulo)) {
      setErro('O título é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const entrada = {
        titulo: titulo.trim(), descricao, configJson,
        compartilhado: compartilhado ? 1 : 0, agora: agoraIso(),
      };
      if (relatorio) await acao('sgcEscRelatorioAtualizar', { ...entrada, id: relatorio.ID });
      else await acao('sgcEscRelatorioInserir', entrada);

      // D-03: a releitura é a confirmação — sem ela, uma escrita recusada
      // passaria por sucesso.
      const lista = await aoSalvar();
      const gravado = relatorio
        ? lista.find((r) => Number(r.ID) === relatorio.ID && r.TITULO === titulo.trim())
        : lista.find((r) => r.TITULO === titulo.trim());
      if (!gravado) {
        setErro('O servidor recusou a gravação: confira o seu perfil e se o relatório é seu.');
        return;
      }
      onFechar();
    } catch (e) {
      setErro(String((e as Error)?.message || e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{relatorio ? 'Editar relatório' : 'Salvar relatório'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          <LabelledField label="Título" obrigatorio>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={180} />
          </LabelledField>
          <LabelledField label="Descrição" hint="Para quem abrir a galeria daqui a um mês.">
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={3} />
          </LabelledField>
          <CheckRow
            marcado={compartilhado}
            onToggle={() => setCompartilhado((v) => !v)}
            hint="Compartilhado, a equipe inteira vê. Sem compartilhar, só você."
          >
            Compartilhar com a equipe
          </CheckRow>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoExcluir({
  relatorio, onFechar, aoExcluir,
}: {
  relatorio: RelatorioSalvo | null;
  onFechar: () => void;
  aoExcluir: () => Promise<RelatorioSalvo[]>;
}) {
  const [erro, setErro] = React.useState('');
  const [excluindo, setExcluindo] = React.useState(false);

  // Idem: trocar o relatorio a excluir limpa o erro na propria renderizacao.
  const [ultimoAlvo, setUltimoAlvo] = React.useState(relatorio);
  if (relatorio !== ultimoAlvo) {
    setUltimoAlvo(relatorio);
    setErro('');
  }

  async function excluir() {
    if (!relatorio) return;
    setExcluindo(true);
    setErro('');
    try {
      await acao('sgcEscRelatorioExcluir', { id: relatorio.ID });
      const lista = await aoExcluir();
      if (lista.some((r) => Number(r.ID) === relatorio.ID)) {
        setErro('O servidor recusou a exclusão: só quem criou o relatório, ou um administrador, pode excluí-lo.');
        return;
      }
      onFechar();
    } catch (e) {
      setErro(String((e as Error)?.message || e));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Dialog open={!!relatorio} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir relatório</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          {relatorio ? (
            <p className="text-[13px] text-ink-secondary">
              “{relatorio.TITULO}” sai da galeria para todo mundo. Os pedidos não são tocados — o que se apaga é o recorte.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={excluindo}>Cancelar</Button>
          <Button variant="danger" onClick={excluir} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
