/* ===========================================================================
 * Usage tab: how athletes use the app.
 *
 * Everything here is read from the summary tables (server/services/usageAnalytics.js),
 * which are kept for good; the raw events behind them are deleted after 90 days.
 * Uses esc(), authHeaders() and showLoginModal() from admin.js.
 * ======================================================================== */

let usageDays = 90;
let usageData = null;
let usageLoaded = false;

const USAGE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#9ca3af'];

const FUNNEL_LABELS = {
    signed_up: 'Signed up',
    opened_app: 'Opened the app',
    onboarding_welcome: 'Onboarding: welcome',
    onboarding_language: 'Onboarding: language',
    onboarding_coach_style: 'Onboarding: coach style',
    onboarding_coach_gender: 'Onboarding: coach gender',
    onboarding_goal: 'Onboarding: goal',
    onboarding_completed: 'Finished onboarding',
    ai_allowed: 'Allowed the AI coach',
    device_connected: 'Connected a device',
    first_coach_message: 'Messaged the coach',
    back_after_a_week: 'Came back in week 2',
};
const SIGNUP_LABELS = { login_viewed: 'Saw the login screen', signup_started: 'Started signing up', signup_completed: 'Created an account' };
const TAB_LABELS = { planning: 'Planning', progress: 'Progress', coach: 'Coach', social: 'Social', profile: 'Profile' };

// --- View switching ---------------------------------------------------------------

function showAdminView(view) {
    document.getElementById('viewDashboard').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('viewUsage').classList.toggle('hidden', view !== 'usage');
    document.querySelectorAll('#adminViewTabs .view-tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    if (view === 'usage' && !usageLoaded) fetchUsageOverview();
}

function setUsageRange(days) {
    usageDays = days;
    document.querySelectorAll('#usageRangeBtns .range-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === days));
    fetchUsageOverview();
}

async function refreshUsageNow(btn) {
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    try {
        await fetch('/api/admin/analytics/refresh', { method: 'POST', headers: authHeaders() });
        await fetchUsageOverview();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh now';
    }
}

// --- Data -------------------------------------------------------------------------

async function fetchUsageOverview() {
    try {
        const res = await fetch(`/api/admin/analytics/overview?days=${usageDays}`, { headers: authHeaders() });
        if (res.status === 401 || res.status === 403) return showLoginModal();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        usageData = await res.json();
        usageLoaded = true;
        renderUsage(usageData);
    } catch (err) {
        console.error(err);
        document.getElementById('usageMeta').textContent = 'Could not load usage statistics.';
    }
}

function pct(part, whole) {
    return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–';
}

function weekStartOf(day) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
}

function renderUsage(data) {
    const since = data.collecting_since;
    document.getElementById('usageMeta').innerHTML = since
        ? `Collecting since <strong>${esc(since)}</strong> &middot; raw events are deleted after ${data.raw_days} days, these charts are kept &middot; updated hourly`
        : 'No events received yet. They start arriving once athletes run an app version that sends them.';

    const today = data.daily.find((d) => d.day === data.today);
    const week = data.weekly.find((w) => w.week === weekStartOf(data.today));
    const avg = data.daily.length ? data.daily.reduce((s, d) => s + d.users, 0) / data.daily.length : 0;
    document.getElementById('usageKpiToday').textContent = today ? today.users : 0;
    document.getElementById('usageKpiWeek').textContent = week ? week.users : 0;
    document.getElementById('usageKpiAvg').textContent = avg ? avg.toFixed(1) : 0;
    document.getElementById('usageKpiSignups').textContent = data.funnel.find((s) => s.step === 'signed_up')?.users || 0;

    renderActiveChart(data);
    renderFunnel(document.getElementById('usageFunnel'), data.funnel.map((s) => ({ label: FUNNEL_LABELS[s.step] || s.step, value: s.users })), 'athletes');
    renderFunnel(document.getElementById('usageSignupFunnel'), data.signup_funnel.map((s) => ({ label: SIGNUP_LABELS[s.step] || s.step, value: s.sessions })), 'sessions');
    renderPaywall(data.paywall);
    renderRetention(data.retention);
    renderTabs(data.tabs);
    renderEventsTable(data.events);
    fillExplorer(data);
}

// --- Charts -----------------------------------------------------------------------

function fillDays(rows, from, to) {
    const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
    const out = [];
    for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = d.toISOString().slice(0, 10);
        out.push(byDay[day] || { day });
    }
    return out;
}

function rangeStart(data) {
    const d = new Date(`${data.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (data.days - 1));
    const start = d.toISOString().slice(0, 10);
    // Don't draw months of empty days before the first event arrived.
    return data.collecting_since && data.collecting_since > start ? data.collecting_since : start;
}

/** Stacked daily bars. series: [{ key, color }], days: [{ day, [key]: number }]. */
function barChartSvg(days, series, { onHover } = {}) {
    const W = 920, H = 230, L = 44, R = 12, T = 12, B = 32;
    const pw = W - L - R, ph = H - T - B;
    const totals = days.map((d) => series.reduce((s, x) => s + (d[x.key] || 0), 0));
    const max = Math.max(4, ...totals);
    const step = max <= 10 ? 1 : Math.ceil(max / 5);
    const top = Math.ceil(max / step) * step;
    const n = Math.max(1, days.length);
    const slot = pw / n;
    const bw = Math.max(2, Math.min(26, Math.floor(slot * 0.72)));
    const labelEvery = n <= 14 ? 1 : n <= 45 ? 7 : n <= 120 ? 14 : 30;

    let grid = '';
    for (let v = 0; v <= top; v += step) {
        const y = T + ph * (1 - v / top);
        grid += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W - R}" y2="${y.toFixed(1)}" stroke="#e5e7eb" ${v ? 'stroke-dasharray="3,3"' : ''}/>`
            + `<text x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="11">${v}</text>`;
    }
    const bars = days.map((d, i) => {
        const cx = L + i * slot + slot / 2;
        let y = T + ph;
        const rects = series.map((s) => {
            const v = d[s.key] || 0;
            if (!v) return '';
            const h = (v / top) * ph;
            y -= h;
            return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(1.5, h).toFixed(1)}" fill="${s.color}" rx="1.5"/>`;
        }).join('');
        const label = (n - 1 - i) % labelEvery === 0 ? `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="#6b7280" font-size="10">${d.day.slice(5)}</text>` : '';
        const hover = onHover ? `onmouseenter="${onHover}(${i})" onclick="${onHover}(${i})"` : '';
        return `<g class="token-bar-group" ${hover}><rect x="${(cx - slot / 2).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}" fill="transparent"/>${rects}${label}</g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="w-full" style="min-width: 560px; height: auto; display: block;">${grid}${bars}</svg>`;
}

let activeDays = [];
function renderActiveChart(data) {
    activeDays = fillDays(data.daily, rangeStart(data), data.today);
    document.getElementById('usageActiveChart').innerHTML = barChartSvg(activeDays, [{ key: 'users', color: '#2563eb' }], { onHover: 'showActiveHover' });
    document.getElementById('usageActiveHover').textContent = '';
}

function showActiveHover(i) {
    const d = activeDays[i];
    if (!d) return;
    document.getElementById('usageActiveHover').innerHTML = `<strong>${esc(d.day)}</strong> &mdash; ${d.users || 0} athletes &middot; ${d.sessions || 0} sessions &middot; ${d.events || 0} events`;
}

/** Horizontal funnel: each step's share of the first, and the biggest step-to-step loss in red. */
function renderFunnel(el, steps, unit) {
    const first = steps[0]?.value || 0;
    if (!first) {
        el.innerHTML = `<p class="text-sm text-gray-400">No ${unit} in this period yet.</p>`;
        return;
    }
    let worst = -1, worstLoss = 0;
    steps.forEach((s, i) => {
        if (!i) return;
        const loss = (steps[i - 1].value || 0) - (s.value || 0);
        if (loss > worstLoss) { worstLoss = loss; worst = i; }
    });
    el.innerHTML = steps.map((s, i) => {
        const share = first ? (s.value / first) * 100 : 0;
        const prev = i ? steps[i - 1].value : null;
        // Steps aren't strictly nested (messaging the coach doesn't need a device), so a step can gain.
        const change = i && prev ? s.value - prev : 0;
        const drop = i && prev
            ? change > 0
                ? `<span class="text-green-600">+${change}</span>`
                : `<span class="${i === worst ? 'text-red-600 font-semibold' : 'text-gray-400'}">−${-change} (${pct(-change, prev)})</span>`
            : '';
        return `
            <div class="mb-2">
                <div class="flex justify-between text-xs mb-1">
                    <span class="font-medium text-gray-700">${esc(s.label)}</span>
                    <span class="tabular-nums text-gray-600"><strong class="text-gray-900">${s.value}</strong> &middot; ${share.toFixed(0)}% ${drop ? '&middot; ' + drop : ''}</span>
                </div>
                <div class="w-full bg-gray-100 rounded" style="height: 10px;">
                    <div class="rounded" style="height: 10px; width: ${share.toFixed(1)}%; background: ${i === worst ? '#dc2626' : '#2563eb'};"></div>
                </div>
            </div>`;
    }).join('');
}

function renderPaywall(rows) {
    const el = document.getElementById('usagePaywall');
    if (!rows.length) {
        el.innerHTML = '<p class="text-sm text-gray-400">The paywall hasn\'t been shown in this period.</p>';
        return;
    }
    el.innerHTML = `
        <table class="w-full text-sm">
            <thead><tr class="text-left text-xs text-gray-500 border-b"><th class="py-1">Entry point</th><th class="text-right">Shown</th><th class="text-right">Bought</th><th class="text-right">Restored</th><th class="text-right">Conversion</th></tr></thead>
            <tbody>${rows.sort((a, b) => b.shown - a.shown).map((r) => `
                <tr class="border-b border-gray-100">
                    <td class="py-1.5">${esc(r.from.replace(/_/g, ' '))}</td>
                    <td class="text-right tabular-nums">${r.shown}</td>
                    <td class="text-right tabular-nums font-semibold">${r.purchased}</td>
                    <td class="text-right tabular-nums">${r.restored}</td>
                    <td class="text-right tabular-nums">${pct(r.purchased, r.shown)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

function renderRetention(cohorts) {
    const el = document.getElementById('usageRetention');
    if (!cohorts.length) {
        el.innerHTML = '<p class="text-sm text-gray-400">No sign-up weeks in this period yet.</p>';
        return;
    }
    const maxWeeks = Math.max(...cohorts.map((c) => c.weeks.length));
    const head = Array.from({ length: maxWeeks }, (_, k) => `<th class="px-2 py-1 text-center font-medium">${k === 0 ? 'Week 1' : k + 1}</th>`).join('');
    const rows = cohorts.map((c) => {
        const cells = Array.from({ length: maxWeeks }, (_, k) => {
            const w = c.weeks[k];
            if (!w) return '<td></td>';
            const share = c.size ? w.active / c.size : 0;
            const alpha = (0.12 + share * 0.88) * (w.complete ? 1 : 0.45);
            const dark = share > 0.55 && w.complete;
            return `<td class="px-2 py-1 text-center tabular-nums" style="background: rgba(37,99,235,${alpha.toFixed(2)}); color: ${dark ? '#fff' : '#111827'};" title="${w.active} of ${c.size}${w.complete ? '' : ' (week still running)'}">${Math.round(share * 100)}%</td>`;
        }).join('');
        return `<tr class="border-b border-white"><td class="pr-3 py-1 whitespace-nowrap text-gray-700">${esc(c.cohort_week)}</td><td class="pr-3 text-right tabular-nums text-gray-500">${c.size}</td>${cells}</tr>`;
    }).join('');
    el.innerHTML = `
        <table class="text-xs">
            <thead><tr class="text-gray-500"><th class="pr-3 text-left font-medium">Signed up (week of)</th><th class="pr-3 text-right font-medium">Athletes</th>${head}</tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function renderTabs(tabs) {
    const el = document.getElementById('usageTabs');
    el.innerHTML = tabs.map((t) => `
        <div class="mb-3">
            <div class="flex justify-between text-sm mb-1"><span class="font-medium">${esc(TAB_LABELS[t.tab] || t.tab)}</span><span class="tabular-nums text-gray-600">${Math.round(t.share * 100)}%</span></div>
            <div class="w-full bg-gray-100 rounded" style="height: 10px;"><div class="rounded" style="height: 10px; width: ${(t.share * 100).toFixed(1)}%; background: #16a34a;"></div></div>
        </div>`).join('');
}

function renderEventsTable(events) {
    const el = document.getElementById('usageEvents');
    if (!events.length) {
        el.innerHTML = '<p class="text-sm text-gray-400">No events in this period yet.</p>';
        return;
    }
    el.innerHTML = `
        <table class="w-full text-sm">
            <thead class="sticky top-0 bg-white"><tr class="text-left text-xs text-gray-500 border-b"><th class="py-1">Event</th><th class="text-right">Times</th><th class="text-right">Weekly athletes</th></tr></thead>
            <tbody>${events.map((e) => `
                <tr class="usage-row border-b border-gray-100" onclick="openInExplorer('${esc(e.name)}')">
                    <td class="py-1.5 font-mono text-xs">${esc(e.name)}</td>
                    <td class="text-right tabular-nums">${e.events.toLocaleString()}</td>
                    <td class="text-right tabular-nums">${e.weekly_share > 0 ? `${Math.round(e.weekly_share * 100)}%` : '<span class="text-gray-400" title="Happens before login, so there is no athlete to count">–</span>'}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

// --- Explorer ---------------------------------------------------------------------

function fillExplorer(data) {
    const sel = document.getElementById('usageExplorerEvent');
    const current = sel.value || 'tab_viewed';
    sel.innerHTML = ['*', ...data.event_names].map((n) => `<option value="${esc(n)}">${n === '*' ? 'any event (active athletes)' : esc(n)}</option>`).join('');
    sel.value = current;
    onExplorerEventChange();
}

function onExplorerEventChange() {
    const name = document.getElementById('usageExplorerEvent').value;
    const dims = name === '*' ? ['platform', 'app_version'] : (usageData?.event_dims?.[name] || []);
    const dimSel = document.getElementById('usageExplorerDim');
    dimSel.innerHTML = [`<option value="">total</option>`, ...dims.map((d) => `<option value="${esc(d)}">by ${esc(d.replace(',', ' + '))}</option>`)].join('');
    if (dims.length) dimSel.value = dims[0];
    loadExplorer();
}

function openInExplorer(name) {
    document.getElementById('usageExplorerEvent').value = name;
    onExplorerEventChange();
    document.getElementById('usageExplorerChart').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadExplorer() {
    const name = document.getElementById('usageExplorerEvent').value;
    const dim = document.getElementById('usageExplorerDim').value;
    const chart = document.getElementById('usageExplorerChart');
    const legend = document.getElementById('usageExplorerLegend');
    try {
        const res = await fetch(`/api/admin/analytics/event?name=${encodeURIComponent(name)}&dim=${encodeURIComponent(dim)}&days=${usageDays}`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // Biggest values first; everything past the eighth is grouped as "other".
        const totals = {};
        for (const r of data.rows) totals[r.dim_value] = (totals[r.dim_value] || 0) + r.events;
        const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
        const keep = ranked.slice(0, 8);
        const series = keep.map((v, i) => ({ key: `v:${v}`, label: v || (dim ? '(not set)' : 'total'), color: USAGE_COLORS[i], total: totals[v] }));
        if (ranked.length > 8) series.push({ key: 'v:__other', label: 'other', color: USAGE_COLORS[8], total: ranked.slice(8).reduce((s, v) => s + totals[v], 0) });
        const byDay = {};
        for (const r of data.rows) {
            const d = (byDay[r.day] = byDay[r.day] || { day: r.day });
            const key = keep.includes(r.dim_value) ? `v:${r.dim_value}` : 'v:__other';
            // Active athletes are people, everything else is times pressed.
            d[key] = (d[key] || 0) + (name === '*' ? r.users : r.events);
        }
        const days = fillDays(Object.values(byDay), rangeStart(usageData), usageData.today);
        chart.innerHTML = data.rows.length ? barChartSvg(days, series) : '<p class="text-sm text-gray-400">Nothing recorded for this event in the period.</p>';
        legend.innerHTML = series.map((s) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color};margin-right:5px;"></span>${esc(s.label.replace('|', ' · '))} <span class="text-gray-400">(${(s.total || 0).toLocaleString()})</span></span>`).join('');
    } catch (err) {
        console.error(err);
        chart.innerHTML = '<p class="text-sm text-red-600">Could not load this event.</p>';
        legend.innerHTML = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (location.hash === '#usage') showAdminView('usage');
});
