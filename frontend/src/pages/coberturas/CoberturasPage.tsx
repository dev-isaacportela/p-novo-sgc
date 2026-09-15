// Limites de cobertura futura (spec 003, RF-027 / C-020): quantos dias de
// estoque são aceitáveis sem justificativa, por fornecedor, departamento,
// seção ou produto. Vale sempre o mais específico; sem parametrização, 35 dias.
//
// Admin e gestor mantêm; os demais leem. O formulário fica DESABILITADO para
// quem só lê — nunca escondido (design.md §9.4).

import * as React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert, Button, Code, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, IconButton, Input, LabelledField, PageHeader, Pagination, Panel, SelectMenu, Status,
  Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import type { Cobertura, NivelCobertura } from '@/lib/cobertura';
import { LIMITE_COBERTURA_PADRAO_DIAS, ROTULO_NIVEL, coberturaDeLinha } from '@/lib/cobertura';

const NIVEIS: { value: NivelCobertura; label: string; hint: string }[] = [
  { value: 'sku', label: 'Produto', hint: 'Código do produto no WinThor' },
  { value: 'secao', label: 'Seção', hint: 'Código da seção' },
  { value: 'departamento', label: 'Departamento', hint: 'Código do departamento' },
  { value: 'fornecedor', label: 'Fornecedor', hint: 'Código do fornecedor' },
];

const FILTRO_NIVEL = [{ value: '', label: 'Todos os níveis' },
  ...NIVEIS.map(({ value, label }) => ({ value: String(value), label }))];

const PERSONAS_QUE_MANTEM = ['admin', 'gestor'];
const POR_PAGINA = 50;

const vazio = (): Cobertura => ({ id: 0, nivel: 'sku', codigo: '', descricao: '', limiteDias: LIMITE_COBERTURA_PADRAO_DIAS });
const agora = () => new Date().toISOString().slice(0, 19);

export default function CoberturasPage() {
  const [nivel, setNivel] = React.useState('');
  const [pagina, setPagina] = React.useState(1);
  const [recarga, setRecarga] = React.useState(0);
  const [lista, setLista] = React.useState<Cobertura[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [persona, setPersona] = React.useState('');
  const [emEdicao, setEmEdicao] = React.useState<Cobertura | null>(null);

  const podeManter = PERSONAS_QUE_MANTEM.includes(persona);
  const recarregar = () => setRecarga((atual) => atual + 1);

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcCoberturaListar', { nivel, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA })
      .then((rows) => { if (vivo) { setLista(rows.map(coberturaDeLinha)); setErro(''); } })
      .catch((falha) => { if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar os limites.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [nivel, pagina, recarga]);

  React.useEffect(() => {
    let vivo = true;
    // Menor privilégio em falha: sem persona resolvida, a tela é de leitura.
    linhas('sgcPersonaAtual')
      .then((rows) => vivo && setPersona(String(rows[0]?.PERSONA ?? 'analista')))
      .catch(() => vivo && setPersona(''));
    return () => { vivo = false; };
  }, []);

  async function salvar() {
    if (!emEdicao) return;
    const cobertura = emEdicao;
    setEmEdicao(null);
    try {
      await acao('sgcEscCoberturaGravar', {
        nivel: cobertura.nivel,
        codigo: cobertura.codigo.trim(),
        descricao: cobertura.descricao.trim(),
        limiteDias: cobertura.limiteDias,
        atualizadoEm: agora(),
      });
      recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o limite.');
    }
  }

  async function desativar(id: number) {
    try {
      await acao('sgcEscCoberturaExcluir', { id, atualizadoEm: agora() });
      recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível remover o limite.');
    }
  }

  const invalido = !emEdicao?.codigo.trim() || !(emEdicao.limiteDias > 0);

  return (
    <>
      <PageHeader
        module="Cadastros"
        title="Limites de cobertura"
        description={`Quantos dias de estoque futuro são aceitáveis sem justificativa. Vale sempre o limite mais específico; sem parametrização, ${LIMITE_COBERTURA_PADRAO_DIAS} dias.`}
        actions={(
          <Button variant="primary" onClick={() => setEmEdicao(vazio())} disabled={!podeManter}>
            <Plus aria-hidden />
            Novo limite
          </Button>
        )}
      />

      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Panel>
        <Toolbar>
          <SelectMenu
            label="Nível"
            value={nivel}
            options={FILTRO_NIVEL}
            onChange={(valor) => { setNivel(valor); setPagina(1); }}
          />
        </Toolbar>

        {carregando ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando...</p>
        ) : lista.length === 0 ? (
          <EmptyState
            title="Nenhum limite parametrizado"
            hint={`Sem limite cadastrado, todo produto usa ${LIMITE_COBERTURA_PADRAO_DIAS} dias.`}
            action={podeManter ? <Button variant="primary" onClick={() => setEmEdicao(vazio())}>Novo limite</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Nível</Th>
                  <Th>Alvo</Th>
                  <Th numeric>Limite (dias)</Th>
                  <Th className="w-20 text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((cobertura) => (
                  <Tr key={cobertura.id}>
                    <Td><Status tone="off">{ROTULO_NIVEL[cobertura.nivel] ?? cobertura.nivel}</Status></Td>
                    <Td>
                      <span className="font-semibold text-ink">{cobertura.descricao || `Código ${cobertura.codigo}`}</span>
                      <span className="block text-[12px] text-ink-secondary">
                        <Code prefix="cód.">{cobertura.codigo}</Code>
                      </span>
                    </Td>
                    <Td numeric>{cobertura.limiteDias}</Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <IconButton label="Editar o limite" disabled={!podeManter} onClick={() => setEmEdicao(cobertura)}>
                          <Pencil aria-hidden />
                        </IconButton>
                        <IconButton label="Remover o limite" tone="danger" disabled={!podeManter} onClick={() => void desativar(cobertura.id)}>
                          <Trash2 aria-hidden />
                        </IconButton>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={pagina}
              lastPage={lista.length < POR_PAGINA ? pagina : pagina + 1}
              total={lista.length}
              unit="limites nesta página"
              busy={carregando}
              onPrevious={() => setPagina((atual) => Math.max(1, atual - 1))}
              onNext={() => setPagina((atual) => atual + 1)}
            />
          </>
        )}
      </Panel>

      <Dialog open={emEdicao !== null} onOpenChange={(aberto) => !aberto && setEmEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{emEdicao?.id ? 'Editar limite de cobertura' : 'Novo limite de cobertura'}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <LabelledField label="Nível" hint="O mais específico vence: produto, depois seção, departamento e fornecedor.">
                <SelectMenu
                  label="Nível do limite"
                  value={emEdicao?.nivel ?? 'sku'}
                  options={NIVEIS.map(({ value, label }) => ({ value: String(value), label }))}
                  disabled={!podeManter}
                  onChange={(valor) => setEmEdicao((atual) => (atual ? { ...atual, nivel: valor as NivelCobertura } : atual))}
                />
              </LabelledField>
              <LabelledField
                label="Código"
                obrigatorio
                hint={NIVEIS.find((item) => item.value === emEdicao?.nivel)?.hint}
              >
                <Input
                  value={emEdicao?.codigo ?? ''}
                  disabled={!podeManter}
                  onChange={(evento) => setEmEdicao((atual) => (atual ? { ...atual, codigo: evento.target.value } : atual))}
                />
              </LabelledField>
              <LabelledField label="Descrição" hint="O nome que aparece nesta lista.">
                <Input
                  value={emEdicao?.descricao ?? ''}
                  disabled={!podeManter}
                  onChange={(evento) => setEmEdicao((atual) => (atual ? { ...atual, descricao: evento.target.value } : atual))}
                />
              </LabelledField>
              <LabelledField label="Limite em dias" obrigatorio>
                <Input
                  type="number"
                  min={1}
                  value={String(emEdicao?.limiteDias ?? '')}
                  disabled={!podeManter}
                  onChange={(evento) => setEmEdicao((atual) => (atual ? { ...atual, limiteDias: Number(evento.target.value) || 0 } : atual))}
                />
              </LabelledField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setEmEdicao(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void salvar()} disabled={!podeManter || invalido}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
