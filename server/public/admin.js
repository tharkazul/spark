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
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500">No users found.</td></tr>';
        return;
    }

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition";
        
        const connections = [];
        if (u.strava_connected) connections.push('<span class="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded font-medium">Strava</span>');
        if (u.garmin_connected) connections.push('<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">Garmin</span>');
        
        const personalTokens = u.daily_token_usage || 0;
        const commonTokens = u.common_token_usage || 0;
        
        const currentLimit = u.effective_limit || 10000;
        let personalTokenClass = "text-gray-900";
        if (personalTokens >= currentLimit) personalTokenClass = "text-red-600 font-bold";
        else if (personalTokens > currentLimit * 0.8) personalTokenClass = "text-orange-500 font-semibold";

        const tier = u.subscription_tier || 'free';
        const tierSelect = `
            <select onchange="setTier('${u.username}', this.value)" class="text-xs bg-gray-50 border border-gray-200 rounded p-1">
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
            <td class="p-4 font-medium text-gray-900">${u.username}</td>
            <td class="p-4 text-gray-600">${u.login_count || 0}</td>
            <td class="p-4 text-gray-600">${u.chat_count || 0}</td>
            <td class="p-4">${tierSelect}</td>
            <td class="p-4">${clicksDisplay}</td>
            <td class="p-4">${dataReqDisplay}</td>
            <td class="p-4 ${personalTokenClass}">${personalTokens.toLocaleString()} / ${(currentLimit/1000)}k</td>
            <td class="p-4 text-gray-600">${commonTokens.toLocaleString()}</td>
            <td class="p-4">
                <div class="flex gap-1">${connections.join('') || '<span class="text-gray-400 text-xs italic">None</span>'}</div>
            </td>
            <td class="p-4 text-right flex justify-end items-center gap-4">
                <button onclick="addTokens('${u.username}')" class="text-xs bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 px-3 py-1 rounded transition">+50k Tokens</button>
                <button onclick="deleteAccount('${u.username}')" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded transition">Delete Account</button>
            </td>
        `;
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
            fetchDiscounts();
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
        case 'percent': return `${c.percentOff ?? 0}% off`;
        case 'fixed_yearly': return `${money(c.fixedYearlyPrice ?? 0)}/year`;
        case 'fixed_monthly': return `${money(c.fixedMonthlyPrice ?? 0)}/month`;
        case 'fixed_both': return `${money(c.fixedMonthlyPrice ?? 0)}/mo &middot; ${money(c.fixedYearlyPrice ?? 0)}/yr`;
        default: return '&mdash;';
    }
}

function usageLabel(c) {
    if (c.redemptionType === 'unlimited') return `Unlimited &middot; ${c.redemptionCount} used`;
    if (c.redemptionType === 'one_time') return c.redemptionCount > 0 ? 'One time &middot; used' : 'One time &middot; available';
    return `Limited &middot; ${c.redemptionCount} of ${c.maxRedemptions ?? 0} used`;
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
            : `<div class="text-xs mt-0.5 ${c.remainingUses === 0 ? 'text-red-600 font-bold' : 'text-gray-500'}">${c.remainingUses} left</div>`;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition' + (c.active ? '' : ' opacity-60');
        tr.innerHTML = `
            <td class="p-4">
                <div class="font-bold text-gray-900 tracking-wider">${esc(c.code)}</div>
                ${c.description ? `<div class="text-xs text-gray-500 mt-0.5">${esc(c.description)}</div>` : ''}
                ${c.createdBy ? `<div class="text-xs text-gray-400 mt-0.5">by ${esc(c.createdBy)}</div>` : ''}
            </td>
            <td class="p-4"><span class="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded font-semibold whitespace-nowrap">${discountEffect(c)}</span></td>
            <td class="p-4 text-gray-600 whitespace-nowrap">${c.durationMonths ? `${c.durationMonths} mo` : 'Forever'}</td>
            <td class="p-4 text-gray-600">
                <div class="whitespace-nowrap">${usageLabel(c)}</div>
                ${remaining}
                <div class="text-xs text-gray-400 mt-0.5">${c.activeHolders} on it now</div>
            </td>
            <td class="p-4 whitespace-nowrap">
                <div class="text-gray-900"><span class="text-xs text-gray-400 uppercase">mo</span> <strong>${money(p.monthly.final)}</strong>${strike(p.monthly)}</div>
                <div class="text-gray-900 mt-0.5"><span class="text-xs text-gray-400 uppercase">yr</span> <strong>${money(p.yearly.final)}</strong>${strike(p.yearly)}</div>
            </td>
            <td class="p-4">${window_}</td>
            <td class="p-4">
                <label class="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" ${c.active ? 'checked' : ''} onchange="toggleDiscountActive(${c.id})" class="w-4 h-4">
                    <span class="text-xs font-semibold ${c.active ? 'text-green-600' : 'text-gray-400'}">${c.active ? 'Active' : 'Off'}</span>
                </label>
            </td>
            <td class="p-4 text-right whitespace-nowrap">
                <button onclick="openDiscountModal(${c.id})" class="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded transition">Edit</button>
                <button onclick="deleteDiscount(${c.id})" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1 rounded transition ml-2">${c.redemptionCount > 0 ? 'Disable' : 'Delete'}</button>
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

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchUsage();
    fetchDiscounts();
});
