function installDarkModeContrastFix() {
  const frame = document.getElementById('studyFrame');
  if (!frame) return;

  const inject = () => {
    let doc;
    try { doc = frame.contentDocument; } catch (_) { return; }
    if (!doc || !doc.head) return;

    const old = doc.getElementById('pwa-dark-button-contrast-fix');
    if (old) old.remove();

    const style = doc.createElement('style');
    style.id = 'pwa-dark-button-contrast-fix';
    style.textContent = `
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
