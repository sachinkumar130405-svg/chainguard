import { hashFileStreaming, encryptFile } from '../components/CryptoUtils.js';
import { submitWithBackend, uploadEncryptedFile, login, getAuthToken, logout } from '../components/ApiService.js';
import {
    isWebAuthnSupported,
    isPlatformAuthenticatorAvailable,
    isDeviceRegistered,
    registerDevice,
    signWithDevice
} from '../components/AttestationClient.js';

// ---- DOM Elements ----
const video = document.getElementById('cameraView');
const btnCapture = document.getElementById('btnCapture');
const gpsLocationDisplay = document.getElementById('gpsLocation');
const syncStatusDisplay = document.getElementById('syncStatus');
const resultOverlay = document.getElementById('resultOverlay');
const resultStatus = document.getElementById('resultStatus');
const resultHash = document.getElementById('resultHash');
const btnNewCapture = document.getElementById('btnNewCapture');
const btnRegisterDevice = document.getElementById('btnRegisterDevice');
const attestationBadge = document.getElementById('attestationBadge');

// Login Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');
const loginErrorDisplay = document.getElementById('loginError');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const btnLogout = document.getElementById('btnLogout');

let currentGps = null;
let db = null;
let deviceAttested = false;

async function init() {
    initIndexedDB();

    const token = getAuthToken();
    if (!token) {
        showLogin();
    } else {
        await startApp();
    }
}

function showLogin() {
    loginOverlay.classList.remove('hidden');
    loginForm.addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
    e.preventDefault();
    loginErrorDisplay.classList.add('hidden');
    btnLoginSubmit.disabled = true;
    btnLoginSubmit.textContent = 'Logging in...';

    try {
        await login(loginUsernameInput.value, loginPasswordInput.value);
        loginOverlay.classList.add('hidden');
        loginForm.reset();
        await startApp();
    } catch (err) {
        loginErrorDisplay.textContent = err.message || 'Login failed';
        loginErrorDisplay.classList.remove('hidden');
    } finally {
        btnLoginSubmit.disabled = false;
        btnLoginSubmit.textContent = 'Login';
    }
}

function handleLogout() {
    logout();
    location.reload();
}

async function startApp() {
    setupCamera();
    startGpsTracking();

    btnCapture.addEventListener('click', handleCapture);
    btnNewCapture.addEventListener('click', resetCapture);
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    // Hardware Attestation setup
    await initAttestation();

    // Register Service Worker for true PWA
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/capture/sw.js');
        } catch (e) {
            console.log('SW registration failed:', e);
        }
    }
}

// ---- Hardware Attestation ----
async function initAttestation() {
    if (!btnRegisterDevice || !attestationBadge) return;

    const supported = isWebAuthnSupported();
    const available = supported && await isPlatformAuthenticatorAvailable();

    if (!available) {
        btnRegisterDevice.textContent = 'Hardware Auth N/A';
        btnRegisterDevice.disabled = true;
        attestationBadge.textContent = 'No Hardware Key';
        attestationBadge.className = 'attestation-badge unavailable';
        return;
    }

    if (isDeviceRegistered()) {
        deviceAttested = true;
        btnRegisterDevice.textContent = 'Device Registered ✓';
        btnRegisterDevice.disabled = true;
        attestationBadge.textContent = 'HW Attested';
        attestationBadge.className = 'attestation-badge attested';
    } else {
        btnRegisterDevice.textContent = 'Register This Device';
        btnRegisterDevice.addEventListener('click', handleRegisterDevice);
        attestationBadge.textContent = 'Not Registered';
        attestationBadge.className = 'attestation-badge not-registered';
    }
}

async function handleRegisterDevice() {
    btnRegisterDevice.disabled = true;
    btnRegisterDevice.textContent = 'Registering...';
    try {
        await registerDevice(navigator.userAgent.slice(0, 50));
        deviceAttested = true;
        btnRegisterDevice.textContent = 'Device Registered ✓';
        attestationBadge.textContent = 'HW Attested';
        attestationBadge.className = 'attestation-badge attested';
    } catch (err) {
        console.error('Device registration failed:', err);
        btnRegisterDevice.textContent = 'Registration Failed';
        btnRegisterDevice.disabled = false;
        setTimeout(() => { btnRegisterDevice.textContent = 'Retry Registration'; }, 2000);
    }
}

// ---- Network & Sync ----
function updateNetworkStatus() {
    if (navigator.onLine) {
        syncStatusDisplay.className = 'sync-status online';
        syncStatusDisplay.textContent = 'Online';
        trySync();
    } else {
        syncStatusDisplay.className = 'sync-status offline';
        syncStatusDisplay.textContent = 'Offline (Caching)';
    }
}

// ---- IndexedDB ----
function initIndexedDB() {
    if (!window.indexedDB) {
        console.warn("Your browser doesn't support a stable version of IndexedDB. Offline capture features will not be available.");
        return;
    }

    const request = indexedDB.open('ChainGuardOffline', 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains('submissions')) {
            db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
        }
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        if (navigator.onLine) trySync();
    };
    request.onerror = (e) => console.error('IndexedDB error:', e);
}

function saveToOfflineDB(record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('submissions', 'readwrite');
        const store = tx.objectStore('submissions');
        const req = store.add(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function getOfflineRecords() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('submissions', 'readonly');
        const store = tx.objectStore('submissions');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function deleteOfflineRecord(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('submissions', 'readwrite');
        const store = tx.objectStore('submissions');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

let isSyncing = false;
let syncRetryCount = 0;

async function trySync() {
    if (!db || !navigator.onLine || isSyncing) return;
    const records = await getOfflineRecords();
    if (records.length === 0) {
        syncRetryCount = 0;
        return;
    }

    isSyncing = true;
    syncStatusDisplay.className = 'sync-status syncing';
    syncStatusDisplay.textContent = `Syncing ${records.length}...`;

    let failedSyncs = 0;

    for (const record of records) {
        try {
            const { file, hash, metadata } = record;

            const submitData = await submitWithBackend(file, hash, metadata);
            const { encryptedBlob, iv } = await encryptFile(file);
            await uploadEncryptedFile(submitData.evidenceId, encryptedBlob, iv, file.type, submitData.authHeader);

            await deleteOfflineRecord(record.id);
        } catch (err) {
            console.error('Failed to sync record', record.id, err);
            failedSyncs++;
        }
    }

    isSyncing = false;

    if (failedSyncs > 0) {
        syncStatusDisplay.className = 'sync-status error';
        syncStatusDisplay.textContent = `Sync Failed (${failedSyncs})`;

        syncRetryCount++;
        const backoffMs = Math.min(1000 * Math.pow(2, syncRetryCount), 60000); // Max 1 minute
        console.log(`Scheduling retry ${syncRetryCount} in ${backoffMs}ms`);
        setTimeout(() => { if (navigator.onLine) trySync(); }, backoffMs);

    } else {
        syncRetryCount = 0;
        syncStatusDisplay.className = 'sync-status anchored';
        syncStatusDisplay.textContent = '✓ Fully Synced';
        setTimeout(updateNetworkStatus, 3000);
    }
}

// ---- Camera & Media ----
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        });
        video.srcObject = stream;
        video.onloadeddata = () => { btnCapture.disabled = false; };
    } catch (err) {
        console.error('Camera access denied:', err);
        alert('Camera access is required for evidence capture.');
    }
}

function startGpsTracking() {
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(
            (pos) => {
                currentGps = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                gpsLocationDisplay.textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
            },
            (err) => {
                console.warn('GPS Error:', err);
                gpsLocationDisplay.textContent = 'GPS Unavailable';
            },
            { enableHighAccuracy: true, maximumAge: 10000 }
        );
    } else {
        gpsLocationDisplay.textContent = 'GPS Not Supported';
    }
}

async function handleCapture() {
    btnCapture.disabled = true;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    resultOverlay.classList.remove('hidden');
    resultStatus.textContent = 'Processing...';
    resultHash.textContent = '';
    btnNewCapture.classList.add('hidden');

    try {
        // 1. Get Blob
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
        const file = new File([blob], `evidence_${Date.now()}.jpg`, { type: 'image/jpeg' });

        // 2. Hash
        resultStatus.textContent = 'Computing Hash...';
        const hash = await hashFileStreaming(file, () => { });
        resultHash.textContent = hash;

        // 3. Hardware Attestation (sign with device key if registered)
        let attestationResult = null;
        if (deviceAttested && navigator.onLine) {
            resultStatus.textContent = 'Signing with Hardware Key...';
            try {
                attestationResult = await signWithDevice();
            } catch (err) {
                console.warn('Hardware signing failed, continuing without:', err);
            }
        }

        // 4. Prepare Metadata
        const metadata = {
            officerId: attestationResult?.officerId || 'OFFICER-PWA',
            latitude: currentGps ? currentGps.latitude : 0,
            longitude: currentGps ? currentGps.longitude : 0,
            hwAttested: !!attestationResult,
            deviceCredentialId: attestationResult?.credentialId || null,
        };

        // 5. Submit or Cache
        if (navigator.onLine) {
            resultStatus.textContent = 'Securing Evidence Online...';
            try {
                const submitData = await submitWithBackend(file, hash, metadata);
                resultStatus.textContent = 'Encrypting & Uploading...';
                const { encryptedBlob, iv } = await encryptFile(file);
                await uploadEncryptedFile(submitData.evidenceId, encryptedBlob, iv, file.type, submitData.authHeader);

                // Add success visual
                const successIcon = document.createElement('div');
                successIcon.className = 'result-success-icon';
                successIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
                resultStatus.parentNode.insertBefore(successIcon, resultStatus);

                resultStatus.innerHTML = attestationResult
                    ? '✓ Secured & Hardware Attested'
                    : '✓ Secured Successfully';
                resultStatus.style.color = 'var(--green)';

                syncStatusDisplay.className = 'sync-status anchored';
                syncStatusDisplay.textContent = '✓ Anchored';
                setTimeout(updateNetworkStatus, 4000);

            } catch (err) {
                console.error('Online submit failed, falling back to cache:', err);
                await cacheEvidence(file, hash, metadata);
            }
        } else {
            await cacheEvidence(file, hash, metadata);
        }

    } catch (err) {
        console.error('Capture flow error:', err);
        resultStatus.textContent = 'Capture Failed';
        resultStatus.style.color = 'var(--red)';
        resultHash.innerHTML = `<span style="color:var(--red)">Error: ${err.message || 'Unknown error occurred'}</span>`;

        syncStatusDisplay.className = 'sync-status error';
        syncStatusDisplay.textContent = 'Capture Failed';
        setTimeout(updateNetworkStatus, 3000);
    }

    btnNewCapture.classList.remove('hidden');
}

async function cacheEvidence(file, hash, metadata) {
    if (!db) {
        alert("Offline storage is not available in your browser. This capture cannot be saved offline.");
        return;
    }

    const MAX_QUEUE_SIZE = 50;
    const records = await getOfflineRecords();

    if (records.length >= MAX_QUEUE_SIZE) {
        alert(`Offline storage limit reached (${MAX_QUEUE_SIZE} items). Please connect to the internet to sync pending evidence before capturing more.`);
        resultStatus.textContent = 'Storage Limit Reached';
        resultStatus.style.color = 'var(--red)';
        return;
    }

    resultStatus.textContent = 'Caching Offline...';
    await saveToOfflineDB({ file, hash, metadata, timestamp: Date.now() });
    resultStatus.textContent = 'Saved Offline. Will sync when connected.';
    resultStatus.style.color = 'var(--violet)';
    updateNetworkStatus();
}

function resetCapture() {
    resultOverlay.classList.add('hidden');
    btnCapture.disabled = false;
    resultStatus.style.color = 'var(--cyan)';

    // Remove success icon if it was added
    const icon = document.querySelector('.result-success-icon');
    if (icon) icon.remove();
}

// ---- Run ----
init();
