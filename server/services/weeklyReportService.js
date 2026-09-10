const path = require("path");
const fs = require("fs");
const db = require("./db");
const { getTransporter } = require("./emailService");

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function formatAMSDate(dateInput) {
  if (!dateInput) return "N/A";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTierBadge(tier) {
  const t = String(tier || "free").toLowerCase();
  if (t === "admin") {
    return `<span style="display:inline-block; padding:3px 8px; font-size:11px; font-weight:700; border-radius:6px; background-color:#2E1065; color:#C084FC; border:1px solid #7E22CE;">ADMIN</span>`;
  }
  if (t === "premium") {
    return `<span style="display:inline-block; padding:3px 8px; font-size:11px; font-weight:700; border-radius:6px; background-color:#3E2A00; color:#FCD34D; border:1px solid #D97706;">PREMIUM</span>`;
  }
  if (t === "rooka_plus" || t === "plus") {
    return `<span style="display:inline-block; padding:3px 8px; font-size:11px; font-weight:700; border-radius:6px; background-color:#38140C; color:#FF7A59; border:1px solid #FF5F3B;">ROOKA+</span>`;
  }
  return `<span style="display:inline-block; padding:3px 8px; font-size:11px; font-weight:700; border-radius:6px; background-color:#26262B; color:#A1A1AA; border:1px solid #3F3F46;">FREE</span>`;
}

/**
 * Generates and sends the weekly athlete signup & tier digest to the administrator
 * @param {Object} options
 * @param {string} [options.recipient] - Override recipient email (defaults to rutger@rooka.io)
 * @param {number} [options.days=7] - Number of days to look back for new signups
 * @param {boolean} [options.dryRun=false] - If true, returns compiled data without sending email
 */
async function sendWeeklyNewUsersReport(options = {}) {
  const recipient = options.recipient || process.env.ADMIN_REPORT_EMAIL || "rutger@rooka.io";
  const days = options.days || 7;
  const dryRun = options.dryRun || false;

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date();

  // Detect available timestamp column in users table (created_at or rooka_start_date)
  const userColumns = await all(`PRAGMA table_info(users)`);
  const colNames = userColumns.map((c) => c.name);
  let dateColExpr = "CURRENT_TIMESTAMP";
  if (colNames.includes("created_at") && colNames.includes("rooka_start_date")) {
    dateColExpr = "COALESCE(u.created_at, u.rooka_start_date)";
  } else if (colNames.includes("created_at")) {
    dateColExpr = "u.created_at";
  } else if (colNames.includes("rooka_start_date")) {
    dateColExpr = "u.rooka_start_date";
  }

  // 1. Fetch new users registered in the last N days (excluding deleted accounts)
  const newUsers = await all(
    `SELECT 
        u.id, 
        u.username, 
        u.email, 
        COALESCE(u.subscription_tier, 'free') as tier,
        u.role,
        ${dateColExpr} as joined_at,
        (u.strava_refresh_token IS NOT NULL) as has_strava,
        (u.garmin_username IS NOT NULL) as has_garmin,
        COUNT(a.id) as activity_count
     FROM users u
     LEFT JOIN activities a ON a.user_id = u.id
     WHERE u.deleted_at IS NULL
       AND ${dateColExpr} >= ?
     GROUP BY u.id
     ORDER BY ${dateColExpr} DESC`,
    [cutoffDate]
  );

  // 2. Fetch global breakdown of all active users across tiers
  const tierCountsRaw = await all(
    `SELECT COALESCE(subscription_tier, 'free') as tier, COUNT(*) as count 
     FROM users 
     WHERE deleted_at IS NULL
     GROUP BY COALESCE(subscription_tier, 'free')`
  );

  const totalUsersRow = await get(`SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL`);
  const totalPlatformUsers = totalUsersRow?.total || 0;

  const globalTierCounts = { free: 0, rooka_plus: 0, premium: 0, admin: 0 };
  for (const row of tierCountsRaw) {
    const key = String(row.tier).toLowerCase();
    if (globalTierCounts[key] !== undefined) {
      globalTierCounts[key] = row.count;
    } else {
      globalTierCounts[key] = row.count;
    }
  }

  // Breakdown of new signups this week
  const newTierBreakdown = { free: 0, paid: 0 };
  newUsers.forEach((u) => {
    const t = String(u.tier).toLowerCase();
    if (t === "rooka_plus" || t === "premium" || t === "admin") {
      newTierBreakdown.paid++;
    } else {
      newTierBreakdown.free++;
    }
  });

  // Prepare date range labels
  const startDateLabel = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
  });
  const endDateLabel = now.toLocaleDateString("en-GB", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Format table rows
  let userRowsHtml = "";
  if (newUsers.length > 0) {
    userRowsHtml = newUsers
      .map((u, idx) => {
        const bg = idx % 2 === 0 ? "#1C1D21" : "#17171A";
        const emailDisplay = u.email ? `<span style="color:#A1A1AA; font-size:12px;">${u.email}</span>` : `<span style="color:#52525B; font-size:12px; font-style:italic;">No email</span>`;
        const integrations = [];
        if (u.has_strava) integrations.push(`<span style="color:#FC4C02; font-size:11px; font-weight:600;">Strava</span>`);
        if (u.has_garmin) integrations.push(`<span style="color:#007CC3; font-size:11px; font-weight:600;">Garmin</span>`);
        const integrationsDisplay = integrations.length > 0 ? integrations.join(" • ") : `<span style="color:#52525B; font-size:11px;">None</span>`;

        return `
          <tr style="background-color:${bg}; border-bottom:1px solid #27272A;">
            <td style="padding:12px 14px; font-size:13px; color:#F4F4F5;">
              <strong style="color:#FFFFFF;">${u.username}</strong><br/>
              ${emailDisplay}
            </td>
            <td style="padding:12px 14px; font-size:12px; color:#D4D4D8;">
              ${getTierBadge(u.tier)}
            </td>
            <td style="padding:12px 14px; font-size:12px; color:#A1A1AA; white-space:nowrap;">
              ${formatAMSDate(u.joined_at)}
            </td>
            <td style="padding:12px 14px; font-size:12px; color:#D4D4D8; text-align:center;">
              ${u.activity_count}
            </td>
            <td style="padding:12px 14px; font-size:11px; white-space:nowrap;">
              ${integrationsDisplay}
            </td>
          </tr>
        `;
      })
      .join("");
  } else {
    userRowsHtml = `
      <tr>
        <td colspan="5" style="padding:28px 14px; text-align:center; color:#71717A; font-size:13px; background-color:#17171A;">
          No new athlete signups recorded in the past ${days} days.
        </td>
      </tr>
    `;
  }

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

  const subject = `Rooka Weekly Briefing: ${newUsers.length} new athlete${newUsers.length === 1 ? "" : "s"} (${startDateLabel} - ${endDateLabel})`;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="margin:0; padding:0; background-color:#0F0F12; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#F4F4F5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0F0F12; padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" style="max-width:640px; background-color:#17171A; border-radius:20px; border:1px solid #27272A; overflow:hidden; box-shadow:0 12px 32px rgba(0,0,0,0.4);">
                
                <!-- Brand Header -->
                <tr>
                  <td style="padding:28px 28px 20px 28px; background:linear-gradient(180deg, #1F2024 0%, #17171A 100%); border-bottom:1px solid #27272A;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <div style="display:inline-block; vertical-align:middle; width:44px; height:44px; border-radius:12px; overflow:hidden; background-color:#FFFFFF; border:1px solid #3F3F46; line-height:0;">
                            ${
                              hasLocalLogo
                                ? `<img src="cid:rooka-logo-mark" alt="rooka" width="44" height="44" style="display:block; width:44px; height:44px; object-fit:contain;" />`
                                : `<img src="https://api.rooka.io/logo-mark.png" alt="rooka" width="44" height="44" style="display:block; width:44px; height:44px; object-fit:contain;" />`
                            }
                          </div>
                          <div style="display:inline-block; vertical-align:middle; margin-left:14px;">
                            <h1 style="margin:0; font-size:20px; font-weight:800; letter-spacing:-0.5px; color:#FFFFFF;">rooka</h1>
                            <p style="margin:2px 0 0 0; font-size:12px; font-weight:600; color:#FF5F3B; text-transform:uppercase; letter-spacing:0.5px;">Weekly Athlete Growth Digest</p>
                          </div>
                        </td>
                        <td align="right" style="vertical-align:middle;">
                          <span style="font-size:12px; color:#A1A1AA; background-color:#27272A; padding:6px 12px; border-radius:100px; font-weight:500;">
                            ${startDateLabel} – ${endDateLabel}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- KPI Metric Cards -->
                <tr>
                  <td style="padding:24px 28px 12px 28px;">
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="31%" style="background-color:#212226; border:1px solid #2E2F35; border-radius:14px; padding:16px; text-align:center;">
                          <div style="font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">New Signups</div>
                          <div style="font-size:28px; font-weight:800; color:#FF5F3B; margin-top:4px;">+${newUsers.length}</div>
                          <div style="font-size:11px; color:#71717A; margin-top:2px;">Last 7 Days</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color:#212226; border:1px solid #2E2F35; border-radius:14px; padding:16px; text-align:center;">
                          <div style="font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">New Paid Tiers</div>
                          <div style="font-size:28px; font-weight:800; color:#FCD34D; margin-top:4px;">+${newTierBreakdown.paid}</div>
                          <div style="font-size:11px; color:#71717A; margin-top:2px;">Rooka+ & Premium</div>
                        </td>
                        <td width="3.5%"></td>
                        <td width="31%" style="background-color:#212226; border:1px solid #2E2F35; border-radius:14px; padding:16px; text-align:center;">
                          <div style="font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Total Athletes</div>
                          <div style="font-size:28px; font-weight:800; color:#FFFFFF; margin-top:4px;">${totalPlatformUsers}</div>
                          <div style="font-size:11px; color:#71717A; margin-top:2px;">All-Time Users</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Global Tier Distribution Bar -->
                <tr>
                  <td style="padding:12px 28px 20px 28px;">
                    <div style="background-color:#212226; border:1px solid #2E2F35; border-radius:14px; padding:16px;">
                      <div style="font-size:12px; font-weight:700; color:#E4E4E7; margin-bottom:10px;">Platform Tier Distribution</div>
                      <table width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="font-size:12px; color:#D4D4D8;">
                            <span style="display:inline-block; width:8px; height:8px; background-color:#71717A; border-radius:50%; margin-right:6px;"></span>
                            Free: <strong style="color:#FFFFFF;">${globalTierCounts.free || 0}</strong>
                          </td>
                          <td style="font-size:12px; color:#D4D4D8;">
                            <span style="display:inline-block; width:8px; height:8px; background-color:#FF5F3B; border-radius:50%; margin-right:6px;"></span>
                            Rooka+: <strong style="color:#FFFFFF;">${globalTierCounts.rooka_plus || 0}</strong>
                          </td>
                          <td style="font-size:12px; color:#D4D4D8;">
                            <span style="display:inline-block; width:8px; height:8px; background-color:#F59E0B; border-radius:50%; margin-right:6px;"></span>
                            Premium: <strong style="color:#FFFFFF;">${globalTierCounts.premium || 0}</strong>
                          </td>
                          <td style="font-size:12px; color:#D4D4D8;">
                            <span style="display:inline-block; width:8px; height:8px; background-color:#8B5CF6; border-radius:50%; margin-right:6px;"></span>
                            Admin: <strong style="color:#FFFFFF;">${globalTierCounts.admin || 0}</strong>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- Section: New Athletes Table -->
                <tr>
                  <td style="padding:8px 28px 28px 28px;">
                    <h2 style="margin:0 0 12px 0; font-size:15px; font-weight:700; color:#FFFFFF; letter-spacing:-0.2px;">
                      New Athletes Joined This Week (${newUsers.length})
                    </h2>
                    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; border-radius:12px; overflow:hidden; border:1px solid #27272A;">
                      <thead>
                        <tr style="background-color:#212226; border-bottom:1px solid #27272A;">
                          <th align="left" style="padding:10px 14px; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Athlete</th>
                          <th align="left" style="padding:10px 14px; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Tier</th>
                          <th align="left" style="padding:10px 14px; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Joined</th>
                          <th align="center" style="padding:10px 14px; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Workouts</th>
                          <th align="left" style="padding:10px 14px; font-size:11px; font-weight:700; color:#A1A1AA; text-transform:uppercase; letter-spacing:0.5px;">Connected</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${userRowsHtml}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 28px; background-color:#121215; border-top:1px solid #27272A; text-align:center;">
                    <p style="margin:0; font-size:11px; color:#71717A; line-height:16px;">
                      Automated weekly briefing delivered to <strong style="color:#A1A1AA;">${recipient}</strong>.<br/>
                      Generated by Rooka System Engine • Amsterdam, NL
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      recipient,
      newUsersCount: newUsers.length,
      newUsers,
      globalTierCounts,
      subject,
    };
  }

  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || `Rooka <${process.env.SMTP_USER || "no-reply@rooka.io"}>`;

  const mailOptions = {
    from,
    to: recipient,
    subject,
    text: `Rooka Weekly Digest:\n\n${newUsers.length} new athlete(s) joined this week.\nTotal athletes: ${totalPlatformUsers}\n\nNew Users:\n` +
      newUsers.map(u => `- ${u.username} (${u.tier}) joined ${u.joined_at}`).join("\n"),
    attachments,
    html: emailHtml,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`✉️ [Report] Weekly new users digest sent successfully to ${recipient} (Message ID: ${info.messageId})`);
  return {
    success: true,
    messageId: info.messageId,
    recipient,
    newUsersCount: newUsers.length,
  };
}

module.exports = {
  sendWeeklyNewUsersReport,
};
