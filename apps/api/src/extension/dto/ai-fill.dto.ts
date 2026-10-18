import { z } from 'zod';

// ---------------------------------------------------------------------------
// POST /v1/extension/ai-fill — Request DTO
// ---------------------------------------------------------------------------

/**
 * A single form field sent to the AI for answer generation.
 * Selectors are stripped — they are extension-internal and not needed by the AI.
 * The AI uses label + fieldType to produce an appropriately-formatted answer.
 */
export const AiFillFieldSchema = z.object({
  /** Human-readable label shown in the form (e.g. "Years of experience"). */
  label: z.string().min(1).max(200),
  /** Input type — tells the AI how long/formatted the answer should be. */
  fieldType: z.enum(['text', 'email', 'tel', 'textarea']),
  /** Whether the field is marked required in the form — context for AI. */
  required: z.boolean(),
});

export const AiFillRequestSchema = z.object({
  /**
   * Resume version ID to use for context.
   * null → MRU complete resume for this user (same fallback as score endpoint).
   */
  resumeId: z.string().nullable(),
  /**
   * Fields the autofill engine could not fill from the profile.
   * Min 1, max 20 — prevents abuse and keeps prompts focused.
   */
  fields: z
    .array(AiFillFieldSchema)
    .min(1, 'fields must contain at least one entry')
    .max(20, 'fields must contain 20 or fewer entries'),
});

export type AiFillRequestDto = z.infer<typeof AiFillRequestSchema>;
export type AiFillFieldDto = z.infer<typeof AiFillFieldSchema>;

// ---------------------------------------------------------------------------
// POST /v1/extension/ai-fill — Response DTO
// ---------------------------------------------------------------------------

export interface AiFillAnswerDto {
  /** Matches the input field label — used by the extension to correlate answers. */
  label: string;
  /** AI-generated answer, or null if the resume didn't contain enough context. */
  value: string | null;
}

export interface AiFillResponseDto {
  answers: AiFillAnswerDto[];
}
