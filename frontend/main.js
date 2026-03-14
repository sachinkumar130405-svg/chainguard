/* ═══════════════════════════════════════════════════════════════
   CHAINGUARD — Verification Dashboard · Main Entry Point
   ═══════════════════════════════════════════════════════════════ */

import { initClock } from './components/HeaderClock.js';
import { initStatCounters } from './components/StatCounter.js';
import { hashFileStreaming, encryptFile } from './components/CryptoUtils.js';
import { verifyWithBackend, submitWithBackend, uploadEncryptedFile } from './components/ApiService.js';
import { initActivityLog, fetchAndRenderActivity } from './components/ActivityLog.js';

// ──── DOM refs ────
const $ = (sel) => document.querySelector(sel);
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const dzDefault = $('#dzDefault');
const dzHashing = $('#dzHashing');
const dzEncrypting = $('#dzEncrypting');
const dzVerifying = $('#dzVerifying');
const hashPercent = $('#hashPercent');
const hashProgressRing = $('#hashProgressRing');
const hashFileName = $('#hashFileName');
const hashBytes = $('#hashBytes');
const hashOutput = $('#hashOutput');
const hashValue = $('#hashValue');
const copyHash = $('#copyHash');
const resultCard = $('#resultCard');
const resultMatch = $('#resultMatch');
const resultNoMatch = $('#resultNoMatch');
const btnReset = $('#btnReset');
const btnDownloadReport = $('#btnDownloadReport');
const headerTime = $('#headerTime');

// Mode toggle & form
const btnModeVerify = $('#btnModeVerify');
const btnModeSubmit = $('#btnModeSubmit');
const submitForm = $('#submitForm');
const inputOfficer = $('#inputOfficer');
const inputLat = $('#inputLat');
const inputLng = $('#inputLng');
const errorTitle = $('#errorTitle');
const errorDesc = $('#errorDesc');

// ──── GLOBAL STATE ────
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
let currentMode = 'verify';

// ──── INITIALIZATION ────
initClock(headerTime);
initStatCounters();
initActivityLog();
showState('default');
hashProgressRing.style.strokeDasharray = RING_CIRCUMFERENCE;
hashProgressRing.style.strokeDashoffset = RING_CIRCUMFERENCE;

// ──── EVENT LISTENERS ────
['dragenter', 'dragover'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropzone.classList.remove('drag-over');
  });
});

dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) processFile(files[0]);
});

dropzone.addEventListener('click', () => {
  if (!dropzone.classList.contains('hashing') &&
    !dropzone.classList.contains('verifying') &&
    !dropzone.classList.contains('submitting')) {
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) processFile(fileInput.files[0]);
});

btnModeVerify.addEventListener('click', () => {
  currentMode = 'verify';
  btnModeVerify.classList.add('active');
  btnModeSubmit.classList.remove('active');
  submitForm.classList.add('hidden');
  hideResults();
  setupDropzoneText();
});

btnModeSubmit.addEventListener('click', () => {
  currentMode = 'submit';
  btnModeSubmit.classList.add('active');
  btnModeVerify.classList.remove('active');
  submitForm.classList.remove('hidden');
  hideResults();
  setupDropzoneText();
});

function setupDropzoneText() {
  const title = $('.dz-default .dz-title');
  title.textContent = currentMode === 'verify'
    ? 'Drop evidence file to verify'
    : 'Drop evidence file to submit';
}

// ──── CORE LOGIC ────

async function processFile(file) {
  hideResults();
  showState('hashing');
  hashFileName.textContent = file.name;
  dropzone.classList.add('hashing');

  const totalSize = file.size;
  const totalStr = formatBytes(totalSize);

  try {
    const hash = await hashFileStreaming(file, (bytesRead) => {
      const pct = Math.round((bytesRead / totalSize) * 100);
      hashPercent.textContent = pct + '%';
      hashProgressRing.style.strokeDashoffset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
      hashBytes.innerHTML = `<span class="bytes-processed">${formatBytes(bytesRead)}</span> / <span class="bytes-total">${totalStr}</span>`;
    });

    await sleep(400);
    dropzone.classList.remove('hashing');
    hashOutput.classList.remove('hidden');
    hashValue.textContent = hash;

    let record = null;

    if (currentMode === 'verify') {
      showState('verifying');
      dropzone.classList.add('verifying');
      record = await verifyWithBackend(file, hash);
    } else {
      const metadata = {
        officerId: inputOfficer.value || 'UNKNOWN',
        latitude: parseFloat(inputLat.value) || 0,
        longitude: parseFloat(inputLng.value) || 0,
      };

      // 1. Submit/Anchor
      const submitData = await submitWithBackend(file, hash, metadata, (state) => {
        showState(state);
        dropzone.classList.add(state);
      });

      // 2. Encrypt
      showState('encrypting');
      dropzone.classList.add('encrypting');
      const { encryptedBlob, iv } = await encryptFile(file);

      // 3. Upload
      showState('uploading');
      dropzone.classList.add('uploading');
      await uploadEncryptedFile(submitData.evidenceId, encryptedBlob, iv, file.type, submitData.authHeader);

      record = {
        ...submitData,
        officerId: metadata.officerId,
        latitude: metadata.latitude,
        longitude: metadata.longitude
      };
    }

    showResult(record, null);
    await fetchAndRenderActivity();
  } catch (err) {
    console.error('Processing error:', err);
    showResult(null, err.message);
  } finally {
    dropzone.classList.remove('verifying', 'submitting', 'uploading', 'encrypting');
    showState('default');
  }
}

// ──── UI HELPERS ────

function showState(state) {
  dzDefault.classList.add('hidden');
  dzHashing.classList.add('hidden');
  dzEncrypting.classList.add('hidden');
  dzVerifying.classList.add('hidden');
  $('#dzSubmitting').classList.add('hidden');
  $('#dzUploading').classList.add('hidden');

  switch (state) {
    case 'hashing': dzHashing.classList.remove('hidden'); break;
    case 'encrypting': dzEncrypting.classList.remove('hidden'); break;
    case 'verifying': dzVerifying.classList.remove('hidden'); break;
    case 'submitting': $('#dzSubmitting').classList.remove('hidden'); break;
    case 'uploading': $('#dzUploading').classList.remove('hidden'); break;
    default: dzDefault.classList.remove('hidden');
  }
}

function hideResults() {
  hashOutput.classList.add('hidden');
  resultCard.classList.add('hidden');
  resultMatch.classList.add('hidden');
  resultNoMatch.classList.add('hidden');
  btnDownloadReport.classList.add('hidden');
}

function showResult(record, errorMsg) {
  resultCard.classList.remove('hidden');

  if (errorMsg) {
    resultNoMatch.classList.remove('hidden');
    resultMatch.classList.add('hidden');
    errorTitle.textContent = errorMsg.includes('DUPLICATE') ? 'CONFLICT — Duplicate Evidence' : 'ERROR — Process Failed';
    errorDesc.textContent = errorMsg;
    resultCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    resultCard.style.boxShadow = '0 0 30px rgba(239, 68, 68, 0.1)';
    return;
  }

  if (record) {
    resultMatch.classList.remove('hidden');
    resultNoMatch.classList.add('hidden');
    btnDownloadReport.classList.remove('hidden');

    $('.match-title').textContent = currentMode === 'submit'
      ? 'SUCCESS — Evidence Secured'
      : 'VERIFIED — Evidence Authentic';

    $('#detailEvidenceId').textContent = record.evidenceId;
    $('#detailTxHash').textContent = record.transactionHash;
    $('#detailBlock').textContent = (record.blockNumber || 0).toLocaleString();
    $('#detailTimestamp').textContent = new Date(record.anchoredAt).toLocaleString();
    $('#detailOfficer').textContent = record.officerId;
    $('#detailGps').textContent = `${(record.latitude || 0).toFixed(4)}, ${(record.longitude || 0).toFixed(4)}`;

    resultCard.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    resultCard.style.boxShadow = '0 0 30px rgba(34, 197, 94, 0.1)';
  } else {
    resultNoMatch.classList.remove('hidden');
    resultMatch.classList.add('hidden');
    errorTitle.textContent = 'UNVERIFIED — No Record Found';
    errorDesc.textContent = "This file's hash does not match any record on the blockchain.";
    resultCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    resultCard.style.boxShadow = '0 0 30px rgba(239, 68, 68, 0.1)';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ──── UTILS ────
copyHash.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(hashValue.textContent);
    const span = copyHash.querySelector('span');
    span.textContent = 'Copied!';
    copyHash.classList.add('copied');
    setTimeout(() => { span.textContent = 'Copy'; copyHash.classList.remove('copied'); }, 2000);
  } catch (err) { console.error('Clipboard error:', err); }
});

btnReset.addEventListener('click', () => {
  hideResults();
  showState('default');
  dropzone.classList.remove('hashing', 'encrypting', 'verifying', 'submitting', 'uploading');
  fileInput.value = '';
  dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

btnDownloadReport.addEventListener('click', () => {
  if (resultMatch.classList.contains('hidden')) return;

  const report = `
═══════════════════════════════════════════
  CHAINGUARD — Evidence Verification Report
═══════════════════════════════════════════

Date Generated:   ${new Date().toISOString()}

FILE HASH (SHA-256):
${hashValue.textContent}

VERIFICATION STATUS:    ✅ MATCH — VERIFIED

BLOCKCHAIN RECORD:
  Evidence ID:      ${$('#detailEvidenceId').textContent}
  Transaction Hash: ${$('#detailTxHash').textContent}
  Block Number:     ${$('#detailBlock').textContent}
  Anchored At:      ${$('#detailTimestamp').textContent}

CAPTURE METADATA:
  Officer Badge:    ${$('#detailOfficer').textContent}
  GPS Coordinates:  ${$('#detailGps').textContent}

═══════════════════════════════════════════
  This report was generated by ChainGuard
  Evidence Integrity Protocol v1.0
═══════════════════════════════════════════
`.trim();

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chainguard-report-${$('#detailEvidenceId').textContent}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});
