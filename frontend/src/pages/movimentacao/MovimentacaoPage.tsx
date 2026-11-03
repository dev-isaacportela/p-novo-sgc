// Spec 013 (movimentação de produtos) — `/movimentacao`: a casca das cinco abas.
//
// O porteiro `verMovimentacao` está aqui E o item está fora do menu do
// comercial: o endereço direto também é barrado (C-001). Os filtros do topo
// (filial, departamento, fornecedor, busca) valem para todas as abas (RF-003);
// a filial é obrigatória onde o estoque é por filial (RF-004) e cada aba tem os
// seus cortes e o seu efeito — trocar de aba não recarrega as outras.
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Field, PageHeader, Panel, SearchInput, SelectMenu, Tabs, TabsContent, TabsList, TabsTrigger, Toolbar,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { hojeIso } from '@/lib/formato';
import { usePersona } from '@/lib/persona';
import { ABAS_MOVIMENTACAO, abaDaUrl, abaExigeFilial, filialEfetiva } from '@/lib/movimentacao';
import type { FiltrosMov } from './carga';
import SemVendaTab from './SemVendaTab';
import ExcedentesTab from './ExcedentesTab';
import AVencerTab from './AVencerTab';
import RupturaTab from './RupturaTab';
import PerdasTab from './PerdasTab';

type Opcao = { value: string; label: string };

// P-08 (R-131): o público fica fora por padrão, como nas compras inteligentes.
const OPCOES_PUBLICO = [
  { value: '0', label: 'Não conta (padrão)' },
  { value: '1', label: 'Conta como venda' },
];

export default function MovimentacaoPage() {
  const sessao = usePersona();
  const [params, setParams] = useSearchParams();
  const aba = abaDaUrl(params.get('aba'));
  const hoje = hojeIso();

  const [filiais, setFiliais] = React.useState<{ CODFILIAL: string; FILIAL: string }[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Opcao[]>([]);
  const [departamentos, setDepartamentos] = React.useState<Opcao[]>([]);
  const [responsaveis, setResponsaveis] = React.useState<Opcao[]>([]);
  const [erroFiltros, setErroFiltros] = React.useState('');

  const [codfilial, setCodfilial] = React.useState('');
  const [codfornec, setCodfornec] = React.useState('');
  const [codepto, setCodepto] = React.useState('');
  const [buscaDigitada, setBuscaDigitada] = React.useState('');
  const [busca, setBusca] = React.useState('');
  const [publico, setPublico] = React.useState('0');

  // RNF-001: os três seletores e os responsáveis, uma vez por visita.
  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      linhas('sgcWintFiliais'),
      linhas('sgcWintFornecedores', { busca: '' }),
      linhas('sgcWintDepartamentos'),
      linhas('kbUsuariosListar', { busca: '', limite: 100, offset: 0 }),
    ])
      .then(([f, forn, dep, usuarios]) => {
        if (!vivo) return;
        setFiliais(f.map((x) => ({ CODFILIAL: String(x.CODFILIAL), FILIAL: String(x.FILIAL) })));
        setFornecedores(forn.map((x) => ({ value: String(x.CODFORNEC), label: `${x.CODFORNEC} · ${x.FORNECEDOR}` })));
        setDepartamentos(dep.map((x) => ({ value: String(x.CODEPTO), label: String(x.DESCRICAO) })));
        setResponsaveis(usuarios.map((u) => ({ value: String(u.ID), label: String(u.NOME) })));
      })
      .catch((e: unknown) => vivo && setErroFiltros(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, []);

  // RNF-003: a busca espera meio segundo depois da última tecla.
  React.useEffect(() => {
    const espera = window.setTimeout(() => setBusca(buscaDigitada.trim()), 500);
    return () => window.clearTimeout(espera);
  }, [buscaDigitada]);

  const filtros = React.useMemo<FiltrosMov>(() => ({
    codfilial: filialEfetiva(aba, codfilial, filiais),
    codfornec: Number(codfornec) || 0,
    codepto: Number(codepto) || 0,
    busca,
    incluirPublico: Number(publico),
  }), [aba, codfilial, filiais, codfornec, codepto, busca, publico]);
  const efetiva = filtros.codfilial;

  if (!sessao) return <Panel className="p-8">Carregando…</Panel>;

  if (!sessao.permissoes.verMovimentacao) {
    return (
      <>
        <PageHeader module="Compras" title="Movimentação de produtos" />
        <Alert tone="error">Seu perfil não tem acesso à movimentação de produtos.</Alert>
      </>
    );
  }

  const podeGravar = sessao.permissoes.registrarPlanoAcao;
  const opcoesFilial = [
    ...(abaExigeFilial(aba) ? [] : [{ value: '', label: 'Todas as filiais' }]),
    ...filiais.map((f) => ({ value: f.CODFILIAL, label: `${f.CODFILIAL} · ${f.FILIAL}` })),
  ];
  const semFilial = abaExigeFilial(aba) && !efetiva;

  return (
    <>
      <PageHeader
        module="Compras"
        title="Movimentação de produtos"
        description="O estoque que sobra e o que acaba rápido demais: parado sem venda, acima da cobertura, perto de vencer, fora da curva e perdido."
      />

      <Panel className="mb-4">
        <Toolbar className="border-0">
          <Field label="Filial" className="w-52">
            <SelectMenu label="Filial" value={efetiva} onChange={setCodfilial} options={opcoesFilial} placeholder="Todas as filiais" />
          </Field>
          <Field label="Departamento" className="w-44">
            <SelectMenu label="Departamento" value={codepto} onChange={setCodepto} options={[{ value: '', label: 'Todos' }, ...departamentos]} placeholder="Todos" />
          </Field>
          <Field label="Fornecedor" className="w-60">
            <SelectMenu label="Fornecedor" value={codfornec} onChange={setCodfornec} options={[{ value: '', label: 'Todos' }, ...fornecedores]} placeholder="Todos" />
          </Field>
          <Field label="Venda a órgão público" className="w-44">
            <SelectMenu label="Venda a órgão público" value={publico} onChange={setPublico} options={OPCOES_PUBLICO} />
          </Field>
          <Field label="Busca" className="min-w-48 flex-1">
            <SearchInput
              placeholder="Produto, código ou lote"
              value={buscaDigitada}
              onChange={(e) => setBuscaDigitada(e.target.value)}
              aria-label="Buscar por produto, código ou lote"
            />
          </Field>
        </Toolbar>
        {erroFiltros ? <Toolbar className="border-0"><Alert tone="error">Os filtros do ERP não carregaram: {erroFiltros}</Alert></Toolbar> : null}
      </Panel>

      <Tabs value={aba} onValueChange={(valor) => setParams({ aba: valor }, { replace: true })}>
        <TabsList>
          {ABAS_MOVIMENTACAO.map((item) => (
            <TabsTrigger key={item.value} value={item.value} title={item.hint}>{item.label}</TabsTrigger>
          ))}
        </TabsList>

        {semFilial ? (
          <Alert tone="info">Carregando as filiais do ERP…</Alert>
        ) : (
          <>
            <TabsContent value="sem-venda">
              {aba === 'sem-venda' ? <SemVendaTab filtros={filtros} hoje={hoje} podeGravar={podeGravar} responsaveis={responsaveis} /> : null}
            </TabsContent>
            <TabsContent value="excedentes">
              {aba === 'excedentes' ? <ExcedentesTab filtros={filtros} /> : null}
            </TabsContent>
            <TabsContent value="a-vencer">
              {aba === 'a-vencer' ? <AVencerTab filtros={filtros} hoje={hoje} podeGravar={podeGravar} responsaveis={responsaveis} /> : null}
            </TabsContent>
            <TabsContent value="ruptura">
              {aba === 'ruptura' ? <RupturaTab filtros={filtros} onFilial={setCodfilial} /> : null}
            </TabsContent>
            <TabsContent value="perdas">
              {aba === 'perdas' ? <PerdasTab filtros={filtros} onFilial={setCodfilial} /> : null}
            </TabsContent>
          </>
        )}
      </Tabs>
    </>
  );
}
