(() => {
  'use strict';

  const FRAME_ID = 'studyFrame';
  const HISTORY_KEY = 'securities-review-simulation-history-v1';
  const DEFAULT_CONFIG = {
    count: 30,
    mode: 'practice',
    scope: 'all',
    typeRatio: { single: 0.40, multiple: 0.45, judge: 0.15 }
  };

  const state = {
    doc: null,
    data: null,
    questions: [],
    chapters: [],
    chapterMap: new Map(),
    paper: null,
    config: null,
    index: 0,
    answers: {},
    checked: {},
    submitted: false
  };

  const normLetters = value => (String(value || '').toUpperCase().match(/[A-D]/g) || []).sort().join('');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const shuffle = items => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function getAttempts() {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open('securities-review-pwa', 1);
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          try {
            const db = req.result;
            const tx = db.transaction('attempts', 'readonly');
            const get = tx.objectStore('attempts').getAll();
            get.onerror = () => resolve([]);
            get.onsuccess = () => resolve(get.result || []);
          } catch (_) { resolve([]); }
        };
      } catch (_) { resolve([]); }
    });
  }

  function findQuestionArray(data) {
    if (!data || typeof data !== 'object') return [];
    let best = [];
    const visit = (value, depth = 0) => {
      if (depth > 2 || !value) return;
      if (Array.isArray(value)) {
        if (value.length > best.length) {
          const sample = value.find(x => x && typeof x === 'object');
          if (sample && ('answer' in sample) && ('id' in sample) && (('body' in sample) || ('text' in sample))) best = value;
        }
        return;
      }
      if (typeof value === 'object') Object.values(value).forEach(v => visit(v, depth + 1));
    };
    visit(data);
    return best;
  }

  function qType(q) {
    if (q.judgment === true) return 'judge';
    return normLetters(q.answer).length > 1 ? 'multiple' : 'single';
  }

  function completeness(q) {
    let n = 0;
    if (String(q.body || q.text || '').trim().length > 20) n += 3;
    if (String(q.explain || '').trim().length > 10) n += 2;
    if (!q.needsOriginal) n += 1;
    if (q.verified) n += 1;
    return n;
  }

  function dedupeQuestions(questions) {
    const grouped = new Map();
    questions.forEach(q => {
      if (!q || !q.id || !normLetters(q.answer)) return;
      const key = q.group || q.id;
      const old = grouped.get(key);
      if (!old || completeness(q) > completeness(old)) grouped.set(key, q);
    });
    return Array.from(grouped.values());
  }

  function chapterWeight(ch) {
    const hours = Number(ch?.hours || 0);
    if (hours > 0) return hours;
    const rank = Number(ch?.rank || 11);
    return Math.max(1, 12 - rank);
  }

  function typeTargets(total, ratio = DEFAULT_CONFIG.typeRatio) {
    const raw = [
      ['single', total * ratio.single],
      ['multiple', total * ratio.multiple],
      ['judge', total * ratio.judge]
    ];
    const base = Object.fromEntries(raw.map(([k,v]) => [k, Math.floor(v)]));
    let remain = total - Object.values(base).reduce((a,b)=>a+b,0);
    raw.sort((a,b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])));
    for (let i = 0; i < remain; i++) base[raw[i % raw.length][0]]++;
    return base;
  }

  function allocateChapterQuota(pool, chapters, count) {
    const byChapter = new Map();
    pool.forEach(q => {
      const ch = Number(q.ch || 0);
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      byChapter.get(ch).push(q);
    });
    const availableChapters = chapters.filter(ch => (byChapter.get(Number(ch.id)) || []).length > 0);
    const quota = new Map(availableChapters.map(ch => [Number(ch.id), 0]));
    let left = count;

    if (count >= availableChapters.length) {
      availableChapters.forEach(ch => { quota.set(Number(ch.id), 1); left--; });
    } else {
      const weighted = shuffle(availableChapters).sort((a,b) => chapterWeight(b) - chapterWeight(a));
      weighted.slice(0, count).forEach(ch => quota.set(Number(ch.id), 1));
      return quota;
    }

    while (left > 0) {
      const candidates = availableChapters.filter(ch => quota.get(Number(ch.id)) < (byChapter.get(Number(ch.id)) || []).length);
      if (!candidates.length) break;
      const scores = candidates.map(ch => {
        const id = Number(ch.id);
        const current = quota.get(id) || 0;
        return { ch, score: chapterWeight(ch) / Math.pow(current + 0.65, 0.88) };
      });
      const max = Math.max(...scores.map(x => x.score));
      const near = scores.filter(x => x.score >= max * 0.92);
      const chosen = near[Math.floor(Math.random() * near.length)].ch;
      quota.set(Number(chosen.id), (quota.get(Number(chosen.id)) || 0) + 1);
      left--;
    }
    return quota;
  }

  function chooseQuestion(chPool, selectedIds, typeDeficit) {
    const remaining = chPool.filter(q => !selectedIds.has(q.id));
    if (!remaining.length) return null;
    const availableTypes = ['multiple','single','judge'].filter(t => remaining.some(q => qType(q) === t));
    let type = availableTypes.sort((a,b) => (typeDeficit[b] || 0) - (typeDeficit[a] || 0))[0];
    if (!type || (typeDeficit[type] || 0) <= 0) type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const candidates = remaining.filter(q => qType(q) === type);
    return candidates[Math.floor(Math.random() * candidates.length)] || remaining[Math.floor(Math.random() * remaining.length)];
  }

  function smartShuffle(items) {
    const pool = shuffle(items);
    const out = [];
    while (pool.length) {
      const lastCh = out.length ? Number(out[out.length - 1].ch || 0) : null;
      let indexes = pool.map((q,i)=>({q,i})).filter(x => Number(x.q.ch || 0) !== lastCh);
      if (!indexes.length) indexes = pool.map((q,i)=>({q,i}));
      const pick = indexes[Math.floor(Math.random() * indexes.length)].i;
      out.push(pool.splice(pick, 1)[0]);
    }
    return out;
  }

  async function buildPaper(config) {
    const attempts = await getAttempts();
    const attemptByQid = new Map(attempts.filter(x => x.qid).map(x => [String(x.qid), x]));
    let pool = [...state.questions];

    if (config.scope === 'important') {
      const top = new Set(state.chapters.filter(ch => Number(ch.rank || 99) <= 5).map(ch => Number(ch.id)));
      pool = pool.filter(q => top.has(Number(q.ch)));
    } else if (config.scope === 'wrong') {
      pool = pool.filter(q => (attemptByQid.get(String(q.id))?.wrongCount || 0) > 0);
    } else if (config.scope === 'unanswered') {
      pool = pool.filter(q => !attemptByQid.has(String(q.id)));
    }

    pool = dedupeQuestions(pool);
    const requested = Math.max(5, Math.min(Number(config.count) || 30, 200));
    const count = Math.min(requested, pool.length);
    if (!count) throw new Error('当前范围没有可用于随机模拟的题目');

    const chapters = state.chapters.filter(ch => pool.some(q => Number(q.ch) === Number(ch.id)));
    const quota = allocateChapterQuota(pool, chapters, count);
    const targets = typeTargets(count, config.typeRatio);
    const deficit = {...targets};
    const selected = [];
    const selectedIds = new Set();
    const byChapter = new Map();
    pool.forEach(q => {
      const ch = Number(q.ch || 0);
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      byChapter.get(ch).push(q);
    });

    const chapterOrder = shuffle(chapters);
    chapterOrder.forEach(ch => {
      const id = Number(ch.id);
      const n = quota.get(id) || 0;
      for (let i = 0; i < n; i++) {
        const q = chooseQuestion(byChapter.get(id) || [], selectedIds, deficit);
        if (!q) break;
        selected.push(q); selectedIds.add(q.id);
        const t = qType(q); deficit[t] = (deficit[t] || 0) - 1;
      }
    });

    while (selected.length < count) {
      const remaining = pool.filter(q => !selectedIds.has(q.id));
      if (!remaining.length) break;
      const preferred = ['multiple','single','judge'].sort((a,b)=>(deficit[b]||0)-(deficit[a]||0))[0];
      const typed = remaining.filter(q => qType(q) === preferred);
      const q = (typed.length ? typed : remaining)[Math.floor(Math.random() * (typed.length ? typed.length : remaining.length))];
      selected.push(q); selectedIds.add(q.id);
      const t = qType(q); deficit[t] = (deficit[t] || 0) - 1;
    }

    return smartShuffle(selected);
  }

  function injectStyle(doc) {
    if (doc.getElementById('pwa-simulation-style')) return;
    const style = doc.createElement('style');
    style.id = 'pwa-simulation-style';
    style.textContent = `
.pwa-sim-trigger{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border:1px solid #177b69;border-radius:12px;background:#177b69;color:#fff;font:inherit;font-weight:800;cursor:pointer}
.pwa-sim-modal,.pwa-sim-view{position:fixed;inset:0;z-index:20050;background:rgba(8,15,17,.72);display:flex;align-items:flex-start;justify-content:center;padding:max(18px,env(safe-area-inset-top)) 12px max(18px,env(safe-area-inset-bottom));overflow:auto;-webkit-overflow-scrolling:touch}
.pwa-sim-card{width:min(760px,100%);background:#fff;color:#183037;border-radius:20px;border:1px solid #d7e1dd;box-shadow:0 24px 70px rgba(0,0,0,.24);padding:22px;margin:auto}
.pwa-sim-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}.pwa-sim-head h2{margin:0;font-size:24px}.pwa-sim-kicker{font-size:11px;font-weight:900;letter-spacing:.16em;color:#177b69;margin-bottom:6px}.pwa-sim-close{border:0;background:#edf3f0;color:#23434a;border-radius:999px;width:44px;height:44px;font-size:24px;cursor:pointer}
.pwa-sim-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pwa-sim-field{display:flex;flex-direction:column;gap:6px}.pwa-sim-field.full{grid-column:1/-1}.pwa-sim-field label{font-size:12px;color:#60777a;font-weight:800}.pwa-sim-field select,.pwa-sim-field input{min-height:46px;border:1px solid #cfdad6;border-radius:11px;background:#fff;color:#183037;padding:0 12px;font-size:16px}.pwa-sim-ratio{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;border-radius:13px;background:#f1f6f3}.pwa-sim-ratio strong{display:block;font-size:18px}.pwa-sim-note{font-size:12px;line-height:1.6;color:#6f8285;margin:12px 0}.pwa-sim-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.pwa-sim-primary,.pwa-sim-secondary{min-height:46px;border-radius:11px;padding:0 17px;font:inherit;font-weight:800;cursor:pointer}.pwa-sim-primary{border:1px solid #177b69;background:#177b69;color:#fff}.pwa-sim-secondary{border:1px solid #cdd9d5;background:#fff;color:#23434a}
.pwa-sim-history{margin-top:18px;border-top:1px solid #e1e9e5;padding-top:14px}.pwa-sim-history h3{font-size:14px;margin:0 0 8px}.pwa-sim-history-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px dashed #e5ece8;font-size:12px;color:#60777a}
.pwa-sim-view{background:#f6f8f5;display:block;padding:0}.pwa-sim-paper{max-width:880px;margin:0 auto;padding:max(18px,env(safe-area-inset-top)) 16px calc(110px + env(safe-area-inset-bottom));min-height:100vh}.pwa-sim-toolbar{position:sticky;top:0;z-index:5;background:rgba(246,248,245,.96);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0 12px;border-bottom:1px solid #dbe4df}.pwa-sim-progress{font-size:13px;color:#60777a}.pwa-sim-progress strong{color:#183037;font-size:18px}.pwa-sim-question{margin-top:18px;background:#fff;border:1px solid #dbe4df;border-radius:18px;padding:20px}.pwa-sim-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.pwa-sim-chip{font-size:11px;border-radius:999px;background:#edf5f1;color:#176e60;padding:5px 9px;font-weight:800}.pwa-sim-body{font-size:17px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}.pwa-sim-body img{max-width:100%;height:auto;background:#fff}.pwa-sim-answer-buttons{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.pwa-sim-choice{width:58px;height:52px;border:2px solid #aac1b8;border-radius:12px;background:#fff;color:#183037;font-size:18px;font-weight:900}.pwa-sim-choice.on{background:#177b69;border-color:#177b69;color:#fff}.pwa-sim-result{margin-top:16px;padding:15px;border-radius:13px;background:#eef5f1;line-height:1.7}.pwa-sim-result.wrong{background:#fff0ed}.pwa-sim-explain{white-space:pre-wrap;margin-top:8px}.pwa-sim-footer{position:fixed;left:0;right:0;bottom:0;z-index:6;background:rgba(255,255,255,.97);border-top:1px solid #d8e2dd;padding:9px 12px calc(9px + env(safe-area-inset-bottom));display:flex;justify-content:center;gap:9px}.pwa-sim-footer button{min-height:46px;padding:0 18px;border-radius:11px;font:inherit;font-weight:800}.pwa-sim-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.pwa-sim-summary-grid div{background:#f0f5f2;border-radius:13px;padding:14px}.pwa-sim-summary-grid strong{display:block;font-size:24px;color:#177b69}.pwa-sim-breakdown{margin-top:16px}.pwa-sim-breakdown-row{display:grid;grid-template-columns:minmax(0,1fr) 70px 70px;gap:8px;padding:8px 0;border-bottom:1px dashed #dde6e2;font-size:13px}
@media(max-width:600px){.pwa-sim-card{padding:17px;border-radius:17px}.pwa-sim-grid{grid-template-columns:1fr}.pwa-sim-field.full{grid-column:auto}.pwa-sim-question{padding:16px}.pwa-sim-body{font-size:16px}.pwa-sim-footer{justify-content:stretch}.pwa-sim-footer button{flex:1;padding:0 8px}.pwa-sim-summary-grid{grid-template-columns:1fr 1fr}.pwa-sim-ratio{font-size:12px}}
@media(prefers-color-scheme:dark){.pwa-sim-view{background:#101719}.pwa-sim-paper{color:#eef4f2}.pwa-sim-toolbar{background:rgba(16,23,25,.96);border-color:#2e3b3e}.pwa-sim-progress,.pwa-sim-progress strong{color:#dce8e4}.pwa-sim-question,.pwa-sim-card{background:#182225;color:#eef4f2;border-color:#2e3b3e}.pwa-sim-field label,.pwa-sim-note,.pwa-sim-history-row{color:#a6b5b1}.pwa-sim-field select,.pwa-sim-field input,.pwa-sim-secondary,.pwa-sim-choice{background:#223033;color:#eef4f2;border-color:#425257}.pwa-sim-ratio,.pwa-sim-summary-grid div{background:#15302b}.pwa-sim-footer{background:rgba(18,28,31,.97);border-color:#2e3b3e}.pwa-sim-result{background:#15362f}.pwa-sim-result.wrong{background:#4b2926}.pwa-sim-close{background:#223033;color:#fff}.pwa-sim-breakdown-row{border-color:#2e3b3e}}
`;
    doc.head.appendChild(style);
  }

  function parseData(doc) {
    const el = doc.getElementById('study-data');
    if (!el) throw new Error('未找到原复习 HTML 的 study-data 数据块');
    const data = JSON.parse(el.textContent || '{}');
    const questions = findQuestionArray(data);
    if (!questions.length) throw new Error('未识别到原题库数组');
    state.data = data;
    state.chapters = Array.isArray(data.chapters) ? data.chapters : [];
    state.chapterMap = new Map(state.chapters.map(ch => [Number(ch.id), ch]));
    state.questions = dedupeQuestions(questions);
  }

  function history() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  }

  function saveHistory(record) {
    const list = history();
    list.unshift(record);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  }

  function historyHtml() {
    const rows = history().slice(0,5);
    if (!rows.length) return '<div class="pwa-sim-history"><h3>最近模拟</h3><div class="pwa-sim-note">还没有模拟记录。</div></div>';
    return `<div class="pwa-sim-history"><h3>最近模拟</h3>${rows.map(x => `<div class="pwa-sim-history-row"><span>${escapeHtml(new Date(x.at).toLocaleString('zh-CN',{hour12:false}))} · ${x.count}题</span><strong>${x.score ?? '—'}%</strong></div>`).join('')}</div>`;
  }

  function openConfig(doc) {
    doc.getElementById('pwaSimulationModal')?.remove();
    const modal = doc.createElement('div');
    modal.id = 'pwaSimulationModal';
    modal.className = 'pwa-sim-modal';
    modal.innerHTML = `<div class="pwa-sim-card">
      <div class="pwa-sim-head"><div><div class="pwa-sim-kicker">RANDOM SIMULATION</div><h2>随机模拟</h2></div><button class="pwa-sim-close" type="button">×</button></div>
      <div class="pwa-sim-grid">
        <div class="pwa-sim-field"><label>题量</label><select id="pwaSimCount"><option>10</option><option>20</option><option selected>30</option><option>50</option><option value="custom">自定义</option></select></div>
        <div class="pwa-sim-field"><label>自定义题量（5–200）</label><input id="pwaSimCustom" type="number" min="5" max="200" value="30" disabled></div>
        <div class="pwa-sim-field"><label>模式</label><select id="pwaSimMode"><option value="practice" selected>练习模式 · 每题可核对</option><option value="exam">考试模式 · 最后统一提交</option></select></div>
        <div class="pwa-sim-field"><label>范围</label><select id="pwaSimScope"><option value="all" selected>全部题库</option><option value="important">重点章节 · 排名前5</option><option value="wrong">历史错题</option><option value="unanswered">未做题</option></select></div>
        <div class="pwa-sim-field full"><label>默认题型比例</label><div class="pwa-sim-ratio"><div>单选<strong>40%</strong></div><div>多选<strong>45%</strong></div><div>判断<strong>15%</strong></div></div></div>
      </div>
      <div class="pwa-sim-note">默认 30 题。题量不少于可用章节数时，保证每个章节至少 1 题；其余题量按原复习册章节重要度/建议复习时长加权分配。最终整卷再次打乱，尽量避免连续出现同一章节。同组重复题默认去重。</div>
      <div class="pwa-sim-actions"><button id="pwaSimGenerate" class="pwa-sim-primary" type="button">生成模拟卷</button><button class="pwa-sim-secondary pwa-sim-close2" type="button">取消</button></div>
      ${historyHtml()}
    </div>`;
    doc.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.pwa-sim-close').onclick = close;
    modal.querySelector('.pwa-sim-close2').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    const countSel = modal.querySelector('#pwaSimCount');
    const custom = modal.querySelector('#pwaSimCustom');
    countSel.onchange = () => { custom.disabled = countSel.value !== 'custom'; if (!custom.disabled) custom.focus(); };
    modal.querySelector('#pwaSimGenerate').onclick = async () => {
      const count = countSel.value === 'custom' ? Number(custom.value) : Number(countSel.value);
      const config = {
        ...DEFAULT_CONFIG,
        count: Math.max(5, Math.min(count || 30, 200)),
        mode: modal.querySelector('#pwaSimMode').value,
        scope: modal.querySelector('#pwaSimScope').value,
        typeRatio: {...DEFAULT_CONFIG.typeRatio}
      };
      const btn = modal.querySelector('#pwaSimGenerate');
      btn.disabled = true; btn.textContent = '正在抽题…';
      try {
        const paper = await buildPaper(config);
        close();
        startPaper(doc, paper, config);
      } catch (err) {
        btn.disabled = false; btn.textContent = '生成模拟卷';
        alert(err.message || String(err));
      }
    };
  }

  function optionLetters(q) {
    if (qType(q) === 'judge') return ['A','B'];
    const body = String(q.body || q.text || '');
    const detected = ['A','B','C','D'].filter(x => new RegExp(`(^|\\n|\\s)${x}[．.、:]`).test(body));
    return detected.length >= 2 ? detected : ['A','B','C','D'];
  }

  function chapterName(q) {
    return state.chapterMap.get(Number(q.ch))?.name || `第${q.ch || '—'}章`;
  }

  function questionBody(q) {
    const raw = String(q.body || q.text || '').trim();
    return raw || '<span style="color:#8b9995">该题题干主要来自原图，请查看原资料。</span>';
  }

  function currentAnswer(q) { return normLetters(state.answers[q.id] || ''); }

  function setAnswer(q, letter) {
    if (state.submitted || (state.config.mode === 'practice' && state.checked[q.id])) return;
    const type = qType(q);
    if (type === 'multiple') {
      const set = new Set((state.answers[q.id] || '').split('').filter(Boolean));
      if (set.has(letter)) set.delete(letter); else set.add(letter);
      state.answers[q.id] = Array.from(set).sort().join('');
    } else state.answers[q.id] = letter;
    renderQuestion();
  }

  function isCorrect(q) { return currentAnswer(q) === normLetters(q.answer); }

  function renderQuestion() {
    const doc = state.doc;
    const view = doc.getElementById('pwaSimulationView');
    if (!view || !state.paper) return;
    const q = state.paper[state.index];
    const type = qType(q);
    const checked = state.checked[q.id] || state.submitted;
    const selected = currentAnswer(q);
    const correct = normLetters(q.answer);
    const typeLabel = {single:'单选',multiple:'多选',judge:'判断'}[type];
    const modeLabel = state.config.mode === 'exam' ? '考试模式' : '练习模式';
    const resultHtml = checked ? `<div class="pwa-sim-result ${isCorrect(q) ? '' : 'wrong'}"><strong>${isCorrect(q) ? '✓ 回答正确' : '✕ 回答错误'}</strong><div>你的答案：${escapeHtml(selected || '未作答')}　正确答案：${escapeHtml(correct)}</div>${q.explain ? `<div class="pwa-sim-explain">${escapeHtml(q.explain)}</div>` : ''}</div>` : '';
    view.innerHTML = `<div class="pwa-sim-paper">
      <div class="pwa-sim-toolbar"><button id="pwaSimExit" class="pwa-sim-secondary" type="button">退出</button><div class="pwa-sim-progress"><strong>${state.index + 1}</strong> / ${state.paper.length} · ${modeLabel}</div><span>${Object.keys(state.answers).filter(k=>state.answers[k]).length} 已答</span></div>
      <article class="pwa-sim-question">
        <div class="pwa-sim-meta"><span class="pwa-sim-chip">${escapeHtml(typeLabel)}</span><span class="pwa-sim-chip">${escapeHtml(chapterName(q))}</span><span class="pwa-sim-chip">${escapeHtml(q.id)}</span></div>
        <div class="pwa-sim-body">${questionBody(q)}</div>
        <div class="pwa-sim-answer-buttons">${optionLetters(q).map(letter => `<button type="button" class="pwa-sim-choice ${selected.includes(letter)?'on':''}" data-letter="${letter}">${letter}</button>`).join('')}</div>
        ${resultHtml}
      </article>
      <div class="pwa-sim-footer"><button id="pwaSimPrev" class="pwa-sim-secondary" type="button" ${state.index===0?'disabled':''}>上一题</button>${state.config.mode==='practice' && !checked ? '<button id="pwaSimCheck" class="pwa-sim-primary" type="button">核对本题</button>' : ''}<button id="pwaSimNext" class="pwa-sim-primary" type="button">${state.index===state.paper.length-1 ? (state.submitted?'查看结果':'提交试卷') : '下一题'}</button></div>
    </div>`;
    view.querySelector('#pwaSimExit').onclick = () => { if (confirm('退出本次模拟？当前未提交的作答不会计入模拟成绩。')) view.remove(); };
    view.querySelectorAll('.pwa-sim-choice').forEach(btn => btn.onclick = () => setAnswer(q, btn.dataset.letter));
    view.querySelector('#pwaSimPrev').onclick = () => { if (state.index > 0) { state.index--; renderQuestion(); } };
    const check = view.querySelector('#pwaSimCheck');
    if (check) check.onclick = () => { state.checked[q.id] = true; renderQuestion(); };
    view.querySelector('#pwaSimNext').onclick = () => {
      if (state.index < state.paper.length - 1) { state.index++; renderQuestion(); window.scrollTo(0,0); return; }
      if (state.submitted) { renderSummary(); return; }
      submitPaper();
    };
  }

  function startPaper(doc, paper, config) {
    doc.getElementById('pwaSimulationView')?.remove();
    state.doc = doc; state.paper = paper; state.config = config; state.index = 0; state.answers = {}; state.checked = {}; state.submitted = false;
    const view = doc.createElement('section');
    view.id = 'pwaSimulationView'; view.className = 'pwa-sim-view';
    doc.body.appendChild(view);
    renderQuestion();
  }

  function submitPaper() {
    state.submitted = true;
    state.paper.forEach(q => { state.checked[q.id] = true; });
    const correct = state.paper.filter(isCorrect).length;
    const score = Math.round(correct / state.paper.length * 100);
    saveHistory({
      id: `SIM-${Date.now()}`,
      at: new Date().toISOString(), count: state.paper.length, score,
      correct, mode: state.config.mode, scope: state.config.scope,
      questionIds: state.paper.map(q=>q.id)
    });
    renderSummary();
  }

  function renderSummary() {
    const doc = state.doc;
    const view = doc.getElementById('pwaSimulationView');
    if (!view) return;
    const correct = state.paper.filter(isCorrect).length;
    const score = Math.round(correct / state.paper.length * 100);
    const byType = {};
    const byChapter = {};
    state.paper.forEach(q => {
      const t = qType(q); const ch = chapterName(q); const ok = isCorrect(q);
      byType[t] ||= {n:0,c:0}; byType[t].n++; if(ok)byType[t].c++;
      byChapter[ch] ||= {n:0,c:0}; byChapter[ch].n++; if(ok)byChapter[ch].c++;
    });
    const typeName = {single:'单选',multiple:'多选',judge:'判断'};
    const breakdown = [...Object.entries(byChapter)].sort((a,b)=>(a[1].c/a[1].n)-(b[1].c/b[1].n));
    view.innerHTML = `<div class="pwa-sim-paper"><div class="pwa-sim-toolbar"><button id="pwaSimExit" class="pwa-sim-secondary" type="button">返回题库</button><div class="pwa-sim-progress"><strong>模拟结果</strong></div><span>${state.paper.length}题</span></div>
      <article class="pwa-sim-question"><div class="pwa-sim-kicker">RESULT</div><h2>本次模拟完成</h2>
      <div class="pwa-sim-summary-grid"><div><span>正确率</span><strong>${score}%</strong></div><div><span>答对</span><strong>${correct}/${state.paper.length}</strong></div><div><span>未作答</span><strong>${state.paper.filter(q=>!currentAnswer(q)).length}</strong></div></div>
      <div class="pwa-sim-breakdown"><h3>题型表现</h3>${Object.entries(byType).map(([k,v])=>`<div class="pwa-sim-breakdown-row"><span>${typeName[k]}</span><span>${v.c}/${v.n}</span><strong>${Math.round(v.c/v.n*100)}%</strong></div>`).join('')}</div>
      <div class="pwa-sim-breakdown"><h3>章节表现 · 薄弱优先</h3>${breakdown.map(([k,v])=>`<div class="pwa-sim-breakdown-row"><span>${escapeHtml(k)}</span><span>${v.c}/${v.n}</span><strong>${Math.round(v.c/v.n*100)}%</strong></div>`).join('')}</div>
      <div class="pwa-sim-actions"><button id="pwaSimReview" class="pwa-sim-primary" type="button">逐题复盘</button><button id="pwaSimAgain" class="pwa-sim-secondary" type="button">再生成一组</button></div></article></div>`;
    view.querySelector('#pwaSimExit').onclick = () => view.remove();
    view.querySelector('#pwaSimReview').onclick = () => { state.index = 0; renderQuestion(); };
    view.querySelector('#pwaSimAgain').onclick = () => { view.remove(); openConfig(doc); };
  }

  function attach(doc) {
    if (!doc?.body || !doc?.head) return;
    state.doc = doc;
    injectStyle(doc);
    try { parseData(doc); } catch (err) { console.warn('[simulation]', err); return; }

    const installTrigger = () => {
      if (doc.getElementById('pwaSimulationTrigger')) return;
      const questionsTab = doc.querySelector('.tab[data-view="questions"]');
      const active = questionsTab?.classList.contains('active');
      if (!active) return;
      const trigger = doc.createElement('button');
      trigger.id = 'pwaSimulationTrigger'; trigger.type = 'button'; trigger.className = 'pwa-sim-trigger'; trigger.textContent = '🎲 随机模拟';
      trigger.onclick = () => openConfig(doc);
      const retry = Array.from(doc.querySelectorAll('button')).find(b => /重练错题/.test((b.textContent||'').trim()));
      if (retry?.parentElement) retry.parentElement.insertBefore(trigger, retry);
      else {
        const head = doc.querySelector('#app .section-head, #app .section-title-row, #app');
        if (head) head.appendChild(trigger);
      }
    };

    installTrigger();
    const observer = new MutationObserver(() => installTrigger());
    observer.observe(doc.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
    doc.addEventListener('click', e => { if (e.target?.closest?.('.tab[data-view="questions"]')) setTimeout(installTrigger, 50); }, true);
  }

  function boot() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    frame.addEventListener('load', () => {
      try { attach(frame.contentDocument); } catch (err) { console.warn('[simulation attach]', err); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
