import Anthropic from '@anthropic-ai/sdk';
import { atsScoreSchema, type ATSScore, type ResumeData } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Step 1 — Keyword extraction tool
// Extract structured keyword categories from raw JD text.
// ---------------------------------------------------------------------------

const EXTRACT_KEYWORDS_TOOL: Anthropic.Tool = {
  name: 'extract_keywords',
  description:
    'Extract and categorise all requirements from a job description. ' +
    'Call this tool with every skill, technology, experience requirement, and domain keyword found.',
  input_schema: {
    type: 'object' as const,
    required: ['required_skills', 'preferred_skills', 'experience_requirements', 'education_requirements', 'domain_keywords'],
    properties: {
      required_skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Must-have technical skills, languages, frameworks, tools explicitly required.',
      },
      preferred_skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Nice-to-have skills marked as "preferred", "bonus", or "plus".',
      },
      experience_requirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Experience-level phrases, e.g. "5+ years backend", "team leadership", "startup experience".',
      },
      education_requirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Education requirements, e.g. "Bachelor\'s in CS", "Master\'s preferred".',
      },
      domain_keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domain and industry terms central to the role, e.g. "distributed systems", "fintech", "HIPAA compliance".',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Step 2 — Resume scoring tool
// Score a resume against the extracted keyword set.
// ---------------------------------------------------------------------------

const SCORE_RESUME_TOOL: Anthropic.Tool = {
  name: 'score_resume',
  description:
    'Score a resume against a job description\'s extracted keyword requirements. ' +
    'Produce an overall score and per-section breakdown. Be calibrated and strict — ' +
    'a score of 100 means the resume is a near-perfect match, not that it is good.',
  input_schema: {
    type: 'object' as const,
    required: ['overall', 'sections', 'keyword_gaps', 'matched_keywords', 'recommendations'],
    properties: {
      overall: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Weighted aggregate score. skills 35%, experience 35%, keywords 20%, education 10%.',
      },
      sections: {
        type: 'object',
        required: ['skills', 'experience', 'education', 'keywords'],
        properties: {
          skills:     { type: 'integer', minimum: 0, maximum: 100 },
          experience: { type: 'integer', minimum: 0, maximum: 100 },
          education:  { type: 'integer', minimum: 0, maximum: 100 },
          keywords:   { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      keyword_gaps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Required or domain keywords from the JD missing or weak in the resume. Ordered by importance.',
      },
      matched_keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'JD keywords explicitly present in the resume.',
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 8 specific, actionable suggestions to improve the score. Not generic advice.',
        maxItems: 8,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const KEYWORD_EXTRACTION_SYSTEM = `You are an expert recruiter and ATS specialist. 
Extract every requirement from the job description provided and call the extract_keywords tool.
Be exhaustive — include all required and preferred skills, technologies, experience levels, and domain terms.
Never hallucinate requirements not present in the JD text.
Always call the extract_keywords tool — never reply with plain text.`;

const SCORING_SYSTEM = `You are a senior technical recruiter scoring a resume against a job description.
You have been given the structured resume data and the extracted keyword requirements.
Score the resume honestly and calibrate strictly: a score of 70 means a solid candidate, 85+ means excellent.
Identify keyword gaps precisely — only list skills and terms genuinely absent or insufficiently demonstrated.
Provide specific, actionable recommendations tied to real gaps, not generic resume advice.
Always call the score_resume tool — never reply with plain text.`;

// ---------------------------------------------------------------------------
// Extracted keyword structure (internal)
// ---------------------------------------------------------------------------

interface ExtractedKeywords {
  required_skills:          string[];
  preferred_skills:         string[];
  experience_requirements:  string[];
  education_requirements:   string[];
  domain_keywords:          string[];
}

// ---------------------------------------------------------------------------
// AtsScorer
// ---------------------------------------------------------------------------

export class AtsScorer {
  private readonly client: Anthropic;
  private readonly model = 'claude-sonnet-4-20250514';

  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error('AtsScorer: ANTHROPIC_API_KEY environment variable is not set');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Score a resume against a job description using a calibrated two-step approach:
   *
   * Step 1 — Extract all requirements from the JD into structured keyword categories.
   *           This prevents the scorer from hallucinating requirements and ensures
   *           consistent keyword matching across scoring runs.
   *
   * Step 2 — Score the resume against the extracted keywords, producing a breakdown
   *           with section scores, keyword gap analysis, and recommendations.
   *
   * Retries are handled by the BullMQ job queue, not here.
   */
  async score(resumeData: ResumeData, jdContent: string): Promise<ATSScore> {
    // -- Step 1: Extract keywords ------------------------------------------

    const keywordsResponse = await this.client.messages.create({
      model:       this.model,
      max_tokens:  2048,
      system:      KEYWORD_EXTRACTION_SYSTEM,
      tools:       [EXTRACT_KEYWORDS_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role:    'user',
          content: `Extract all requirements from this job description:\n\n${jdContent}`,
        },
      ],
    });

    const keywordToolBlock = keywordsResponse.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!keywordToolBlock) {
      throw new Error(
        `AtsScorer step 1: Anthropic did not call extract_keywords. Stop reason: ${keywordsResponse.stop_reason}`,
      );
    }

    const keywords = keywordToolBlock.input as ExtractedKeywords;

    // -- Step 2: Score resume against keywords --------------------------------

    const allKeywords = [
      ...keywords.required_skills,
      ...keywords.preferred_skills,
      ...keywords.experience_requirements,
      ...keywords.education_requirements,
      ...keywords.domain_keywords,
    ];

    const scoringPrompt = [
      'Score this resume against the job requirements.',
      '',
      '## Extracted JD Requirements',
      `Required skills: ${keywords.required_skills.join(', ') || 'none specified'}`,
      `Preferred skills: ${keywords.preferred_skills.join(', ') || 'none specified'}`,
      `Experience requirements: ${keywords.experience_requirements.join(', ') || 'none specified'}`,
      `Education requirements: ${keywords.education_requirements.join(', ') || 'none specified'}`,
      `Domain keywords: ${keywords.domain_keywords.join(', ') || 'none specified'}`,
      `All keywords to match: ${allKeywords.join(', ')}`,
      '',
      '## Resume (structured)',
      JSON.stringify(resumeData, null, 2),
    ].join('\n');

    const scoringResponse = await this.client.messages.create({
      model:       this.model,
      max_tokens:  2048,
      system:      SCORING_SYSTEM,
      tools:       [SCORE_RESUME_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        { role: 'user', content: scoringPrompt },
      ],
    });

    const scoreToolBlock = scoringResponse.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!scoreToolBlock) {
      throw new Error(
        `AtsScorer step 2: Anthropic did not call score_resume. Stop reason: ${scoringResponse.stop_reason}`,
      );
    }

    // Validate output against ATSScore Zod schema
    const parseResult = atsScoreSchema.safeParse(scoreToolBlock.input);
    if (!parseResult.success) {
      throw new Error(
        `AtsScorer: AI output failed Zod validation: ` +
          parseResult.error.issues
            .map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`)
            .join(', '),
      );
    }

    return parseResult.data;
  }
}
