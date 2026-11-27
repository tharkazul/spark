// Users tab: charts about who the athletes are, built from the same rows as the user
// table (GET /api/admin/usage, kept in allUsers by admin.js). Accounts marked as test
// accounts are left out while "Hide test accounts" is on (visibleUsers() in admin.js).

// Categorical colors in fixed order (validated: CVD-safe on white). Gray is reserved for
// "None" / "Unknown" so it never reads as a real category.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const NEUTRAL = '#a8a29e';

const DAY_MS = 86400000;

/** Server timestamps are UTC, written either as ISO or as 'YYYY-MM-DD HH:MM:SS'. */
function parseServerTime(value) {
    if (!value) return null;
    const s = String(value);
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

const pctOf = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const swatch = (color) => `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};flex:none"></span>`;

// --- Shared tooltip ------------------------------------------------------------

function insightsTooltip() {
    let tip = document.getElementById('insightsTip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'insightsTip';
        tip.className = 'fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg hidden tabular-nums';
        document.body.appendChild(tip);
    }
    return tip;
}

// Any element with data-tip shows it on hover; listeners are attached once per container.
function bindTips(container) {
    if (container.dataset.tipsBound) return;
    container.dataset.tipsBound = '1';
    const tip = insightsTooltip();
    container.addEventListener('mousemove', (e) => {
        const target = e.target.closest('[data-tip]');
        if (!target) { tip.classList.add('hidden'); return; }
        tip.textContent = target.dataset.tip;
        tip.classList.remove('hidden');
        const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = `${x}px`;
        tip.style.top = `${e.clientY - tip.offsetHeight - 10}px`;
    });
    container.addEventListener('mouseleave', () => tip.classList.add('hidden'));
}

// --- Chart builders ------------------------------------------------------------

/** Donut with a legend that carries every number (the colors alone never have to). */
function donutChart(slices, { unit = 'athletes' } = {}) {
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (!total) return '<p class="text-sm text-gray-400">No athletes yet.</p>';
    const R = 70, r = 44, C = 80;
    let angle = -Math.PI / 2;
    const arcs = slices.filter((s) => s.value > 0).map((s) => {
        const share = s.value / total;
        const tip = `${s.label}: ${s.value} ${unit} (${pctOf(s.value, total)}%)`;
        if (share >= 0.9999) {
            return `<g data-tip="${esc(tip)}"><circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${s.color}" stroke-width="${R - r}"/></g>`;
        }
        const a0 = angle, a1 = angle + share * Math.PI * 2;
        angle = a1;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (rad, ang) => `${(C + rad * Math.cos(ang)).toFixed(2)} ${(C + rad * Math.sin(ang)).toFixed(2)}`;
        const d = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
        return `<path d="${d}" fill="${s.color}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" data-tip="${esc(tip)}" class="hover:opacity-80"/>`;
    }).join('');
    const svg = `<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="${esc(slices.map((s) => `${s.label} ${s.value}`).join(', '))}" style="flex:none">
        ${arcs}
        <text x="${C}" y="${C - 2}" text-anchor="middle" font-size="22" font-weight="700" fill="#111827">${total}</text>
        <text x="${C}" y="${C + 16}" text-anchor="middle" font-size="11" fill="#6b7280">${esc(unit)}</text>
    </svg>`;
    const legend = slices.map((s) => `
        <li class="flex items-center gap-2 py-0.5 ${s.value ? '' : 'opacity-50'}" data-tip="${esc(`${s.label}: ${s.value} ${unit} (${pctOf(s.value, total)}%)`)}">
            ${swatch(s.color)}<span class="text-gray-700">${esc(s.label)}</span>
            <span class="ml-auto pl-3 tabular-nums text-gray-900 font-medium">${s.value}</span>
            <span class="w-10 text-right tabular-nums text-gray-400">${pctOf(s.value, total)}%</span>
        </li>`).join('');
    return `<div class="flex flex-wrap items-center gap-6">${svg}<ul class="text-sm flex-1 min-w-[180px]">${legend}</ul></div>`;
}

/** Horizontal bars, one per row, with the count and share printed at the end. */
function hBarChart(rows, { total, unit = 'athletes', color = SERIES[0] } = {}) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<ul class="space-y-2 text-sm">${rows.map((r) => {
        const width = (r.value / max) * 100;
        const share = total ? ` · ${pctOf(r.value, total)}%` : '';
        return `<li class="grid items-center gap-3" style="grid-template-columns: minmax(90px, 9rem) 1fr 5.5rem" data-tip="${esc(`${r.label}: ${r.value} ${unit}${share}`)}">
            <span class="text-gray-700 truncate">${esc(r.label)}</span>
            <span class="h-4 bg-gray-100 rounded-sm overflow-hidden"><span class="block h-full rounded-r" style="width:${width.toFixed(1)}%;background:${r.color || color};min-width:${r.value ? 3 : 0}px"></span></span>
            <span class="tabular-nums text-gray-900 font-medium text-right">${r.value}<span class="text-gray-400 font-normal">${total ? ` · ${pctOf(r.value, total)}%` : ''}</span></span>
        </li>`;
    }).join('')}</ul>`;
}

/** Sign-ups per week (bars) for the last `weeks` weeks, Monday-based. */
function signupChart(users, weeks = 26) {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const starts = [];
    for (let i = weeks - 1; i >= 0; i--) starts.push(monday.getTime() - i * 7 * DAY_MS);
    const counts = starts.map(() => 0);
    let before = 0, unknown = 0;
    users.forEach((u) => {
        const t = parseServerTime(u.created_at);
        if (t === null) { unknown++; return; }
        if (t < starts[0]) { before++; return; }
        const i = Math.min(weeks - 1, Math.floor((t - starts[0]) / (7 * DAY_MS)));
        counts[i]++;
    });

    const W = 920, H = 220, L = 36, Rm = 12, T = 12, B = 30;
    const pw = W - L - Rm, ph = H - T - B;
    const max = Math.max(4, ...counts);
    const step = max <= 10 ? 1 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5;
    const top = Math.ceil(max / step) * step;
    const slot = pw / weeks;
    const bw = Math.max(4, Math.min(24, Math.floor(slot * 0.7)));
    let grid = '';
    for (let v = 0; v <= top; v += step) {
        const y = T + ph * (1 - v / top);
        grid += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W - Rm}" y2="${y.toFixed(1)}" stroke="#e5e7eb" ${v ? 'stroke-dasharray="3,3"' : ''}/>`
            + `<text x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="11">${v}</text>`;
    }
    let running = before;
    const fmt = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const bars = counts.map((c, i) => {
        running += c;
        const cx = L + i * slot + slot / 2;
        const h = (c / top) * ph;
        const tip = `Week of ${fmt(starts[i])}: ${c} new · ${running} in total`;
        const bar = c ? `<path d="M ${(cx - bw / 2).toFixed(1)} ${(T + ph).toFixed(1)} V ${(T + ph - h + 4).toFixed(1)} q 0 -4 4 -4 H ${(cx + bw / 2 - 4).toFixed(1)} q 4 0 4 4 V ${(T + ph).toFixed(1)} Z" fill="${SERIES[0]}"/>` : '';
        const label = (weeks - 1 - i) % 4 === 0 ? `<text x="${cx.toFixed(1)}" y="${H - 9}" text-anchor="middle" fill="#6b7280" font-size="10">${fmt(starts[i])}</text>` : '';
        return `<g data-tip="${esc(tip)}"><rect x="${(cx - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}" fill="transparent"/>${bar}${label}</g>`;
    }).join('');
    const note = unknown ? `<p class="text-xs text-gray-400 mt-1">${unknown} account${unknown === 1 ? '' : 's'} without a sign-up date ${unknown === 1 ? 'is' : 'are'} not shown.</p>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full" style="min-width:560px;height:auto;display:block" role="img" aria-label="New athletes per week">${grid}${bars}</svg>${note}`;
}

// --- Grouping ------------------------------------------------------------------

function countBy(users, keyFn, order) {
    const counts = Object.fromEntries(order.map(([k]) => [k, 0]));
    users.forEach((u) => {
        const k = keyFn(u);
        if (k in counts) counts[k]++;
    });
    return counts;
}

function bucketRows(users, valueFn, buckets) {
    return buckets.map(([label, test]) => ({ label, value: users.filter((u) => test(valueFn(u))).length }));
}

// --- Render ----------------------------------------------------------------------

function renderUserInsights() {
    const root = document.getElementById('viewUsers');
    if (!root || typeof visibleUsers !== 'function') return;
    const users = visibleUsers();
    const total = users.length;
    const now = Date.now();
    const hiddenTests = allUsers.length - total;

    document.getElementById('insightsMeta').textContent = hideTestUsers && hiddenTests
        ? `${total} athletes · ${hiddenTests} test account${hiddenTests === 1 ? '' : 's'} left out`
        : `${total} athletes${allUsers.some((u) => u.is_test_account) ? ', test accounts included' : ''}`;

    // KPIs
    const ageDays = (u, field) => { const t = parseServerTime(u[field]); return t === null ? null : (now - t) / DAY_MS; };
    const newWeek = users.filter((u) => { const d = ageDays(u, 'created_at'); return d !== null && d < 7; }).length;
    const activeWeek = users.filter((u) => { const d = ageDays(u, 'last_active_at'); return d !== null && d < 7; }).length;
    const paying = users.filter((u) => ['rooka_plus', 'premium'].includes(u.subscription_tier)).length;
    const withDevice = users.filter((u) => u.garmin_connected || u.suunto_connected || u.apple_watch_connected).length;
    document.getElementById('insightsKpiTotal').textContent = total;
    document.getElementById('insightsKpiNew').textContent = newWeek;
    document.getElementById('insightsKpiActive').textContent = activeWeek;
    document.getElementById('insightsKpiActiveSub').textContent = `${pctOf(activeWeek, total)}% of athletes`;
    document.getElementById('insightsKpiPaying').textContent = paying;
    document.getElementById('insightsKpiPayingSub').textContent = `${pctOf(paying, total)}% · rooka+ or Premium`;
    document.getElementById('insightsKpiDevice').textContent = withDevice;
    document.getElementById('insightsKpiDeviceSub').textContent = `${pctOf(withDevice, total)}% · Garmin, Suunto or Apple Watch`;

    document.getElementById('insightsSignups').innerHTML = signupChart(users);

    // Part-to-whole: tier, language, phone
    const tierOrder = [['free', 'Free'], ['rooka_plus', 'rooka+'], ['premium', 'Premium'], ['admin', 'Admin']];
    const tiers = countBy(users, (u) => u.subscription_tier || 'free', tierOrder);
    document.getElementById('insightsTier').innerHTML = donutChart(tierOrder.map(([k, label], i) => ({ label, value: tiers[k], color: SERIES[i] })));

    const langs = countBy(users, (u) => u.language || 'en', LANGUAGES);
    document.getElementById('insightsLanguage').innerHTML = donutChart(
        LANGUAGES.map(([k, label], i) => ({ label, value: langs[k], color: SERIES[i] })).sort((a, b) => b.value - a.value),
    );

    const phone = { ios: 0, android: 0, both: 0, unknown: 0 };
    users.forEach((u) => {
        phone[u.ios_device && u.android_device ? 'both' : u.ios_device ? 'ios' : u.android_device ? 'android' : 'unknown']++;
    });
    document.getElementById('insightsPhone').innerHTML = donutChart([
        { label: 'iPhone', value: phone.ios, color: SERIES[0] },
        { label: 'Android', value: phone.android, color: SERIES[2] },
        { label: 'Both', value: phone.both, color: SERIES[6] },
        { label: 'Unknown', value: phone.unknown, color: NEUTRAL },
    ]);

    // Connections: athletes can have several, so bars (not a pie), each as a share of all athletes.
    const connRows = CONNECTIONS.map(([k, label]) => ({ label, value: users.filter((u) => u[k]).length }))
        .sort((a, b) => b.value - a.value);
    connRows.push({ label: 'None', value: users.filter((u) => !CONNECTIONS.some(([k]) => u[k])).length, color: NEUTRAL });
    document.getElementById('insightsConnections').innerHTML = hBarChart(connRows, { total });

    // Recency
    const seen = (u) => ageDays(u, 'last_active_at');
    document.getElementById('insightsRecency').innerHTML = hBarChart(bucketRows(users, seen, [
        ['Last 24 hours', (d) => d !== null && d < 1],
        ['1–7 days ago', (d) => d !== null && d >= 1 && d < 7],
        ['8–30 days ago', (d) => d !== null && d >= 7 && d < 30],
        ['31–90 days ago', (d) => d !== null && d >= 30 && d < 90],
        ['Over 90 days', (d) => d !== null && d >= 90],
        ['Never', (d) => d === null],
    ]).map((r, i, all) => (i === all.length - 1 ? { ...r, color: NEUTRAL } : r)), { total });

    // Engagement
    const countBuckets = [
        ['None', (n) => n === 0],
        ['1–5', (n) => n >= 1 && n <= 5],
        ['6–20', (n) => n >= 6 && n <= 20],
        ['21–100', (n) => n >= 21 && n <= 100],
        ['Over 100', (n) => n > 100],
    ];
    const greyFirst = (rows) => rows.map((r, i) => (i === 0 ? { ...r, color: NEUTRAL } : r));
    document.getElementById('insightsChats').innerHTML = hBarChart(greyFirst(bucketRows(users, (u) => u.chat_count || 0, countBuckets)), { total });
    document.getElementById('insightsLogins').innerHTML = hBarChart(greyFirst(bucketRows(users, (u) => u.login_count || 0, countBuckets)), { total });

    bindTips(root);
}
