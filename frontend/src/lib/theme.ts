// Tema claro/escuro — design.md §2.1.
//
// O tema é uma classe `.dark` no <html>; os tokens de `index.css` fazem o
// resto. Três estados: 'light', 'dark' e 'system' (segue o SO). A escolha vai
// para localStorage para acompanhar a pessoa entre telas e sessões; o script
// inline do index.html aplica a classe ANTES do React montar, para a tela não
// piscar clara e depois escurecer.

export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'theme';

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getTheme(): Theme {
  try {
    const salvo = localStorage.getItem(THEME_KEY);
    if (salvo === 'light' || salvo === 'dark' || salvo === 'system') return salvo;
  } catch {
    /* storage indisponível: cai no padrão */
  }
  return 'light';
}

/** Tema efetivamente aplicado (resolve 'system'). */
export function resolvedTheme(theme: Theme = getTheme()): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.classList.toggle('dark', resolvedTheme(theme) === 'dark');
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* sem storage, vale só para esta página */
  }
  applyTheme(theme);
}

/** Alterna entre claro e escuro a partir do que está na tela agora. */
export function toggleTheme(): Theme {
  const proximo: Theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
  setTheme(proximo);
  return proximo;
}

/** Em 'system', acompanha mudanças do SO enquanto a página está aberta. */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (getTheme() === 'system') applyTheme('system'); };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
