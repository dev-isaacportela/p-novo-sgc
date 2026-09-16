// Spec 009 (indicadores e relatórios) — `/analises`: a casca das quatro abas.
//
// O porteiro `verAnalises` está aqui E o item está fora do menu do comercial
// (A-8 da revisão da onda 2): o endereço direto também é barrado.
//
// O filtro de FILIAL mora no cabeçalho e vale para a tela inteira (RF-004); o
// PERÍODO fica dentro da aba, porque intervalo livre e mês fechado são
// grandezas diferentes (RN-011). Trocar qualquer um dos dois recarrega só a aba
// visível — cada aba tem o seu próprio efeito (RNF-001).
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { linhas } from '@/lib/mitra-api';
import {
  Alert, Field, PageHeader, Panel, SelectMenu, Tabs, TabsContent, TabsList, TabsTrigger, Toolbar,
} from '@/components/page';
import { usePersona } from '@/lib/persona';
import type { FilialErp } from '@/lib/analises';
import IndicadoresTab from './IndicadoresTab';
import ComprasVendasTab from './ComprasVendasTab';
import PedidosSlaTab from './PedidosSlaTab';
import SolicitacoesTab from './SolicitacoesTab';

const ABAS = [
  { value: 'indicadores', label: 'Indicadores' },
  { value: 'compras-vendas', label: 'Compras × vendas' },
  { value: 'pedidos', label: 'Pedidos (SLA)' },
  { value: 'solicitacoes', label: 'Solicitações' },
];

export default function AnalisesPage() {
  const sessao = usePersona();
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.value === params.get('aba')) ? String(params.get('aba')) : 'indicadores';
  const [filiais, setFiliais] = React.useState<FilialErp[]>([]);
  const [codfilial, setCodfilial] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcWintFiliais')
      .then((rows) => vivo && setFiliais(rows as unknown as FilialErp[]))
      .catch(() => vivo && setFiliais([]));
    return () => { vivo = false; };
  }, []);

  if (!sessao) return <Panel className="p-8">Carregando…</Panel>;

  if (!sessao.permissoes.verAnalises) {
    return (
      <>
        <PageHeader module="Gestão" title="Análises" />
        <Alert tone="error">Seu perfil não tem acesso às análises.</Alert>
      </>
    );
  }

  const opcoesFilial = [
    { value: '', label: 'Todas as filiais' },
    ...filiais.map((f) => ({ value: f.CODFILIAL, label: f.FILIAL })),
  ];

  return (
    <>
      <PageHeader
        module="Gestão"
        title="Análises"
        description="Indicadores operacionais, compras × vendas, prazo dos pedidos e aderência das solicitações."
        actions={
          <Field label="Filial" className="w-64">
            <SelectMenu
              label="Filial"
              value={codfilial}
              onChange={setCodfilial}
              options={opcoesFilial}
              placeholder="Todas as filiais"
            />
          </Field>
        }
      />

      <Tabs value={aba} onValueChange={(valor) => setParams({ aba: valor }, { replace: true })}>
        <TabsList>
          {ABAS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Cada aba monta o seu próprio efeito: trocar de aba não recarrega as
            outras, e trocar a filial só refaz a que está na tela (RNF-001). */}
        <TabsContent value="indicadores">
          {aba === 'indicadores' ? <IndicadoresTab codfilial={codfilial} /> : null}
        </TabsContent>
        <TabsContent value="compras-vendas">
          {aba === 'compras-vendas' ? <ComprasVendasTab codfilial={codfilial} filiais={filiais} /> : null}
        </TabsContent>
        <TabsContent value="pedidos">
          {aba === 'pedidos' ? <PedidosSlaTab codfilial={codfilial} /> : null}
        </TabsContent>
        <TabsContent value="solicitacoes">
          {aba === 'solicitacoes' ? <SolicitacoesTab codfilial={codfilial} /> : null}
        </TabsContent>
      </Tabs>

      {filiais.length === 0 ? (
        <Toolbar className="border-0">
          <Alert tone="info">Nenhuma filial veio do ERP: a comparação de compras e vendas fica sem recorte.</Alert>
        </Toolbar>
      ) : null}
    </>
  );
}
