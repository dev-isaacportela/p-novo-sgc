/**
 * Estrutura da aplicação — design.md §10.
 *
 * A janela não rola: o contêiner é h-screen overflow-hidden e quem rola é o
 * <main>. Menu lateral recolhível (estado em localStorage), gaveta no mobile.
 * Onda 1 do SGC 2: um módulo (Quadro de compras); os demais entram com as specs.
 * Quem administra o quadro é decidido pelo motor (ADMINS_IDS); a persona vem do SGC.
 */
import * as React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Bell, CalendarClock, ClipboardList, FileText, Gauge, KanbanSquare, LogOut, Menu, PackageX, PanelLeftClose, PanelLeftOpen, Receipt, ShieldCheck, ShoppingCart, Truck, X, type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { clearSession } from '@/lib/mitra-auth';
import { menuParaPersona, type ItemDeMenu } from '@/lib/permissoes';
import { limparPersona, usePersona } from '@/lib/persona';
import { SessaoContext, type Sessao } from '@/lib/sessao';
import { BRAND_GREEN, Monogram, Wordmark } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

// O que cada pessoa vê é regra de permissão (P-03, spec 002 T-040): vem de
// menuParaPersona; aqui só o ícone de cada rota. Comercial fica com zero itens.
const ICONES: Record<string, LucideIcon> = {
  '/quadro': KanbanSquare, '/agenda': CalendarClock, '/notificacoes': Bell,
  '/fornecedores': Truck, '/coberturas': Gauge, '/seguranca': ShieldCheck,
  // Onda 2 (005-007):
  '/notas-fiscais': FileText, '/faturamentos-pendentes': Receipt, '/nfs-em-atraso': AlertTriangle, '/bo': PackageX,
  // Onda 3 (008-009; /relatorios adiado, R-114):
  '/solicitacoes': ClipboardList, '/analises': BarChart3,
  // Onda 4 (011):
  '/compras-inteligentes': ShoppingCart,
};

function agruparMenu(itens: ItemDeMenu[]) {
  return [...new Set(itens.map((i) => i.grupo))].map((grupo) => ({
    grupo,
    itens: itens.filter((i) => i.grupo === grupo).map((i) => ({ ...i, Icone: ICONES[i.to] ?? KanbanSquare })),
  }));
}

const CHAVE_RECOLHIDO = 'sgc-menu-recolhido';

export default function AdminLayout({ usuario }: { usuario: Sessao }) {
  const navigate = useNavigate();
  const [recolhido, setRecolhido] = React.useState(() => {
    try {
      return localStorage.getItem(CHAVE_RECOLHIDO) === '1';
    } catch {
      return false;
    }
  });
  const [gaveta, setGaveta] = React.useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem(CHAVE_RECOLHIDO, recolhido ? '1' : '0');
    } catch {
      // preferência não crítica
    }
  }, [recolhido]);

  // Gaveta fecha por Escape (design.md §10).
  React.useEffect(() => {
    if (!gaveta) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setGaveta(false);
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [gaveta]);

  const iniciais = usuario.NOME.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');

  const sessaoPersona = usePersona();
  const grupos = React.useMemo(
    () => agruparMenu(sessaoPersona ? menuParaPersona(sessaoPersona.permissoes) : []),
    [sessaoPersona],
  );

  function sair() {
    limparPersona();
    clearSession();
    navigate('/login', { replace: true });
    window.location.reload();
  }

  const menu = (fechado: boolean) => (
    <div className="flex h-full flex-col bg-nav">
      <div className={cn('flex flex-col items-center justify-center gap-1 px-4 py-4', fechado && 'h-14 px-0 py-0')}>
        {fechado ? (
          // Verde da MARCA (não o --primary da interface).
          <span style={{ color: BRAND_GREEN }}>
            <Monogram className="size-7" />
          </span>
        ) : (
          <>
            <Wordmark className="h-6" />
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-secondary">Gestão de compras</p>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {grupos.map((grupo) => (
          <div key={grupo.grupo} className="mb-4">
            {fechado ? (
              <div className="mx-auto mb-2 h-px w-6 bg-rule-row" aria-hidden />
            ) : (
              <p className="mb-1 px-2 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">{grupo.grupo}</p>
            )}
            {grupo.itens.map(({ to, label, Icone }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                onClick={() => setGaveta(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors',
                    fechado && 'justify-center px-0',
                    isActive ? 'bg-accent font-semibold text-nav-active' : 'text-nav-text hover:bg-nav-hover hover:text-ink',
                  )
                }
              >
                <Icone className="size-4 shrink-0" aria-hidden />
                {fechado ? null : <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-rule-row p-2">
        <div className={cn('flex items-center gap-2.5 px-1.5 py-2', fechado && 'flex-col justify-center gap-2 px-0')}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-primary-foreground">
            {iniciais || '?'}
          </span>
          {fechado ? null : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-ink">{usuario.NOME}</span>
              <span className="truncate text-[12px] text-ink-secondary">{usuario.EMAIL}</span>
            </span>
          )}
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={sair}
          aria-label="Sair"
          title="Sair"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-nav-text transition-colors',
            'hover:bg-alert-bg hover:text-alert focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
            fechado && 'justify-center px-0',
          )}
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          {fechado ? null : 'Sair'}
        </button>
        {/* O botão de recolher mora no rodapé (§10). Só existe no desktop. */}
        <button
          type="button"
          onClick={() => setRecolhido((v) => !v)}
          aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          title={recolhido ? 'Expandir menu' : 'Recolher menu'}
          className={cn(
            'mt-1 hidden w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-nav-text transition-colors lg:flex',
            'hover:bg-nav-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
            fechado && 'justify-center px-0',
          )}
        >
          {recolhido ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" aria-hidden />
              Recolher
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <SessaoContext.Provider value={usuario}>
      <div className="flex h-screen overflow-hidden bg-ground">
        <aside
          className={cn(
            'hidden shrink-0 border-r border-rule-table transition-[width] lg:block',
            recolhido ? 'lg:w-[4.5rem]' : 'lg:w-60',
          )}
        >
          {menu(recolhido)}
        </aside>

        {gaveta ? (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setGaveta(false)}
            className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          />
        ) : null}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-60 border-r border-rule-table transition-transform lg:hidden',
            gaveta ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-14 items-center justify-end px-2">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setGaveta(false)}
              className="absolute top-3 right-2 z-50 rounded-lg p-2 text-ink-secondary hover:bg-nav-hover"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="-mt-14 h-full">{menu(false)}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule-table bg-nav px-3 lg:hidden">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setGaveta(true)}
              className="rounded-lg p-2 text-ink-secondary hover:bg-nav-hover"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <Wordmark className="h-5" />
            <span className="ml-auto flex size-8 items-center justify-center rounded-xl bg-primary text-[12px] font-bold text-primary-foreground">
              {iniciais || '?'}
            </span>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SessaoContext.Provider>
  );
}
