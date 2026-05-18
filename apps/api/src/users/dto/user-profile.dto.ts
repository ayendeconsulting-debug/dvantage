import { z } from 'zod';

// ---------------------------------------------------------------------------
// PATCH /v1/users/me/profile — Request DTO
// ---------------------------------------------------------------------------

/**
 * Partial update — any field may be omitted (undefined = leave as-is).
 * Null explicitly clears the field in the DB.
 */
export const UpdateUserProfileSchema = z.object({
  phone: z
    .string()
    .max(32, 'Phone must be 32 characters or fewer')
    .nullable()
    .optional(),

  linkedinUrl: z
    .string()
    .url('linkedinUrl must be a valid URL')
    .max(500, 'LinkedIn URL must be 500 characters or fewer')
    .nullable()
    .optional(),
});

export type UpdateUserProfileDto = z.infer<typeof UpdateUserProfileSchema>;

// ---------------------------------------------------------------------------
// GET/PATCH /v1/users/me/profile — Response DTO
// ---------------------------------------------------------------------------

export interface UserProfileResponseDto {
  phone:       string | null;
  linkedinUrl: string | null;
}
