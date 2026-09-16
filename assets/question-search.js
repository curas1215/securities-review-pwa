(() => {
  'use strict';

  const FRAME_ID = 'studyFrame';
  const STYLE_ID = 'pwa-question-search-style';
  const TRIGGER_ID = 'pwaQuestionSearchTrigger';
  const MODAL_ID = 'pwaQuestionSearchModal';
  const MAX_RESULTS = 100;

  const state = {
    doc: null,
    questions: [],
    chapters: [],
    chapterMap: new Map(),
    groups: [],
    query: ''
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function stripHtml(doc, value) {
    const raw = String(value ?? '');
    if (!raw) return '';
    const box = doc.createElement('div');
    box.innerHTML = raw;
    return (box.textContent || box.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function stringifySimple(value, depth = 0) {
    if (value == null || depth > 2) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.slice(0, 20).map(v => stringifySimple(v, depth + 1)).join(' ');
    if (typeof value === 'object') return Object.values(value).slice(0, 30).map(v => stringifySimple(v, depth + 1)).join(' ');
    return '';
  }

  function findQuestionArray(data) {
    if (!data || typeof data !== 'object') return [];
    let best = [];
    const visit = (value, depth = 0) => {
      if (!value || depth > 3) return;
      if (Array.isArray(value)) {
        const sample = value.find(x => x && typeof x === 'object');
        if (sample && ('id' in sample) && ('answer' in sample) && (('body' in sample) || ('text' in sample))) {
          if (value.length > best.length) best = value;
        }
        return;
      }
      if (typeof value === 'object') Object.values(value).forEach(v => visit(v, depth + 1));
    };
    visit(data);
    return best;
  }

  function findChapterArray(data) {
    const direct = data?.chapters;
    if (Array.isArray(direct) && direct.length) return direct;
    let best = [];
    const visit = (value, depth = 0) => {
      if (!value || depth > 3) return;
      if (Array.isArray(value)) {
        const sample = value.find(x => x && typeof x === 'object');
        if (sample && ('id' in sample) && (('rank' in sample) || ('hours' in sample)) && (('title' in sample) || ('name' in sample) || ('label' in sample))) {
          if (value.length > best.length) best = value;
        }
        return;
      }
      if (typeof value === 'object') Object.values(value).forEach(v => visit(v, depth + 1));
    };
    visit(data);
    return best;
  }

  function parseData(doc) {
    const el = doc.getElementById('study-data');
    if (!el) throw new Error('未找到原复习 HTML 的 study-data 数据块');
    const data = JSON.parse(el.textContent || '{}');
    const questions = findQuestionArray(data);
    if (!questions.length) throw new Error('未识别到原题库数组');
    const chapters = findChapterArray(data);
    return {data, questions, chapters};
  }

  function completeness(q) {
    let score = 0;
    if (String(q.body || q.text || '').trim().length > 30) score += 4;
    if (String(q.explain || '').trim().length > 15) score += 3;
    if (!q.needsOriginal) score += 1;
    if (q.verified) score += 1;
    return score;
  }

  function buildGroups(doc, questions) {
    const grouped = new Map();
    questions.forEach(q => {
      if (!q || !q.id) return;
      const key = String(q.group || q.id);
      const old = grouped.get(key);
      if (!old) grouped.set(key, {key, count: 1, q});
      else {
        old.count += 1;
        if (completeness(q) > completeness(old.q)) old.q = q;
      }
    });

    return Array.from(grouped.values()).map(item => {
      const q = item.q;
      const body = stripHtml(doc, q.body || q.text || '');
      const explain = stripHtml(doc, q.explain || '');
      const options = stripHtml(doc, stringifySimple(q.options || q.option || q.choices || ''));
      const meta = [q.id, q.card, q.knowledge, q.knowledgePoint, q.point, q.title, q.source, q.sourceName, q.tags, q.keywords]
        .map(v => stripHtml(doc, stringifySimple(v))).filter(Boolean).join(' ');
      const all = `${q.id || ''} ${body} ${options} ${explain} ${meta}`.toLowerCase();
      return {...item, body, explain, options, meta, all};
    });
  }

  function qType(q) {
    if (q?.judgment === true) return '判断';
    const letters = String(q?.answer || '').toUpperCase().match(/[A-D]/g) || [];
    return letters.length > 1 ? '多选' : '单选';
  }

  function chapterName(q) {
    const ch = state.chapterMap.get(Number(q?.ch));
    return ch?.title || ch?.name || ch?.label || (q?.ch ? `第${q.ch}章` : '未标章节');
  }

  function normalizeQuery(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function queryTokens(value) {
    return normalizeQuery(value).toLowerCase().split(' ').filter(Boolean).slice(0, 8);
  }

  function search(value) {
    const query = normalizeQuery(value);
    const tokens = queryTokens(query);
    if (!tokens.length) return [];
    const phrase = query.toLowerCase();

    const results = [];
    for (const item of state.groups) {
      if (!tokens.every(t => item.all.includes(t))) continue;
      const q = item.q;
      const id = String(q.id || '').toLowerCase();
      const body = item.body.toLowerCase();
      const explain = item.explain.toLowerCase();
      const meta = item.meta.toLowerCase();
      let score = 0;
      if (id === phrase) score += 1000;
      else if (id.includes(phrase)) score += 420;
      if (body.includes(phrase)) score += 160;
      if (meta.includes(phrase)) score += 120;
      if (explain.includes(phrase)) score += 70;
      tokens.forEach(t => {
        if (id.includes(t)) score += 100;
        if (body.includes(t)) score += 35;
        if (meta.includes(t)) score += 25;
        if (explain.includes(t)) score += 15;
      });
      score += completeness(q) * 2;
      results.push({...item, score});
    }
    return results.sort((a,b) => b.score - a.score || String(a.q.id).localeCompare(String(b.q.id), 'zh-CN'));
  }

  function highlight(text, query) {
    const safe = escapeHtml(text || '');
    const tokens = queryTokens(query).sort((a,b) => b.length - a.length);
    if (!tokens.length) return safe;
    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    try {
      const re = new RegExp(`(${escapedTokens.join('|')})`, 'ig');
      return safe.replace(re, '<mark>$1</mark>');
    } catch (_) { return safe; }
  }

  function snippet(text, query, max = 170) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const tokens = queryTokens(query);
    const lower = clean.toLowerCase();
    let pos = -1;
    for (const t of tokens) {
      const p = lower.indexOf(t);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) return clean.slice(0, max) + (clean.length > max ? '…' : '');
    const start = Math.max(0, pos - 45);
    const end = Math.min(clean.length, start + max);
    return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
  }

  function sanitizeQuestionHtml(doc, raw) {
    const text = String(raw || '');
    if (!/<[a-z][\s\S]*>/i.test(text)) return escapeHtml(text).replace(/\n/g, '<br>');
    const tpl = doc.createElement('template');
    tpl.innerHTML = text;
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(el => el.remove());
    tpl.content.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) el.removeAttribute(attr.name);
      });
    });
    return tpl.innerHTML;
  }

  function optionsHtml(q) {
    const value = q.options || q.option || q.choices;
    if (!value) return '';
    if (Array.isArray(value)) {
      return `<div class="pwa-qs-options">${value.map((v,i) => `<div><strong>${String.fromCharCode(65+i)}.</strong> ${escapeHtml(stringifySimple(v))}</div>`).join('')}</div>`;
    }
    if (typeof value === 'object') {
      return `<div class="pwa-qs-options">${Object.entries(value).map(([k,v]) => `<div><strong>${escapeHtml(k)}.</strong> ${escapeHtml(stringifySimple(v))}</div>`).join('')}</div>`;
    }
    return `<div class="pwa-qs-options">${escapeHtml(String(value)).replace(/\n/g,'<br>')}</div>`;
  }

  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.pwa-qs-trigger{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border:1px solid #52706b;border-radius:12px;background:#fff;color:#183037;font:inherit;font-weight:800;cursor:pointer;margin-left:8px}
.pwa-qs-trigger.pwa-qs-floating{position:fixed;right:14px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:19000;box-shadow:0 8px 26px rgba(0,0,0,.16);margin:0}
.pwa-qs-modal{position:fixed;inset:0;z-index:21050;background:rgba(8,15,17,.72);display:flex;align-items:flex-start;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 10px max(16px,env(safe-area-inset-bottom));overflow:auto;-webkit-overflow-scrolling:touch}
.pwa-qs-card{width:min(900px,100%);min-height:min(720px,calc(100vh - 32px));background:#fff;color:#183037;border:1px solid #d7e1dd;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.24);padding:20px;margin:auto}
.pwa-qs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.pwa-qs-kicker{font-size:11px;font-weight:900;letter-spacing:.16em;color:#177b69;margin-bottom:5px}.pwa-qs-head h2{margin:0;font-size:24px}.pwa-qs-close{width:44px;height:44px;border:0;border-radius:999px;background:#edf3f0;color:#23434a;font-size:24px;cursor:pointer}
.pwa-qs-searchrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;margin:18px 0 8px}.pwa-qs-input{min-height:50px;border:2px solid #b8cbc4;border-radius:13px;background:#fff;color:#183037;padding:0 14px;font-size:17px;outline:none}.pwa-qs-input:focus{border-color:#177b69;box-shadow:0 0 0 3px rgba(23,123,105,.12)}.pwa-qs-searchbtn{min-height:50px;border:1px solid #177b69;border-radius:13px;background:#177b69;color:#fff;padding:0 18px;font:inherit;font-weight:900;cursor:pointer}.pwa-qs-hint{font-size:12px;color:#6c8082;line-height:1.55;margin-bottom:14px}.pwa-qs-status{font-size:13px;font-weight:800;color:#526c6e;margin:10px 0}
.pwa-qs-results{display:grid;gap:10px}.pwa-qs-result{width:100%;text-align:left;border:1px solid #dbe5e1;border-radius:14px;background:#fbfcfb;color:#183037;padding:14px;cursor:pointer}.pwa-qs-result:hover{border-color:#91b3a9}.pwa-qs-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.pwa-qs-chip{font-size:11px;font-weight:800;border-radius:999px;padding:4px 8px;background:#edf5f1;color:#176e60}.pwa-qs-title{font-size:15px;font-weight:800;line-height:1.55;margin-bottom:6px}.pwa-qs-snippet{font-size:13px;line-height:1.65;color:#5f7375}.pwa-qs-result mark,.pwa-qs-detail mark{background:#fff1a8;color:inherit;border-radius:3px;padding:0 1px}
.pwa-qs-empty{padding:34px 12px;text-align:center;color:#7a8d8f}.pwa-qs-detail{display:none}.pwa-qs-detail.show{display:block}.pwa-qs-list.hidden{display:none}.pwa-qs-back{min-height:42px;border:1px solid #cbd8d3;border-radius:11px;background:#fff;color:#23434a;padding:0 13px;font:inherit;font-weight:800;cursor:pointer;margin:12px 0}.pwa-qs-detailbox{border:1px solid #dbe5e1;border-radius:16px;background:#fbfcfb;padding:18px}.pwa-qs-body{font-size:17px;line-height:1.85;white-space:normal;overflow-wrap:anywhere}.pwa-qs-body img{max-width:100%;height:auto;background:#fff}.pwa-qs-options{display:grid;gap:8px;margin-top:14px;font-size:15px;line-height:1.7}.pwa-qs-reveal{min-height:44px;margin-top:18px;border:1px solid #177b69;border-radius:11px;background:#177b69;color:#fff;padding:0 16px;font:inherit;font-weight:900;cursor:pointer}.pwa-qs-answer{display:none;margin-top:14px;padding:14px;border-radius:13px;background:#edf5f1;line-height:1.75}.pwa-qs-answer.show{display:block}.pwa-qs-explain{white-space:pre-wrap;margin-top:8px}.pwa-qs-source-note{font-size:12px;color:#718486;margin-top:12px}
@media(max-width:600px){.pwa-qs-card{padding:15px;border-radius:17px;min-height:calc(100vh - 24px)}.pwa-qs-searchrow{grid-template-columns:1fr}.pwa-qs-searchbtn{width:100%}.pwa-qs-body{font-size:16px}.pwa-qs-trigger{padding:0 12px}}
@media(prefers-color-scheme:dark){.pwa-qs-trigger{background:#223033;color:#eef4f2;border-color:#425257}.pwa-qs-card{background:#182225;color:#eef4f2;border-color:#2e3b3e}.pwa-qs-close,.pwa-qs-back{background:#223033;color:#eef4f2;border-color:#425257}.pwa-qs-input{background:#101719;color:#eef4f2;border-color:#425257}.pwa-qs-hint,.pwa-qs-status,.pwa-qs-snippet,.pwa-qs-source-note{color:#a7b7b3}.pwa-qs-result,.pwa-qs-detailbox{background:#202c2f;color:#eef4f2;border-color:#344449}.pwa-qs-answer{background:#15362f;color:#eef4f2}.pwa-qs-result mark,.pwa-qs-detail mark{background:#66551d;color:#fff5c2}}
`;
    doc.head.appendChild(style);
  }

  function renderResults(doc, results, query) {
    const list = doc.querySelector(`#${MODAL_ID} .pwa-qs-results`);
    const status = doc.querySelector(`#${MODAL_ID} .pwa-qs-status`);
    if (!list || !status) return;

    if (!queryTokens(query).length) {
      status.textContent = `可搜索 ${state.groups.length} 个去重题组`;
      list.innerHTML = '<div class="pwa-qs-empty">输入关键词开始搜题，例如：CAPM、β、杜邦分析、N11Q035</div>';
      return;
    }

    status.textContent = `找到 ${results.length} 个题组${results.length > MAX_RESULTS ? ` · 展示前 ${MAX_RESULTS} 个` : ''}`;
    if (!results.length) {
      list.innerHTML = '<div class="pwa-qs-empty">没有找到匹配题目。可以减少关键词，或尝试题号/核心概念。</div>';
      return;
    }

    list.innerHTML = results.slice(0, MAX_RESULTS).map((item, index) => {
      const q = item.q;
      const title = snippet(item.body || item.meta || q.id, query, 125);
      const detail = snippet(item.explain || item.body, query, 180);
      return `<button type="button" class="pwa-qs-result" data-result-index="${index}">
        <div class="pwa-qs-meta"><span class="pwa-qs-chip">${escapeHtml(qType(q))}</span><span class="pwa-qs-chip">${escapeHtml(chapterName(q))}</span><span class="pwa-qs-chip">${escapeHtml(q.id || '')}</span>${item.count > 1 ? `<span class="pwa-qs-chip">同组 ${item.count} 次</span>` : ''}</div>
        <div class="pwa-qs-title">${highlight(title, query)}</div>
        ${detail ? `<div class="pwa-qs-snippet">${highlight(detail, query)}</div>` : ''}
      </button>`;
    }).join('');

    list.querySelectorAll('.pwa-qs-result').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = results[Number(btn.dataset.resultIndex)];
        if (item) showDetail(doc, item, query);
      });
    });
  }

  function showDetail(doc, item, query) {
    const modal = doc.getElementById(MODAL_ID);
    if (!modal) return;
    const list = modal.querySelector('.pwa-qs-list');
    const detail = modal.querySelector('.pwa-qs-detail');
    if (!list || !detail) return;
    const q = item.q;
    const rawBody = q.body || q.text || '';
    detail.innerHTML = `
      <button type="button" class="pwa-qs-back">← 返回搜索结果</button>
      <div class="pwa-qs-detailbox">
        <div class="pwa-qs-meta"><span class="pwa-qs-chip">${escapeHtml(qType(q))}</span><span class="pwa-qs-chip">${escapeHtml(chapterName(q))}</span><span class="pwa-qs-chip">${escapeHtml(q.id || '')}</span>${q.card ? `<span class="pwa-qs-chip">${escapeHtml(stringifySimple(q.card))}</span>` : ''}${item.count > 1 ? `<span class="pwa-qs-chip">同组收录 ${item.count} 次</span>` : ''}</div>
        <div class="pwa-qs-body">${sanitizeQuestionHtml(doc, rawBody)}</div>
        ${optionsHtml(q)}
        <button type="button" class="pwa-qs-reveal">显示答案与解析</button>
        <div class="pwa-qs-answer"><div><strong>答案：</strong>${escapeHtml(q.answer || '原资料未提供')}</div>${q.explain ? `<div class="pwa-qs-explain"><strong>解析：</strong>${escapeHtml(q.explain)}</div>` : '<div class="pwa-qs-explain">原资料没有结构化解析。</div>'}</div>
        ${q.needsOriginal ? '<div class="pwa-qs-source-note">提示：该题部分内容来自原始扫描资料，结构化文字可能不完整。</div>' : ''}
      </div>`;
    list.classList.add('hidden');
    detail.classList.add('show');
    detail.querySelector('.pwa-qs-back').onclick = () => {
      detail.classList.remove('show');
      list.classList.remove('hidden');
    };
    const reveal = detail.querySelector('.pwa-qs-reveal');
    const answer = detail.querySelector('.pwa-qs-answer');
    reveal.onclick = () => {
      const visible = answer.classList.toggle('show');
      reveal.textContent = visible ? '收起答案与解析' : '显示答案与解析';
    };
  }

  function openModal(doc) {
    doc.getElementById(MODAL_ID)?.remove();
    const modal = doc.createElement('section');
    modal.id = MODAL_ID;
    modal.className = 'pwa-qs-modal';
    modal.innerHTML = `<div class="pwa-qs-card">
      <div class="pwa-qs-head"><div><div class="pwa-qs-kicker">QUESTION SEARCH</div><h2>关键词搜题</h2></div><button type="button" class="pwa-qs-close" aria-label="关闭搜题">×</button></div>
      <div class="pwa-qs-list">
        <div class="pwa-qs-searchrow"><input class="pwa-qs-input" type="search" inputmode="search" autocomplete="off" placeholder="搜索题干、解析、题号或知识点"><button type="button" class="pwa-qs-searchbtn">搜索</button></div>
        <div class="pwa-qs-hint">支持多个关键词，以空格分隔；多个关键词采用“同时包含”匹配。同组重复题默认合并，不修改原题库。</div>
        <div class="pwa-qs-status"></div><div class="pwa-qs-results"></div>
      </div>
      <div class="pwa-qs-detail"></div>
    </div>`;
    doc.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.pwa-qs-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    doc.addEventListener('keydown', function onKey(e) {
      if (!doc.getElementById(MODAL_ID)) { doc.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') close();
    });

    const input = modal.querySelector('.pwa-qs-input');
    const button = modal.querySelector('.pwa-qs-searchbtn');
    let timer = 0;
    const run = () => {
      state.query = normalizeQuery(input.value);
      renderResults(doc, search(state.query), state.query);
    };
    button.onclick = run;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 180);
    });
    renderResults(doc, [], '');
    setTimeout(() => input.focus(), 50);
  }

  function placeTrigger(doc) {
    if (doc.getElementById(TRIGGER_ID)) return;
    const btn = doc.createElement('button');
    btn.id = TRIGGER_ID;
    btn.type = 'button';
    btn.className = 'pwa-qs-trigger';
    btn.textContent = '🔍 搜题';
    btn.setAttribute('aria-label', '关键词搜题');
    btn.onclick = () => openModal(doc);

    const sim = doc.querySelector('.pwa-sim-trigger');
    if (sim?.parentElement) {
      sim.insertAdjacentElement('afterend', btn);
      return;
    }

    const buttons = Array.from(doc.querySelectorAll('button'));
    const retrain = buttons.find(el => (el.textContent || '').includes('重练错题'));
    if (retrain?.parentElement) {
      retrain.insertAdjacentElement('afterend', btn);
      return;
    }

    const tools = doc.querySelector('.tools,.toolbar,.actions,.top-actions');
    if (tools) {
      tools.appendChild(btn);
      return;
    }

    btn.classList.add('pwa-qs-floating');
    doc.body.appendChild(btn);
  }

  function enhance(doc) {
    if (!doc?.head || !doc?.body) return;
    try {
      const parsed = parseData(doc);
      state.doc = doc;
      state.questions = parsed.questions;
      state.chapters = parsed.chapters;
      state.chapterMap = new Map(parsed.chapters.map(ch => [Number(ch.id), ch]));
      state.groups = buildGroups(doc, parsed.questions);
      injectStyle(doc);
      placeTrigger(doc);

      if (!doc.body.dataset.pwaQuestionSearchBound) {
        doc.body.dataset.pwaQuestionSearchBound = '1';
        const observer = new MutationObserver(() => {
          if (!doc.getElementById(TRIGGER_ID)) requestAnimationFrame(() => placeTrigger(doc));
        });
        observer.observe(doc.body, {subtree:true, childList:true});
      }
    } catch (error) {
      console.warn('Question search unavailable:', error);
    }
  }

  function bind() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    const run = () => {
      try { enhance(frame.contentDocument); } catch (_) {}
    };
    frame.addEventListener('load', () => {
      requestAnimationFrame(run);
      setTimeout(run, 250);
    });
    run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true});
  else bind();
})();
