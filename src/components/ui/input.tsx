import * as React from 'react'
import { cn } from '@/lib/utils'

export const inputClass =
  'flex h-10 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:opacity-70 aria-invalid:border-danger aria-invalid:outline-danger/30'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputClass, 'file:border-0 file:bg-transparent file:text-sm file:font-medium', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(inputClass, 'h-auto min-h-20 resize-y leading-relaxed', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

/** Native select: accessible, keyboard-friendly and uses the OS picker on phones. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        inputClass,
        'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2020%2020%27%20fill%3D%27%2359656a%27%3E%3Cpath%20d%3D%27M5.5%207.5l4.5%204.5%204.5-4.5%27/%3E%3C/svg%3E")] bg-[length:1.1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
NativeSelect.displayName = 'NativeSelect'
