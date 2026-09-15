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

  // Onda 1 do SGC 2: o quadro de compras. Pedidos, fornecedores e agenda entram
  // com as specs 001–004 (docs/specs/000-visao-geral).
  return (
    <Routes>
      <Route element={<AdminLayout usuario={usuario} />}>
        <Route index element={<Navigate to="/quadro" replace />} />
        <Route path="quadro" element={<QuadroPage />} />
        <Route path="quadro/admin" element={<QuadroAdminPage />} />
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
