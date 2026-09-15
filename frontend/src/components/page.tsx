/**
 * Vocabulário do produto — design.md §8.
 *
 * Camada 2, montada sobre os primitivos de `ui/`. A fronteira: nome que só faz
 * sentido dentro deste sistema (Panel, Status, Code) mora aqui; nome genérico
 * (Button, Input, Table) é reexport ou envoltório fino.
 *
 * Uma listagem inteira se escreve com estes nomes, sem uma classe Tailwind
 * sequer no arquivo da página. Se uma tela precisou de classe crua, ou falta um
 * nome aqui ou o primitivo está mal ajustado — corrija aqui, não na tela.
 */
import * as React from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button as ButtonPrimitive } from '@/components/ui/button';
import { Input as InputPrimitive } from '@/components/ui/input';
import { Badge as BadgePrimitive } from '@/components/ui/badge';
import { Alert as AlertPrimitive, AlertDescription as AlertDescriptionPrimitive } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  accentInsensitiveFilter,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export { Input } from '@/components/ui/input';
export { Textarea } from '@/components/ui/textarea';
export { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// ── 8.1 Estrutura de tela ─────────────────────────────────────────────────

interface PageHeaderProps {
  module: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

/**
 * Gruda no topo só a partir de `lg`: no mobile quem já está fixo é a barra do
 * layout, e dois cabeçalhos grudados comem a tela inteira. O `-top-8` compensa
 * o `lg:p-8` do <main> — o navegador desconta o padding do container de
 * rolagem ao grudar, e com `top-0` sobraria uma faixa de 32px por onde a
 * tabela rolada continuaria aparecendo.
 */
export function PageHeader({ module, title, description, actions, meta }: PageHeaderProps) {
  return (
    <header className="mb-6 bg-ground pb-4 lg:sticky lg:-top-8 lg:z-20 lg:pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
            {module}
          </p>
          <h1 className="font-title text-2xl font-bold text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 text-[13px] text-ink-secondary">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? (
        <p className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-ink-secondary">
          {meta}
        </p>
      ) : null}
    </header>
  );
}

/**
 * Sem `overflow-hidden` de propósito: ele recortaria o menu de filtro na borda.
 * O canto arredondado se resolve pelo fundo branco do cabeçalho da tabela
 * (mesma cor do painel) e pela última linha sem filete inferior.
 */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-rule-table bg-card', className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-rule-row px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-title text-[15px] font-bold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12px] text-ink-secondary">{hint}</p> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

// ── 8.2 Filtros ───────────────────────────────────────────────────────────

/** Linha de filtros, colada na tabela que ela filtra (§9.2). */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3 border-b border-rule-row px-4 py-3',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Um seletor fechado não mostra que está filtrando quando o rótulo saiu da
 * tela; a ficha mostra, e ainda dá o clique para desfazer.
 */
export function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-2 py-1 text-[12px] text-accent-foreground">
      <span className="font-semibold">{label}:</span>
      <span>{value}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remover filtro ${label}`}
        title={`Remover filtro ${label}`}
        className="rounded-lg p-0.5 transition-colors hover:bg-brand-100"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Filtro raro atras de um botao (§9.2): a linha fica com o que se usa toda
 * visita e o resto abre num painel, em vez de seis seletores competindo por
 * atencao. Nada filtra escondido — a contagem no botao e as fichas acima da
 * tabela continuam mostrando o que esta ativo.
 */
export function MoreFilters({
  count = 0,
  label = 'Mais filtros',
  children,
  onClear,
  className,
}: {
  count?: number;
  label?: string;
  children: React.ReactNode;
  onClear?: () => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    // Sem `modal`: o painel nao precisa travar a rolagem da pagina. Em
    // compensacao, abrir um SelectMenu de dentro dele move o foco para outro
    // portal — e o padrao do Radix seria fechar o painel junto. Dai o
    // `onFocusOutside` barrado; o clique realmente fora continua fechando.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ButtonPrimitive
          type="button"
          variant="outline"
          aria-expanded={open}
          className={cn(count > 0 && 'border-brand-400 text-primary', className)}
        >
          <SlidersHorizontal aria-hidden />
          {label}
          {count > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-foreground">
              {count}
            </span>
          ) : null}
        </ButtonPrimitive>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" onFocusOutside={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between border-b border-rule-row px-4 py-2.5">
          <span className="font-title text-[13px] font-bold text-ink">{label}</span>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              disabled={count === 0}
              className="rounded-lg px-2 py-0.5 text-[12px] font-semibold text-primary transition-colors hover:bg-accent disabled:pointer-events-none disabled:text-ink-muted"
            >
              Limpar
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 p-4">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function SearchInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <InputPrimitive type="search" className={cn('pl-9', className)} {...props} />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Popover + cmdk, não `<select>` nativo (§9.3): o nativo muda de altura e
 * largura conforme o sistema operacional, e uma linha com seis deles fica
 * irregular. Em compensação o nativo dava type-ahead de graça — por isso lista
 * acima de `searchThreshold` ganha campo de busca.
 */
export function SelectMenu({
  value,
  onChange,
  options,
  label,
  placeholder = 'Selecione',
  className,
  disabled,
  searchThreshold = 10,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchThreshold?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    // `modal` é obrigatório: sem ele, dentro de um diálogo o FocusScope do
    // Radix rouba o foco do campo de busca e não dá para digitar (§9.3).
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-[13px] text-ink shadow-xs transition-colors',
            'focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none',
            'disabled:pointer-events-none disabled:bg-muted disabled:text-ink-muted',
            !selected && 'text-ink-secondary',
            className
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-56 p-0"
      >
        <Command filter={accentInsensitiveFilter}>
          {options.length >= searchThreshold ? <CommandInput placeholder="Buscar..." /> : null}
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {/* A dica vai EMBAIXO do rótulo: lado a lado, um texto
                      comprido esmaga o nome até virar reticência. */}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="truncate text-[12px] text-ink-secondary">{option.hint}</span>
                    ) : null}
                  </span>
                  {option.value === value ? (
                    <Check className="ml-auto size-3.5 text-primary" aria-hidden />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Asterisco de campo obrigatório — um só desenho para todo formulário. */
function MarcaObrigatorio() {
  return (
    <span className="text-destructive" title="Campo obrigatório" aria-label="obrigatório">
      {' '}*
    </span>
  );
}

/** Rótulo + controle. Use com SelectMenu — um <label> roubaria o clique dele. */
export function Field({
  label,
  hint,
  obrigatorio,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  obrigatorio?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12px] font-semibold text-ink-secondary">
        {label}
        {obrigatorio ? <MarcaObrigatorio /> : null}
      </span>
      {children}
      {hint ? <span className="text-[12px] text-ink-secondary">{hint}</span> : null}
    </div>
  );
}

/** Idem, embrulhado em <label> nativo — para input, textarea e afins. */
export function LabelledField({
  label,
  hint,
  // `error` tinge a mesma linha do hint: quando o campo tem o que dizer sobre
  // o que foi digitado, a resposta fica onde o olho já está, não num alerta
  // do rodapé.
  hintTone = 'muted',
  obrigatorio,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  hintTone?: 'muted' | 'error';
  obrigatorio?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12px] font-semibold text-ink-secondary">
        {label}
        {obrigatorio ? <MarcaObrigatorio /> : null}
      </span>
      {children}
      {hint ? (
        <span className={cn('text-[12px]', hintTone === 'error' ? 'text-destructive' : 'text-ink-secondary')}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

// ── 8.3 Ações ─────────────────────────────────────────────────────────────

const BUTTON_VARIANT = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
} as const;

/**
 * `variant` padrão é `secondary`, não primário: numa tela com dez botões, só um
 * é a ação principal. `type` padrão é "button" — dentro de um <form> o HTML
 * assume "submit", e um botão de ação interna acabava salvando e fechando o
 * diálogo.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: Omit<React.ComponentProps<typeof ButtonPrimitive>, 'variant' | 'size'> & {
  variant?: keyof typeof BUTTON_VARIANT;
  size?: 'sm' | 'md';
}) {
  return (
    <ButtonPrimitive
      type={type}
      variant={BUTTON_VARIANT[variant]}
      size={size === 'sm' ? 'sm' : 'default'}
      {...props}
    />
  );
}

const ICON_TONE = {
  neutral: 'text-primary hover:bg-accent',
  danger: 'text-destructive hover:bg-destructive-bg',
  attention: 'text-attention hover:bg-attention-bg',
} as const;

/**
 * Um único `label` vira `title` E `aria-label`. Quando eram dois atributos
 * separados, divergiam.
 */
export function IconButton({
  label,
  tone = 'neutral',
  className,
  type = 'button',
  ...props
}: Omit<React.ComponentProps<'button'>, 'aria-label' | 'title'> & {
  label: string;
  tone?: keyof typeof ICON_TONE;
}) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent transition-colors',
        // O glifo precisa de tamanho explicito: sem isto o lucide entrega 24px
        // dentro de um botao de 32px, e o icone encosta na borda. 16px e o que a
        // vitrine (.iconbtn svg) e todo icone do AdminLayout ja usavam.
        '[&_svg]:size-4 [&_svg]:shrink-0',
        'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:text-ink-muted disabled:opacity-60',
        ICON_TONE[tone],
        className
      )}
      {...props}
    />
  );
}

/**
 * Item de checklist clicável — checkbox nativo é proibido (§6 do prompt).
 * Usado nos 6 itens da visita, no roteiro de dispositivos e nas modalidades
 * do município.
 */
export function CheckRow({
  marcado,
  onToggle,
  children,
  hint,
  disabled,
}: {
  marcado: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={marcado}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left text-[13px] transition-colors',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-60'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
          marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'
        )}
        aria-hidden
      >
        {marcado ? <Check className="size-3" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={marcado ? 'text-ink' : 'text-ink-secondary'}>{children}</span>
        {hint ? <span className="text-[12px] text-ink-secondary">{hint}</span> : null}
      </span>
    </button>
  );
}

/**
 * Ação terciária que se lê como link, não como botão: "Esqueci minha senha",
 * "Criar conta", "Voltar". É `<button>` e não `<a>` porque não navega — troca
 * o passo da mesma tela; o sublinhado no hover é o que sinaliza que clica.
 * Um terceiro botão numa coluna de botões apaga qual é a ação principal.
 */
export function TextLink({ className, type = 'button', ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm text-[13px] font-semibold text-primary transition-colors',
        'hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:text-ink-muted disabled:no-underline',
        className
      )}
      {...props}
    />
  );
}

// ── 8.4 Estado e sinalização ──────────────────────────────────────────────

const STATUS_TONE = {
  live: { dot: 'bg-primary', text: 'text-primary' },
  // Inativo é cinza, nunca vermelho: numa listagem em que quase tudo está
  // inativo, o vermelho vira alarme e apaga o destaque do que é crítico.
  off: { dot: 'bg-ink-muted', text: 'text-ink-secondary' },
  attention: { dot: 'bg-attention', text: 'text-attention' },
  alert: { dot: 'bg-destructive', text: 'text-destructive' },
} as const;

/** Estado dentro de tabela: ponto + texto. Selo preenchido não entra em célula. */
export function Status({
  tone,
  children,
}: {
  tone: keyof typeof STATUS_TONE;
  children: React.ReactNode;
}) {
  const style = STATUS_TONE[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', style.text)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
      {children}
    </span>
  );
}

const BADGE_TONE = {
  neutral: 'neutral',
  accent: 'accent',
  attention: 'attention',
  alert: 'destructive',
} as const;

/** Selo — FORA de tabela. Dentro de tabela, use Status. */
export function Badge({
  tone = 'neutral',
  ...props
}: Omit<React.ComponentProps<typeof BadgePrimitive>, 'variant'> & {
  tone?: keyof typeof BADGE_TONE;
}) {
  return <BadgePrimitive variant={BADGE_TONE[tone]} {...props} />;
}

const ETIQUETA_TONS = ['neutral', 'accent', 'attention', 'alert'] as const;

/** Tom guardado no banco → tom do selo; valor desconhecido cai em neutro. */
function tomEtiqueta(valor: string): (typeof ETIQUETA_TONS)[number] {
  return (ETIQUETA_TONS as readonly string[]).includes(valor)
    ? (valor as (typeof ETIQUETA_TONS)[number])
    : 'neutral';
}

/**
 * Etiquetas do atendimento (spec 003, D-005 do plan). Mesma fileira de selos no
 * card do quadro, no detalhe e no cadastro — com a mesma regra de corte.
 *
 * `limite` existe por causa do C-004: a coluna do quadro tem largura fixa e o
 * card não pode empurrar o resto para fora. Sem etiqueta, não renderiza nada —
 * nem espaço reservado, nem rótulo "sem etiquetas" (C-006).
 */
export function EtiquetaLista({
  etiquetas,
  limite,
}: {
  etiquetas: { id: number; tom: string; nome: string }[];
  limite?: number;
}) {
  if (etiquetas.length === 0) return null;
  const visiveis = limite ? etiquetas.slice(0, limite) : etiquetas;
  const ocultas = etiquetas.length - visiveis.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {visiveis.map((etiqueta) => (
        <Badge key={etiqueta.id} tone={tomEtiqueta(etiqueta.tom)}>
          {etiqueta.nome}
        </Badge>
      ))}
      {ocultas > 0 ? (
        <span className="text-[12px] text-ink-secondary" title={etiquetas.map((e) => e.nome).join(', ')}>
          +{ocultas}
        </span>
      ) : null}
    </span>
  );
}

const ALERT_TONE = {
  success: 'success',
  error: 'destructive',
  warn: 'attention',
  info: 'default',
} as const;

/** Aviso no fluxo da tela, onde a ação aconteceu — e não some sozinho. */
export function Alert({
  tone,
  children,
  className,
}: {
  tone: keyof typeof ALERT_TONE;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AlertPrimitive
      variant={ALERT_TONE[tone]}
      // role="alert" interrompe o leitor de tela: só erro merece isso.
      role={tone === 'error' ? 'alert' : 'status'}
      className={className}
    >
      {/* O primitivo é grid [0_1fr]: texto solto cai na coluna de largura
          zero e quebra palavra a palavra. A descrição o posiciona certo. */}
      <AlertDescriptionPrimitive>{children}</AlertDescriptionPrimitive>
    </AlertPrimitive>
  );
}

/** Convite para agir, com o próximo passo à mão — não uma frase triste. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="font-title text-[15px] font-bold text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-[13px] text-ink-secondary">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Identificador discreto — sem selo. Precisa estar disponível, não competir. */
export function Code({
  children,
  prefix,
  className,
}: {
  children: React.ReactNode;
  prefix?: string;
  className?: string;
}) {
  return (
    <span className={cn('text-[12px] whitespace-nowrap text-ink-secondary', className)}>
      {prefix ? <span className="mr-0.5">{prefix}</span> : null}
      {children}
    </span>
  );
}

/** Ausência de dado. Nunca 0, nunca R$ 0,00 — isso seria afirmar um valor. */
export function Dash() {
  return (
    <span className="text-ink-secondary" aria-label="sem informação">
      —
    </span>
  );
}

/** Número em destaque dentro de uma frase. */
export function Stat({ children }: { children: React.ReactNode }) {
  return <span className="font-title font-bold text-ink">{children}</span>;
}

/** Separador entre contagens. */
export function MetaDot() {
  return (
    <span className="text-ink-muted" aria-hidden>
      ·
    </span>
  );
}

// ── 8.5 Quadro ────────────────────────────────────────────────────────────
//
// Colunas por estado, dentro do Panel. Sem arrastar cartão: o estado muda por
// controle explícito dentro do cartão (um SelectMenu), que funciona no teclado
// e no toque sem biblioteca de drag. Área rebaixada usa paper-sunken — nunca
// um terceiro cinza (§5).

/**
 * Altura da coluna, por nome. Mora no `Board` e não na `BoardColumn` porque a
 * altura é do quadro inteiro: se cada coluna escolhesse a sua, as fases
 * desalinhariam — que é justamente o que a altura fixa existe para evitar.
 *
 * `curto` cabe num cartão de dashboard; `padrao` é a tela de trabalho;
 * `alto` é para monitor grande, quando sobra altura e o quadro é o assunto
 * principal da tela. Precisou de outro valor? Acrescente um nome aqui, não uma
 * classe na tela.
 */
const BOARD_HEIGHT = {
  curto: '[--board-column-h:22rem]',
  padrao: '[--board-column-h:30rem]',
  alto: '[--board-column-h:40rem]',
} as const;

export function Board({
  height = 'padrao',
  children,
}: {
  height?: keyof typeof BOARD_HEIGHT;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4', BOARD_HEIGHT[height])}>
      {children}
    </div>
  );
}

/**
 * Coluna de altura FIXA em que só a pilha de cartões rola (§9.6).
 *
 * O cabeçalho da fase fica parado e visível — quem rolou trinta cartões ainda
 * sabe em que coluna está. E a coluna cheia não estica o quadro nem desalinha
 * as vizinhas: sem isto, uma fase com trinta itens empurra o rodapé para
 * milhares de pixels abaixo e as outras três viram faixas curtas no topo.
 *
 * A altura vem do `Board` pela variável `--board-column-h`; o valor no
 * fallback é o mesmo do `padrao`, para a coluna usada fora de um `Board`
 * continuar de pé em vez de colapsar.
 *
 * `min-h-0` no miolo não é enfeite: sem ele o filho de um flex container se
 * recusa a encolher abaixo do conteúdo, e o overflow nunca chega a rolar.
 */
export function BoardColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-[var(--board-column-h,30rem)] flex-col gap-2 rounded-2xl bg-paper-sunken p-2">
      <header className="flex shrink-0 items-center justify-between px-1.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
        <span>{title}</span>
        <span>{count}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">{children}</div>
    </section>
  );
}

export function BoardCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-rule-table bg-card p-3 text-[13px]">
      {children}
    </article>
  );
}

// ── 8.6 Tabela ────────────────────────────────────────────────────────────

/** Remove o filete da última linha — é o que fecha o canto do Panel. */
export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse text-[13px] [&_tr:last-child>td]:border-b-0',
          className
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({ numeric, className, ...props }: React.ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'bg-card px-4 py-2.5 text-left align-middle text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink-muted uppercase',
        numeric && 'text-right',
        className
      )}
      {...props}
    />
  );
}

export function Td({ numeric, className, ...props }: React.ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn('border-b border-rule-row px-4 py-3 align-top', numeric && 'text-right', className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.ComponentProps<'tr'>) {
  // Sem fundo alternado: a hierarquia vem de tipografia, alinhamento e espaço.
  return <tr className={cn('transition-colors hover:bg-accent', className)} {...props} />;
}

export function RowTitle({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-ink">{children}</span>;
}

export function RowMeta({ children }: { children: React.ReactNode }) {
  return <span className="block text-[12px] text-ink-secondary">{children}</span>;
}

export function Pagination({
  page,
  lastPage,
  total,
  unit,
  busy,
  onPrevious,
  onNext,
}: {
  page: number;
  lastPage: number;
  total: number;
  unit: string;
  busy?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-rule-row px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Contagem muda sozinha ao paginar — o leitor de tela precisa saber. */}
      <p className="text-[12px] text-ink-secondary" aria-live="polite">
        Página <Stat>{page}</Stat> de <Stat>{lastPage}</Stat>
        <MetaDot />
        <Stat>{total.toLocaleString('pt-BR')}</Stat> {unit}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onPrevious} disabled={busy || page <= 1}>
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        <Button size="sm" onClick={onNext} disabled={busy || page >= lastPage}>
          Próxima
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

