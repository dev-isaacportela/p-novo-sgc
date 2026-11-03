import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { KanbanProvider, criarKanbanApi } from '@benenutri/mitra-kanban';
import { uploadFilePublicMitra } from 'mitra-interactions-sdk';
import { clearSession, initMitra } from '@/lib/mitra-auth';
import { acao, linhas } from '@/lib/mitra-api';
import type { Sessao } from '@/lib/sessao';
import AdminLayout from '@/components/AdminLayout';
import { Alert, Button, Card } from '@/components/page';
import LoginPage from '@/pages/LoginPage';
import QuadroPage from '@/pages/quadros/QuadroPage';
import QuadroAdminPage from '@/pages/quadros/QuadroAdminPage';
import FornecedoresPage from '@/pages/fornecedores/FornecedoresPage';
import FornecedorPage from '@/pages/fornecedores/FornecedorPage';
import CoberturasPage from '@/pages/coberturas/CoberturasPage';
import AgendaPage from '@/pages/agenda/AgendaPage';
import NotificacoesPage from '@/pages/notificacoes/NotificacoesPage';
import SegurancaPage from '@/pages/seguranca/SegurancaPage';
import NotasFiscaisPage from '@/pages/fiscal/NotasFiscaisPage';
import FaturamentosPendentesPage from '@/pages/fiscal/FaturamentosPendentesPage';
import NfsAtrasoPage from '@/pages/fiscal/NfsAtrasoPage';
import BoPage from '@/pages/bo/BoPage';
import SolicitacoesPage from '@/pages/solicitacoes/SolicitacoesPage';
import AnalisesPage from '@/pages/analises/AnalisesPage';
import ComprasInteligentesPage from '@/pages/compras-inteligentes/ComprasInteligentesPage';
import PedidoGaldermaPage from '@/pages/galderma/PedidoGaldermaPage';
import AcompanhamentoGaldermaPage from '@/pages/galderma/AcompanhamentoGaldermaPage';
import ComposicaoGaldermaPage from '@/pages/galderma/ComposicaoGaldermaPage';
import MovimentacaoPage from '@/pages/movimentacao/MovimentacaoPage';
import EmpenhosPage from '@/pages/empenhos/EmpenhosPage';
import EmpenhosAdminPage from '@/pages/empenhos/EmpenhosAdminPage';
import PregoesPage from '@/pages/empenhos/PregoesPage';
import IndicadoresEmpenhosPage from '@/pages/empenhos/IndicadoresEmpenhosPage';

/**
 * Guarda de sessão: autenticar na Mitra não basta — kbUsuarioSessao precisa
 * devolver o INT_USER de quem chamou. Zero linhas é recusa, com a saída à mão.
 */
function Autenticado() {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'recusado' | 'erro'>('carregando');
  const [usuario, setUsuario] = useState<Sessao | null>(null);

  useEffect(() => {
    let vivo = true;
    linhas('kbUsuarioSessao')
      .then((rows) => {
        if (!vivo) return;
        const u = rows[0];
        if (u?.ID) {
          setUsuario({ ID: Number(u.ID), NOME: String(u.NOME ?? ''), EMAIL: String(u.EMAIL ?? '') });
          setEstado('ok');
        } else {
          setEstado('recusado');
        }
      })
      .catch(() => vivo && setEstado('erro'));
    return () => {
      vivo = false;
    };
  }, []);

  function sair() {
    clearSession();
    window.location.replace('.');
  }

  if (estado === 'carregando') {
    return <p className="p-8 text-center text-[13px] text-ink-secondary">Verificando acesso...</p>;
  }

  if (estado !== 'ok' || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground p-4">
        <Card className="w-full max-w-md p-8">
          <h1 className="font-title mb-3 text-xl font-bold text-ink">Acesso não liberado</h1>
          <Alert tone={estado === 'erro' ? 'error' : 'warn'}>
            {estado === 'erro'
              ? 'Não foi possível verificar seu acesso. Tente novamente em instantes.'
              : 'Sua conta autenticou, mas não há usuário cadastrado no sistema para este e-mail. Procure a TI.'}
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button onClick={sair}>Sair e entrar com outra conta</Button>
          </div>
        </Card>
      </div>
    );
  }

  // Rotas por spec (docs/specs/000-visao-geral): onda 1 — quadro de compras
  // (002), fornecedores (001), itens e coberturas (003), agenda (004); onda 2 —
  // notas fiscais e faturamentos pendentes (005), NFs em atraso (006), produtos
  // em B.O. (007); onda 3 — solicitações do comercial (008), análises e
  // relatórios (009); onda 4 — compras inteligentes (011), ainda em
  // construção (as coberturas por curva, 012, moram na rota `/coberturas` que
  // já existe). Quem barra persona sem
  // acesso é cada página, no topo, com a mesma frase do servidor; o menu
  // (AdminLayout) só esconde.
  return (
    <Routes>
      <Route element={<AdminLayout usuario={usuario} />}>
        <Route index element={<Navigate to="/quadro" replace />} />
        <Route path="quadro" element={<QuadroPage />} />
        <Route path="quadro/admin" element={<QuadroAdminPage />} />
        {/* R-118: o Novo pedido é janela sobre o quadro; o link antigo abre a janela. */}
        <Route path="pedidos/novo" element={<Navigate to="/quadro?novo=1" replace />} />
        <Route path="compras-inteligentes" element={<ComprasInteligentesPage />} />
        {/* Onda 5 (R-150): pedido Galderma — mesa, acompanhamento e composição. */}
        <Route path="galderma" element={<PedidoGaldermaPage />} />
        <Route path="galderma/acompanhamento" element={<AcompanhamentoGaldermaPage />} />
        <Route path="galderma/composicao" element={<ComposicaoGaldermaPage />} />
        {/* Onda 5 (R-140): movimentação de produtos (013). */}
        <Route path="movimentacao" element={<MovimentacaoPage />} />
        <Route path="empenhos" element={<EmpenhosPage />} />
        <Route path="empenhos/admin" element={<EmpenhosAdminPage />} />
        <Route path="empenhos/pregoes" element={<PregoesPage />} />
        <Route path="empenhos/indicadores" element={<IndicadoresEmpenhosPage />} />
        <Route path="fornecedores" element={<FornecedoresPage />} />
        <Route path="fornecedores/:codfornec" element={<FornecedorPage />} />
        <Route path="coberturas" element={<CoberturasPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="notificacoes" element={<NotificacoesPage />} />
        <Route path="seguranca" element={<SegurancaPage />} />
        <Route path="notas-fiscais" element={<NotasFiscaisPage />} />
        <Route path="faturamentos-pendentes" element={<FaturamentosPendentesPage />} />
        <Route path="nfs-em-atraso" element={<NfsAtrasoPage />} />
        <Route path="bo" element={<BoPage />} />
        <Route path="solicitacoes" element={<SolicitacoesPage />} />
        <Route path="analises" element={<AnalisesPage />} />
        <Route path="*" element={<Navigate to="/quadro" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [configured, setConfigured] = useState(initMitra);
  // A lib fala com o Mitra pelo transporte do projeto (linhas/acao de mitra-api):
  // ela recebe o NOME da server function e o projeto resolve o id.
  const api = useMemo(
    () => criarKanbanApi({
      acao: (nome, input) => acao(nome as Parameters<typeof acao>[0], input),
      linhas: (nome, input) => linhas(nome as Parameters<typeof linhas>[0], input),
      // Anexos do card (spec 007 da lib): o arquivo sobe pelo SDK do projeto e a lib só registra o endereço.
      enviarArquivo: async (arquivo) => {
        const resposta = await uploadFilePublicMitra({ file: arquivo });
        const url = resposta?.result?.publicUrl;
        if (!url) throw new Error(`O envio de ${arquivo.name} não devolveu o endereço do arquivo.`);
        return url;
      },
    }),
    [],
  );

  return (
    <KanbanProvider api={api}>
      <Routes>
        {/* initMitra de novo: é ele quem configura o SDK com a sessão salva. */}
        <Route path="/login" element={<LoginPage onLogin={() => setConfigured(initMitra())} />} />
        <Route path="/*" element={configured ? <Autenticado /> : <Navigate to="/login" replace />} />
      </Routes>
    </KanbanProvider>
  );
}

export default App;
