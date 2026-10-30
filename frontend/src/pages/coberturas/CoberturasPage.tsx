// Coberturas por curva (spec 012): quantos dias de estoque futuro a compra
// mira em cada curva ABC (o ALVO) e quanto de folga passa sem justificativa
// (o TETO = alvo + tolerância), por fornecedor, departamento, seção ou produto.
// Vale sempre a parametrização mais específica que tenha alvo para a curva do
// item; sem nenhuma, 35 dias e tolerância 0.
//
// Gestor e admin mantêm; ninguém mais abre a tela (porteiro de rota, RN-008).
// Quem tem acesso somente-leitura vê tudo com os controles DESABILITADOS —
// nunca escondidos (design.md §9.4).
//
// Custo de execução (RNF-001/RNF-002/RNF-003): abrir são duas chamadas (lista
// + persona em cache); trocar filtro ou página, uma; salvar são 1 gravação +
// 1 log por campo alterado + 1 releitura (pior caso 9); a aba de auditoria
// carrega uma vez, só quando aberta.

import * as React from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, IconButton, Input, LabelledField, PageHeader,
  Pagination, Panel, PanelHeader, RowMeta, RowTitle, SelectMenu, Status, Table, Tabs,
  TabsContent, TabsList, TabsTrigger, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { fmtDataHora, hojeIso } from '@/lib/formato';
import { usePersona } from '@/lib/persona';
import type { Cobertura, CurvaAbc, NivelCobertura } from '@/lib/cobertura';
import {
  ALVO_COBERTURA_PADRAO_DIAS, COLUNAS_CSV_COBERTURA, ROTULO_NIVEL, acaoDaCobertura,
  coberturaDeLinha, diferencasDeCobertura, linhasCsvCobertura, tetoDaCurva,
} from '@/lib/cobertura';

const NIVEIS: { value: NivelCobertura; label: string; hint: string }[] = [
  { value: 'sku', label: 'Produto', hint: 'Código do produto no WinThor' },
  { value: 'secao', label: 'Seção', hint: 'Código da seção' },
  { value: 'departamento', label: 'Departamento', hint: 'Código do departamento' },
  { value: 'fornecedor', label: 'Fornecedor', hint: 'Código do fornecedor' },
];

const FILTRO_NIVEL = [{ value: '', label: 'Todos os níveis' },
  ...NIVEIS.map(({ value, label }) => ({ value: String(value), label }))];

// O padrão é Ativas; é por "Inativas" que se chega ao alvo desativado para
// reativá-lo regravando (C-010).
const FILTRO_SITUACAO = [
  { value: 'ativa', label: 'Ativas' },
  { value: 'inativa', label: 'Inativas' },
  { value: '', label: 'Todas' },
];

const CURVAS: CurvaAbc[] = ['A', 'B', 'C'];
const POR_PAGINA = 50;
const LOG_POR_PAGINA = 50;

const vazia = (): Cobertura => ({
  id: 0,
  nivel: 'sku',
  codigo: '',
  descricao: '',
  ativo: true,
  curvas: {
    A: { alvoDias: 0, toleranciaPct: 0 },
    B: { alvoDias: 0, toleranciaPct: 0 },
    C: { alvoDias: 0, toleranciaPct: 0 },
  },
});

const agora = () => new Date().toISOString().slice(0, 19);
const dias = (valor: number | null) => (valor === null ? null : valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

/** O número digitado; campo vazio é 0 no alvo e 0 na tolerância ("nenhuma folga"). */
const numeroDigitado = (texto: string) => (texto.trim() === '' ? 0 : Number(texto.replace(',', '.')) || 0);

interface LinhaLog {
  ID: unknown; ID_COBERTURA: unknown; NIVEL: unknown; CODIGO: unknown; DESCRICAO: unknown;
  CAMPO: unknown; ANTES: unknown; DEPOIS: unknown; ACAO: unknown; POR_NOME: unknown; EM: unknown;
}

/**
 * As três curvas do formulário numa tabela — uma linha por curva, colunas
 * alvo, tolerância e o máximo sem justificativa (C-013). Rótulos e dicas uma
 * vez só, no cabeçalho e no rodapé, em vez de três painéis repetidos.
 */
function TabelaCurvas({
  curvas, desabilitado, onAlterar,
}: {
  curvas: Cobertura['curvas'];
  desabilitado: boolean;
  onAlterar: (curva: CurvaAbc, campo: 'alvoDias' | 'toleranciaPct', valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <thead>
          <tr>
            <Th className="w-24">Curva</Th>
            <Th numeric className="w-36">Alvo (dias) <span className="text-destructive" title="Campo obrigatório" aria-label="obrigatório">*</span></Th>
            <Th numeric className="w-36">Tolerância (%)</Th>
            <Th numeric>Máximo sem justificativa</Th>
          </tr>
        </thead>
        <tbody>
          {CURVAS.map((curva) => {
            const valor = curvas[curva];
            const teto = tetoDaCurva(valor.alvoDias, valor.toleranciaPct);
            return (
              <Tr key={curva}>
                <Td><RowTitle>{`Curva ${curva}`}</RowTitle></Td>
                <Td numeric>
                  <Input
                    type="number"
                    min={0}
                    className="text-right"
                    aria-label={`Alvo em dias da curva ${curva}`}
                    value={valor.alvoDias ? String(valor.alvoDias) : ''}
                    disabled={desabilitado}
                    onChange={(evento) => onAlterar(curva, 'alvoDias', evento.target.value)}
                  />
                </Td>
                <Td numeric>
                  <Input
                    type="number"
                    min={0}
                    className="text-right"
                    aria-label={`Tolerância em % da curva ${curva}`}
                    value={valor.toleranciaPct ? String(valor.toleranciaPct) : ''}
                    disabled={desabilitado}
                    onChange={(evento) => onAlterar(curva, 'toleranciaPct', evento.target.value)}
                  />
                </Td>
                <Td numeric>
                  <span className="font-title text-[15px] font-bold text-ink">
                    {teto === null ? <Dash /> : `${dias(teto)} dias`}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <RowMeta>
        O alvo é o que a compra mira. Tolerância 0 significa nenhuma folga; o máximo sem justificativa é o alvo mais a tolerância.
      </RowMeta>
    </div>
  );
}

export default function CoberturasPage() {
  const sessao = usePersona();
  const [nivel, setNivel] = React.useState('');
  const [situacao, setSituacao] = React.useState('ativa');
  const [pagina, setPagina] = React.useState(1);
  const [recarga, setRecarga] = React.useState(0);
  const [lista, setLista] = React.useState<Cobertura[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [emEdicao, setEmEdicao] = React.useState<Cobertura | null>(null);
  const [antesDaEdicao, setAntesDaEdicao] = React.useState<Cobertura | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const [aba, setAba] = React.useState('parametros');
  const [log, setLog] = React.useState<LinhaLog[]>([]);
  const [logAlvo, setLogAlvo] = React.useState('0');
  const [logPagina, setLogPagina] = React.useState(1);
  // Comeca em true: a aba abre carregando, e o `finally` de cada busca desliga.
  const [logCarregando, setLogCarregando] = React.useState(true);

  const podeVer = sessao?.permissoes.verCoberturas ?? false;
  const podeManter = podeVer && !sessao?.permissoes.somenteLeitura;
  const motivoBloqueio = podeManter ? undefined : 'Seu acesso a esta tela é somente de leitura.';
  const recarregar = () => setRecarga((atual) => atual + 1);

  React.useEffect(() => {
    if (!podeVer) return undefined;
    let vivo = true;
    linhas('sgcCoberturaListar', { nivel, situacao, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA })
      .then((rows) => { if (vivo) { setLista(rows.map(coberturaDeLinha)); setErro(''); } })
      .catch((falha) => { if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as coberturas.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [podeVer, nivel, situacao, pagina, recarga]);

  // RNF-003: a auditoria só vai ao servidor quando a aba está aberta.
  React.useEffect(() => {
    if (!podeVer || aba !== 'auditoria') return undefined;
    let vivo = true;
    linhas('sgcCoberturaLogListar', {
      idCobertura: Number(logAlvo) || 0, limite: LOG_POR_PAGINA, offset: (logPagina - 1) * LOG_POR_PAGINA,
    })
      .then((rows) => { if (vivo) { setLog(rows as unknown as LinhaLog[]); setErro(''); } })
      .catch((falha) => { if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar o histórico.'); })
      .finally(() => { if (vivo) setLogCarregando(false); });
    return () => { vivo = false; };
  }, [podeVer, aba, logAlvo, logPagina, recarga]);

  function abrir(cobertura: Cobertura | null) {
    setAntesDaEdicao(cobertura);
    setEmEdicao(cobertura ? { ...cobertura, curvas: { ...cobertura.curvas } } : vazia());
  }

  function alterarCurva(curva: CurvaAbc, campo: 'alvoDias' | 'toleranciaPct', texto: string) {
    setEmEdicao((atual) => (atual ? {
      ...atual,
      curvas: { ...atual.curvas, [curva]: { ...atual.curvas[curva], [campo]: numeroDigitado(texto) } },
    } : atual));
  }

  /**
   * RF-008: uma chamada de gravação, uma por campo alterado e a releitura. A
   * releitura não é opcional — escrita guardada recusada devolve 0 linhas sem
   * erro (D-03), e é ela que mostra o que de fato ficou gravado.
   */
  async function salvar() {
    if (!emEdicao) return;
    const depois = { ...emEdicao, codigo: emEdicao.codigo.trim(), descricao: emEdicao.descricao.trim() };
    const antes = antesDaEdicao;
    setSalvando(true);
    try {
      await acao('sgcEscCoberturaGravar', {
        nivel: depois.nivel,
        codigo: depois.codigo,
        descricao: depois.descricao,
        alvoADias: depois.curvas.A.alvoDias,
        toleranciaAPct: depois.curvas.A.toleranciaPct,
        alvoBDias: depois.curvas.B.alvoDias,
        toleranciaBPct: depois.curvas.B.toleranciaPct,
        alvoCDias: depois.curvas.C.alvoDias,
        toleranciaCPct: depois.curvas.C.toleranciaPct,
        atualizadoEm: agora(),
      });
      await registrar(depois, diferencasDeCobertura(antes, depois), acaoDaCobertura(antes, depois));
      setEmEdicao(null);
      setAntesDaEdicao(null);
      recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a cobertura.');
    } finally {
      setSalvando(false);
    }
  }

  async function desativar(cobertura: Cobertura) {
    try {
      await acao('sgcEscCoberturaExcluir', { id: cobertura.id, atualizadoEm: agora() });
      await registrar(cobertura, [{ campo: 'ATIVO', antes: '1', depois: '0' }], 'desativou');
      recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível desativar a cobertura.');
    }
  }

  /** O log resolve o ID_COBERTURA pela chave única — a tela só manda nível e código (D-004). */
  async function registrar(
    alvo: Cobertura,
    diferencas: { campo: string; antes: string; depois: string }[],
    acaoDerivada: string,
  ) {
    const em = agora();
    for (const diferenca of diferencas) {
      await acao('sgcEscCoberturaLogInserir', {
        nivel: alvo.nivel, codigo: alvo.codigo, campo: diferenca.campo,
        antes: diferenca.antes, depois: diferenca.depois, acao: acaoDerivada, em,
      });
    }
  }

  // R-037: exporta as linhas já carregadas — zero execução nova.
  function exportar() {
    baixarCsv(`coberturas-${hojeIso()}.csv`, textoCsv([...COLUNAS_CSV_COBERTURA], linhasCsvCobertura(lista)));
  }

  const invalido = !emEdicao?.codigo.trim() || CURVAS.some((c) => !(emEdicao.curvas[c].alvoDias > 0));

  if (!sessao) return <Panel className="p-8">Carregando...</Panel>;

  // A-8 da revisão da onda 2: o porteiro fecha o endereço direto, não só o menu.
  if (!podeVer) {
    return (
      <>
        <PageHeader module="Cadastros" title="Coberturas" />
        <Alert tone="error">Seu perfil não tem acesso às coberturas por curva.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Cadastros"
        title="Coberturas"
        description={`Quantos dias de estoque a compra mira em cada curva e quanto de folga passa sem justificativa. Vale a parametrização mais específica; sem nenhuma, ${ALVO_COBERTURA_PADRAO_DIAS} dias.`}
      />

      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="parametros">
          <Panel>
            {/* §9.4: a ação primária mora na faixa do painel da aba, não no cabeçalho da página. */}
            <PanelHeader title="Parametrizações" hint="Da mais específica para a mais geral.">
              <Button onClick={exportar} disabled={lista.length === 0}>
                <Download aria-hidden />
                Exportar CSV
              </Button>
              <Button variant="primary" onClick={() => abrir(null)} disabled={!podeManter} title={motivoBloqueio}>
                <Plus aria-hidden />
                Nova cobertura
              </Button>
            </PanelHeader>

            <Toolbar>
              <SelectMenu
                label="Nível"
                value={nivel}
                options={FILTRO_NIVEL}
                onChange={(valor) => { setNivel(valor); setPagina(1); }}
              />
              <SelectMenu
                label="Situação"
                value={situacao}
                options={FILTRO_SITUACAO}
                onChange={(valor) => { setSituacao(valor); setPagina(1); }}
              />
            </Toolbar>

            {carregando ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando...</p>
            ) : lista.length === 0 ? (
              <EmptyState
                title="Nenhuma cobertura parametrizada"
                hint={`Sem parametrização, todo produto usa ${ALVO_COBERTURA_PADRAO_DIAS} dias de alvo e nenhuma folga.`}
                action={podeManter ? <Button variant="primary" onClick={() => abrir(null)}>Nova cobertura</Button> : undefined}
              />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Nível</Th>
                      <Th>Alvo</Th>
                      <Th>Situação</Th>
                      {CURVAS.map((curva) => <Th key={curva} numeric>{`Curva ${curva}`}</Th>)}
                      <Th className="w-20 text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((cobertura) => (
                      <Tr key={cobertura.id}>
                        <Td><Status tone="off">{ROTULO_NIVEL[cobertura.nivel] ?? cobertura.nivel}</Status></Td>
                        <Td>
                          <RowTitle>{cobertura.descricao || `Código ${cobertura.codigo}`}</RowTitle>
                          <RowMeta><Code prefix="cód.">{cobertura.codigo}</Code></RowMeta>
                        </Td>
                        <Td>
                          {/* §14: inativo é cinza com o texto ao lado, nunca vermelho. */}
                          <Status tone={cobertura.ativo ? 'live' : 'off'}>{cobertura.ativo ? 'Ativa' : 'Inativa'}</Status>
                        </Td>
                        {CURVAS.map((curva) => {
                          const par = cobertura.curvas[curva];
                          const teto = tetoDaCurva(par.alvoDias, par.toleranciaPct);
                          return (
                            <Td key={curva} numeric>
                              {teto === null ? <Dash /> : (
                                <>
                                  <RowTitle>{`${dias(par.alvoDias)} d · ${dias(par.toleranciaPct)} %`}</RowTitle>
                                  <RowMeta>{`máx. ${dias(teto)} d`}</RowMeta>
                                </>
                              )}
                            </Td>
                          );
                        })}
                        <Td className="text-right">
                          <span className="inline-flex items-center justify-end gap-1">
                            <IconButton label={podeManter ? 'Editar a cobertura' : `Editar a cobertura — ${motivoBloqueio}`} disabled={!podeManter} onClick={() => abrir(cobertura)}>
                              <Pencil aria-hidden />
                            </IconButton>
                            <IconButton
                              label={podeManter ? 'Desativar a cobertura' : `Desativar a cobertura — ${motivoBloqueio}`}
                              tone="danger"
                              disabled={!podeManter || !cobertura.ativo}
                              onClick={() => void desativar(cobertura)}
                            >
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
                  unit="coberturas nesta página"
                  busy={carregando}
                  onPrevious={() => setPagina((atual) => Math.max(1, atual - 1))}
                  onNext={() => setPagina((atual) => atual + 1)}
                />
              </>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="auditoria">
          <Panel>
            <PanelHeader title="Histórico" hint="Da alteração mais recente para a mais antiga, uma linha por campo." />
            <Toolbar>
              <SelectMenu
                label="Parametrização"
                value={logAlvo}
                options={[
                  { value: '0', label: 'Todas as parametrizações' },
                  ...lista.map((c) => ({
                    value: String(c.id),
                    label: `${ROTULO_NIVEL[c.nivel] ?? c.nivel} ${c.codigo}${c.descricao ? ` — ${c.descricao}` : ''}`,
                  })),
                ]}
                onChange={(valor) => { setLogAlvo(valor); setLogPagina(1); }}
              />
            </Toolbar>

            {logCarregando ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando...</p>
            ) : log.length === 0 ? (
              <EmptyState title="Nenhuma alteração registrada" hint="O histórico começa na primeira gravação." />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Quando</Th>
                      <Th>Quem</Th>
                      <Th>Alvo</Th>
                      <Th>Campo</Th>
                      <Th>Antes</Th>
                      <Th>Depois</Th>
                      <Th>Ação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((linhaLog) => (
                      <Tr key={String(linhaLog.ID)}>
                        <Td>{fmtDataHora(String(linhaLog.EM ?? ''))}</Td>
                        <Td>{String(linhaLog.POR_NOME ?? '') || <Dash />}</Td>
                        <Td>
                          <RowTitle>{String(linhaLog.DESCRICAO ?? '') || String(linhaLog.CODIGO ?? '')}</RowTitle>
                          <RowMeta>
                            <Code>{`${ROTULO_NIVEL[String(linhaLog.NIVEL) as NivelCobertura] ?? String(linhaLog.NIVEL ?? '')} ${String(linhaLog.CODIGO ?? '')}`}</Code>
                          </RowMeta>
                        </Td>
                        <Td>{String(linhaLog.CAMPO ?? '')}</Td>
                        <Td>{String(linhaLog.ANTES ?? '') || <Dash />}</Td>
                        <Td>{String(linhaLog.DEPOIS ?? '') || <Dash />}</Td>
                        <Td><Status tone="off">{String(linhaLog.ACAO ?? '')}</Status></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={logPagina}
                  lastPage={log.length < LOG_POR_PAGINA ? logPagina : logPagina + 1}
                  total={log.length}
                  unit="alterações nesta página"
                  busy={logCarregando}
                  onPrevious={() => setLogPagina((atual) => Math.max(1, atual - 1))}
                  onNext={() => setLogPagina((atual) => atual + 1)}
                />
              </>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <Dialog open={emEdicao !== null} onOpenChange={(aberto) => { if (!aberto) { setEmEdicao(null); setAntesDaEdicao(null); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{antesDaEdicao ? 'Editar cobertura' : 'Nova cobertura'}</DialogTitle>
            <DialogDescription>O mais específico vence: produto, depois seção, departamento e fornecedor.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              {podeManter ? null : <Alert tone="info">{motivoBloqueio}</Alert>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabelledField label="Nível">
                  <SelectMenu
                    label="Nível da cobertura"
                    value={emEdicao?.nivel ?? 'sku'}
                    options={NIVEIS.map(({ value, label }) => ({ value: String(value), label }))}
                    disabled={!podeManter}
                    onChange={(valor) => setEmEdicao((atual) => (atual ? { ...atual, nivel: valor as NivelCobertura } : atual))}
                  />
                </LabelledField>
                <LabelledField label="Código" obrigatorio hint={NIVEIS.find((item) => item.value === emEdicao?.nivel)?.hint}>
                  <Input
                    value={emEdicao?.codigo ?? ''}
                    disabled={!podeManter}
                    onChange={(evento) => setEmEdicao((atual) => (atual ? { ...atual, codigo: evento.target.value } : atual))}
                  />
                </LabelledField>
                <LabelledField label="Descrição" hint="O nome que aparece na lista." className="sm:col-span-2">
                  <Input
                    value={emEdicao?.descricao ?? ''}
                    disabled={!podeManter}
                    onChange={(evento) => setEmEdicao((atual) => (atual ? { ...atual, descricao: evento.target.value } : atual))}
                  />
                </LabelledField>
              </div>
              {emEdicao ? (
                <TabelaCurvas curvas={emEdicao.curvas} desabilitado={!podeManter} onAlterar={alterarCurva} />
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => { setEmEdicao(null); setAntesDaEdicao(null); }}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => void salvar()}
              disabled={!podeManter || invalido || salvando}
              title={podeManter ? (invalido ? 'Informe o código e um alvo maior que zero nas três curvas.' : undefined) : motivoBloqueio}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
