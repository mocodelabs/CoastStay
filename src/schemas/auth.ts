import { z } from 'zod'

export const emailSchema = z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.')

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use at most 72 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' })
export type SignupValues = z.infer<typeof signupSchema>

export const forgotSchema = z.object({ email: emailSchema })
export type ForgotValues = z.infer<typeof forgotSchema>

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' })
export type NewPasswordValues = z.infer<typeof newPasswordSchema>
