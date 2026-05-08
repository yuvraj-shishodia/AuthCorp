import { z } from 'zod'

// Common validators
export const emailSchema = z.string().email().max(254)
export const passwordSchema = z.string().min(8).max(128)

// Auth schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const googleTokenSchema = z.object({
  token: z.string().min(32).max(4096),
})

// Document analysis schemas
export const analysisSchema = z.object({
  analysisType: z.enum(['full', 'ai', 'metadata', 'ocr']).default('full'),
  enableRiskCheck: z.coerce.boolean().default(false),
})

export const analysisQuerySchema = z.object({
  id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
})

// Utility: safe parse with detailed error messages
export function validate<T>(schema: z.ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success) {
    return {
      success: false as const,
      errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    }
  }
  return { success: true as const, data: result.data }
}