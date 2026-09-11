function installDarkModeContrastFix() {
  const frame = document.getElementById('studyFrame');
  if (!frame) return;

  const inject = () => {
    let doc;
    try { doc = frame.contentDocument; } catch (_) { return; }
    if (!doc || !doc.head || !doc.body) return;

    const old = doc.getElementById('pwa-dark-button-contrast-fix');
    if (old) old.remove();

    const style = doc.createElement('style');
    style.id = 'pwa-dark-button-contrast-fix';
    style.textContent = `
/* Mobile integrity rules: study content must never be visually clipped. */
body.pwa-mobile .qbox,
body.pwa-mobile .qslot,
body.pwa-mobile .qpreview,
body.pwa-mobile .qpreview > summary,
body.pwa-mobile .qtext,
body.pwa-mobile .material,
body.pwa-mobile .raw,
body.pwa-mobile .example,
body.pwa-mobile .answer,
body.pwa-mobile .qsolution {
  max-height:none !important;
  height:auto !important;
  text-overflow:clip !important;
}
body.pwa-mobile .qbox,
body.pwa-mobile .qslot,
body.pwa-mobile .qtext,
body.pwa-mobile .material,
body.pwa-mobile .raw,
body.pwa-mobile .example,
body.pwa-mobile .answer,
body.pwa-mobile .qsolution {
  overflow:visible !important;
}
body.pwa-mobile .qtext,
body.pwa-mobile .material,
body.pwa-mobile .raw,
body.pwa-mobile .answer,
body.pwa-mobile .qsolution {
  display:block !important;
  white-space:pre-wrap !important;
  overflow-wrap:anywhere !important;
  word-break:break-word !important;
  -webkit-line-clamp:unset !important;
  line-clamp:unset !important;
  -webkit-box-orient:initial !important;
}
body.pwa-mobile img.qscan,
body.pwa-mobile img.qmath {
  display:block !important;
  width:100% !important;
  max-width:100% !important;
  height:auto !important;
  max-height:none !important;
  min-height:0 !important;
  object-fit:contain !important;
  object-position:top center !important;
  overflow:visible !important;
  cursor:zoom-in !important;
}
body.pwa-mobile .qscan,
body.pwa-mobile .qmath {
  max-height:none !important;
  overflow:visible !important;
}
body.pwa-mobile .qbox svg {
  max-height:none !important;
  height:auto !important;
  overflow:visible !important;
}

.pwa-image-zoom-overlay {
  position:fixed !important;
  inset:0 !important;
  z-index:2147483000 !important;
  background:rgba(6,12,14,.96) !important;
  padding:max(14px,env(safe-area-inset-top)) 10px max(18px,env(safe-area-inset-bottom)) !important;
  display:flex !important;
  align-items:flex-start !important;
  justify-content:center !important;
  overflow:auto !important;
  -webkit-overflow-scrolling:touch !important;
}
.pwa-image-zoom-overlay img {
  display:block !important;
  width:auto !important;
  max-width:none !important;
  height:auto !important;
  max-height:none !important;
  min-width:100% !important;
  background:#fff !important;
  filter:none !important;
  opacity:1 !important;
  margin:40px 0 20px !important;
}
.pwa-image-zoom-close {
  position:fixed !important;
  top:max(10px,env(safe-area-inset-top)) !important;
  right:12px !important;
  z-index:2147483001 !important;
  min-width:44px !important;
  min-height:44px !important;
  border-radius:22px !important;
  background:#223033 !important;
  color:#fff !important;
  -webkit-text-fill-color:#fff !important;
  border:1px solid #526268 !important;
  font-size:24px !important;
  line-height:1 !important;
}

@media (prefers-color-scheme: dark) {
  body.pwa-mobile button:not(.active):not(.selected):not(.correct):not(.wrong):not(.right):not(.error):not(.success),
  body.pwa-mobile a[role="button"]:not(.active):not(.selected),
  body.pwa-mobile label[role="button"]:not(.active):not(.selected) {
    background:#223033 !important;
    color:#eef4f2 !important;
    -webkit-text-fill-color:#eef4f2 !important;
    border-color:#425257 !important;
    opacity:1 !important;
  }
  body.pwa-mobile button:disabled,
  body.pwa-mobile button[disabled] {
    background:#1b2528 !important;
    color:#91a19d !important;
    -webkit-text-fill-color:#91a19d !important;
    border-color:#334246 !important;
    opacity:.82 !important;
  }
  body.pwa-mobile .choice.correct,
  body.pwa-mobile button.correct,
  body.pwa-mobile button.right,
  body.pwa-mobile button.success {
    background:#174d3f !important;
    color:#eafff7 !important;
    -webkit-text-fill-color:#eafff7 !important;
    border-color:#2f8b72 !important;
  }
  body.pwa-mobile .choice.wrong,
  body.pwa-mobile button.wrong,
  body.pwa-mobile button.error {
    background:#542b2b !important;
    color:#fff1f1 !important;
    -webkit-text-fill-color:#fff1f1 !important;
    border-color:#9a5757 !important;
  }

  body.pwa-mobile .material,
  body.pwa-mobile .qpreview,
  body.pwa-mobile .qbox,
  body.pwa-mobile .raw,
  body.pwa-mobile .example,
  body.pwa-mobile .empty,
  body.pwa-mobile .filters,
  body.pwa-mobile .card,
  body.pwa-mobile .panel,
  body.pwa-mobile .stat,
  body.pwa-mobile dialog,
  body.pwa-mobile .dialoghead {
    background:#182225 !important;
    color:#eef4f2 !important;
    border-color:#2e3b3e !important;
  }
  body.pwa-mobile .material,
  body.pwa-mobile .material > summary,
  body.pwa-mobile .material p,
  body.pwa-mobile .material div,
  body.pwa-mobile .material span,
  body.pwa-mobile .qtext {
    color:#eef4f2 !important;
    -webkit-text-fill-color:#eef4f2 !important;
  }
  body.pwa-mobile .material {
    background:#202c2f !important;
    border:1px solid #3b4a4e !important;
  }
  body.pwa-mobile .qsolution,
  body.pwa-mobile .answer,
  body.pwa-mobile .formula,
  body.pwa-mobile .calc-out {
    background:#15362f !important;
    color:#eef4f2 !important;
    -webkit-text-fill-color:#eef4f2 !important;
    border-color:#31564d !important;
  }
  body.pwa-mobile .notice {
    background:#3a3020 !important;
    color:#f5dfb5 !important;
    -webkit-text-fill-color:#f5dfb5 !important;
    border-color:#6d5a35 !important;
  }
  body.pwa-mobile .trap {
    background:#3a2620 !important;
    color:#ffc8b2 !important;
    -webkit-text-fill-color:#ffc8b2 !important;
    border-color:#704638 !important;
  }

  body.pwa-mobile img.qscan,
  body.pwa-mobile img.qmath,
  body.pwa-mobile .qscan,
  body.pwa-mobile .qmath {
    background:#fff !important;
    color-scheme:light !important;
    filter:none !important;
    mix-blend-mode:normal !important;
    opacity:1 !important;
    padding:4px !important;
    border:1px solid #d7dfdc !important;
    border-radius:8px !important;
  }
  body.pwa-mobile .qbox svg {
    background:#f7faf8 !important;
    color-scheme:light !important;
    border-radius:8px !important;
    padding:6px !important;
  }
  body.pwa-mobile .qbox svg text {
    fill:#263b40 !important;
  }

  body.pwa-mobile .tab { color:#a9bbb6 !important; -webkit-text-fill-color:#a9bbb6 !important; }
  body.pwa-mobile .tab.active { color:#24a58d !important; -webkit-text-fill-color:#24a58d !important; }
  body.pwa-mobile .pwa-mobile-bottom button {
    background:transparent !important;
    color:#a4b2af !important;
    -webkit-text-fill-color:#a4b2af !important;
    border-color:transparent !important;
  }
  body.pwa-mobile .pwa-mobile-bottom button.active {
    background:#15362f !important;
    color:#dff8ef !important;
    -webkit-text-fill-color:#dff8ef !important;
  }
}
`;
    doc.head.appendChild(style);

    if (!doc.body.dataset.pwaImageZoomBound) {
      doc.body.dataset.pwaImageZoomBound = '1';
      doc.addEventListener('click', event => {
        const img = event.target && event.target.closest && event.target.closest('img.qscan,img.qmath');
        if (!img) return;
        event.preventDefault();
        const overlay = doc.createElement('div');
        overlay.className = 'pwa-image-zoom-overlay';
        const clone = img.cloneNode(true);
        clone.removeAttribute('style');
        const close = doc.createElement('button');
        close.type = 'button';
        close.className = 'pwa-image-zoom-close';
        close.setAttribute('aria-label','关闭完整题图');
        close.textContent = '×';
        const dismiss = () => overlay.remove();
        close.addEventListener('click', dismiss);
        overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
        overlay.appendChild(close);
        overlay.appendChild(clone);
        doc.body.appendChild(overlay);
      }, true);
    }
  };

  frame.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(inject));
    setTimeout(inject, 250);
  });

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (media?.addEventListener) media.addEventListener('change', inject);
  else if (media?.addListener) media.addListener(inject);
}

installDarkModeContrastFix();

(async () => {
  const parts = ['app.part1.txt','app.part2.txt','app.part3.txt','app.part4.txt'];
  const source = (await Promise.all(parts.map(async name => {
    const response = await fetch(new URL(name, document.currentScript.src), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.text();
  }))).join('');
  (0, eval)(source);
})().catch(error => {
  console.error('PWA app loader failed', error);
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `应用启动失败：${error.message}`;
    toast.classList.remove('hidden');
  }
});
