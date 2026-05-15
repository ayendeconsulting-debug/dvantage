/**
 * Password reset template.
 * Inline CSS only — email clients strip <style> blocks.
 */
export function resetPasswordTemplate(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your D'Vantage password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f4f4f5;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#050505;padding:24px 32px;">
              <span style="font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#3B82F6;">D</span><span style="font-size:22px;font-weight:200;color:#ffffff;">'</span><span style="font-size:22px;font-weight:700;color:#ffffff;">vant</span><span style="font-size:22px;font-weight:200;color:#60A5FA;">age</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px 0;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#09090b;letter-spacing:-0.01em;">
                Reset your password
              </h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#52525b;">
                We received a request to reset the password on your D'Vantage account.
                Click the button below to choose a new password.
                This link expires in <strong>1 hour</strong>.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:6px;background-color:#3B82F6;">
                    <a href="${url}"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;
                              color:#ffffff;text-decoration:none;border-radius:6px;
                              letter-spacing:-0.01em;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5;">
                Or copy this link into your browser:<br />
                <span style="color:#3B82F6;word-break:break-all;">${url}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 32px 32px;">
              <p style="margin:24px 0 0;padding-top:24px;border-top:1px solid #f4f4f5;
                        font-size:12px;color:#a1a1aa;line-height:1.5;">
                If you didn't request a password reset, please ignore this email.
                Your password will not change.<br /><br />
                D'Vantage &middot; From applied to interview.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
