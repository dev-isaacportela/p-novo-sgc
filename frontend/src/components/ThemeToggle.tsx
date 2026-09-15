// Botão de alternância claro/escuro — design.md §2.1.
// Mora no rodapé do menu lateral, entre a identidade e o botão de sair (§10);
// no mobile ele vem junto, dentro da gaveta.
//
// É um IconButton, mas NEUTRO em vez do verde do tone padrão: os vizinhos de
// rodapé (sair, recolher) são cinza, e um sol verde ao lado deles lia como ação
// primária, que ele não é.
import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/page';
import { cn } from '@/lib/utils';
import { resolvedTheme, toggleTheme, watchSystemTheme } from '@/lib/theme';

export function ThemeToggle({ className }: { className?: string }) {
  const [escuro, setEscuro] = React.useState(() => resolvedTheme() === 'dark');

  React.useEffect(() => {
    // Se o usuário deixou em 'system', o SO pode mudar com a página aberta.
    const parar = watchSystemTheme();
    const sync = () => setEscuro(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { parar(); observer.disconnect(); };
  }, []);

  return (
    <IconButton
      label={escuro ? 'Tema claro' : 'Tema escuro'}
      className={cn('text-ink-secondary hover:text-ink', className)}
      onClick={() => setEscuro(toggleTheme() === 'dark')}
    >
      {escuro ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </IconButton>
  );
}
