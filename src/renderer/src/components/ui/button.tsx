import * as React from 'react'
import { type VariantProps, cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { Slot } from '@radix-ui/react-slot'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white shadow-sm shadow-accent/25 hover:bg-accent/90 hover:shadow-md hover:shadow-accent/30',
        destructive: 'bg-danger text-white shadow-sm shadow-danger/25 hover:bg-danger/90',
        outline: 'border border-border/20 bg-transparent hover:bg-hover/5 text-foreground hover:border-border/40',
        secondary: 'bg-surface-lighter text-foreground hover:bg-surface-light shadow-sm',
        ghost: 'hover:bg-hover/10 text-foreground hover:text-accent-light',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 rounded-md px-3.5 text-xs',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
