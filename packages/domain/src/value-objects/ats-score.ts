/**
 * ATSScore value object.
 *
 * Represents the result of an ATS analysis run. Scores are integers 0–100.
 * The composite score is a weighted average of the sub-scores.
 *
 * Weights are defined here and must match the scoring engine in
 * apps/worker-ai when it emits scores.
 */

export interface ATSScoreBreakdown {
  readonly keyword: number; // Keyword match rate (0–100)
  readonly structure: number; // Section presence + ordering (0–100)
  readonly semantic: number; // pgvector similarity (0–100)
  readonly formatting: number; // ATS-parseable formatting (0–100)
}

const WEIGHTS: Record<keyof ATSScoreBreakdown, number> = {
  keyword: 0.4,
  structure: 0.25,
  semantic: 0.25,
  formatting: 0.1,
};

export class ATSScore {
  private readonly _breakdown: ATSScoreBreakdown;
  private readonly _composite: number;

  private constructor(breakdown: ATSScoreBreakdown) {
    this.validateBreakdown(breakdown);
    this._breakdown = breakdown;
    this._composite = Math.round(
      breakdown.keyword * WEIGHTS.keyword +
        breakdown.structure * WEIGHTS.structure +
        breakdown.semantic * WEIGHTS.semantic +
        breakdown.formatting * WEIGHTS.formatting,
    );
  }

  static create(breakdown: ATSScoreBreakdown): ATSScore {
    return new ATSScore(breakdown);
  }

  get composite(): number {
    return this._composite;
  }

  get breakdown(): Readonly<ATSScoreBreakdown> {
    return this._breakdown;
  }

  get label(): 'poor' | 'fair' | 'good' | 'excellent' {
    if (this._composite < 40) return 'poor';
    if (this._composite < 65) return 'fair';
    if (this._composite < 85) return 'good';
    return 'excellent';
  }

  toJSON(): { composite: number; breakdown: ATSScoreBreakdown; label: string } {
    return {
      composite: this._composite,
      breakdown: this._breakdown,
      label: this.label,
    };
  }

  private validateBreakdown(b: ATSScoreBreakdown): void {
    const fields: (keyof ATSScoreBreakdown)[] = ['keyword', 'structure', 'semantic', 'formatting'];
    for (const field of fields) {
      const val = b[field];
      if (!Number.isInteger(val) || val < 0 || val > 100) {
        throw new Error(`ATSScore.${field} must be an integer between 0 and 100. Got: ${val}`);
      }
    }
  }
}
