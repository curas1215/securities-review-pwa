(() => {
  'use strict';

  const FRAME_ID = 'studyFrame';
  const STYLE_ID = 'pwa-simulation-choice-feedback-fix';

  function enhance(doc) {
    if (!doc || !doc.head || !doc.body) return;

    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
/* Random simulation choice feedback. Kept separate from the original question-bank styles. */
body.pwa-mobile .pwa-sim-choice.on,
body.pwa-mobile .pwa-sim-choice.selected,
.pwa-sim-choice.on,
.pwa-sim-choice.selected {
  background:#177b69 !important;
  border-color:#35b89d !important;
  color:#ffffff !important;
  -webkit-text-fill-color:#ffffff !important;
  box-shadow:0 0 0 3px rgba(53,184,157,.20) !important;
  transform:translateY(-1px);
}

body.pwa-mobile .pwa-sim-choice.pwa-sim-correct,
.pwa-sim-choice.pwa-sim-correct {
  background:#176c55 !important;
  border-color:#58d4ad !important;
  color:#ffffff !important;
  -webkit-text-fill-color:#ffffff !important;
  box-shadow:0 0 0 3px rgba(88,212,173,.22) !important;
}

body.pwa-mobile .pwa-sim-choice.pwa-sim-wrong-selected,
.pwa-sim-choice.pwa-sim-wrong-selected {
  background:#7a3535 !important;
  border-color:#e27a7a !important;
  color:#ffffff !important;
  -webkit-text-fill-color:#ffffff !important;
  box-shadow:0 0 0 3px rgba(226,122,122,.20) !important;
}

body.pwa-mobile .pwa-sim-choice:active,
.pwa-sim-choice:active {
  transform:scale(.96);
}
`;
      doc.head.appendChild(style);
    }

    const annotate = () => {
      const view = doc.getElementById('pwaSimulationView');
      if (!view) return;

      const buttons = Array.from(view.querySelectorAll('.pwa-sim-choice'));
      buttons.forEach(btn => {
        btn.classList.toggle('selected', btn.classList.contains('on'));
        btn.classList.remove('pwa-sim-correct', 'pwa-sim-wrong-selected');
        btn.setAttribute('aria-pressed', btn.classList.contains('on') ? 'true' : 'false');
      });

      const result = view.querySelector('.pwa-sim-result');
      if (!result) return;

      const text = result.textContent || '';
      const match = text.match(/正确答案[：:]\s*([A-D]+)/i);
      if (!match) return;
      const correct = new Set((match[1].toUpperCase().match(/[A-D]/g) || []));

      buttons.forEach(btn => {
        const letter = String(btn.dataset.letter || '').toUpperCase();
        const selected = btn.classList.contains('on');
        if (correct.has(letter)) btn.classList.add('pwa-sim-correct');
        else if (selected) btn.classList.add('pwa-sim-wrong-selected');
      });
    };

    if (!doc.body.dataset.pwaSimulationChoiceFixBound) {
      doc.body.dataset.pwaSimulationChoiceFixBound = '1';
      doc.addEventListener('click', event => {
        if (event.target && event.target.closest && event.target.closest('.pwa-sim-choice')) {
          requestAnimationFrame(annotate);
          setTimeout(annotate, 30);
        }
      }, true);
      const observer = new MutationObserver(() => requestAnimationFrame(annotate));
      observer.observe(doc.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
    }

    annotate();
  }

  function bind() {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    const run = () => {
      try { enhance(frame.contentDocument); } catch (_) {}
    };
    frame.addEventListener('load', () => {
      requestAnimationFrame(run);
      setTimeout(run, 200);
    });
    run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true});
  else bind();
})();
