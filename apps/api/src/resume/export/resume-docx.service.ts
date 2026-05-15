import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  AlignmentType,
} from 'docx';
import type { ResumeData } from '@vantage/validation';

@Injectable()
export class ResumeDocxService {
  async generate(data: ResumeData, _originalFileName: string): Promise<Buffer> {
    const children: Paragraph[] = [];

    // -- Name -----------------------------------------------------------------
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: data.contact.name, bold: true, size: 44, color: '1a1a1a' }),
        ],
        spacing: { after: 100 },
      }),
    );

    // -- Contact line ---------------------------------------------------------
    const contactParts = [
      data.contact.email,
      data.contact.phone,
      data.contact.location,
      data.contact.linkedin,
      data.contact.github,
    ].filter((v): v is string => Boolean(v));

    if (contactParts.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: contactParts.join('  ·  '), size: 18, color: '666666' }),
          ],
          spacing: { after: 280 },
        }),
      );
    }

    // -- Summary --------------------------------------------------------------
    if (data.summary) {
      children.push(this.sectionHeading('Professional Summary'));
      children.push(
        new Paragraph({
          children: [new TextRun({ text: data.summary, size: 20, color: '333333' })],
          spacing: { after: 240 },
        }),
      );
    }

    // -- Experience -----------------------------------------------------------
    if (data.experience.length > 0) {
      children.push(this.sectionHeading('Experience'));
      for (const exp of data.experience) {
        const dateRange = `${exp.startDate} – ${exp.current ? 'Present' : (exp.endDate ?? '')}`;

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${exp.title}  ·  ${exp.company}`, bold: true, size: 22, color: '1a1a1a' }),
            ],
            spacing: { after: 40 },
          }),
        );

        children.push(
          new Paragraph({
            children: [new TextRun({ text: dateRange, size: 18, color: '888888', italics: true })],
            spacing: { after: 80 },
          }),
        );

        if (exp.description) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: exp.description, size: 20, color: '444444' })],
              spacing: { after: 80 },
            }),
          );
        }

        for (const highlight of exp.highlights) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: highlight, size: 20, color: '333333' })],
              bullet: { level: 0 },
              spacing: { after: 40 },
            }),
          );
        }

        children.push(new Paragraph({ spacing: { after: 180 } }));
      }
    }

    // -- Education ------------------------------------------------------------
    if (data.education.length > 0) {
      children.push(this.sectionHeading('Education'));
      for (const edu of data.education) {
        const dateRange = `${edu.startDate}${edu.endDate ? ` – ${edu.endDate}` : ''}`;

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${edu.degree} in ${edu.field}`, bold: true, size: 22, color: '1a1a1a' }),
              new TextRun({ text: `  —  ${edu.institution}`, size: 20, color: '444444' }),
            ],
            spacing: { after: 40 },
          }),
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: dateRange + (edu.gpa ? `  ·  GPA ${edu.gpa}` : ''),
                size: 18,
                color: '888888',
                italics: true,
              }),
            ],
            spacing: { after: 180 },
          }),
        );
      }
    }

    // -- Skills ---------------------------------------------------------------
    if (data.skills.length > 0) {
      children.push(this.sectionHeading('Skills'));

      const byCategory: Record<string, string[]> = {};
      for (const skill of data.skills) {
        (byCategory[skill.category] ??= []).push(skill.name);
      }

      for (const [category, names] of Object.entries(byCategory) as Array<[string, string[]]>) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${category.charAt(0).toUpperCase() + category.slice(1)}: `,
                bold: true,
                size: 20,
                color: '333333',
              }),
              new TextRun({ text: names.join(', '), size: 20, color: '444444' }),
            ],
            spacing: { after: 80 },
          }),
        );
      }
      children.push(new Paragraph({ spacing: { after: 100 } }));
    }

    // -- Certifications -------------------------------------------------------
    if (data.certifications.length > 0) {
      children.push(this.sectionHeading('Certifications'));
      for (const cert of data.certifications) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: cert.name, bold: true, size: 20, color: '1a1a1a' }),
              new TextRun({
                text: `  —  ${cert.issuer}${cert.date ? ` (${cert.date})` : ''}`,
                size: 20,
                color: '444444',
              }),
            ],
            spacing: { after: 80 },
          }),
        );
      }
    }

    // -- Build document -------------------------------------------------------
    const doc = new Document({
      sections: [
        {
          children,
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
        },
      ],
      styles: {
        default: {
          heading1: {
            run: { size: 40, bold: true, color: '1a1a1a' },
            paragraph: { spacing: { after: 120 } },
          },
          heading2: {
            run: { size: 20, bold: true, color: '3B82F6', allCaps: true },
            paragraph: {
              spacing: { before: 280, after: 120 },
              border: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size: 4,
                  color: 'e5e7eb',
                  space: 4,
                },
              },
            },
          },
        },
      },
    });

    return Packer.toBuffer(doc);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sectionHeading(title: string): Paragraph {
    return new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
      alignment: AlignmentType.LEFT,
    });
  }
}
