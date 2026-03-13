/* ═══════════════════════════════════════════════════════════════
   CHAINGUARD — Verification Dashboard · Main Logic
   ═══════════════════════════════════════════════════════════════ */

// ──── DOM refs ────
const $ = (sel) => document.querySelector(sel);
const dropzone       = $('#dropzone');
const fileInput      = $('#fileInput');
const dzDefault      = $('#dzDefault');
const dzHashing      = $('#dzHashing');
const dzVerifying    = $('#dzVerifying');
const hashPercent    = $('#hashPercent');
const hashProgressRing = $('#hashProgressRing');
const hashFileName   = $('#hashFileName');
const hashBytes      = $('#hashBytes');
const hashOutput     = $('#hashOutput');
const hashValue      = $('#hashValue');
const copyHash       = $('#copyHash');
const resultCard     = $('#resultCard');
const resultMatch    = $('#resultMatch');
const resultNoMatch  = $('#resultNoMatch');
const btnReset       = $('#btnReset');
const btnDownloadReport = $('#btnDownloadReport');
const headerTime     = $('#headerTime');

// ──── CONSTANTS ────
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r = 52 in the SVG
const VERIFY_ENDPOINT = 'http://localhost:3001/api/evidence/verify';

// ──── HEADER CLOCK ────
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  headerTime.textContent = `${hh}:${mm}:${ss} UTC${now.getTimezoneOffset() <= 0 ? '+' : '-'}${String(Math.abs(now.getTimezoneOffset() / 60)).padStart(2, '0')}`;
}
updateClock();
setInterval(updateClock, 1000);

// ──── STAT COUNTER ANIMATION ────
function animateCounters() {
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

// Trigger on viewport entry
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { animateCounters(); statsObserver.disconnect(); } });
}, { threshold: 0.5 });
document.querySelectorAll('.hero-stats').forEach(el => statsObserver.observe(el));

// ──── DRAG & DROP ────
['dragenter', 'dragover'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('drag-over');
  });
});

dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) processFile(files[0]);
});

dropzone.addEventListener('click', () => {
  if (!dropzone.classList.contains('hashing') && !dropzone.classList.contains('verifying')) {
    fileInput.click();
  }
});

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) processFile(fileInput.files[0]);
});

// ──── UTILITY ────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function hexString(buffer) {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──── CORE: PROCESS FILE ────
async function processFile(file) {
  // Reset previous state
  hideResults();

  // Show hashing state
  showState('hashing');
  hashFileName.textContent = file.name;
  dropzone.classList.add('hashing');

  const totalSize = file.size;
  const totalStr = formatBytes(totalSize);

  // Hash using streaming for large files
  const hash = await hashFileStreaming(file, (bytesRead) => {
    const pct = Math.round((bytesRead / totalSize) * 100);
    hashPercent.textContent = pct + '%';

    // Animate SVG ring
    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    hashProgressRing.style.strokeDashoffset = offset;

    // Update bytes display
    hashBytes.innerHTML = `<span class="bytes-processed">${formatBytes(bytesRead)}</span> / <span class="bytes-total">${totalStr}</span>`;
  });

  // Small delay for UX
  await sleep(400);

  // Show hash
  dropzone.classList.remove('hashing');
  showState('verifying');
  dropzone.classList.add('verifying');

  hashOutput.classList.remove('hidden');
  hashValue.textContent = hash;

  // Real blockchain verification via backend API
  let record = null;
  try {
    record = await verifyWithBackend(file, hash);
  } catch (err) {
    console.error('Verification error:', err);
  }

  dropzone.classList.remove('verifying');
  showState('default');

  showResult(record, hash);
}

// ──── STREAMING SHA-256 ────
async function hashFileStreaming(file, onProgress) {
  // For browsers that don't support streams, fall back to ArrayBuffer
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks

  if (file.size < CHUNK_SIZE * 2) {
    // Small file: single-shot hash
    onProgress(0);
    const buffer = await file.arrayBuffer();
    onProgress(file.size);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return hexString(hashBuffer);
  }

  // Large file: read in chunks and simulate progressive hashing
  // Note: Web Crypto doesn't have a streaming API, so we read the full file
  // but report progress as chunks are read.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let offset = 0;

    // We simulate chunk progress while FileReader loads the whole thing
    const progressInterval = setInterval(() => {
      offset = Math.min(offset + CHUNK_SIZE, file.size);
      onProgress(offset);
      if (offset >= file.size) clearInterval(progressInterval);
    }, 120);

    reader.onload = async () => {
      clearInterval(progressInterval);
      onProgress(file.size);
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', reader.result);
        resolve(hexString(hashBuffer));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => { clearInterval(progressInterval); reject(reader.error); };
    reader.readAsArrayBuffer(file);
  });
}

// ──── LEDGER LOOKUP (REAL BACKEND) ────
async function verifyWithBackend(file, hash) {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(VERIFY_ENDPOINT, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Verify request failed with status ${response.status}`);
  }

  const payload = await response.json();

  // No match / error envelope
  if (!payload.success || !payload.verified || !payload.data || !payload.data.match) {
    return null;
  }

  const rec = payload.data.record || {};
  const meta = rec.metadata || {};

  return {
    evidenceId: rec.evidenceId,
    transactionHash: rec.transactionHash,
    blockNumber: rec.blockNumber,
    anchoredAt: rec.anchoredAt,
    officerId: meta.officerId || rec.officerId || 'UNKNOWN',
    latitude: typeof meta.latitude === 'number' ? meta.latitude : (rec.latitude || 0),
    longitude: typeof meta.longitude === 'number' ? meta.longitude : (rec.longitude || 0),
  };
}

// ──── UI STATE MANAGEMENT ────
function showState(state) {
  dzDefault.classList.add('hidden');
  dzHashing.classList.add('hidden');
  dzVerifying.classList.add('hidden');

  switch (state) {
    case 'hashing':
      dzHashing.classList.remove('hidden');
      hashPercent.textContent = '0%';
      hashProgressRing.style.strokeDashoffset = RING_CIRCUMFERENCE;
      break;
    case 'verifying':
      dzVerifying.classList.remove('hidden');
      break;
    default:
      dzDefault.classList.remove('hidden');
  }
}

function hideResults() {
  hashOutput.classList.add('hidden');
  resultCard.classList.add('hidden');
  resultMatch.classList.add('hidden');
  resultNoMatch.classList.add('hidden');
  btnDownloadReport.classList.add('hidden');
}

function showResult(record, hash) {
  resultCard.classList.remove('hidden');

  if (record) {
    resultMatch.classList.remove('hidden');
    resultNoMatch.classList.add('hidden');
    btnDownloadReport.classList.remove('hidden');

    // Populate details
    $('#detailEvidenceId').textContent = record.evidenceId;
    $('#detailTxHash').textContent = record.transactionHash;
    $('#detailBlock').textContent = record.blockNumber.toLocaleString();
    $('#detailTimestamp').textContent = new Date(record.anchoredAt).toLocaleString();
    $('#detailOfficer').textContent = record.officerId;
    $('#detailGps').textContent = `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`;

    // Glow effect on card
    resultCard.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    resultCard.style.boxShadow = '0 0 30px rgba(34, 197, 94, 0.1)';
  } else {
    resultNoMatch.classList.remove('hidden');
    resultMatch.classList.add('hidden');

    resultCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    resultCard.style.boxShadow = '0 0 30px rgba(239, 68, 68, 0.1)';
  }
}

// ──── COPY HASH ────
copyHash.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(hashValue.textContent);
    const span = copyHash.querySelector('span');
    span.textContent = 'Copied!';
    copyHash.classList.add('copied');
    setTimeout(() => {
      span.textContent = 'Copy';
      copyHash.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Clipboard error:', err);
  }
});

// ──── RESET ────
btnReset.addEventListener('click', () => {
  hideResults();
  showState('default');
  dropzone.classList.remove('hashing', 'verifying');
  fileInput.value = '';

  // Scroll to dropzone
  dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ──── DOWNLOAD REPORT (MOCK) ────
btnDownloadReport.addEventListener('click', () => {
  const hash = hashValue.textContent;
  // Report generation now relies on the last shown record in the UI;
  // if there is no match, there is nothing to export.
  if (resultMatch.classList.contains('hidden')) return;

  const record = {
    evidenceId: $('#detailEvidenceId').textContent,
    transactionHash: $('#detailTxHash').textContent,
    blockNumber: Number($('#detailBlock').textContent.replace(/,/g, '')) || 0,
    anchoredAt: $('#detailTimestamp').textContent,
    officerId: $('#detailOfficer').textContent,
    latitude: 0,
    longitude: 0,
  };

  const report = `
═══════════════════════════════════════════
  CHAINGUARD — Evidence Verification Report
═══════════════════════════════════════════

Date Generated:   ${new Date().toISOString()}

FILE HASH (SHA-256):
${hash}

VERIFICATION STATUS:    ✅ MATCH — VERIFIED

BLOCKCHAIN RECORD:
  Evidence ID:      ${record.evidenceId}
  Transaction Hash: ${record.transactionHash}
  Block Number:     ${record.blockNumber.toLocaleString()}
  Anchored At:      ${new Date(record.anchoredAt).toLocaleString()}

CAPTURE METADATA:
  Officer Badge:    ${record.officerId}
  GPS Coordinates:  ${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}

═══════════════════════════════════════════
  This report was generated by ChainGuard
  Evidence Integrity Protocol v1.0
═══════════════════════════════════════════
`.trim();

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chainguard-report-${record.evidenceId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ──── INIT ────
showState('default');
hashProgressRing.style.strokeDasharray = RING_CIRCUMFERENCE;
hashProgressRing.style.strokeDashoffset = RING_CIRCUMFERENCE;
