// Ops Hub's shared components, built on shadcn/ui (neutral theme). The component names and props
// that pages already use (Button variant="primary", Chip tone="accent", Card, Label...) are kept,
// so every page picks up the shadcn look without changing its own code.
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from './utils';

export { cn } from './utils';
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog';

// ---- Button (shadcn button) --------------------------------------------------------------

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary shadow-card hover:bg-primary/90',
        secondary: 'bg-surface-alt text-body shadow-card hover:bg-surface-alt/80',
        outline: 'border border-border bg-canvas text-body shadow-card hover:bg-surface-alt',
        ghost: 'text-body hover:bg-surface-alt',
        destructive: 'border border-border bg-canvas text-error shadow-card hover:border-error/40 hover:bg-[#fef2f2]',
        link: 'text-link underline-offset-4 hover:underline',
        // Ops Hub's original names, mapped onto shadcn variants.
        primary: 'bg-primary text-on-primary shadow-card hover:bg-primary/90',
        tertiary: 'border border-border bg-canvas text-body shadow-card hover:bg-surface-alt',
        danger: 'border border-border bg-canvas text-error shadow-card hover:border-error/40 hover:bg-[#fef2f2]',
      },
      size: {
        default: 'min-h-9 px-4 py-2',
        sm: 'min-h-8 gap-1.5 px-3 text-[13px]',
        lg: 'min-h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;

export function Button({
  variant = 'primary',
  size,
  asChild = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: VariantProps<typeof buttonVariants>['size']; asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  // Outline-style buttons were the compact ones before; keep them small by default.
  const s = size ?? (variant === 'tertiary' || variant === 'danger' ? 'sm' : 'default');
  return <Comp className={cn(buttonVariants({ variant, size: s }), className)} {...props} />;
}

// ---- Card (shadcn card) ------------------------------------------------------------------

/** shadcn card: white, thin border, small shadow. Padding is on the card; pass p-0 for flush lists. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-canvas p-5 text-body shadow-card', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('leading-none font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

// ---- Badge (shadcn badge), still called Chip in pages ------------------------------------

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'muted' | 'danger';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-colors [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-canvas text-body',
        accent: 'border-transparent bg-primary text-on-primary',
        success: 'border-transparent bg-[#f0fdf4] text-[#15803d]',
        warning: 'border-transparent bg-[#fffbeb] text-[#b45309]',
        muted: 'border-transparent bg-surface-alt text-muted',
        danger: 'border-transparent bg-[#fef2f2] text-[#b91c1c]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** Short label for statuses, roles, departments and tags (shadcn Badge). */
export function Chip({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
export const Badge = Chip;

// ---- Text and layout ---------------------------------------------------------------------

/** Card / section title. */
export function Label({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm font-semibold tracking-tight text-body', className)} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-body">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

const MASK_SPLIT = /(\[(?:email|phone|credential) hidden\])/;
const MASK_TOKEN = /^\[(?:email|phone|credential) hidden\]$/;

/**
 * Renders a value as the API sent it. Masked tokens and labels are styled so they read as
 * deliberate, and a field the API omitted shows "Hidden for your role" instead of a blank.
 */
export function Masked({ value, multiline = false }: { value: unknown; multiline?: boolean }) {
  if (value === undefined) {
    return <span className="rounded-md bg-surface-alt px-1.5 py-0.5 text-xs font-medium text-muted">Hidden for your role</span>;
  }
  if (value === null || value === '') return <span className="text-muted">None</span>;
  const text = String(value);
  const parts = text.split(MASK_SPLIT);
  return (
    <span className={multiline ? 'whitespace-pre-wrap' : undefined}>
      {parts.map((part, i) =>
        MASK_TOKEN.test(part) ? (
          <span key={i} className="rounded-md bg-surface-alt px-1 text-xs font-medium text-muted">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-border/60 py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm text-body">{children}</dd>
    </div>
  );
}

// ---- Form controls (shadcn input) --------------------------------------------------------

/** shadcn input look, for <input>, <select> and <textarea> elements that pages build themselves. */
export const inputClass =
  'w-full min-h-9 rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-body shadow-card outline-none transition-[color,box-shadow] placeholder:text-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, 'min-h-20', className)} {...props} />;
}

/** Visible form label (shadcn label). */
export function FieldLabel({ className, ...props }: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return <label className={cn('text-sm leading-none font-medium text-body', className)} {...props} />;
}

// ---- Empty state -------------------------------------------------------------------------

/**
 * A friendly "nothing here yet" block: what the list is for, and what to do next.
 * Use inside a Card or list; `action` is usually a Link or Button.
 */
export function EmptyState({ title, hint, action, className }: { title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span aria-hidden className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-canvas text-muted shadow-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 13h4l2 3h4l2-3h4" />
          <path d="M5.5 6.5 4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5l-1.5-6.5A2 2 0 0 0 16.6 5H7.4a2 2 0 0 0-1.9 1.5Z" />
        </svg>
      </span>
      <p className="font-medium text-body">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
