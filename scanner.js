/* BOOK WORM – czytnik kodów kreskowych EAN-13 (ISBN).
   Własny dekoder działa bez internetu i bez zewnętrznych bibliotek.
   Jeśli przeglądarka ma wbudowany BarcodeDetector, korzystamy z niego dodatkowo. */
(function (root) {
  'use strict';

  // Szerokości modułów (4 elementy na cyfrę). L i R mają te same szerokości, G to odwrócone L.
  const L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map((s) => s.split('').map(Number));
  const G = L.map((p) => p.slice().reverse());
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function matchDigit(w, patterns) {
    const sum = w[0] + w[1] + w[2] + w[3];
    if (!sum) return null;
    const unit = sum / 7;
    let best = -1, bestErr = Infinity, second = Infinity;
    for (let d = 0; d < 10; d++) {
      const p = patterns[d];
      let err = 0;
      for (let k = 0; k < 4; k++) err += Math.abs(w[k] / unit - p[k]);
      if (err < bestErr) { second = bestErr; bestErr = err; best = d; }
      else if (err < second) second = err;
    }
    return { d: best, err: bestErr, margin: second - bestErr };
  }

  function checksumOk(digits) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += digits[i] * (i % 2 ? 3 : 1);
    return (10 - (s % 10)) % 10 === digits[12];
  }

  // runs: szerokości kolejnych pasków; runs[i] musi być ciemny (początek kodu)
  function decodeAt(runs, i) {
    if (i + 59 > runs.length) return null;
    let total = 0;
    for (let k = 0; k < 59; k++) total += runs[i + k];
    const m = total / 95;
    // Strażnicy: 1-1-1 na początku, 1-1-1-1-1 w środku, 1-1-1 na końcu
    const guards = [0, 1, 2, 27, 28, 29, 30, 31, 56, 57, 58];
    for (const g of guards) {
      const r = runs[i + g] / m;
      if (r < 0.35 || r > 2.1) return null;
    }
    // Cicha strefa przed kodem (jasny pasek przed i)
    if (i > 0 && runs[i - 1] < m * 3) return null;

    const digits = new Array(13);
    let parity = '';
    let errSum = 0;
    for (let k = 0; k < 6; k++) {
      const w = runs.slice(i + 3 + k * 4, i + 7 + k * 4);
      const a = matchDigit(w, L), b = matchDigit(w, G);
      if (!a || !b) return null;
      if (a.err <= b.err) { digits[k + 1] = a.d; parity += 'L'; errSum += a.err; }
      else { digits[k + 1] = b.d; parity += 'G'; errSum += b.err; }
    }
    const first = PARITY.indexOf(parity);
    if (first < 0) return null;
    digits[0] = first;
    for (let k = 0; k < 6; k++) {
      const w = runs.slice(i + 32 + k * 4, i + 36 + k * 4);
      const a = matchDigit(w, L);
      if (!a) return null;
      digits[k + 7] = a.d; errSum += a.err;
    }
    if (errSum / 12 > 1.5) return null;
    if (!checksumOk(digits)) return null;
    return digits.join('');
  }

  function runsFromBinary(bin) {
    // zwraca {runs, firstDark}
    const runs = [];
    let cur = bin[0], len = 0;
    for (let x = 0; x < bin.length; x++) {
      if (bin[x] === cur) len++;
      else { runs.push(len); cur = bin[x]; len = 1; }
    }
    runs.push(len);
    return { runs, firstDark: bin[0] === 1 };
  }

  function decodeRuns(runs, firstDark) {
    for (let i = firstDark ? 0 : 1; i + 59 <= runs.length; i += 2) {
      const r = decodeAt(runs, i);
      if (r) return r;
    }
    return null;
  }

  // Dekoduje jedną linię jasności (tablica liczb 0–255)
  function decodeLine(lum) {
    if (lum.length < 95) return null;
    // Krótkie linie powiększamy 2× (interpolacja), żeby lepiej trafić w krawędzie wąskich pasków
    const up = lum.length < 1400 ? 2 : 1;
    const n = lum.length * up;
    const src = new Float32Array(n);
    for (let x = 0; x < n; x++) {
      const f = x / up, i0 = Math.floor(f), i1 = Math.min(lum.length - 1, i0 + 1), t = f - i0;
      src[x] = lum[i0] * (1 - t) + lum[i1] * t;
    }
    // Lekkie wygładzenie
    const s = new Float32Array(n);
    for (let x = 0; x < n; x++) s[x] = (src[Math.max(0, x - 1)] + 2 * src[x] + src[Math.min(n - 1, x + 1)]) / 4;
    // Próg adaptacyjny: średnia z okna ~1/8 szerokości, poprawiona o globalny zakres
    const sorted = Array.from(s).sort((a, b) => a - b);
    const lo = sorted[Math.floor(n * 0.05)], hi = sorted[Math.floor(n * 0.95)];
    if (hi - lo < 25) return null;
    const win = Math.max(16, Math.floor(n / 8));
    const pre = new Float64Array(n + 1);
    for (let x = 0; x < n; x++) pre[x + 1] = pre[x] + s[x];
    const attempts = [0.5, 0.42, 0.58];
    for (const t of attempts) {
      const globalT = lo + (hi - lo) * t;
      const bin = new Uint8Array(n);
      for (let x = 0; x < n; x++) {
        const a = Math.max(0, x - win), b = Math.min(n, x + win);
        const local = (pre[b] - pre[a]) / (b - a);
        const thr = (local + globalT) / 2;
        bin[x] = s[x] < thr ? 1 : 0;
      }
      const { runs, firstDark } = runsFromBinary(bin);
      let r = decodeRuns(runs, firstDark);
      if (r) return r;
      // Kod do góry nogami
      const rev = runs.slice().reverse();
      const lastDark = bin[n - 1] === 1;
      r = decodeRuns(rev, lastDark);
      if (r) return r;
    }
    return null;
  }

  // Skanuje obraz w odcieniach szarości (Uint8Array w x h) wieloma liniami poziomymi i pionowymi.
  function decodeGray(gray, w, h, opts) {
    const o = Object.assign({ rows: 24, cols: 12, minHits: 1 }, opts);
    const hits = new Map();
    const take = (code) => {
      const c = (hits.get(code) || 0) + 1;
      hits.set(code, c);
      return c >= o.minHits ? code : null;
    };
    const line = new Uint8Array(Math.max(w, h));
    // Linie poziome – od środka na zewnątrz
    for (let k = 0; k < o.rows; k++) {
      const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      const y = Math.round(h / 2 + off * (h / (o.rows + 2)));
      if (y < 0 || y >= h) continue;
      const row = gray.subarray(y * w, y * w + w);
      const r = decodeLine(row);
      if (r && take(r)) return r;
    }
    // Linie pionowe (kod obrócony o 90°)
    for (let k = 0; k < o.cols; k++) {
      const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      const x = Math.round(w / 2 + off * (w / (o.cols + 2)));
      if (x < 0 || x >= w) continue;
      for (let y = 0; y < h; y++) line[y] = gray[y * w + x];
      const r = decodeLine(line.subarray(0, h));
      if (r && take(r)) return r;
    }
    return null;
  }

  function toGray(imageData) {
    const { data, width, height } = imageData;
    const g = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return g;
  }

  // ---------- ISBN ----------
  function isbn10to13(s) {
    const core = '978' + s.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += +core[i] * (i % 2 ? 3 : 1);
    return core + ((10 - (sum % 10)) % 10);
  }
  function normalizeIsbn(input) {
    const s = String(input || '').toUpperCase().replace(/[^0-9X]/g, '');
    if (/^97[89]\d{10}$/.test(s)) {
      const d = s.split('').map(Number);
      return checksumOk(d) ? s : null;
    }
    if (/^\d{9}[\dX]$/.test(s)) {
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : +s[i]) * (10 - i);
      return sum % 11 === 0 ? isbn10to13(s) : null;
    }
    return null;
  }

  // ---------- Aparat ----------
  class CameraScanner {
    constructor(video, onCode, onState) {
      this.video = video;
      this.onCode = onCode;
      this.onState = onState || (() => {});
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.stream = null;
      this.running = false;
      this.native = null;
      this.recent = [];
    }

    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('Ta przeglądarka nie daje dostępu do aparatu.'), { code: 'unsupported' });
      try {
        if ('BarcodeDetector' in window) {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('ean_13')) this.native = new window.BarcodeDetector({ formats: ['ean_13'] });
        }
      } catch (e) { this.native = null; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (e) {
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        throw Object.assign(new Error(denied
          ? 'Brak zgody na aparat. Zezwól na dostęp w Ustawienia → Safari → Aparat albo zrób zdjęcie kodu.'
          : 'Nie udało się włączyć aparatu. Zrób zdjęcie kodu albo wpisz ISBN.'), { code: denied ? 'denied' : 'failed' });
      }
      this.video.setAttribute('playsinline', '');
      this.video.muted = true;
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.running = true;
      this.onState('scanning');
      this.loop();
    }

    stop() {
      this.running = false;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.video.srcObject = null;
    }

    accept(code) {
      // Wymagamy dwóch zgodnych odczytów w krótkim czasie, żeby uniknąć pomyłek
      const now = Date.now();
      this.recent = this.recent.filter((r) => now - r.t < 1500);
      this.recent.push({ code, t: now });
      return this.recent.filter((r) => r.code === code).length >= 2;
    }

    async loop() {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          let code = null;
          if (this.native) {
            const res = await this.native.detect(v);
            const hit = res.find((r) => /^\d{13}$/.test(r.rawValue));
            if (hit) code = hit.rawValue;
          }
          if (!code) {
            // Środkowy pas kadru, przeskalowany do ~720 px szerokości
            const vw = v.videoWidth, vh = v.videoHeight;
            const cropH = Math.round(vh * 0.6), cropY = Math.round((vh - cropH) / 2);
            const scale = Math.min(1, 720 / vw);
            const cw = Math.round(vw * scale), ch = Math.round(cropH * scale);
            this.canvas.width = cw; this.canvas.height = ch;
            this.ctx.drawImage(v, 0, cropY, vw, cropH, 0, 0, cw, ch);
            const gray = toGray(this.ctx.getImageData(0, 0, cw, ch));
            code = decodeGray(gray, cw, ch, { rows: 16, cols: 8 });
          }
          if (code && this.accept(code)) {
            this.running = false;
            this.onCode(code);
            return;
          }
        } catch (e) { /* kolejna klatka */ }
      }
      setTimeout(() => this.loop(), 90);
    }
  }

  // Dekodowanie ze zdjęcia (plik z aparatu)
  async function decodeFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if ('BarcodeDetector' in window) {
        try {
          const det = new window.BarcodeDetector({ formats: ['ean_13'] });
          const res = await det.detect(img);
          const hit = res.find((r) => /^\d{13}$/.test(r.rawValue));
          if (hit) return hit.rawValue;
        } catch (e) { /* własny dekoder */ }
      }
      for (const target of [1000, 1600, 700]) {
        const scale = Math.min(1, target / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const code = decodeGray(toGray(ctx.getImageData(0, 0, w, h)), w, h, { rows: 60, cols: 40 });
        if (code) return code;
      }
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const api = { decodeLine, decodeGray, normalizeIsbn, CameraScanner, decodeFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BWScanner = api;
})(typeof window !== 'undefined' ? window : globalThis);
