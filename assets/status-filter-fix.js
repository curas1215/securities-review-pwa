(() => {
  'use strict';

  const DB_NAME = 'securities-review-pwa';
  const DB_VERSION = 1;
  const frame = document.getElementById('studyFrame');
  if (!frame) return;

  let dbPromise = null;
  let applyTimer = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'id' });
      };
    });
    return dbPromise;
  }

  async function readAttempts() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains('attempts')) return resolve([]);
        const tx = db.transaction('attempts', 'readonly');
        const req = tx.objectStore('attempts').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      return [];
    }
  }

  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const stemKey = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220);

  function qidOf(box) {
    const own = box?.dataset && (box.dataset.qid || box.dataset.id || box.dataset.questionId);
    if (own) return own;
    const child = box?.querySelector?.('[data-qid],[data-question-id]');
    return child ? (child.dataset.qid || child.dataset.questionId || '') : '';
  }

  function findStatusSelect(doc) {
    return Array.from(doc.querySelectorAll('select')).find(select => {
      const labels = Array.from(select.options).map(option => text(option));
      return labels.some(v => v === '未做') &&
             labels.some(v => v.includes('最近做错')) &&
             labels.some(v => v.includes('曾经做错')) &&
             labels.some(v => v.includes('最近做对'));
    }) || null;
  }

  function selectedLabel(select) {
    return text(select?.selectedOptions?.[0] || select?.options?.[select?.selectedIndex]);
  }

  async function applyFilter(doc) {
    const statusSelect = findStatusSelect(doc);
    if (!statusSelect) return;

    const mode = selectedLabel(statusSelect);
    const supported = ['未做', '最近做错', '曾经做错', '最近做对'];
    const boxes = Array.from(doc.querySelectorAll('.qbox'));

    if (!supported.includes(mode)) {
      boxes.forEach(box => box.classList.remove('pwa-status-hidden'));
      return;
    }

    const attempts = await readAttempts();
    const byQid = new Map();
    const byStem = new Map();
    for (const row of attempts) {
      if (!row) continue;
      if (row.qid) byQid.set(String(row.qid), row);
      if (row.stem) byStem.set(stemKey(row.stem), row);
    }

    for (const box of boxes) {
      const qid = qidOf(box);
      const stem = stemKey(text(box.querySelector('.qtext')) || text(box).slice(0, 1000));
      const row = (qid && byQid.get(String(qid))) || byStem.get(stem) || null;

      let keep = true;
      if (mode === '未做') keep = !row || !(Number(row.attempts) > 0);
      if (mode === '最近做错') keep = Boolean(row && Number(row.attempts) > 0 && row.lastCorrect === false);
      if (mode === '曾经做错') keep = Boolean(row && Number(row.wrongCount) > 0);
      if (mode === '最近做对') keep = Boolean(row && Number(row.attempts) > 0 && row.lastCorrect === true);

      box.classList.toggle('pwa-status-hidden', !keep);
    }
  }

  function scheduleApply(doc, delay = 60) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => applyFilter(doc), delay);
  }

  function bindFrame() {
    let doc;
    try { doc = frame.contentDocument; } catch (_) { return; }
    if (!doc?.documentElement || !doc.body) return;

    if (!doc.getElementById('pwa-status-filter-style')) {
      const style = doc.createElement('style');
      style.id = 'pwa-status-filter-style';
      style.textContent = '.pwa-status-hidden{display:none!important}';
      doc.head.appendChild(style);
    }

    if (doc.documentElement.dataset.pwaStatusFilterBound === '1') {
      scheduleApply(doc, 0);
      return;
    }
    doc.documentElement.dataset.pwaStatusFilterBound = '1';

    doc.addEventListener('change', event => {
      const select = event.target?.closest?.('select');
      if (select && select === findStatusSelect(doc)) scheduleApply(doc, 30);
    }, true);

    doc.addEventListener('click', event => {
      if (event.target?.closest?.('.qbox')) scheduleApply(doc, 260);
    }, true);

    const observer = new MutationObserver(() => scheduleApply(doc, 80));
    observer.observe(doc.body, { subtree: true, childList: true });

    scheduleApply(doc, 100);
  }

  frame.addEventListener('load', () => {
    setTimeout(bindFrame, 220);
    setTimeout(bindFrame, 700);
  });
})();
