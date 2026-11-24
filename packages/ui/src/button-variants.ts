// shadcn button styles, shared by Button and by dialogs that style Radix parts as buttons.
import { cva } from 'class-variance-authority';

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
        // Text-style actions inside rows (Remove, Change dates): no box, no padding.
        inline: 'h-auto min-h-0 gap-1 p-0 shadow-none',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
