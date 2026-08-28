/**
 * Tailwind config for the admin dashboard stylesheet (server/public/admin.css).
 *
 * The admin page deliberately does not use cdn.tailwindcss.com: that build is an
 * in-browser compiler and logs "should not be used in production" on every load.
 *
 * Regenerate after changing classes in admin.html or admin.js:
 *   npx tailwindcss -c server/tailwind.admin.config.js \
 *     -i server/tailwind.admin.input.css -o server/public/admin.css --minify
 *
 * Both files must be listed explicitly. A `admin.{html,js}` brace glob silently
 * matches only the HTML, which drops every class used solely from JS —
 * `line-through` (the struck-through original prices), the Strava/Garmin badge
 * colours — and the stylesheet then looks complete but is not.
 */
module.exports = {
  content: [
    'server/public/admin.html',
    'server/public/admin.js',
  ],
  theme: { extend: {} },
};
