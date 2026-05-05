function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #e4e4e7">
  <span style="font-size:20px;font-weight:700;color:#18181b">Alphorn</span>
</td></tr>
<tr><td style="padding:32px 40px">${content}</td></tr>
<tr><td style="padding:16px 40px 32px;text-align:center">
  <span style="font-size:12px;color:#a1a1aa">Alphorn — Notification Router</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td>
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 32px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${label}</a>
</td></tr></table>`;
}

export function verificationEmailTemplate(url: string): string {
  return layout(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#18181b">Verify your email address</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525b;line-height:1.6">Click the button below to verify your email and activate your account.</p>
    ${button(url, "Verify Email")}
    <p style="margin:0;font-size:12px;color:#a1a1aa">If you didn't create an account, you can ignore this email.</p>
  `);
}

export function invitationEmailTemplate(
  orgName: string,
  inviterName: string,
  acceptUrl: string,
): string {
  return layout(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#18181b">You've been invited</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525b;line-height:1.6"><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(orgName)}</strong> on Alphorn.</p>
    ${button(acceptUrl, "Accept Invitation")}
    <p style="margin:0;font-size:12px;color:#a1a1aa">If you don't recognize this invitation, you can ignore this email.</p>
  `);
}

export function passwordResetEmailTemplate(url: string): string {
  return layout(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#18181b">Reset your password</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525b;line-height:1.6">Click the button below to reset your password.</p>
    ${button(url, "Reset Password")}
    <p style="margin:0;font-size:12px;color:#a1a1aa">If you didn't request a password reset, you can ignore this email. The link expires in 1 hour.</p>
  `);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
