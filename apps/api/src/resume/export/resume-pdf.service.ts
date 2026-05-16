import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { ResumeData } from '@vantage/validation';

// ---------------------------------------------------------------------------
// Design tokens — classic professional theme
// ---------------------------------------------------------------------------

const BLUE      = '#2563EB'; // section headings + bullet dots
const DARK      = '#111827'; // name + role headings
const BODY      = '#374151'; // body text
const MUTED     = '#6B7280'; // dates, contact, secondary
const RULE_CLR  = '#D1D5DB'; // horizontal rules

const MARGIN    = 54;        // points (≈ 19mm)
const PAGE_W    = 595.28;    // A4 width in points
const CONTENT_W = PAGE_W - MARGIN * 2;
const BULLET_X  = MARGIN + 10;
const TEXT_X    = MARGIN + 22;
const TEXT_W    = CONTENT_W - 22;
const LABEL_W   = 84;        // skills category label width

// ---------------------------------------------------------------------------
// Sanitise AI-extracted values
// The AI parser may write '<UNKNOWN>' when a field cannot be determined.
// We strip these entirely rather than displaying them as literal text.
// ---------------------------------------------------------------------------

function clean(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed === '<UNKNOWN>' || trimmed === 'UNKNOWN') return '';
  return trimmed;
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
export class ResumePdfService {
  async generate(data: ResumeData, _originalFileName: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size:   'A4',
        margin: MARGIN,
        info: {
          Title:   `${data.contact.name} \u2014 Resume`,
          Author:  data.contact.name,
          Creator: "D'Vantage",
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
      doc.on('end',   ()             => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error)   => reject(err));

      this.header(doc, data);
      if (data.summary)              this.summary(doc, data.summary);
      if (data.experience.length)    this.experience(doc, data.experience);
      if (data.education.length)     this.education(doc, data.education);
      if (data.skills.length)        this.skills(doc, data.skills);
      if (data.certifications.length) this.certifications(doc, data.certifications);

      doc.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Header — name + contact
  // ---------------------------------------------------------------------------

  private header(doc: InstanceType<typeof PDFDocument>, data: ResumeData): void {
    // Name
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor(DARK)
      .text(data.contact.name, MARGIN, doc.y);

    doc.moveDown(0.2);

    // Contact line
    const parts = [
      data.contact.email,
      data.contact.phone,
      data.contact.location,
      data.contact.linkedin,
      data.contact.github,
    ].map(clean).filter(Boolean);

    if (parts.length) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(parts.join('   \u00B7   '), MARGIN, doc.y, {
          width: CONTENT_W,
          lineGap: 1.5,
        });
    }

    doc.moveDown(0.55);

    // Blue rule — thicker than section rules to anchor the header
    const hy = doc.y;
    doc.moveTo(MARGIN, hy).lineTo(MARGIN + CONTENT_W, hy)
      .strokeColor(BLUE).lineWidth(1.5).stroke();

    doc.moveDown(0.85);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  private summary(doc: InstanceType<typeof PDFDocument>, text: string): void {
    this.sectionHeading(doc, 'Professional Summary');
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(BODY)
      .text(text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2.5, align: 'justify' });
    doc.moveDown(0.8);
  }

  // ---------------------------------------------------------------------------
  // Experience
  // ---------------------------------------------------------------------------

  private experience(
    doc: InstanceType<typeof PDFDocument>,
    experience: ResumeData['experience'],
  ): void {
    this.sectionHeading(doc, 'Experience');

    for (const exp of experience) {
      const dateRange = exp.current
        ? `${clean(exp.startDate)} \u2013 Present`
        : cleanDate(exp.startDate, exp.endDate);

      // Role · Company  [date right-aligned on same baseline]
      const rowY = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(DARK)
        .text(`${clean(exp.title)}  \u00B7  ${clean(exp.company)}`, MARGIN, rowY, {
          width: CONTENT_W * 0.68,
          lineBreak: false,
        });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(dateRange, MARGIN + CONTENT_W * 0.68, rowY, {
          width:     CONTENT_W * 0.32,
          align:     'right',
          lineBreak: false,
        });

      // Advance past the title row manually
      doc.y = rowY + doc.currentLineHeight(true) + 3;

      // Optional context description (italicised)
      const desc = clean(exp.description);
      if (desc) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor(MUTED)
          .text(desc, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
        doc.moveDown(0.25);
      }

      // Bullet highlights
      for (const hl of exp.highlights) {
        const bulletY = doc.y;
        // Blue bullet dot
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(BLUE)
          .text('\u2022', BULLET_X, bulletY, { lineBreak: false, width: 12 });
        // Hanging-indent body text
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(BODY)
          .text(hl, TEXT_X, bulletY, { width: TEXT_W, lineGap: 2 });
        doc.moveDown(0.1);
      }

      doc.moveDown(0.7);
    }
  }

  // ---------------------------------------------------------------------------
  // Education
  // ---------------------------------------------------------------------------

  private education(
    doc: InstanceType<typeof PDFDocument>,
    education: ResumeData['education'],
  ): void {
    this.sectionHeading(doc, 'Education');

    for (const edu of education) {
      const dateStr = cleanDate(edu.startDate, edu.endDate);
      const rowY    = doc.y;

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(DARK)
        .text(`${clean(edu.degree)} in ${clean(edu.field)}`, MARGIN, rowY, {
          width:     CONTENT_W * 0.68,
          lineBreak: false,
        });

      if (dateStr) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(MUTED)
          .text(dateStr, MARGIN + CONTENT_W * 0.68, rowY, {
            width:     CONTENT_W * 0.32,
            align:     'right',
            lineBreak: false,
          });
      }

      doc.y = rowY + doc.currentLineHeight(true) + 3;

      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(BODY)
        .text(clean(edu.institution), MARGIN, doc.y, { width: CONTENT_W });

      doc.moveDown(0.65);
    }
  }

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  private skills(
    doc: InstanceType<typeof PDFDocument>,
    skills: ResumeData['skills'],
  ): void {
    this.sectionHeading(doc, 'Skills');

    const byCategory: Record<string, string[]> = {};
    for (const s of skills) {
      (byCategory[s.category] ??= []).push(s.name);
    }

    for (const [cat, names] of Object.entries(byCategory) as [string, string[]][]) {
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      const rowY  = doc.y;

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(MUTED)
        .text(label, MARGIN, rowY, { width: LABEL_W, lineBreak: false });

      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(BODY)
        .text(names.join(', '), MARGIN + LABEL_W, rowY, {
          width:   CONTENT_W - LABEL_W,
          lineGap: 2,
        });

      doc.moveDown(0.3);
    }

    doc.moveDown(0.4);
  }

  // ---------------------------------------------------------------------------
  // Certifications
  // ---------------------------------------------------------------------------

  private certifications(
    doc: InstanceType<typeof PDFDocument>,
    certifications: ResumeData['certifications'],
  ): void {
    this.sectionHeading(doc, 'Certifications');

    for (const cert of certifications) {
      const rowY       = doc.y;
      const certExt    = cert as ResumeData['certifications'][number] & { date?: string };
      const issuerStr  = clean(cert.issuer);
      const dateStr2   = clean(certExt.date);
      const right      = issuerStr + (dateStr2 ? `  (${dateStr2})` : '');

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(DARK)
        .text(clean(cert.name), MARGIN, rowY, {
          width:     CONTENT_W * 0.62,
          lineBreak: false,
        });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(right, MARGIN + CONTENT_W * 0.62, rowY, {
          width:     CONTENT_W * 0.38,
          align:     'right',
          lineBreak: false,
        });

      doc.y = rowY + doc.currentLineHeight(true) + 4;
    }
  }

  // ---------------------------------------------------------------------------
  // Section heading — blue uppercase label + thin grey rule
  // ---------------------------------------------------------------------------

  private sectionHeading(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
  ): void {
    doc.moveDown(0.15);

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(BLUE)
      .text(title.toUpperCase(), MARGIN, doc.y, {
        characterSpacing: 1.5,
        lineBreak:        false,
        width:            CONTENT_W,
      });

    const ruleY = doc.y + doc.currentLineHeight(true) + 3;
    doc
      .moveTo(MARGIN, ruleY)
      .lineTo(MARGIN + CONTENT_W, ruleY)
      .strokeColor(RULE_CLR)
      .lineWidth(0.5)
      .stroke();

    doc.y = ruleY + 6;
  }
}
