import { cn } from '@/lib/utils';
import logoBenenutri from '@/assets/logo-benenutri.png';

/**
 * Marca oficial — design.md §11.
 *
 * O verde da marca NÃO é o --primary. São papéis diferentes: um é identidade,
 * o outro é interface. Por isso a cor da marca fica explícita aqui (e no token
 * --brand-mark do index.css, para uso em classe), nunca herdada do tema, e a
 * marca nunca é recolorida para o verde da interface.
 */
export const BRAND_GREEN = '#45963d';

/**
 * Monograma BN. Inline (e não <img>) para o `currentColor` valer: assim a
 * marca herda a cor de onde é usada — verde no menu, branca sobre o verde —
 * sem duplicar arquivo por cor.
 */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 757.5 663.06"
      fill="currentColor"
      role="img"
      aria-label="BENENUTRI"
      className={cn('h-5 w-auto', className)}
    >
      <path d="M332.36,271.85c0,30.66-22.37,53.87-52.21,58.84v1.66c29.84,4.97,52.21,28.18,52.21,58.84v152.5c0,77.91-42.27,119.35-120.18,119.35H13.26c-8.29,0-13.26-4.97-13.26-13.26V13.26C0,4.14,4.97,0,13.26,0h198.91c77.91,0,120.18,41.44,120.18,119.35v152.51ZM222.13,142.56c0-21.55-10.77-33.15-33.15-33.15h-75.42v167.42h75.42c21.55,0,33.15-11.61,33.15-32.33v-101.94ZM222.13,419.38c0-21.55-10.77-33.15-33.15-33.15h-75.42v167.42h75.42c21.55,0,33.15-10.77,33.15-33.15v-101.12Z" />
      <path d="M744.24,0c8.29,0,13.26,4.97,13.26,13.26v636.53c0,8.29-4.97,13.26-13.26,13.26h-82.05c-7.46,0-12.43-3.32-14.92-10.77l-126.81-353.91h-4.15v351.42c0,8.29-4.14,13.26-13.26,13.26h-86.2c-8.29,0-13.26-4.97-13.26-13.26V13.26c0-8.28,4.97-13.26,13.26-13.26h82.05c7.46,0,12.43,3.32,14.92,10.77l125.98,352.25h4.97V13.26c0-8.28,4.14-13.26,13.26-13.26h86.2Z" />
    </svg>
  );
}

/**
 * Quadrado do login (design.md §10.1): monograma sobre `bg-accent`.
 *
 * No claro o monograma fica no verde da marca (4,1:1 sobre #eef7ec). No escuro
 * esse verde some sobre o accent (#1f3120, 2,6:1), então o monograma toma a
 * cor do par tonal do quadrado, `accent-foreground` (9,2:1) — o mesmo
 * mecanismo de "branca sobre o verde" do §11: a marca não é recolorida, o
 * lugar dita a cor. Use este componente em vez de montar o quadrado na tela.
 */
export function MonogramTile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex size-12 items-center justify-center rounded-2xl bg-accent text-brand-mark dark:text-accent-foreground',
        className,
      )}
    >
      <Monogram className="h-6" />
    </div>
  );
}

/**
 * Assinatura completa. PNG a 3× a largura exibida, na cor da marca.
 *
 * `w-fit`, e não `w-auto`: dentro de um container `flex-col` o
 * `align-items: stretch` só age sobre largura `auto`, e esticava a assinatura
 * para a coluna inteira — na tela de login ela saía 347px de largura por 32 de
 * altura, o dobro do largo que a marca tem. `fit-content` não é `auto`, então
 * o stretch não a alcança, e em `flex-row` nada muda.
 */
export function Wordmark({ className }: { className?: string }) {
  return <img src={logoBenenutri} alt="BENENUTRI" className={cn('h-5 w-fit', className)} />;
}
