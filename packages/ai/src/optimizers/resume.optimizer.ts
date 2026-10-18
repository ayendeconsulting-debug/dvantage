import Anthropic from '@anthropic-ai/sdk';
import {
  resumeDataSchema,
  type ResumeData,
  type ATSScore,
  type OptimizationChange,
} from '@vantage/validation';

// ---------------------------------------------------------------------------
// Tool definition — optimize_resume
//
// Returns the full optimized ResumeData alongside a structured change log.
// Defining the full schema inline forces the AI to return a correctly-shaped
// object that will pass Zod validation — same strategy as the extractor.
// ---------------------------------------------------------------------------

const OPTIMIZE_RESUME_TOOL: Anthropic.Tool = {
  name: 'optimize_resume',
  description:
    'Return an optimized version of the resume tailored to the job description, ' +
    'along with a structured change log explaining every modification.',
  input_schema: {
    type: 'object' as const,
    required: ['optimized_resume', 'change_log'],
    properties: {
      optimized_resume: {
        type: 'object',
        required: ['contact', 'summary', 'experience', 'education', 'skills', 'certifications'],
        properties: {
          contact: {
            type: 'object',
            required: ['name', 'email'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              location: { type: 'string' },
              linkedin: { type: 'string' },
              github: { type: 'string' },
            },
          },
          summary: {
            type: 'string',
            description: 'Rewritten to align with the target role and incorporate key JD terms.',
          },
          experience: {
            type: 'array',
            items: {
              type: 'object',
              required: ['company', 'title', 'startDate', 'current', 'description', 'highlights'],
              properties: {
                company: { type: 'string' },
                title: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                current: { type: 'boolean' },
                description: { type: 'string' },
                highlights: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          education: {
            type: 'array',
            items: {
              type: 'object',
              required: ['institution', 'degree', 'field', 'startDate'],
              properties: {
                institution: { type: 'string' },
                degree: { type: 'string' },
                field: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                gpa: { type: 'string' },
              },
            },
          },
          skills: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'category'],
              properties: {
                name: { type: 'string' },
                category: { type: 'string', enum: ['technical', 'soft', 'language', 'tool'] },
                level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'expert'] },
              },
            },
          },
          certifications: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'issuer'],
              properties: {
                name: { type: 'string' },
                issuer: { type: 'string' },
                date: { type: 'string' },
                expiryDate: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
        },
      },
      change_log: {
        type: 'array',
        description:
          'Every change made, with its location, original text, replacement, and reason.',
        items: {
          type: 'object',
          required: ['section', 'original', 'optimized', 'reason'],
          properties: {
            section: {
              type: 'string',
              description:
                'Human-readable path, e.g. "summary", "experience[0].highlights[2]", "skills".',
            },
            original: { type: 'string', description: 'The original text before optimization.' },
            optimized: { type: 'string', description: 'The replacement text after optimization.' },
            reason: {
              type: 'string',
              description: 'Why this change closes a keyword gap or improves ATS alignment.',
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert resume coach and ATS optimization specialist.
Your task is to rewrite the provided resume to better match the job description, guided by the ATS score and keyword gap analysis.

## Strict rules — violations are not acceptable:
1. NEVER fabricate experience, skills, certifications, or achievements not implied by the original resume.
2. NEVER change factual data: company names, job titles, institutions, dates, or GPA.
3. Only incorporate missing keywords where they truthfully apply to the candidate's existing work.
4. If a keyword gap cannot be addressed honestly, do NOT add it — leave the gap rather than fabricate.

## What you SHOULD do:
- Rewrite the professional summary to target the role and naturally incorporate key JD terms.
- Strengthen bullet points with more specific, impactful language that surfaces relevant keywords.
- Reorder skills so JD-required skills appear first within each category.
- Add keywords to existing bullet points only where the original work genuinely involved them.
- Consolidate redundant bullet points if it improves clarity.

## Output:
Call the optimize_resume tool with:
  1. The complete optimized resume (all fields, not just changed ones).
  2. A change_log entry for EVERY modification made, no matter how small.

Always call the optimize_resume tool — never reply with plain text.`;

// ---------------------------------------------------------------------------
// Optimizer output type
// ---------------------------------------------------------------------------

export interface OptimizationResult {
  optimizedData: ResumeData;
  changeLog: OptimizationChange[];
}

// ---------------------------------------------------------------------------
// ResumeOptimizer
// ---------------------------------------------------------------------------

export class ResumeOptimizer {
  private readonly client: Anthropic;
  private readonly model = 'claude-sonnet-4-6';

  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error('ResumeOptimizer: ANTHROPIC_API_KEY environment variable is not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Optimize a resume against a job description using the ATS score as context.
   *
   * The ATS score's keyword_gaps and recommendations guide the optimizer.
   * The optimizer returns the full rewritten ResumeData (Zod-validated) plus a
   * structured change log so the UI can render a side-by-side diff.
   *
   * Retries are handled by the BullMQ job queue, not here.
   */
  async optimize(
    resumeData: ResumeData,
    atsScore: ATSScore,
    jdContent: string,
  ): Promise<OptimizationResult> {
    const userMessage = [
      '## Job Description',
      jdContent,
      '',
      '## ATS Score Summary',
      `Overall score: ${atsScore.overall}/100`,
      `Section scores: skills=${atsScore.sections.skills}, experience=${atsScore.sections.experience}, education=${atsScore.sections.education}, keywords=${atsScore.sections.keywords}`,
      '',
      `## Keyword Gaps (missing from resume — incorporate where truthful)`,
      atsScore.keyword_gaps.length > 0 ? atsScore.keyword_gaps.join(', ') : 'None identified',
      '',
      '## Matched Keywords (already present — preserve these)',
      atsScore.matched_keywords.length > 0 ? atsScore.matched_keywords.join(', ') : 'None',
      '',
      '## Scoring Recommendations',
      atsScore.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n'),
      '',
      '## Original Resume (structured)',
      JSON.stringify(resumeData, null, 2),
    ].join('\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192, // optimization needs more tokens — full ResumeData + change log
      system: SYSTEM_PROMPT,
      tools: [OPTIMIZE_RESUME_TOOL],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolBlock) {
      throw new Error(
        `ResumeOptimizer: Anthropic did not call optimize_resume. Stop reason: ${response.stop_reason}`,
      );
    }

    const raw = toolBlock.input as { optimized_resume: unknown; change_log: unknown };

    // Validate the optimized resume against ResumeDataSchema
    const resumeParseResult = resumeDataSchema.safeParse(raw.optimized_resume);
    if (!resumeParseResult.success) {
      throw new Error(
        `ResumeOptimizer: optimized_resume failed Zod validation: ` +
          resumeParseResult.error.issues
            .map(
              (i: { path: (string | number)[]; message: string }) =>
                `${i.path.join('.')}: ${i.message}`,
            )
            .join(', '),
      );
    }

    // Change log — accept as-is (non-critical, best-effort)
    const changeLog = Array.isArray(raw.change_log) ? (raw.change_log as OptimizationChange[]) : [];

    return {
      optimizedData: resumeParseResult.data,
      changeLog,
    };
  }
}
