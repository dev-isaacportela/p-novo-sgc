// Persona por usuário (P-13, RF-030, C-042).
//
// D-014: a lista é de TODOS os usuários ativos da plataforma, com a persona
// vazia quando não há linha — o SGC não tem cadastro próprio de gente. A
// mudança vale na sessão seguinte (D-013).
//
// A recusa a quem não é admin nem diretoria vale nos dois lados: aqui, e no
// `WHERE` de `sgcEscPersonaSalvar`.
import * as React from 'react';

import { linha, linhas } from '@/lib/mitra-api';
import { instanteIso } from '@/lib/pedido';
import { PERSONAS, type Persona } from '@/lib/permissoes';
import { usePersona } from '@/lib/persona';
import {
  Alert, EmptyState, PageHeader, Pagination, Panel, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';

const POR_PAGINA = 25;

const ROTULO_PERSONA: Record<Persona, string> = {
  admin: 'Administrador',
  analista: 'Analista de compras',
  gestor: 'Gerência de compras',
  diretoria: 'Diretoria',
  comercial: 'Comercial',
};

const OPCOES = PERSONAS.map((persona) => ({ value: persona, label: ROTULO_PERSONA[persona] }));

interface Pessoa {
  USUARIO_ID: number;
  NOME: string;
  EMAIL: string;
  ACCESS_LEVEL: string;
  PERSONA: string;
}

export default function SegurancaPage() {
  const sessao = usePersona();
  const [busca, setBusca] = React.useState('');
  const [pagina, setPagina] = React.useState(1);
  const [pessoas, setPessoas] = React.useState<Pessoa[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [falha, setFalha] = React.useState<string | null>(null);
  const [salvo, setSalvo] = React.useState<string | null>(null);

  // `versao` é o pedido de recarga depois de gravar uma persona.
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      linhas('sgcPersonasListar', { busca, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
      linha('sgcPersonasListarTotal', { busca }),
    ])
      .then(([registros, contagem]) => {
        if (!vivo) return;
        setPessoas(registros as unknown as Pessoa[]);
        setTotal(Number(contagem?.TOTAL ?? 0));
        setCarregando(false);
      })
      .catch(() => {
        if (!vivo) return;
        setFalha('Não foi possível carregar os usuários.');
        setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [busca, pagina, versao]);

  // Buscar e paginar são eventos: é neles que o "carregando" liga.
  const buscarPor = (texto: string) => {
    setCarregando(true);
    setPagina(1);
    setBusca(texto);
  };
  const irPara = (proxima: number) => {
    setCarregando(true);
    setPagina(proxima);
  };

  async function salvar(usuarioAlvo: number, persona: string) {
    setFalha(null);
    setSalvo(null);
    setCarregando(true);
    try {
      await linhas('sgcEscPersonaSalvar', { usuarioAlvo, persona, agora: instanteIso() });
      setVersao((atual) => atual + 1);
      setSalvo('Persona atualizada. Ela passa a valer na sessão seguinte da pessoa.');
    } catch {
      setCarregando(false);
      setFalha('Não foi possível gravar a persona.');
    }
  }

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.verSeguranca) {
    return (
      <>
        <PageHeader module="Administração" title="Segurança" />
        <Alert tone="error">A tela de segurança é do administrador e da diretoria.</Alert>
      </>
    );
  }

  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <PageHeader
        module="Administração"
        title="Segurança"
        description="A persona decide o que cada pessoa faz no quadro de compras."
      />
      {falha ? <Alert tone="error" className="mb-4">{falha}</Alert> : null}
      {salvo ? <Alert tone="success" className="mb-4">{salvo}</Alert> : null}

      <Panel>
        <PanelHeader title="Pessoas" hint="Sem persona atribuída, o sistema trata como analista." />
        <Toolbar>
          <SearchInput
            value={busca}
            onChange={(evento) => buscarPor(evento.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar pessoa"
          />
        </Toolbar>
        {pessoas.length === 0 && !carregando ? (
          <EmptyState title="Nenhuma pessoa encontrada" hint="Ajuste a busca." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Acesso na plataforma</Th>
                <Th>Persona no SGC</Th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((pessoa) => (
                <Tr key={pessoa.USUARIO_ID}>
                  <Td>
                    <RowTitle>{pessoa.NOME}</RowTitle>
                    <RowMeta>{pessoa.EMAIL}</RowMeta>
                  </Td>
                  <Td>
                    <Status tone={pessoa.ACCESS_LEVEL === 'READ_ONLY' ? 'off' : 'live'}>
                      {pessoa.ACCESS_LEVEL}
                    </Status>
                  </Td>
                  <Td>
                    <SelectMenu
                      label={`Persona de ${pessoa.NOME}`}
                      value={pessoa.PERSONA}
                      onChange={(valor) => salvar(pessoa.USUARIO_ID, valor)}
                      options={OPCOES}
                      placeholder="Sem persona (analista)"
                      disabled={carregando}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {total > 0 ? (
          <Pagination
            page={pagina}
            lastPage={ultimaPagina}
            total={total}
            unit="pessoas"
            busy={carregando}
            onPrevious={() => irPara(Math.max(1, pagina - 1))}
            onNext={() => irPara(Math.min(ultimaPagina, pagina + 1))}
          />
        ) : null}
      </Panel>
    </>
  );
}
