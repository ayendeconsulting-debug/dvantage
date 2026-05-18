// ---------------------------------------------------------------------------
// ExtensionAiFillService
//
// Generates answers for job application form fields that the deterministic
// autofill engine (Tier A) could not fill from the user's profile.
//
// Strategy:
//   1. Fetch the user's MRU complete resume (structuredData JSON).
//      If resumeId is provided, fetch that specific version instead.
//   2. Build a Claude prompt: resume context + field list.
//   3. Use tool_use (fill_application_fields) to guarantee structured JSON
//      output — same pattern as ResumeExtractor.
//   4. Return { answers: [{ label, value }] } — one answer per input field,
//      in the same order. value is null when AI cannot determine the answer.
//
// Design decisions:
//   - No DB writes — answers are ephemeral; the extension fills the DOM directly.
//   - max_tokens: 512 — answers are short; we never want verbose output.
//   - Timeout: caller should enforce; this service does not set one internally.
//   - 422 when no complete resume exists — AI fill requires resume context.
//   - process.env['ANTHROPIC_API_KEY'] directly — no ConfigService/ConfigModule.
// ---------------------------------------------------------------------------

import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, isNull }                                    from 'drizzle-orm';
import Anthropic                                                     from '@anthropic-ai/sdk';

import {
  resumeVersions,
  type DatabaseClient,
  type ExtensionToken,
} from '@vantage/database';
import type { ResumeData } from '@vantage/validation';

import { DATABASE_CLIENT } from '../database/database.module';
import type {
  AiFillRequestDto,
  AiFillResponseDto,
  AiFillAnswerDto,
} from './dto/ai-fill.dto';

// ---------------------------------------------------------------------------
// Claude tool definition — forces structured JSON output via tool_use
// ---------------------------------------------------------------------------

const FILL_FIELDS_TOOL: Anthropic.Tool = {
  name:        'fill_application_fields',
  description: 'Return answers for job application form fields using information from the resume.',
  input_schema: {
    type:     'object' as const,
    required: ['answers'],
    properties: {
      answers: {
        type:  'array',
        items: {
          type:     'object',
          required: ['label', 'value'],
          properties: {
            label: {
              type:        'string',
              description: 'The field label, exactly as provided in the input.',
            },
            value: {
              type:        ['string', 'null'],
              description: 'The answer derived from the resume, or null if not determinable.',
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

const SYSTEM_PROMPT = `You are an AI assistant helping a job applicant fill out application forms.

Given the applicant's resume data and a list of form fields, generate the best answer for each field using ONLY information explicitly present in their resume.

Rules:
- Only use information from the resume — never fabricate or assume
- text/email/tel fields: answer with 1–5 words or a short phrase
- textarea fields: 1–2 sentences maximum
- For "years of experience" questions: calculate from experience entries (current date vs earliest startDate)
- For work authorization / eligibility questions: infer from contact.location if available; otherwise return null
- If the resume does not contain enough information to answer a field, return null
- Always call fill_application_fields — never reply with plain text
- Return answers in exactly the same order as the input fields`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ExtensionAiFillService {
  private readonly logger = new Logger(ExtensionAiFillService.name);
  private readonly model  = 'claude-sonnet-4-6';

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: DatabaseClient,
  ) {}

  /**
   * Generate AI answers for form fields that deterministic autofill skipped.
   *
   * @param token  — validated extension token (provides userId)
   * @param dto    — resumeId (null → MRU) + fields to fill
   */
  async fill(
    token: ExtensionToken,
    dto:   AiFillRequestDto,
  ): Promise<AiFillResponseDto> {
    const userId = token.userId;

    // ── Fetch resume ─────────────────────────────────────────────────────────
    const resumeRow = await this.fetchResume(userId, dto.resumeId);
    if (!resumeRow) {
      throw new UnprocessableEntityException(
        'No complete resume found. Upload and parse a resume before using AI fill.',
      );
    }

    const resumeData = resumeRow.structuredData as ResumeData;

    // ── Build prompt ──────────────────────────────────────────────────────────
    const fieldList = dto.fields
      .map((f, i) =>
        `${i + 1}. "${f.label}" (type: ${f.fieldType}, required: ${f.required})`,
      )
      .join('\n');

    const userMessage =
      `Resume data:\n${JSON.stringify(resumeData, null, 2)}\n\n` +
      `Form fields to fill:\n${fieldList}\n\n` +
      `Call fill_application_fields with your answers.`;

    // ── Claude call ───────────────────────────────────────────────────────────
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model:       this.model,
      max_tokens:  512,
      system:      SYSTEM_PROMPT,
      tools:       [FILL_FIELDS_TOOL],
      tool_choice: { type: 'any' },
      messages:    [{ role: 'user', content: userMessage }],
    });

    // ── Parse tool output ─────────────────────────────────────────────────────
    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (!toolBlock) {
      this.logger.warn(
        `ExtensionAiFillService — Claude did not call the tool. stop_reason=${response.stop_reason}`,
      );
      // Graceful degradation: return all-null answers
      return {
        answers: dto.fields.map((f) => ({ label: f.label, value: null })),
      };
    }

    const raw = toolBlock.input as { answers?: unknown[] };
    const rawAnswers = Array.isArray(raw.answers) ? raw.answers : [];

    // Validate + sanitise each answer
    const answers: AiFillAnswerDto[] = dto.fields.map((field, i) => {
      const rawAnswer = rawAnswers[i] as { label?: unknown; value?: unknown } | undefined;
      const value     = typeof rawAnswer?.value === 'string' ? rawAnswer.value.trim() || null : null;
      return { label: field.label, value };
    });

    const filled = answers.filter((a) => a.value !== null).length;
    this.logger.log(
      `ExtensionAiFillService — user=${userId} fields=${dto.fields.length} ` +
      `aiAnswered=${filled}/${dto.fields.length}`,
    );

    return { answers };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchResume(
    userId:   string,
    resumeId: string | null,
  ) {
    if (resumeId) {
      const rows = await this.db
        .select()
        .from(resumeVersions)
        .where(
          and(
            eq(resumeVersions.id,          resumeId),
            eq(resumeVersions.userId,      userId),
            eq(resumeVersions.parseStatus, 'complete'),
            isNull(resumeVersions.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    }

    // MRU complete resume — most-recently-created, not most-recently-updated
    const rows = await this.db
      .select()
      .from(resumeVersions)
      .where(
        and(
          eq(resumeVersions.userId,      userId),
          eq(resumeVersions.parseStatus, 'complete'),
          isNull(resumeVersions.deletedAt),
        ),
      )
      .orderBy(desc(resumeVersions.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }
}
