/**
 * Animates numeric stat values from 0 to their target value.
 */
export function animateCounters() {
    document.querySelectorAll('.stat-value').forEach((el) => {
        const target = el.textContent;
        // skip non-numeric stats
        if (target.includes('%')) return;
        const num = parseInt(target.replace(/,/g, ''), 10);
        if (isNaN(num)) return;
        let current = 0;
        const duration = 1800;
        const start = performance.now();
        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            current = Math.round(eased * num);
            el.textContent = current.toLocaleString();
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    });
}

/**
 * Sets up an IntersectionObserver to trigger the counter animation.
 */
export function initStatCounters() {
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                animateCounters();
                statsObserver.disconnect();
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.hero-stats').forEach(el => statsObserver.observe(el));
}
