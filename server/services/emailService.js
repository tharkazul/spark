const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

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
 * Sends a branded password reset email with a 6-digit OTP code using Rooka's orange brand identity
 */
async function sendPasswordResetEmail({ toEmail, username, resetCode }) {
  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || `Rooka <${process.env.SMTP_USER || "no-reply@rooka.io"}>`;
  const athleteName = username ? username : "Athlete";

  // Check for local logo asset
  const logoPath = path.join(__dirname, "../public/logo-mark.png");
  const hasLocalLogo = fs.existsSync(logoPath);

  const attachments = [];
  if (hasLocalLogo) {
    attachments.push({
      filename: "logo-mark.png",
      path: logoPath,
      cid: "rooka-logo-mark",
    });
  }

  const mailOptions = {
    from,
    to: toEmail,
    subject: `Your Rooka verification code: ${resetCode}`,
    text: `Hi ${athleteName},\n\nYour 6-digit verification code to reset your Rooka account password is: ${resetCode}\n\nThis code will expire in 15 minutes. If you did not request this, you can safely ignore this email.\n\nKeep pushing,\nTeam Rooka`,
    attachments,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Rooka Password</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #17171A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F5F5F7;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #17171A; padding: 40px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" style="max-width: 480px; background-color: #212226; border-radius: 24px; border: 1px solid #2D2E33; padding: 36px 28px; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                  
                  <!-- Logo / Header -->
                  <tr>
                    <td align="center" style="padding-bottom: 24px;">
                      <div style="display: inline-block; width: 64px; height: 64px; border-radius: 16px; overflow: hidden; background-color: #FFFFFF; border: 1px solid #2D2E33; box-shadow: 0 4px 16px rgba(255, 95, 59, 0.15); line-height: 0;">
                        ${
                          hasLocalLogo
                            ? `<img src="cid:rooka-logo-mark" alt="rooka" width="64" height="64" style="display: block; width: 64px; height: 64px; object-fit: contain;" />`
                            : `<img src="https://api.rooka.io/logo-mark.png" alt="rooka" width="64" height="64" style="display: block; width: 64px; height: 64px; object-fit: contain;" />`
                        }
                      </div>
                      <h1 style="margin: 12px 0 0 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #F5F5F7;">rooka</h1>
                    </td>
                  </tr>

                  <!-- Main Message -->
                  <tr>
                    <td style="padding-bottom: 20px;">
                      <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #F5F5F7;">Password Reset Code</h2>
                      <p style="margin: 0; font-size: 14px; line-height: 22px; color: #9A9AA2;">
                        Hi <strong style="color: #F5F5F7;">${athleteName}</strong>, we received a request to reset your password. Use the verification code below to set a new password in the app.
                      </p>
                    </td>
                  </tr>

                  <!-- OTP Code Box with Rooka Orange Brand Accent -->
                  <tr>
                    <td align="center" style="padding: 12px 0 24px 0;">
                      <div style="background-color: #17171A; border: 1.5px solid #FF5F3B; border-radius: 16px; padding: 18px 24px; display: inline-block; box-shadow: 0 0 24px rgba(255, 95, 59, 0.15);">
                        <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #FF5F3B; font-family: 'SF Mono', Consolas, Monaco, monospace; display: block; margin-left: 8px;">
                          ${resetCode}
                        </span>
                      </div>
                    </td>
                  </tr>

                  <!-- Expiration notice -->
                  <tr>
                    <td style="padding-bottom: 24px;">
                      <p style="margin: 0; font-size: 13px; color: #9A9AA2; text-align: center;">
                        ⏳ This code expires in <strong style="color: #FF6B45;">15 minutes</strong>.
                      </p>
                    </td>
                  </tr>

                  <!-- Divider -->
                  <tr>
                    <td style="border-top: 1px solid #2D2E33; padding-top: 20px;">
                      <p style="margin: 0; font-size: 12px; line-height: 18px; color: #6F6F79;">
                        If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding-top: 24px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #6F6F79;">
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
