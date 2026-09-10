const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { sendWeeklyNewUsersReport } = require("../services/weeklyReportService");

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || (!args.includes("--send") && !args.includes("-s"));
  
  let recipient = process.env.ADMIN_REPORT_EMAIL || "rutger@rooka.io";
  const recipientIdx = args.findIndex((a) => a === "--recipient" || a === "-r" || a === "--to");
  if (recipientIdx !== -1 && args[recipientIdx + 1]) {
    recipient = args[recipientIdx + 1].trim();
  }

  let days = 7;
  const daysIdx = args.findIndex((a) => a === "--days" || a === "-d");
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    const parsedDays = parseInt(args[daysIdx + 1], 10);
    if (!isNaN(parsedDays) && parsedDays > 0) {
      days = parsedDays;
    }
  }

  console.log("==================================================");
  console.log("       Rooka Weekly Athlete Digest Generator      ");
  console.log("==================================================");
  console.log(`📅 Lookback Window: Last ${days} day(s)`);
  console.log(`📬 Target Recipient: ${recipient}`);
  console.log(`⚙️  Mode: ${isDryRun ? "DRY-RUN (Preview only, no email sent)" : "LIVE SEND (Delivering email)"}`);
  console.log("--------------------------------------------------");

  try {
    const result = await sendWeeklyNewUsersReport({
      recipient,
      days,
      dryRun: isDryRun,
    });

    if (isDryRun) {
      console.log(`\n📊 New signups in last ${days} days: ${result.newUsersCount}`);
      console.log(`📈 Global Tier Breakdown:`, result.globalTierCounts);
      console.log(`\n📋 Athletes List:`);
      if (result.newUsers && result.newUsers.length > 0) {
        console.table(
          result.newUsers.map((u) => ({
            ID: u.id,
            Username: u.username,
            Email: u.email || "(no email)",
            Tier: u.tier,
            Joined: u.joined_at,
            Activities: u.activity_count,
            Strava: u.has_strava ? "✓" : "✗",
            Garmin: u.has_garmin ? "✓" : "✗",
          }))
        );
      } else {
        console.log("  (No new signups in this window)");
      }
      console.log("\n💡 To send this email for real, run:");
      console.log("   node server/scripts/send-weekly-user-digest.js --send");
      console.log("   node server/scripts/send-weekly-user-digest.js --send --recipient another@email.com");
    } else {
      console.log("\n✅ Weekly report email delivered successfully!");
      console.log(`   Recipient:  ${result.recipient}`);
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   New Users:  ${result.newUsersCount}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Execution failed:", err);
    process.exit(1);
  }
}

main();
