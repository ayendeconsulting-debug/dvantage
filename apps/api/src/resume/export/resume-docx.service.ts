import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  AlignmentType,
  TabStopType,
} from 'docx';
import type { ResumeData } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Colour palette (hex without #, as docx requires)
// ---------------------------------------------------------------------------

const BLUE = '2563EB';
const DARK = '111827';
const BODY = '374151';
const MUTED = '6B7280';
const RULE  = 'D1D5DB';

// Page geometry (twips — 1 inch = 1440 twips)
// A4 width 11906 twips, margins 1080 twips (0.75 in) each side
// Content width = 11906 - 2160 = 9746 twips
const RIGHT_TAB = 9180; // right-aligned tab stop for dates

// ---------------------------------------------------------------------------
// Sanitise AI-extracted values — strip '<UNKNOWN>' placeholders
// ---------------------------------------------------------------------------

function clean(value: string | null | undefined): string {
  if (!value) return '';
  const t = value.trim();
  if (t === '<UNKNOWN>' || t === 'UNKNOWN') return '';
  return t;
}

function cleanDate(start: string | null | undefined, end?: string | null | undefined): string {
  const s = clean(start);
  const e = clean(end);
  if (!s && !e) return '';
  if (!e) return s;
  return `${s} \u2013 ${e}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ResumeDocxService {
  async generate(data: ResumeData, _originalFileName: string): Promise<Buffer> {
    const children: Paragraph[] = [];

    // ── Name ──────────────────────────────────────────────────────────────────
    children.push(this.nameParagraph(data.contact.name));

    // ── Contact line ──────────────────────────────────────────────────────────
    const contactParts = [
      data.contact.email,
      data.contact.phone,
      data.contact.location,
      data.contact.linkedin,
      data.contact.github,
    ].map(clean).filter(Boolean);

    if (contactParts.length) {
      children.push(this.contactParagraph(contactParts));
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    if (data.summary) {
      children.push(this.sectionHeading('Professional Summary'));
      children.push(this.bodyText(data.summary));
    }

    // ── Experience ────────────────────────────────────────────────────────────
    if (data.experience.length) {
      children.push(this.sectionHeading('Experience'));

      for (const exp of data.experience) {
        const dateRange = exp.current
          ? `${clean(exp.startDate)} \u2013 Present`
          : cleanDate(exp.startDate, exp.endDate);

        // Role · Company [TAB] Date
        children.push(this.entryHeader(`${clean(exp.title)}  \u00B7  ${clean(exp.company)}`, dateRange));

        // Context description — italicised muted line
        const desc = clean(exp.description);
        if (desc) {
          children.push(this.contextLine(desc));
        }

        // Bullet highlights
        for (const hl of exp.highlights) {
          children.push(this.bulletItem(hl));
        }

        children.push(this.spacer(160));
      }
    }

    // ── Education ─────────────────────────────────────────────────────────────
    if (data.education.length) {
      children.push(this.sectionHeading('Education'));

      for (const edu of data.education) {
        const dateStr = cleanDate(edu.startDate, edu.endDate);

        children.push(this.entryHeader(`${clean(edu.degree)} in ${clean(edu.field)}`, dateStr));

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: clean(edu.institution), size: 20, color: BODY, font: 'Calibri' }),
            ],
            spacing: { after: 160 },
          }),
        );
      }
    }

    // ── Skills ────────────────────────────────────────────────────────────────
    if (data.skills.length) {
      children.push(this.sectionHeading('Skills'));

      const byCategory: Record<string, string[]> = {};
      for (const s of data.skills) {
        (byCategory[s.category] ??= []).push(s.name);
      }

      for (const [cat, names] of Object.entries(byCategory) as [string, string[]][]) {
        const label = cat.charAt(0).toUpperCase() + cat.slice(1);
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text:  `${label}: `,
                bold:  true,
                size:  20,
                color: DARK,
                font:  'Calibri',
              }),
              new TextRun({ text: names.join(', '), size: 20, color: BODY, font: 'Calibri' }),
            ],
            spacing: { after: 80 },
          }),
        );
      }

      children.push(this.spacer(100));
    }

    // ── Certifications ────────────────────────────────────────────────────────
    if (data.certifications.length) {
      children.push(this.sectionHeading('Certifications'));

      for (const cert of data.certifications) {
        const certWithDate = cert as typeof cert & { date?: string };
        const issuerStr    = clean(cert.issuer);
        const dateStr2     = clean(certWithDate.date);
        const right        = issuerStr + (dateStr2 ? ` (${dateStr2})` : '');

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: clean(cert.name), bold: true, size: 20, color: DARK, font: 'Calibri' }),
              new TextRun({
                text:  `  \u2014  ${right}`,
                size:  20,
                color: BODY,
                font:  'Calibri',
              }),
            ],
            spacing: { after: 80 },
          }),
        );
      }
    }

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
      sections: [
        {
          children,
          properties: {
            page: {
              // A4 — standard 0.75 in margins all around
              margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
            },
          },
        },
      ],
      styles: {
        default: {
          // Heading 1 — candidate name
          heading1: {
            run: {
              font:  'Calibri',
              size:  52,  // 26pt
              bold:  true,
              color: DARK,
            },
            paragraph: { spacing: { after: 80 } },
          },
          // Heading 2 — section titles
          heading2: {
            run: {
              font:    'Calibri',
              size:    20,  // 10pt
              bold:    true,
              color:   BLUE,
              allCaps: true,
            },
            paragraph: {
              spacing: { before: 300, after: 120 },
              border: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size:  4,
                  color: RULE,
                  space: 4,
                },
              },
            },
          },
          // Base document style
          document: {
            run: { font: 'Calibri', size: 20, color: BODY },
            paragraph: { spacing: { line: 276, lineRule: 'auto' as const } },
          },
        },
      },
    });

    return Packer.toBuffer(doc);
  }

  // ---------------------------------------------------------------------------
  // Paragraph helpers
  // ---------------------------------------------------------------------------

  /** Candidate name — Heading 1 */
  private nameParagraph(name: string): Paragraph {
    return new Paragraph({
      heading:  HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text:  name,
          bold:  true,
          size:  52,
          color: DARK,
          font:  'Calibri',
        }),
      ],
      spacing: { after: 80 },
    });
  }

  /** Contact line with · separators + bottom border */
  private contactParagraph(parts: string[]): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text:  parts.join('   \u00B7   '),
          size:  18,
          color: MUTED,
          font:  'Calibri',
        }),
      ],
      spacing: { after: 200 },
      border: {
        bottom: {
          style: BorderStyle.THICK,
          size:  12,
          color: BLUE,
          space: 6,
        },
      },
    });
  }

  /** Section heading — Heading 2 with bottom rule */
  private sectionHeading(title: string): Paragraph {
    return new Paragraph({
      heading:   HeadingLevel.HEADING_2,
      alignment: AlignmentType.LEFT,
      children:  [
        new TextRun({
          text:    title,
          bold:    true,
          size:    20,
          color:   BLUE,
          font:    'Calibri',
          allCaps: true,
        }),
      ],
      spacing: { before: 300, after: 120 },
    });
  }

  /**
   * Entry header — bold title on the left, italic date right-aligned via tab stop.
   * This is the standard Word technique for right-aligned dates without tables.
   */
  private entryHeader(title: string, date: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({ text: title, bold: true, size: 22, color: DARK, font: 'Calibri' }),
        new TextRun({ text: '\t', size: 20, font: 'Calibri' }),
        new TextRun({ text: date, size: 20, color: MUTED, italics: true, font: 'Calibri' }),
      ],
      tabStops: [
        {
          type:     TabStopType.RIGHT,
          position: RIGHT_TAB,
        },
      ],
      spacing: { after: 60 },
    });
  }

  /** Italic muted context / description line */
  private contextLine(text: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text:    text,
          size:    19,
          color:   MUTED,
          italics: true,
          font:    'Calibri',
        }),
      ],
      spacing: { after: 60 },
    });
  }

  /** Standard body paragraph */
  private bodyText(text: string): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text, size: 20, color: BODY, font: 'Calibri' })],
      spacing:  { after: 200 },
    });
  }

  /** Bullet point — uses Word's native list style */
  private bulletItem(text: string): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text, size: 20, color: BODY, font: 'Calibri' })],
      bullet:   { level: 0 },
      spacing:  { after: 40 },
    });
  }

  /** Empty spacer paragraph */
  private spacer(after: number): Paragraph {
    return new Paragraph({ spacing: { after } });
  }
}
