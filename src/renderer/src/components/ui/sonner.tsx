import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface-light group-[.toaster]:text-foreground group-[.toaster]:border-border/10 group-[.toaster]:shadow-lg rounded-lg',
          description: 'group-[.toast]:text-muted text-xs',
          actionButton:
            'group-[.toast]:bg-accent group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-surface-lighter group-[.toast]:text-muted',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
