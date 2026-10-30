async function fetchUsage() {
    try {
        const token = localStorage.getItem('nana_token');
        if (!token) {
            showLoginModal();
            return;
        }

        const response = await fetch('/api/admin/usage', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                showLoginModal();
                return;
            }
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        const users = await response.json();
        renderTable(users);
        updateStats(users);
    } catch (err) {
        showError("Could not load user data. Are you an admin?");
        console.error(err);
    }
}

function renderTable(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="p-8 text-center text-gray-500">No users found.</td></tr>';
        return;
    }

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition";
        
        const connections = [];
        if (u.strava_connected) connections.push('<span class="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded font-medium whitespace-nowrap">Strava</span>');
        if (u.garmin_connected) connections.push('<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium whitespace-nowrap">Garmin</span>');
        if (u.suunto_connected) connections.push('<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded font-medium whitespace-nowrap">Suunto</span>');
        if (u.apple_health_connected) connections.push('<span class="bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded font-medium whitespace-nowrap">Apple Health</span>');
        if (u.apple_watch_connected) connections.push('<span class="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded font-medium whitespace-nowrap">Apple Watch</span>');
        
        const personalTokens = u.daily_token_usage || 0;
        const commonTokens = u.common_token_usage || 0;
        
        const currentLimit = u.effective_limit || 10000;
        let personalTokenClass = "text-gray-900";
        if (personalTokens >= currentLimit) personalTokenClass = "text-red-600 font-bold";
        else if (personalTokens > currentLimit * 0.8) personalTokenClass = "text-orange-500 font-semibold";

        const tier = u.subscription_tier || 'free';
        const tierSelect = `
            <select data-action="set-tier" class="text-xs bg-gray-50 border border-gray-200 rounded p-1">
                <option value="free" ${tier === 'free' ? 'selected' : ''}>Free</option>
                <option value="rooka_plus" ${tier === 'rooka_plus' ? 'selected' : ''}>Rooka+</option>
                <option value="premium" ${tier === 'premium' ? 'selected' : ''}>Premium</option>
                <option value="admin" ${tier === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
        `;

        const clicks = u.rooka_plus_clicks || 0;
        const clicksDisplay = clicks > 0 ? `<span class="text-green-600 font-bold">${clicks} <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></span>` : '<span class="text-gray-400">0</span>';

        const dataReq = u.data_request_clicks || 0;
        const dataReqDisplay = dataReq > 0 ? `<span class="text-blue-600 font-bold flex items-center gap-1">${dataReq} <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></span>` : '<span class="text-gray-400">0</span>';

        tr.innerHTML = `
            <td class="p-4 text-gray-500 tabular-nums">${esc(u.id)}</td>
            <td class="p-4 font-medium text-gray-900">${esc(u.username)}</td>
            <td class="p-4 text-gray-600">${esc(u.login_count || 0)}</td>
            <td class="p-4 text-gray-600">${esc(u.chat_count || 0)}</td>
            <td class="p-4">${tierSelect}</td>
            <td class="p-4">${clicksDisplay}</td>
            <td class="p-4">${dataReqDisplay}</td>
            <td class="p-4 ${personalTokenClass}">${personalTokens.toLocaleString()} / ${(currentLimit/1000)}k</td>
            <td class="p-4 text-gray-600">${commonTokens.toLocaleString()}</td>
            <td class="p-4">
                <div class="flex flex-wrap gap-1">${connections.join('') || '<span class="text-gray-400 text-xs italic">None</span>'}</div>
            </td>
            <td class="p-4 text-right flex justify-end items-center gap-4">
                <button type="button" data-action="add-tokens" class="text-xs bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 px-3 py-1 rounded transition">+50k Tokens</button>
                <button type="button" data-action="delete-account" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded transition">Delete Account</button>
            </td>
        `;
        // Usernames are user-chosen, so they are bound here rather than spliced into inline handlers.
        tr.querySelector('[data-action="set-tier"]').addEventListener('change', (e) => setTier(u.username, e.target.value));
        tr.querySelector('[data-action="add-tokens"]').addEventListener('click', () => addTokens(u.username));
        tr.querySelector('[data-action="delete-account"]').addEventListener('click', () => deleteAccount(u.username));
        tbody.appendChild(tr);
    });
}

function updateStats(users) {
    document.getElementById('statTotalUsers').innerText = users.length;
    
    const totalPersonal = users.reduce((sum, u) => sum + (u.daily_token_usage || 0), 0);
    const totalCommon = users.reduce((sum, u) => sum + (u.common_token_usage || 0), 0);
    
    document.getElementById('statPersonalTokens').innerText = totalPersonal.toLocaleString();
    document.getElementById('statCommonTokens').innerText = totalCommon.toLocaleString();
}

async function setTier(username, tier) {
    if (!confirm(`Change tier for ${username} to ${tier}?`)) {
        fetchUsage(); // Reset dropdown
        return;
    }

    try {
        const response = await fetch('/api/admin/set-tier', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nana_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUsername: username, tier: tier })
        });

        const data = await response.json();
        if (response.ok) {
            fetchUsage();
        } else {
            showError(data.error || "Failed to set tier.");
        }
    } catch (err) {
        showError("Network error occurred.");
    }
}

async function addTokens(username) {
    if (!confirm(`Are you sure you want to add an extra 50k tokens to the daily limit for ${username}?`)) return;

    try {
        const response = await fetch('/api/admin/add-tokens', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nana_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUsername: username })
        });

        const data = await response.json();
        if (response.ok) {
            fetchUsage();
        } else {
            showError(data.error || "Failed to add tokens.");
        }
    } catch (err) {
        showError("Network error occurred.");
    }
}

async function deleteAccount(username) {
    const confirmation = prompt(`CRITICAL WARNING: Are you absolutely sure you want to delete the account for ${username}? Type 'DELETE' to confirm.`);
    if (confirmation !== 'DELETE') {
        alert('Deletion cancelled.');
        return;
    }

    try {
        const response = await fetch(`/api/admin/delete-user/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nana_token')}`
            }
        });

        const data = await response.json();
        if (response.ok) {
            fetchUsage(); // Refresh the table
        } else {
            showError(data.error || "Failed to delete account.");
        }
    } catch (err) {
        showError("Network error occurred.");
    }
}

function showError(msg) {
    const toast = document.getElementById('errorToast');
    document.getElementById('errorMsg').innerText = msg;
    toast.classList.remove('opacity-0');
    toast.classList.remove('pointer-events-none');
    
    setTimeout(() => {
        toast.classList.add('opacity-0');
        toast.classList.add('pointer-events-none');
    }, 4000);
}

function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginError');
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    
    err.classList.add('hidden');
    btn.disabled = true;
    btn.innerText = 'Logging in...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('nana_token', data.token);
            document.getElementById('loginModal').classList.add('hidden');
            fetchUsage();
            fetchTokenStats();
            fetchDiscounts();
            fetchLiveSessions();
        } else {
            err.innerText = data.error || 'Login failed';
            err.classList.remove('hidden');
        }
    } catch (error) {
        err.innerText = 'Network error';
        err.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Sign In';
    }
});

/* ===========================================================================
 * Discount codes
 *
 * A code is three independent choices: what it does to the price
 * (percent / fixed yearly / fixed monthly / fixed both), how long it keeps
 * doing it (forever or X months), and how many athletes may redeem it
 * (one time / limited / unlimited).
 *
 * Every price shown here is computed by the server (server/services/pricing.js)
 * and returned with each code, so this table shows exactly what the athlete
 * will be charged rather than a second copy of the same arithmetic.
 * ======================================================================== */

let discountBasePricing = { currency: '€', monthly: 6.99, yearly: 69.99 };

function authHeaders(json) {
    const h = { 'Authorization': `Bearer ${localStorage.getItem('nana_token')}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function money(amount) {
    return `${discountBasePricing.currency}${Number(amount).toFixed(2)}`;
}

function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** What the code does to the price, in words. */
function discountEffect(c) {
    switch (c.discountType) {
        case 'percent': return `${esc(c.percentOff ?? 0)}% off`;
        case 'fixed_yearly': return `${money(c.fixedYearlyPrice ?? 0)}/year`;
        case 'fixed_monthly': return `${money(c.fixedMonthlyPrice ?? 0)}/month`;
        case 'fixed_both': return `${money(c.fixedMonthlyPrice ?? 0)}/mo &middot; ${money(c.fixedYearlyPrice ?? 0)}/yr`;
        default: return '&mdash;';
    }
}

function usageLabel(c) {
    if (c.redemptionType === 'unlimited') return `Unlimited &middot; ${esc(c.redemptionCount)} used`;
    if (c.redemptionType === 'one_time') return c.redemptionCount > 0 ? 'One time &middot; used' : 'One time &middot; available';
    return `Limited &middot; ${esc(c.redemptionCount)} of ${esc(c.maxRedemptions ?? 0)} used`;
}

/**
 * Puts the discount table into a terminal state.
 *
 * The table must never be left showing its "Loading…" placeholder. The error
 * toast fades after four seconds, so a failed load that only toasted was
 * indistinguishable from a request that never came back — it just read as
 * "forever loading".
 */
function showDiscountMessage(message, options) {
    const { summary, isError = false, retry = false } = options || {};
    document.getElementById('discountSummary').innerText = summary || (isError ? 'Could not load codes' : '');
    document.getElementById('discountTableBody').innerHTML = `
        <tr><td colspan="8" class="p-8 text-center ${isError ? 'text-red-600' : 'text-gray-400'}">
            <div>${esc(message)}</div>
            ${retry ? '<button onclick="fetchDiscounts()" class="mt-3 text-sm bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 shadow-sm transition">&#8635; Try again</button>' : ''}
        </td></tr>`;
}

/** Says what actually went wrong, so a stuck table is self-diagnosing. */
function discountFailureDetail(status, serverMessage) {
    if (!status) return 'Could not reach the server.';
    if (status === 404) {
        return 'This server has no /api/admin/discounts endpoint — it is probably running a build from before discount codes were added, and needs a restart or redeploy.';
    }
    if (serverMessage) return `${serverMessage} (HTTP ${status})`;
    return `The server returned HTTP ${status}.`;
}

async function fetchDiscounts() {
    const token = localStorage.getItem('nana_token');
    if (!token) {
        showLoginModal();
        showDiscountMessage('Sign in as an admin to manage discount codes.', { summary: 'Not signed in' });
        return;
    }

    let response;
    try {
        response = await fetch('/api/admin/discounts', { headers: authHeaders() });
    } catch (err) {
        console.error('Discount fetch failed:', err);
        const detail = discountFailureDetail(0);
        showError(`Could not load discount codes. ${detail}`);
        showDiscountMessage(detail, { isError: true, retry: true });
        return;
    }

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            showLoginModal();
            showDiscountMessage('Sign in as an admin to manage discount codes.', { summary: 'Not signed in' });
            return;
        }
        let serverMessage = '';
        try { serverMessage = (await response.json()).error || ''; } catch (_) { /* not JSON */ }
        const detail = discountFailureDetail(response.status, serverMessage);
        console.error('Discount fetch failed:', response.status, serverMessage);
        showError(`Could not load discount codes. ${detail}`);
        showDiscountMessage(detail, { isError: true, retry: true });
        return;
    }

    try {
        const data = await response.json();
        if (data.basePricing) {
            discountBasePricing = data.basePricing;
            document.querySelectorAll('.dc-base-monthly').forEach((el) => { el.innerText = money(discountBasePricing.monthly); });
            document.querySelectorAll('.dc-base-yearly').forEach((el) => { el.innerText = money(discountBasePricing.yearly); });
        }
        renderDiscountTable(data.codes || []);
    } catch (err) {
        console.error('Discount response was not valid JSON:', err);
        showError('Could not load discount codes.');
        showDiscountMessage('The server sent a response this page could not read.', { isError: true, retry: true });
    }
}

function renderDiscountTable(codes) {
    window.__discountCodes = codes;
    const tbody = document.getElementById('discountTableBody');
    const summary = document.getElementById('discountSummary');
    const activeCount = codes.filter((c) => c.active).length;
    summary.innerText = codes.length
        ? `${codes.length} code${codes.length === 1 ? '' : 's'} · ${activeCount} active · list price ${money(discountBasePricing.monthly)}/mo, ${money(discountBasePricing.yearly)}/yr`
        : `No codes yet · list price ${money(discountBasePricing.monthly)}/mo, ${money(discountBasePricing.yearly)}/yr`;

    tbody.innerHTML = '';
    if (!codes.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-gray-400">No discount codes yet. Create one to offer a percentage off, a fixed price, or a limited-time deal.</td></tr>';
        return;
    }

    codes.forEach((c) => {
        const p = c.pricing;
        const strike = (plan) => plan.discounted
            ? ` <span class="text-gray-400 line-through text-xs">${money(plan.original)}</span>`
            : '';

        const from = formatDate(c.validFrom);
        const until = formatDate(c.validUntil);
        let window_ = '<span class="text-gray-400 text-xs">Always</span>';
        if (from || until) {
            window_ = `<span class="text-xs text-gray-600">${from ? esc(from) : 'now'} &rarr; ${until ? esc(until) : '&infin;'}</span>`;
        }

        const remaining = c.remainingUses === null
            ? ''
            : `<div class="text-xs mt-0.5 ${c.remainingUses === 0 ? 'text-red-600 font-bold' : 'text-gray-500'}">${esc(c.remainingUses)} left</div>`;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition' + (c.active ? '' : ' opacity-60');
        tr.innerHTML = `
            <td class="p-4">
                <div class="font-bold text-gray-900 tracking-wider">${esc(c.code)}</div>
                ${c.description ? `<div class="text-xs text-gray-500 mt-0.5">${esc(c.description)}</div>` : ''}
                ${c.createdBy ? `<div class="text-xs text-gray-400 mt-0.5">by ${esc(c.createdBy)}</div>` : ''}
            </td>
            <td class="p-4"><span class="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded font-semibold whitespace-nowrap">${discountEffect(c)}</span></td>
            <td class="p-4 text-gray-600 whitespace-nowrap">${c.durationMonths ? `${esc(c.durationMonths)} mo` : 'Forever'}</td>
            <td class="p-4 text-gray-600">
                <div class="whitespace-nowrap">${usageLabel(c)}</div>
                ${remaining}
                <div class="text-xs text-gray-400 mt-0.5">${esc(c.activeHolders)} on it now</div>
            </td>
            <td class="p-4 whitespace-nowrap">
                <div class="text-gray-900"><span class="text-xs text-gray-400 uppercase">mo</span> <strong>${money(p.monthly.final)}</strong>${strike(p.monthly)}</div>
                <div class="text-gray-900 mt-0.5"><span class="text-xs text-gray-400 uppercase">yr</span> <strong>${money(p.yearly.final)}</strong>${strike(p.yearly)}</div>
            </td>
            <td class="p-4">${window_}</td>
            <td class="p-4">
                <label class="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" ${c.active ? 'checked' : ''} onchange="toggleDiscountActive(${Number(c.id)})" class="w-4 h-4">
                    <span class="text-xs font-semibold ${c.active ? 'text-green-600' : 'text-gray-400'}">${c.active ? 'Active' : 'Off'}</span>
                </label>
            </td>
            <td class="p-4 text-right whitespace-nowrap">
                <button onclick="openDiscountModal(${Number(c.id)})" class="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded transition">Edit</button>
                <button onclick="deleteDiscount(${Number(c.id)})" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded transition ml-2">${c.redemptionCount > 0 ? 'Disable' : 'Delete'}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/* --- form ---------------------------------------------------------------- */

function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
}

function getRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
}

/** Only the inputs the chosen type/duration/usage actually needs stay visible. */
function syncDiscountForm() {
    const type = getRadio('dcType');
    document.getElementById('dcPercentWrap').classList.toggle('hidden', type !== 'percent');
    document.getElementById('dcMonthlyWrap').classList.toggle('hidden', !(type === 'fixed_monthly' || type === 'fixed_both'));
    document.getElementById('dcYearlyWrap').classList.toggle('hidden', !(type === 'fixed_yearly' || type === 'fixed_both'));

    const forMonths = getRadio('dcDur') === 'months';
    document.getElementById('dcMonthsWrap').classList.toggle('hidden', !forMonths);
    document.getElementById('dcForeverNote').classList.toggle('hidden', forMonths);

    const use = getRadio('dcUse');
    document.getElementById('dcMaxWrap').classList.toggle('hidden', use !== 'limited');
    const note = document.getElementById('dcUseNote');
    note.classList.toggle('hidden', use === 'limited');
    note.innerText = use === 'one_time'
        ? 'Exactly one athlete can ever redeem this code.'
        : 'Any number of athletes can redeem this code.';
}

function openDiscountModal(id) {
    const code = id != null ? (window.__discountCodes || []).find((c) => c.id === id) : null;

    document.getElementById('dcError').classList.add('hidden');
    document.getElementById('dcId').value = code ? code.id : '';
    document.getElementById('dcCode').value = code ? code.code : '';
    document.getElementById('dcDescription').value = code && code.description ? code.description : '';
    document.getElementById('dcPercentOff').value = code && code.percentOff != null ? code.percentOff : '';
    document.getElementById('dcFixedMonthly').value = code && code.fixedMonthlyPrice != null ? code.fixedMonthlyPrice : '';
    document.getElementById('dcFixedYearly').value = code && code.fixedYearlyPrice != null ? code.fixedYearlyPrice : '';
    document.getElementById('dcDurationMonths').value = code && code.durationMonths != null ? code.durationMonths : '';
    document.getElementById('dcMaxRedemptions').value = code && code.maxRedemptions != null ? code.maxRedemptions : '';
    document.getElementById('dcValidFrom').value = code && code.validFrom ? code.validFrom.slice(0, 10) : '';
    document.getElementById('dcValidUntil').value = code && code.validUntil ? code.validUntil.slice(0, 10) : '';
    document.getElementById('dcActive').checked = code ? !!code.active : true;

    setRadio('dcType', code ? code.discountType : 'percent');
    setRadio('dcDur', code && code.durationMonths ? 'months' : 'forever');
    setRadio('dcUse', code ? code.redemptionType : 'unlimited');
    syncDiscountForm();

    document.getElementById('discountModalTitle').innerText = code ? `Edit ${code.code}` : 'New Discount Code';
    document.getElementById('dcSaveBtn').innerText = code ? 'Save Changes' : 'Create Code';
    document.getElementById('discountModal').classList.remove('hidden');
}

function closeDiscountModal() {
    document.getElementById('discountModal').classList.add('hidden');
}

/** Blank must travel as null, not 0 — 0 is a legitimate fixed price. */
function numOrNull(id) {
    const v = document.getElementById(id).value.trim();
    if (!v) return null;
    const n = Number(v.replace(',', '.'));
    return isNaN(n) ? null : n;
}

async function saveDiscount(e) {
    e.preventDefault();
    const id = document.getElementById('dcId').value;
    const err = document.getElementById('dcError');
    const btn = document.getElementById('dcSaveBtn');
    const original = btn.innerText;

    const payload = {
        code: document.getElementById('dcCode').value.trim().toUpperCase().replace(/\s+/g, ''),
        description: document.getElementById('dcDescription').value.trim() || null,
        discountType: getRadio('dcType'),
        percentOff: numOrNull('dcPercentOff'),
        fixedMonthlyPrice: numOrNull('dcFixedMonthly'),
        fixedYearlyPrice: numOrNull('dcFixedYearly'),
        durationMonths: getRadio('dcDur') === 'months' ? numOrNull('dcDurationMonths') : null,
        redemptionType: getRadio('dcUse'),
        maxRedemptions: getRadio('dcUse') === 'limited' ? numOrNull('dcMaxRedemptions') : null,
        validFrom: document.getElementById('dcValidFrom').value || null,
        validUntil: document.getElementById('dcValidUntil').value || null,
        active: document.getElementById('dcActive').checked,
    };

    err.classList.add('hidden');
    btn.disabled = true;
    btn.innerText = 'Saving…';

    try {
        const response = await fetch(id ? `/api/admin/discounts/${id}` : '/api/admin/discounts', {
            method: id ? 'PUT' : 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok) {
            closeDiscountModal();
            fetchDiscounts();
        } else {
            // The server is the authority on what a valid code is, so show its
            // message rather than re-implementing the rules here.
            err.innerText = data.error || 'Could not save this code.';
            err.classList.remove('hidden');
        }
    } catch (_) {
        err.innerText = 'Network error occurred.';
        err.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerText = original;
    }
}

async function toggleDiscountActive(id) {
    const code = (window.__discountCodes || []).find((c) => c.id === id);
    if (!code) return;

    try {
        const response = await fetch(`/api/admin/discounts/${id}`, {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify({
                code: code.code,
                description: code.description,
                discountType: code.discountType,
                percentOff: code.percentOff,
                fixedMonthlyPrice: code.fixedMonthlyPrice,
                fixedYearlyPrice: code.fixedYearlyPrice,
                durationMonths: code.durationMonths,
                redemptionType: code.redemptionType,
                maxRedemptions: code.maxRedemptions,
                validFrom: code.validFrom,
                validUntil: code.validUntil,
                active: !code.active,
            }),
        });
        const data = await response.json();
        if (!response.ok) showError(data.error || 'Failed to update the code.');
        fetchDiscounts();
    } catch (_) {
        showError('Network error occurred.');
        fetchDiscounts();
    }
}

async function deleteDiscount(id) {
    const code = (window.__discountCodes || []).find((c) => c.id === id);
    if (!code) return;

    // A redeemed code cannot be deleted without orphaning the athletes on it,
    // so the server deactivates it instead. Say which will happen up front.
    const redeemed = code.redemptionCount > 0;
    const message = redeemed
        ? `${code.code} has ${code.redemptionCount} redemption(s), so it cannot be deleted. It will be switched off instead — including for the ${code.activeHolders} athlete(s) currently on it, who go back to full price.\n\nContinue?`
        : `${code.code} has never been redeemed and will be permanently removed.\n\nContinue?`;
    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/admin/discounts/${id}`, { method: 'DELETE', headers: authHeaders() });
        const data = await response.json();
        if (response.ok) {
            if (!data.deleted) showError(data.message);
            fetchDiscounts();
        } else {
            showError(data.error || 'Failed to remove the code.');
        }
    } catch (_) {
        showError('Network error occurred.');
    }
}

document.getElementById('discountForm')?.addEventListener('submit', saveDiscount);
document.getElementById('discountModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'discountModal') closeDiscountModal();
});
['dcType', 'dcDur', 'dcUse'].forEach((name) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
        el.addEventListener('change', syncDiscountForm);
    });
});

async function triggerWeeklyPlanning() {
    if (!confirm('Run the Sunday weekly workout planning job for all accounts now? This will generate Monday-Sunday schedules on the Common token budget.')) {
        return;
    }
    const token = localStorage.getItem('nana_token');
    if (!token) return showLoginModal();

    try {
        const res = await fetch('/api/admin/trigger-weekly-planning', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        if (res.ok) {
            alert(`Weekly planning job triggered successfully!\nProcessed: ${data.summary?.total || 0} accounts\nTarget week: ${data.summary?.targetDates?.[0]} to ${data.summary?.targetDates?.[6]}`);
            fetchUsage();
        } else {
            alert(`Failed: ${data.error || 'Unknown error'}`);
        }
    } catch (e) {
        alert(`Error triggering weekly planning: ${e.message}`);
    }
}

/* ===========================================================================
 * Live coaching: sessions the server is following through Garmin LiveTrack.
 * ======================================================================== */

let liveRefreshTimer = null;

function showLiveMessage(text, isError) {
    const el = document.getElementById('liveMessage');
    el.textContent = text;
    el.classList.remove('hidden', 'text-gray-500', 'text-red-600');
    el.classList.add(isError ? 'text-red-600' : 'text-gray-500');
}

function livePace(speed) {
    if (!speed || speed <= 0) return null;
    const s = Math.round(1000 / speed);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`;
}

function liveLatest(m) {
    if (!m) return '<span class="text-gray-400">—</span>';
    const parts = [];
    if (m.durationSecs) parts.push(`${Math.round(m.durationSecs / 60)} min`);
    if (m.distanceMeters) parts.push(`${(m.distanceMeters / 1000).toFixed(2)} km`);
    const pace = livePace(m.speed);
    if (pace) parts.push(pace);
    if (m.hr) parts.push(`♥ ${m.hr}`);
    if (m.power) parts.push(`${m.power} W`);
    return `${esc(parts.join(' · '))}<div class="text-xs text-gray-400">${esc(new Date(m.at).toLocaleTimeString())}</div>`;
}

function liveStatusBadge(s) {
    const color = {
        active: 'bg-green-50 text-green-600 border-green-200',
        waiting: 'bg-blue-50 text-blue-600 border-blue-200',
        error: 'bg-red-50 text-red-600 border-red-200',
    }[s.status] || 'bg-gray-50 text-gray-600 border-gray-200';
    const label = s.status === 'waiting' ? 'waiting for GPS' : s.status;
    return `<span class="text-xs border px-2 py-0.5 rounded ${color}">${esc(label)}</span>${s.error ? `<div class="text-xs text-red-600 mt-1">${esc(s.error)}</div>` : ''}`;
}

function renderLiveTable(sessions) {
    const tbody = document.getElementById('liveTableBody');
    const running = sessions.filter((s) => s.status === 'active' || s.status === 'waiting');
    document.getElementById('liveSummary').textContent =
        `${running.length} running · ${sessions.length} recent`;
    if (!sessions.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-400">No live sessions yet. Paste a LiveTrack link above to start one.</td></tr>';
        return;
    }
    tbody.innerHTML = sessions.map((s) => {
        const cues = s.cues || [];
        const cueList = cues.length
            ? `<details><summary class="cursor-pointer">${cues.length} cue${cues.length === 1 ? '' : 's'}</summary><ul class="mt-1 space-y-1">${cues.map((c) =>
                `<li><span class="text-gray-400">${esc(new Date(c.sentAt || c.at).toLocaleTimeString())}</span> ${esc(c.body)}</li>`).join('')}</ul></details>`
            : '<span class="text-gray-400">none</span>';
        const workout = s.workout_name
            ? esc(s.workout_name)
            : `<span class="text-gray-400">${s.sport ? `${esc(s.sport)}, no plan today` : '—'}</span>`;
        const canStop = s.status === 'active' || s.status === 'waiting';
        return `<tr class="hover:bg-gray-50 transition align-top">
            <td class="p-4 text-gray-500 tabular-nums">${esc(s.id)}</td>
            <td class="p-4 font-medium text-gray-900">${esc(s.username || `#${s.user_id}`)}<div class="text-xs text-gray-400">${esc(s.source || '')}</div></td>
            <td class="p-4">${liveStatusBadge(s)}</td>
            <td class="p-4 text-gray-600">${workout}</td>
            <td class="p-4 text-gray-600">${liveLatest(s.last_metrics)}</td>
            <td class="p-4 text-gray-600">${cueList}</td>
            <td class="p-4 text-right">${canStop
                ? `<button onclick="stopLiveSession(${Number(s.id)})" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded transition">Stop</button>`
                : ''}</td>
        </tr>`;
    }).join('');
}

async function fetchLiveSessions() {
    clearTimeout(liveRefreshTimer);
    try {
        const response = await fetch('/api/admin/live-sessions', { headers: authHeaders() });
        if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
        const sessions = await response.json();
        renderLiveTable(sessions);
        // Follow running sessions without a manual refresh.
        if (sessions.some((s) => s.status === 'active' || s.status === 'waiting')) {
            liveRefreshTimer = setTimeout(fetchLiveSessions, 15000);
        }
    } catch (e) {
        document.getElementById('liveSummary').textContent = 'Could not load live sessions.';
        console.error(e);
    }
}

async function startLiveSession(e) {
    e.preventDefault();
    const userId = Number(document.getElementById('liveUserId').value);
    const url = document.getElementById('liveUrl').value.trim();
    if (!url) return showLiveMessage('Paste a LiveTrack link first.', true);
    showLiveMessage('Starting…');
    try {
        const response = await fetch('/api/admin/live-sessions', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ userId, url }),
        });
        const data = await response.json();
        if (!response.ok) return showLiveMessage(data.error || `Failed (${response.status})`, true);
        showLiveMessage(`Session ${data.id} is ${data.status === 'waiting' ? 'waiting for the first GPS point' : data.status}.`);
        document.getElementById('liveUrl').value = '';
        fetchLiveSessions();
    } catch (err) {
        showLiveMessage(err.message, true);
    }
}

async function stopLiveSession(id) {
    if (!confirm(`Stop live coaching for session ${id}?`)) return;
    const response = await fetch(`/api/admin/live-sessions/${id}/stop`, { method: 'POST', headers: authHeaders() });
    if (!response.ok) alert(`Failed to stop session ${id}`);
    fetchLiveSessions();
}

async function showLiveAddress() {
    const userId = Number(document.getElementById('liveUserId').value);
    if (!userId) return showLiveMessage('Enter a user ID first.', true);
    const response = await fetch(`/api/admin/live-coach/address/${userId}`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) return showLiveMessage(data.error || `Failed (${response.status})`, true);
    showLiveMessage(`LiveTrack address for user ${userId}: ${data.address}`);
}

/* ===========================================================================
 * Token Usage: Paid vs. Free (Cached) Graph
 * ======================================================================== */

let currentTokenRangeDays = 30;
let lastTokenStatsDays = [];

function compactTokens(n) {
    const val = Number(n) || 0;
    if (val >= 1000000) return `${(val / 1000000).toFixed(2).replace(/\.00$/, '')}M`;
    if (val >= 10000) return `${Math.round(val / 1000)}k`;
    if (val >= 1000) return `${(val / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return val.toLocaleString();
}

function setTokenStatsRange(days) {
    currentTokenRangeDays = days;
    document.querySelectorAll('#tokenRangeBtns .range-btn').forEach((btn) => {
        btn.classList.toggle('active', Number(btn.getAttribute('data-days')) === days);
    });
    document.querySelectorAll('.token-range-label').forEach((el) => {
        el.textContent = `${days}d`;
    });
    fetchTokenStats();
}

async function fetchTokenStats() {
    const token = localStorage.getItem('nana_token');
    if (!token) return;

    try {
        const response = await fetch(`/api/admin/token-stats?days=${currentTokenRangeDays}`, {
            headers: authHeaders()
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        renderTokenStats(data);
    } catch (e) {
        console.error('Could not load token stats:', e);
        const container = document.getElementById('tokenChartContainer');
        if (container) {
            container.innerHTML = '<div class="p-8 text-center text-red-600 text-sm">Could not load token usage chart.</div>';
        }
    }
}

function renderTokenStats(data) {
    const today = data?.today || { total_tokens: 0, paid_tokens: 0, free_tokens: 0, request_count: 0, cache_hit_count: 0, savings_pct: 0 };
    const totals = data?.totals || { total_tokens: 0, paid_tokens: 0, free_tokens: 0, request_count: 0, cache_hit_count: 0, savings_pct: 0 };
    const days = Array.isArray(data?.days) ? data.days : [];
    lastTokenStatsDays = days;

    // 1. Today's Live Breakdown Bar
    const todayTotal = today.total_tokens || 0;
    const paidPct = todayTotal > 0 ? Math.max(0, Math.min(100, (today.paid_tokens / todayTotal) * 100)) : 0;
    const freePct = todayTotal > 0 ? Math.max(0, Math.min(100 - paidPct, (today.free_tokens / todayTotal) * 100)) : 0;

    const barPaid = document.getElementById('tokenTodayBarPaid');
    const barFree = document.getElementById('tokenTodayBarFree');
    if (barPaid) barPaid.style.width = `${paidPct.toFixed(1)}%`;
    if (barFree) barFree.style.width = `${freePct.toFixed(1)}%`;

    const elTodayPaid = document.getElementById('tokenTodayPaid');
    const elTodayFree = document.getElementById('tokenTodayFree');
    const elTodaySummary = document.getElementById('tokenTodaySummary');
    const elTodayMeta = document.getElementById('tokenTodayMeta');

    if (elTodayPaid) elTodayPaid.textContent = (today.paid_tokens || 0).toLocaleString();
    if (elTodayFree) elTodayFree.textContent = (today.free_tokens || 0).toLocaleString();
    if (elTodaySummary) {
        elTodaySummary.innerHTML = todayTotal > 0
            ? `<span class="text-gray-900">${todayTotal.toLocaleString()} total</span> &middot; <span class="text-blue-600">${paidPct.toFixed(1)}% paid</span> / <span class="text-green-600">${freePct.toFixed(1)}% free</span>`
            : `<span class="text-gray-400">No tokens recorded yet today</span>`;
    }
    if (elTodayMeta) {
        const hitRate = today.request_count > 0 ? Math.round((today.cache_hit_count / today.request_count) * 100) : 0;
        elTodayMeta.innerHTML = `${(today.request_count || 0).toLocaleString()} AI calls (${hitRate}% cache hit) &middot; <strong>${today.savings_pct || 0}%</strong> saved today`;
    }

    // 2. Period Summary Cards
    const elPeriodPaid = document.getElementById('tokenPeriodPaid');
    const elPeriodFree = document.getElementById('tokenPeriodFree');
    const elPeriodSavings = document.getElementById('tokenPeriodSavings');
    const elPeriodPaidSub = document.getElementById('tokenPeriodPaidSub');
    const elPeriodFreeSub = document.getElementById('tokenPeriodFreeSub');
    const elPeriodReqSub = document.getElementById('tokenPeriodRequestsSub');

    if (elPeriodPaid) elPeriodPaid.textContent = (totals.paid_tokens || 0).toLocaleString();
    if (elPeriodFree) elPeriodFree.textContent = (totals.free_tokens || 0).toLocaleString();
    if (elPeriodSavings) elPeriodSavings.textContent = `${totals.savings_pct || 0}%`;
    if (elPeriodPaidSub) elPeriodPaidSub.textContent = `Out of ${(totals.total_tokens || 0).toLocaleString()} total tokens processed`;
    if (elPeriodFreeSub) elPeriodFreeSub.textContent = `${(totals.cached_tokens || 0).toLocaleString()} cached input tokens (90% off)`;
    if (elPeriodReqSub) {
        const periodHitRate = totals.request_count > 0 ? Math.round((totals.cache_hit_count / totals.request_count) * 100) : 0;
        elPeriodReqSub.textContent = `${(totals.request_count || 0).toLocaleString()} AI calls (${periodHitRate}% hit cache)`;
    }

    // 3. Daily Stacked Bar Chart (SVG)
    const container = document.getElementById('tokenChartContainer');
    if (!container) return;

    const maxTotal = Math.max(1000, ...days.map((d) => d.total_tokens || 0));
    const svgWidth = 920;
    const svgHeight = 250;
    const padLeft = 56;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 36;
    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    const n = Math.max(1, days.length);
    const slotWidth = plotWidth / n;
    const barWidth = Math.max(3, Math.min(28, Math.floor(slotWidth * 0.72)));

    // Horizontal grid lines (0%, 25%, 50%, 75%, 100%)
    const gridSteps = [0, 0.25, 0.5, 0.75, 1];
    const gridSvg = gridSteps.map((step) => {
        const y = padTop + plotHeight * (1 - step);
        const val = Math.round(maxTotal * step);
        return `
            <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${svgWidth - padRight}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-dasharray="${step === 0 ? 'none' : '3,3'}" stroke-width="1" />
            <text x="${padLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="11">${compactTokens(val)}</text>
        `;
    }).join('');

    const labelStep = n <= 10 ? 1 : n <= 35 ? 3 : 10;

    const barsSvg = days.map((d, i) => {
        const xCenter = padLeft + i * slotWidth + slotWidth / 2;
        const x = xCenter - barWidth / 2;
        const paid = d.paid_tokens || 0;
        const free = d.free_tokens || 0;
        const total = paid + free;

        const paidH = total > 0 ? (paid / maxTotal) * plotHeight : 0;
        const freeH = total > 0 ? (free / maxTotal) * plotHeight : 0;

        const yPaid = padTop + plotHeight - paidH;
        const yFree = yPaid - freeH;

        const shortDate = d.date ? d.date.slice(5) : ''; // MM-DD
        const showLabel = i === n - 1 || i === 0 || (n - 1 - i) % labelStep === 0;
        const savingsPct = total > 0 ? ((free / total) * 100).toFixed(1) : '0.0';
        const tooltip = `${d.date}: Total ${total.toLocaleString()} | Paid ${paid.toLocaleString()} | Free (Cached) ${free.toLocaleString()} (${savingsPct}% saved)`;

        return `
            <g class="token-bar-group cursor-pointer" onmouseenter="showTokenDayHover(${i})" onclick="showTokenDayHover(${i})">
                <title>${esc(tooltip)}</title>
                <rect x="${(xCenter - slotWidth / 2).toFixed(1)}" y="${padTop}" width="${slotWidth.toFixed(1)}" height="${plotHeight}" fill="transparent" />
                ${total === 0
                    ? `<rect x="${x.toFixed(1)}" y="${(padTop + plotHeight - 2).toFixed(1)}" width="${barWidth}" height="2" fill="#d1d5db" rx="1" />`
                    : `
                        ${paidH > 0 ? `<rect x="${x.toFixed(1)}" y="${yPaid.toFixed(1)}" width="${barWidth}" height="${Math.max(1.5, paidH).toFixed(1)}" fill="#2563eb" rx="1.5" />` : ''}
                        ${freeH > 0 ? `<rect x="${x.toFixed(1)}" y="${yFree.toFixed(1)}" width="${barWidth}" height="${Math.max(1.5, freeH).toFixed(1)}" fill="#16a34a" rx="1.5" />` : ''}
                    `
                }
                ${showLabel ? `<text x="${xCenter.toFixed(1)}" y="${svgHeight - 12}" text-anchor="middle" fill="#6b7280" font-size="10">${esc(shortDate)}</text>` : ''}
            </g>
        `;
    }).join('');

    container.innerHTML = `
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="w-full" style="min-width: 580px; height: auto; display: block;">
            ${gridSvg}
            ${barsSvg}
        </svg>
    `;
}

function showTokenDayHover(index) {
    const d = lastTokenStatsDays[index];
    const info = document.getElementById('tokenChartHoverInfo');
    if (!d || !info) return;
    const total = (d.paid_tokens || 0) + (d.free_tokens || 0);
    const savingsPct = total > 0 ? ((d.free_tokens / total) * 100).toFixed(1) : '0.0';
    info.innerHTML = `<strong>${esc(d.date)}</strong> &mdash; Total: <strong class="text-gray-900">${total.toLocaleString()}</strong> &middot; <span class="text-blue-600 font-semibold">Paid: ${(d.paid_tokens || 0).toLocaleString()}</span> &middot; <span class="text-green-600 font-semibold">Free (Cached): ${(d.free_tokens || 0).toLocaleString()}</span> (${savingsPct}% saved across ${(d.request_count || 0).toLocaleString()} calls)`;
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchUsage();
    fetchTokenStats();
    fetchDiscounts();
    fetchLiveSessions();
});
