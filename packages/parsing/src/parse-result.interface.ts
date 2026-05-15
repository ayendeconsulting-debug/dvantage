export interface ParseResult {
  /** Full extracted text content, normalised to UTF-8. */
  rawText: string;
  /** Approximate word count — useful for quality checks and logging. */
  wordCount: number;
  /** Page count — only available for PDF; undefined for DOCX and TXT. */
  pageCount?: number;
}
