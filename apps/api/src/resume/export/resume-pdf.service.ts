import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { ResumeData } from '@vantage/validation';

const BRAND     = '#3B82F6';
const DARK      = '#1a1a1a';
const BODY      = '#333333';
const MUTED     = '#777777';
const BORDER    = '#e5e7eb';
const MARGIN    = 50;
const PAGE_W    = 595.28;
const CONTENT_W = PAGE_W - MARGIN * 2;

@Injectable()
export class ResumePdfService {
  async generate(data: ResumeData, _originalFileName: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        info: { Title: data.contact.name, Author: data.contact.name },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // Name
      doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK).text(data.contact.name);
      doc.moveDown(0.4);

      // Contact line
      const contactParts = [
        data.contact.email,
        data.contact.phone,
        data.contact.location,
        data.contact.linkedin,
        data.contact.github,
      ].filter((v): v is string => Boolean(v));

      if (contactParts.length > 0) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(contactParts.join('   ·   '));
        doc.moveDown(0.8);
      }

      // Summary
      if (data.summary) {
        this.sectionHeading(doc, 'Professional Summary');
        doc.font('Helvetica').fontSize(10).fillColor(BODY).text(data.summary, { lineGap: 3 });
        doc.moveDown(0.6);
      }

      // Experience
      if (data.experience.length > 0) {
        this.sectionHeading(doc, 'Experience');
        for (const exp of data.experience) {
          const dateRange = `${exp.startDate} – ${exp.current ? 'Present' : (exp.endDate ?? '')}`;
          const y = doc.y;
          doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
            .text(`${exp.title}  ·  ${exp.company}`, MARGIN, y, { width: CONTENT_W * 0.72, lineBreak: false });
          doc.font('Helvetica').fontSize(9).fillColor(MUTED)
            .text(dateRange, MARGIN + CONTENT_W * 0.72, y, { width: CONTENT_W * 0.28, align: 'right', lineBreak: false });
          doc.moveDown(0.35);
          if (exp.description) {
            doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(exp.description, { lineGap: 2 });
            doc.moveDown(0.25);
          }
          for (const highlight of exp.highlights) {
            doc.font('Helvetica').fontSize(9).fillColor(BODY)
              .text('•', MARGIN, doc.y, { lineBreak: false, width: 10 });
            doc.text(highlight, MARGIN + 18, doc.y - doc.currentLineHeight(), { width: CONTENT_W - 18, lineGap: 2 });
          }
          doc.moveDown(0.7);
        }
      }

      // Education
      if (data.education.length > 0) {
        this.sectionHeading(doc, 'Education');
        for (const edu of data.education) {
          const dateRange = `${edu.startDate}${edu.endDate ? ` – ${edu.endDate}` : ''}${edu.gpa ? `  ·  GPA ${edu.gpa}` : ''}`;
          const y = doc.y;
          doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
            .text(`${edu.degree} in ${edu.field}, ${edu.institution}`, MARGIN, y, { width: CONTENT_W * 0.72, lineBreak: false });
          doc.font('Helvetica').fontSize(9).fillColor(MUTED)
            .text(dateRange, MARGIN + CONTENT_W * 0.72, y, { width: CONTENT_W * 0.28, align: 'right', lineBreak: false });
          doc.moveDown(0.7);
        }
      }

      // Skills
      if (data.skills.length > 0) {
        this.sectionHeading(doc, 'Skills');
        const byCategory: Record<string, string[]> = {};
        for (const skill of data.skills) {
          (byCategory[skill.category] ??= []).push(skill.name);
        }
        for (const [category, names] of Object.entries(byCategory) as Array<[string, string[]]>) {
          const label = category.charAt(0).toUpperCase() + category.slice(1);
          const y = doc.y;
          doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
            .text(label, MARGIN, y, { width: 72, lineBreak: false });
          doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
            .text(names.join(', '), MARGIN + 72, y, { width: CONTENT_W - 72, lineGap: 2 });
          doc.moveDown(0.3);
        }
        doc.moveDown(0.4);
      }

      // Certifications
      if (data.certifications.length > 0) {
        this.sectionHeading(doc, 'Certifications');
        for (const cert of data.certifications) {
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK)
            .text(cert.name, { continued: true })
            .font('Helvetica').fillColor(BODY)
            .text(` — ${cert.issuer}${cert.date ? ` (${cert.date})` : ''}`);
          doc.moveDown(0.3);
        }
      }

      doc.end();
    });
  }

  private sectionHeading(doc: InstanceType<typeof PDFDocument>, title: string): void {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND)
      .text(title.toUpperCase(), { characterSpacing: 1.2 });
    const lineY = doc.y + 2;
    doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
      .strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.moveDown(0.6);
  }
}
