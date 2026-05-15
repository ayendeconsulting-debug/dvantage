import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const resumeContactSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  phone:    z.string().optional(),
  location: z.string().optional(),
  // linkedin and github are stored as-is from resume text — may be partial URLs,
  // profile handles, or full URLs. z.string().url() is too strict here.
  linkedin: z.string().optional(),
  github:   z.string().optional(),
});

export const resumeExperienceSchema = z.object({
  company:     z.string().min(1),
  title:       z.string().min(1),
  startDate:   z.string().min(1),
  endDate:     z.string().optional(),
  current:     z.boolean(),
  description: z.string(),
  highlights:  z.array(z.string()),
});

export const resumeEducationSchema = z.object({
  institution: z.string().min(1),
  degree:      z.string().min(1),
  field:       z.string().min(1),
  startDate:   z.string().min(1),
  endDate:     z.string().optional(),
  gpa:         z.string().optional(),
});

export const resumeSkillSchema = z.object({
  name:     z.string().min(1),
  category: z.enum(['technical', 'soft', 'language', 'tool']),
  level:    z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
});

export const resumeCertificationSchema = z.object({
  name:       z.string().min(1),
  issuer:     z.string().min(1),
  date:       z.string().optional(),
  expiryDate: z.string().optional(),
  // Certification URLs from resumes are often partial — store as-is.
  url:        z.string().optional(),
});

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

export const resumeDataSchema = z.object({
  contact:        resumeContactSchema,
  summary:        z.string(),
  experience:     z.array(resumeExperienceSchema),
  education:      z.array(resumeEducationSchema),
  skills:         z.array(resumeSkillSchema),
  certifications: z.array(resumeCertificationSchema),
});

// ---------------------------------------------------------------------------
// Inferred types — used across API, worker-ai, and frontend
// ---------------------------------------------------------------------------

export type ResumeContact       = z.infer<typeof resumeContactSchema>;
export type ResumeExperience    = z.infer<typeof resumeExperienceSchema>;
export type ResumeEducation     = z.infer<typeof resumeEducationSchema>;
export type ResumeSkill         = z.infer<typeof resumeSkillSchema>;
export type ResumeCertification = z.infer<typeof resumeCertificationSchema>;
export type ResumeData          = z.infer<typeof resumeDataSchema>;
