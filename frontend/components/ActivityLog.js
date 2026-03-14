import { listEvidence } from './ApiService.js';

const activityList = document.querySelector('#activityList');
const btnRefreshActivity = document.querySelector('#btnRefreshActivity');

export async function initActivityLog() {
    if (!activityList || !btnRefreshActivity) return;

    await fetchAndRenderActivity();

    btnRefreshActivity.addEventListener('click', async () => {
        const svg = btnRefreshActivity.querySelector('svg');
        if (svg) svg.style.animation = 'spin 1s linear infinite';
        await fetchAndRenderActivity();
        if (svg) svg.style.animation = 'none';
    });
}

export async function fetchAndRenderActivity() {
    if (!activityList) return;
    try {
        const records = await listEvidence(5);
        renderActivityLog(records);
    } catch (err) {
        console.error('Failed to load activity log:', err);
        activityList.innerHTML = `<div class="activity-empty">Failed to load recent activity.</div>`;
    }
}

function renderActivityLog(records) {
    if (!records || records.length === 0) {
        activityList.innerHTML = `<div class="activity-empty">No recent activity found.</div>`;
        return;
    }

    const html = records.map(rec => {
        const hashFormatted = rec.fileHash.slice(0, 16) + '...' + rec.fileHash.slice(-16);
        const dateObj = new Date(rec.anchoredAt);
        const timeFormatted = isNaN(dateObj.getTime()) ? 'Unknown' : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const officer = (rec.metadata && rec.metadata.officerId) || rec.officerId || 'UNKNOWN';

        return `
            <div class="activity-item">
                <div class="activity-info">
                    <div class="activity-hash">${hashFormatted}</div>
                    <div class="activity-meta">
                        <span>${officer}</span>
                        <span>•</span>
                        <span>${timeFormatted}</span>
                    </div>
                </div>
                <div class="activity-status ${rec.status === 'anchored' ? 'anchored' : ''}">
                    ${rec.status === 'anchored' ? 'Anchored' : 'Verified'}
                </div>
            </div>
        `;
    }).join('');

    activityList.innerHTML = html;
}

// Add keyframes for refresh spin animation
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
