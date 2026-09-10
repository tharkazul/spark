const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!user || !pass) {
    console.warn("⚠️ SMTP credentials not fully configured in environment.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Verifies the connection configuration with SMTP server
 */
async function verifyEmailConnection() {
  const transporter = getTransporter();
  return transporter.verify();
}

/**
 * Sends a branded password reset email with a 6-digit OTP code
 */
async function sendPasswordResetEmail({ toEmail, username, resetCode }) {
  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || `Rooka <${process.env.SMTP_USER || "no-reply@rooka.io"}>`;

  const athleteName = username ? username : "Athlete";

  const mailOptions = {
    from,
    to: toEmail,
    subject: `Your Rooka verification code: ${resetCode}`,
    text: `Hi ${athleteName},\n\nYour 6-digit verification code to reset your Rooka account password is: ${resetCode}\n\nThis code will expire in 15 minutes. If you did not request this, you can safely ignore this email.\n\nKeep pushing,\nTeam Rooka`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Rooka Password</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0B0E14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E2E8F0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0B0E14; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" style="max-width: 480px; background-color: #151A24; border-radius: 16px; border: 1px solid #232D3F; padding: 36px 28px; text-align: left;">
                  
                  <!-- Logo / Header -->
                  <tr>
                    <td align="center" style="padding-bottom: 24px;">
                      <div style="display: inline-block; background-color: #208AEF; width: 48px; height: 48px; border-radius: 12px; text-align: center; line-height: 48px; font-size: 24px; color: #FFFFFF; font-weight: 800;">
                        ⚡
                      </div>
                      <h1 style="margin: 12px 0 0 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; color: #FFFFFF;">ROOKA</h1>
                    </td>
                  </tr>

                  <!-- Main Message -->
                  <tr>
                    <td style="padding-bottom: 20px;">
                      <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #FFFFFF;">Password Reset Code</h2>
                      <p style="margin: 0; font-size: 14px; line-height: 22px; color: #94A3B8;">
                        Hi <strong style="color: #F1F5F9;">${athleteName}</strong>, we received a request to reset your password. Use the verification code below to set a new password in the app.
                      </p>
                    </td>
                  </tr>

                  <!-- OTP Code Box -->
                  <tr>
                    <td align="center" style="padding: 16px 0 24px 0;">
                      <div style="background-color: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 18px 24px; display: inline-block;">
                        <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #38BDF8; font-family: monospace;">
                          ${resetCode}
                        </span>
                      </div>
                    </td>
                  </tr>

                  <!-- Expiration notice -->
                  <tr>
                    <td style="padding-bottom: 24px;">
                      <p style="margin: 0; font-size: 13px; color: #64748B; text-align: center;">
                        ⏳ This code expires in <strong>15 minutes</strong>.
                      </p>
                    </td>
                  </tr>

                  <!-- Divider -->
                  <tr>
                    <td style="border-top: 1px solid #232D3F; padding-top: 20px;">
                      <p style="margin: 0; font-size: 12px; line-height: 18px; color: #64748B;">
                        If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding-top: 24px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #475569;">
                        © ${new Date().getFullYear()} Rooka Endurance HQ. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = {
  getTransporter,
  verifyEmailConnection,
  sendPasswordResetEmail,
};
