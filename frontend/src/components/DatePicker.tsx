/**
 * Campo de data do projeto (UI-03 B, spec 004 — design.md §1.4/§9.2 têm a
 * emenda). Substitui `<input type="date">` em toda tela: o nativo muda de
 * altura, largura e formato conforme o sistema operacional (mesmo motivo que
 * já tirou o `<select>` nativo dos painéis, §9.3).
 *
 * Texto com máscara dd/mm/aaaa (digitar é o caminho rápido) + botão que abre
 * a grade do mês num popover. A regra de calendário (grade, navegação,
 * texto <-> ISO) é pura e mora em `src/lib/data.ts`, testada por
 * `tests/data.test.mjs` — este arquivo só monta a tela e o teclado em cima
 * dela. Data sempre como texto ISO: nunca `Date`, nunca fuso.
 */
import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { hojeIso } from '@/lib/formato';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  aplicarMascaraData, dentroDoLimite, fimDaSemana, gradeDoMes,
  inicioDaSemana, isoParaTexto, isoPorExtenso, isoValido, mesAdjacente,
  nomeDiaSemanaAbrev, nomeMes, somarDias, textoParaIso,
} from '@/lib/data';

export interface DatePickerProps {
  value: string;
  onChange: (valor: string) => void;
  id?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  id,
  min,
  max,
  disabled,
  placeholder = 'dd/mm/aaaa',
  'aria-label': ariaLabel,
  className,
}: DatePickerProps) {
  const [texto, setTexto] = React.useState(() => isoParaTexto(value));
  // Sincroniza o texto quando o valor muda por fora (reset de formulário,
  // carregamento) — ajuste de estado durante a renderização, não em efeito
  // (evita o "cascading render" de um useEffect que só espelha uma prop).
  // Enquanto o texto digitado for incompleto/impossível, onChange nunca
  // disparou: value não muda, e nada aqui atropela o que a pessoa digitou.
  const [ultimoValor, setUltimoValor] = React.useState(value);
  if (value !== ultimoValor) {
    setUltimoValor(value);
    setTexto(isoParaTexto(value));
  }
  const [open, setOpen] = React.useState(false);
  const [mesExibido, setMesExibido] = React.useState(() => {
    const ref = isoValido(value) ? value : hojeIso();
    const [ano, mes] = ref.split('-').map(Number);
    return { ano, mes };
  });
  const [diaFoco, setDiaFoco] = React.useState(() => (isoValido(value) ? value : hojeIso()));

  const inputRef = React.useRef<HTMLInputElement>(null);
  const diaRefs = React.useRef(new Map<string, HTMLButtonElement>());

  React.useEffect(() => {
    if (open) diaRefs.current.get(diaFoco)?.focus();
  }, [open, diaFoco]);

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitado = aplicarMascaraData(e.target.value);
    setTexto(digitado);
    const iso = textoParaIso(digitado);
    if (iso !== null) onChange(iso);
  }

  function handleOpenChange(next: boolean) {
    if (next && !disabled) {
      const ref = isoValido(value) ? value : hojeIso();
      const [ano, mes] = ref.split('-').map(Number);
      setMesExibido({ ano, mes });
      setDiaFoco(ref);
    }
    setOpen(next);
  }

  function escolher(iso: string) {
    if (!dentroDoLimite(iso, min, max)) return;
    onChange(iso);
    setTexto(isoParaTexto(iso));
    setOpen(false);
  }

  function irParaMes(delta: number) {
    setMesExibido((atual) => mesAdjacente(atual, delta));
  }

  function mover(novoIso: string) {
    setDiaFoco(novoIso);
    const [ano, mes] = novoIso.split('-').map(Number);
    setMesExibido((atual) => (atual.ano === ano && atual.mes === mes ? atual : { ano, mes }));
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); mover(somarDias(diaFoco, -1)); break;
      case 'ArrowRight': e.preventDefault(); mover(somarDias(diaFoco, 1)); break;
      case 'ArrowUp': e.preventDefault(); mover(somarDias(diaFoco, -7)); break;
      case 'ArrowDown': e.preventDefault(); mover(somarDias(diaFoco, 7)); break;
      case 'Home': e.preventDefault(); mover(inicioDaSemana(diaFoco)); break;
      case 'End': e.preventDefault(); mover(fimDaSemana(diaFoco)); break;
      case 'PageUp': e.preventDefault(); irParaMes(-1); break;
      case 'PageDown': e.preventDefault(); irParaMes(1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        escolher(diaFoco);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const dias = gradeDoMes(mesExibido.ano, mesExibido.mes);
  const rotuloMes = `${nomeMes(mesExibido.mes)} de ${mesExibido.ano}`;

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        ref={inputRef}
        id={id}
        value={texto}
        onChange={handleTextChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        className="pr-9"
      />
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              'absolute right-1.5 inline-flex size-6 items-center justify-center rounded-lg text-ink-secondary transition-colors',
              'hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <CalendarIcon className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-3"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => irParaMes(-1)}
              className="inline-flex size-7 items-center justify-center rounded-lg text-ink-secondary hover:bg-accent hover:text-primary"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="text-[13px] font-semibold text-ink capitalize">{rotuloMes}</span>
            <button
              type="button"
              aria-label="Mês seguinte"
              onClick={() => irParaMes(1)}
              className="inline-flex size-7 items-center justify-center rounded-lg text-ink-secondary hover:bg-accent hover:text-primary"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>

          <div
            role="grid"
            aria-label={rotuloMes}
            onKeyDown={handleGridKeyDown}
            className="grid grid-cols-7 gap-0.5"
          >
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="flex h-7 items-center justify-center text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase"
              >
                {nomeDiaSemanaAbrev(i)}
              </span>
            ))}
            {dias.map((dia) => {
              const selecionado = dia.iso === value;
              const hoje = dia.iso === hojeIso();
              const foraDoLimite = !dentroDoLimite(dia.iso, min, max);
              return (
                <button
                  key={dia.iso}
                  ref={(el) => {
                    if (el) diaRefs.current.set(dia.iso, el);
                    else diaRefs.current.delete(dia.iso);
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={dia.iso === diaFoco ? 0 : -1}
                  aria-selected={selecionado}
                  aria-disabled={foraDoLimite || undefined}
                  aria-label={isoPorExtenso(dia.iso)}
                  onClick={() => escolher(dia.iso)}
                  onFocus={() => setDiaFoco(dia.iso)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg text-[13px] transition-colors',
                    !dia.noMes && 'text-ink-muted',
                    hoje && !selecionado && 'ring-2 ring-brand-500',
                    selecionado && 'bg-primary font-semibold text-primary-foreground',
                    foraDoLimite
                      ? 'pointer-events-none opacity-40'
                      : !selecionado && 'hover:bg-accent',
                  )}
                >
                  {Number(dia.iso.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
