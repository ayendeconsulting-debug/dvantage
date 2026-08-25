import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { verifyEmailTemplate } from './templates/verify-email.template';
import { resetPasswordTemplate } from './templates/reset-password.template';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly devMode: boolean;

  constructor() {
    const apiKey = process.env['RESEND_API_KEY'];
    this.from = process.env['EMAIL_FROM'] ?? "D'Vantage <no-reply@dvantage.ai>";
    this.devMode = !apiKey;

    if (this.devMode) {
      this.logger.warn(
        'RESEND_API_KEY is not set — emails will be logged only. ' +
          'Check Mailpit at http://localhost:8025 for captured emails in dev.',
      );
      this.resend = new Resend('re_dev_placeholder');
    } else {
      this.resend = new Resend(apiKey);
    }
  }

  async sendVerificationEmail(to: string, url: string): Promise<void> {
    await this.send({
      to,
      subject: "Verify your D'Vantage email",
      html: verifyEmailTemplate(url),
    });
  }

  async sendPasswordResetEmail(to: string, url: string): Promise<void> {
    await this.send({
      to,
      subject: "Reset your D'Vantage password",
      html: resetPasswordTemplate(url),
    });
  }

  private async send(opts: { to: string; subject: string; html: string }): Promise<void> {
    // In dev without RESEND_API_KEY, log the email instead of sending.
    // Mailpit captures SMTP if you configure Resend's SMTP transport — or
    // just read the URL from the log.
    if (this.devMode) {
      this.logger.debug(`[EMAIL DEV] To: ${opts.to} | Subject: ${opts.subject}`);
      const urlMatch = opts.html.match(/href="(http[^"]+)"/);
      if (urlMatch?.[1]) this.logger.debug(`[EMAIL DEV] URL: ${urlMatch[1]}`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    if (error) {
      this.logger.error(`Email delivery failed → ${opts.to}: ${JSON.stringify(error)}`);
      throw new Error(`Email delivery failed: ${JSON.stringify(error)}`);
    }

    this.logger.log(`Email sent → ${opts.to} (${opts.subject})`);
  }
}
