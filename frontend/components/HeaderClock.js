/**
 * Updates the header clock with the current UTC time.
 * @param {HTMLElement} headerTimeEl 
 */
export function updateClock(headerTimeEl) {
    if (!headerTimeEl) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    headerTimeEl.textContent = `${hh}:${mm}:${ss} UTC${now.getTimezoneOffset() <= 0 ? '+' : '-'}${String(Math.abs(now.getTimezoneOffset() / 60)).padStart(2, '0')}`;
}

/**
 * Starts the clock interval.
 * @param {HTMLElement} headerTimeEl 
 */
export function initClock(headerTimeEl) {
    updateClock(headerTimeEl);
    return setInterval(() => updateClock(headerTimeEl), 1000);
}
