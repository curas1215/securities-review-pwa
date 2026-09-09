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
