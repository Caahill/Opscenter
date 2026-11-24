// Components built to docs/DESIGN.md: ink-black primary actions, lavender secondary actions,
// white rounded cards on the soft surface, mono labels for taxonomy.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

const BUTTON: Record<ButtonVariant, string> = {
  // button-primary: dark, darkens on hover rather than changing colour.
  primary: 'bg-primary text-on-primary hover:bg-deep-panel rounded-xl px-[18px] py-3',
  secondary: 'bg-surface-alt text-accent hover:text-accent-hover rounded-xl px-[18px] py-3',
  tertiary: 'bg-canvas text-body border border-border hover:border-border-strong rounded-md px-3 py-2',
  danger: 'bg-canvas text-error border border-border hover:border-error rounded-md px-3 py-2',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 font-sans text-button font-extrabold tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'tertiary' || variant === 'danger' ? 'min-h-9' : null,
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
}

/** feature-card: one idea per card, white on surface, thin border, minimal shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-xl border border-border bg-canvas p-5 shadow-card', className)} {...props} />
  );
}

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'muted' | 'danger';

/** app-chip: short label on a pale pill, for statuses, roles, departments and phase tags. */
export function Chip({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  const tones = {
    neutral: 'bg-surface text-body border border-border',
    accent: 'bg-pale-purple text-accent-pressed',
    success: 'bg-[#e6f6ee] text-[#1f6f49]',
    warning: 'bg-pale-orange text-[#8a3a12]',
    muted: 'bg-surface-alt text-muted',
    danger: 'bg-[#fdecec] text-[#9b1c20]',
  } as const;
  return (
    <span
      className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold tracking-normal', tones[tone], className)}
      {...props}
    />
  );
}

/** Small uppercase section label, used above groups of content. */
export function Label({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx('text-[12px] font-semibold uppercase tracking-[0.06em] text-muted', className)} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-title-sm font-[650] text-body">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
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
    return <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 font-mono text-[12px] text-muted">Hidden for your role</span>;
  }
  if (value === null || value === '') return <span className="text-muted">None</span>;
  const text = String(value);
  const parts = text.split(MASK_SPLIT);
  return (
    <span className={multiline ? 'whitespace-pre-wrap' : undefined}>
      {parts.map((part, i) =>
        MASK_TOKEN.test(part) ? (
          <span key={i} className="rounded-sm bg-pale-purple px-1 font-mono text-[12px] text-accent-pressed">
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
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-surface-alt py-2 last:border-0">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="text-[15px] text-body">{children}</dd>
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-border bg-canvas px-3 py-2 text-[15px] text-body outline-none focus:border-accent focus:ring-2 focus:ring-pale-purple';

/**
 * A friendly "nothing here yet" block: what the list is for, and what to do next.
 * Use inside a Card or list; `action` is usually a Link or Button.
 */
export function EmptyState({ title, hint, action, className }: { title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span aria-hidden className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-muted">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 13h4l2 3h4l2-3h4" />
          <path d="M5.5 6.5 4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5l-1.5-6.5A2 2 0 0 0 16.6 5H7.4a2 2 0 0 0-1.9 1.5Z" />
        </svg>
      </span>
      <p className="font-semibold text-body">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-[14px] text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
