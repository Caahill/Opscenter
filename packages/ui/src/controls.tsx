'use client';
// shadcn/ui Checkbox, AlertDialog (with a ready-made ConfirmButton) and Collapsible, on Ops Hub's
// neutral tokens. Client components: they hold open/closed and checked state.
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { buttonVariants } from './button-variants';
import { cn } from './utils';

// ---- Checkbox ----------------------------------------------------------------------------

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-border-strong bg-canvas shadow-card outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// ---- AlertDialog -------------------------------------------------------------------------

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogContent({ className, children, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <AlertDialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-canvas p-6 shadow-agent duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn('text-lg font-semibold text-body', className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn('text-sm text-muted', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export function AlertDialogCancel({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />;
}

export function AlertDialogAction({ className, destructive, ...props }: ComponentProps<typeof AlertDialogPrimitive.Action> & { destructive?: boolean }) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants({ variant: 'default' }), destructive ? 'bg-error text-white hover:bg-error/90' : null, className)}
      {...props}
    />
  );
}

/**
 * A button that asks "Are you sure?" in a shadcn AlertDialog before running `onConfirm`.
 * Replaces window.confirm; the trigger keeps whatever look `trigger` gives it.
 */
export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  disabled,
  onConfirm,
  ...triggerProps
}: Omit<ComponentProps<'button'>, 'title' | 'onClick'> & {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild disabled={disabled}>
        <button type="button" {...triggerProps}>
          {trigger}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} onClick={() => void onConfirm()}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Collapsible -------------------------------------------------------------------------

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
export const CollapsibleContent = CollapsiblePrimitive.Content;

// ---- useConfirm --------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

/**
 * Promise-based "Are you sure?" for code that must ask in the middle of a flow (e.g. after the API
 * says a checklist is incomplete). Render `dialog` once; `await confirm({...})` resolves true/false.
 */
export function useConfirm(): [(opts: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve }));
  const finish = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <AlertDialog open={state !== null} onOpenChange={(o) => (o ? null : finish(false))}>
      {state ? (
        <AlertDialogContent>
          <AlertDialogTitle>{state.opts.title}</AlertDialogTitle>
          {state.opts.description ? <AlertDialogDescription className="whitespace-pre-line">{state.opts.description}</AlertDialogDescription> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive={state.opts.destructive} onClick={() => finish(true)}>
              {state.opts.confirmLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
  return [confirm, dialog];
}
