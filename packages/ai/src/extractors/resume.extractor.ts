import Anthropic from '@anthropic-ai/sdk';
import { resumeDataSchema, type ResumeData } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Anthropic tool definition — forces structured JSON output via tool_use.
// The model must call this tool; it cannot reply with plain text.
// ---------------------------------------------------------------------------

const EXTRACT_RESUME_TOOL: Anthropic.Tool = {
  name: 'extract_resume',
  description:
    'Extract structured information from a resume. ' +
    'Call this tool with all fields populated from the resume text. ' +
    'If a field is not present in the resume, omit it or use an empty array.',
  input_schema: {
    type: 'object' as const,
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
      summary: { type: 'string', description: 'Professional summary or objective statement.' },
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
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a resume parser. Extract all information from the provided resume text and call the extract_resume tool with the structured data.

Rules:
- Extract ALL work experience, education, skills, and certifications present.
- For dates, preserve the format as written in the resume (e.g. "Jan 2020", "2020-01", "January 2020").
- Set current=true for roles with no end date or marked as "Present".
- For skills, categorise as: technical (programming languages, frameworks, databases), tool (software tools, IDEs, platforms), language (spoken/written languages), or soft (communication, leadership, etc.).
- If the resume has no summary or objective, return an empty string for summary.
- Never hallucinate information not present in the resume.
- Always call the extract_resume tool — never reply with plain text.`;

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export class ResumeExtractor {
  private readonly client: Anthropic;
  private readonly model = 'claude-sonnet-4-6';

  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error('ResumeExtractor: ANTHROPIC_API_KEY environment variable is not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Extract structured resume data from raw text.
   *
   * Uses Anthropic tool_use (function calling) to guarantee structured JSON
   * output. The response is validated against ResumeDataSchema (Zod) before
   * returning — malformed AI output throws rather than silently corrupting the DB.
   *
   * Retries are handled by the BullMQ job queue, not here.
   */
  async extract(rawText: string): Promise<ResumeData> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_RESUME_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: `Please extract the structured data from this resume:\n\n${rawText}`,
        },
      ],
    });

    // Find the tool_use block in the response
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      throw new Error(
        `ResumeExtractor: Anthropic did not call the extract_resume tool. ` +
          `Stop reason: ${response.stop_reason}`,
      );
    }

    // Validate the tool input against our Zod schema
    const parseResult = resumeDataSchema.safeParse(toolUseBlock.input);
    if (!parseResult.success) {
      throw new Error(
        `ResumeExtractor: AI output failed Zod validation: ` +
          parseResult.error.issues
            .map(
              (i: { path: (string | number)[]; message: string }) =>
                `${i.path.join('.')}: ${i.message}`,
            )
            .join(', '),
      );
    }

    return parseResult.data;
  }
}
