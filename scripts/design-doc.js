/* OWL COMPILE 설계서 페이지 스크립트: 목차 하이라이트 + 보드 재생 미리보기 */
(() => {
  try {
    const links = [...document.querySelectorAll('.toc-list a')];
    const byId = new Map();
    links.forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(a);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => l.classList.remove('on'));
        (byId.get(e.target.id) || []).forEach((a) => a.classList.add('on'));
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    document.querySelectorAll('[data-toc]').forEach((el) => io.observe(el));
  } catch (_) { /* 목차 하이라이트는 부가 기능 */ }
})();

(() => {
  const root = document.getElementById('play');
  const dataEl = document.getElementById('play-data');
  if (!root || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const $ = (s) => root.querySelector(s);
  const board = $('.board');
  const grid = $('.grid');
  const owl = $('.actor.owl');
  const owlSvg = owl.querySelector('svg');
  const cat = $('.actor.cat');
  const code = $('.code');
  const tickEl = $('.tick');
  const statusEl = $('.status');
  const toast = $('.toast');
  const result = $('.result');
  const caption = $('.caption');
  const btnPlay = $('[data-act="play"]');
  const btnStep = $('[data-act="step"]');
  const btnReset = $('[data-act="reset"]');
  const TICK_MS = 600; // 브리프 §3: 틱당 600ms
  const DEG = { N: 0, E: 90, S: 180, W: 270 };
  const CELL = {
    '#': ['c wall', ''], O: ['c', '<i class="pit"></i>'], M: ['c', '<b class="e">🐭</b>'], K: ['c', '<b class="e">🔑</b>'],
    D: ['c door', '<b class="e">🚪</b>'], G: ['c goal', '<i class="ring"></i>'], c: ['c patrol', ''],
  };
  const OUTCOME = { goal: '둥지 도착', dead: '사망', stuck: '미도착', error: '에러' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let sc = data[0];
  let i = 0;
  let timer = null;
  let toastTimer = null;
  let angle = 0;
  let prevDir = 'N';

  const last = () => sc.steps.length - 1;
  const setPlayLabel = () => {
    btnPlay.textContent = timer ? '일시정지' : (i >= last() && i > 0 ? '다시 재생' : '재생');
  };
  const stop = () => { clearInterval(timer); timer = null; setPlayLabel(); };

  function showToast(m, e) {
    toast.textContent = m;
    toast.dataset.e = e || '';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1200);
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    const ok = sc.outcome === 'goal';
    board.classList.remove('shake', 'won');
    void board.offsetWidth;
    board.classList.add(ok ? 'won' : 'shake');
    statusEl.textContent = OUTCOME[sc.outcome] || sc.outcome;
    result.innerHTML = `<p class="rmsg ${ok ? 'good' : 'bad'}">${esc(sc.message)}</p>`
      + `<ul>${sc.score.map((l) => `<li><span>${esc(l.label)}</span><b>${l.points > 0 ? '+' : ''}${l.points}</b></li>`).join('')}</ul>`
      + `<p class="total"><span>라운드 점수</span><b>${sc.total}점</b></p>`;
    result.hidden = false;
    setPlayLabel();
  }

  function render(n) {
    const s = sc.steps[n];
    const delta = ((((DEG[s.d] - DEG[prevDir]) % 360) + 540) % 360) - 180; // 짧은 쪽으로 회전
    angle += delta;
    prevDir = s.d;
    owl.style.transform = `translate(${s.x * 100}%, ${s.y * 100}%)`;
    owlSvg.style.transform = `rotate(${angle}deg)`;
    if (s.c) cat.style.transform = `translate(${s.c[0] * 100}%, ${s.c[1] * 100}%)`;
    grid.querySelectorAll('.c').forEach((c) => {
      const k = c.dataset.k;
      c.classList.toggle('gone', s.eat.includes(k) || s.tak.includes(k));
      c.classList.toggle('open', s.opn.includes(k));
    });
    let on = null;
    code.querySelectorAll('li').forEach((li) => {
      const hit = Number(li.dataset.n) === s.l;
      li.classList.toggle('on', hit);
      if (hit) on = li;
    });
    if (on) code.scrollTop = Math.max(0, on.offsetTop - code.clientHeight / 2);
    tickEl.textContent = `틱 ${s.t} / ${last()}`;
    if (n > 0) statusEl.textContent = '실행 중';
    if (n > 0 && s.m) showToast(s.m, s.e);
    if (n > 0 && n === last()) finish();
  }

  function load(key) {
    clearInterval(timer);
    timer = null;
    sc = data.find((d) => d.key === key) || data[0];
    i = 0;
    grid.innerHTML = sc.tiles.map((row, y) => row.split('').map((t, x) => {
      const [cls, inner] = CELL[t] || ['c', ''];
      return `<span class="${cls}" data-k="${x},${y}">${inner}</span>`;
    }).join('')).join('');
    code.innerHTML = sc.lines.map((l, n) =>
      `<li data-n="${n}"${l.head ? ' class="head"' : ''}><span class="ln">${n + 1}</span><span class="tx">${esc(l.text)}</span></li>`).join('');
    cat.hidden = !sc.cat;
    board.classList.remove('shake', 'won');
    result.hidden = true;
    toast.classList.remove('show');
    caption.textContent = sc.title;
    angle = DEG[sc.steps[0].d];
    prevDir = sc.steps[0].d;
    owl.classList.add('instant');
    cat.classList.add('instant');
    render(0);
    void owl.offsetWidth;
    owl.classList.remove('instant');
    cat.classList.remove('instant');
    statusEl.textContent = '대기';
    root.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.key === sc.key)));
    setPlayLabel();
  }

  function play() {
    if (timer) { stop(); return; }
    if (i >= last()) load(sc.key);
    timer = setInterval(() => {
      if (i >= last()) { stop(); return; }
      i += 1;
      render(i);
    }, TICK_MS);
    setPlayLabel();
  }

  btnPlay.addEventListener('click', play);
  btnStep.addEventListener('click', () => {
    clearInterval(timer);
    timer = null;
    if (i < last()) { i += 1; render(i); }
    setPlayLabel();
  });
  btnReset.addEventListener('click', () => load(sc.key));
  root.querySelectorAll('[role="tab"]').forEach((b) => b.addEventListener('click', () => load(b.dataset.key)));
  load(root.dataset.default || data[0].key);
})();
