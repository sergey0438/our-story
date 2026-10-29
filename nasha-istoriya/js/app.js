/* ==========================================================================
   Наша история — логика игры
   Экраны: старт → вопросы и вставки → (секретный финал | обычный финал)
   ========================================================================== */
(function () {
  'use strict';

  var S = window.LoveShared;
  var params = new URLSearchParams(window.location.search);
  var PREVIEW = params.has('preview');
  var JUMP = PREVIEW ? params.get('jump') : null;
  var PROGRESS_KEY = S.KEYS.progress + (PREVIEW ? 'preview' : 'live');
  var MUTE_KEY = 'love-quiz:muted';

  var stage = document.getElementById('stage');
  var veil = document.getElementById('veil');
  var fxLayer = document.getElementById('fx');
  var soundBtn = document.getElementById('soundBtn');
  var topbar = document.getElementById('topbar');

  var reduceMotionMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var cfg = null;
  var steps = [];
  var state = null;
  var motion = true;
  var audio = null;
  var audioFailed = false;
  var timers = [];

  /* ---------- Утилиты DOM ---------- */

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  function t(text) { return S.personalize(text, cfg); }

  /* Текст с переносами → абзацы */
  function paragraphs(text, cls) {
    var parts = t(text || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    return el('div', { class: cls || '' }, parts.map(function (p) { return el('p', { class: 'multiline', text: p }); }));
  }

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function pace(ms) { return motion ? ms : Math.min(ms, 350); }

  /* ---------- Иллюстрации и картинки ---------- */

  var PH_SVG = '<svg viewBox="0 0 120 100" aria-hidden="true">' +
    '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path class="ph-heart" d="M46 80C24 66 12 54 12 38c0-10 8-18 18-18 7 0 12 4 16 10 4-6 9-10 16-10 10 0 18 8 18 18 0 16-12 28-34 42z" fill="rgba(241,179,195,.22)"/>' +
    '<path d="M76 84C60 74 52 66 52 55c0-7 5.5-12.5 12.5-12.5 5 0 8.5 3 11.5 7 3-4 6.5-7 11.5-7C94.5 42.5 100 48 100 55c0 11-8 19-24 29z" fill="rgba(217,178,111,.25)" stroke="#d9b26f"/>' +
    '<path d="M104 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#d9b26f" stroke="none"/>' +
    '<path d="M18 86l1.4 3.6 3.6 1.4-3.6 1.4L18 96l-1.4-3.6-3.6-1.4 3.6-1.4z" fill="#f1b3c3" stroke="none"/>' +
    '</g></svg>';

  function placeholder(label) {
    var ph = el('div', { class: 'ph', role: 'img', 'aria-label': label || 'Здесь будет наше фото' });
    ph.innerHTML = PH_SVG; // статичная иллюстрация, без пользовательских данных
    if (label !== '') ph.appendChild(el('span', { class: 'ph__text', text: label || 'здесь будет наше фото' }));
    return ph;
  }

  /* Картинка с красивой заглушкой, если файла нет или он не загрузился */
  function picture(src, alt, cls, phLabel) {
    var safe = S.safeSrc(src);
    if (!safe) { var ph0 = placeholder(phLabel); if (cls) ph0.classList.add(cls); return ph0; }
    var img = el('img', { src: safe, alt: alt || '', class: cls || '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', function () {
      var ph1 = placeholder(phLabel);
      if (cls) ph1.classList.add(cls);
      if (img.parentNode) img.parentNode.replaceChild(ph1, img);
    }, { once: true });
    return img;
  }

  function framed(src, caption, extraCls) {
    return el('div', { class: 'frame ' + (extraCls || '') },
      picture(src, caption || 'Наше фото', 'frame__img'),
      el('span', { class: 'frame__heart', 'aria-hidden': 'true', text: '❤' }),
      caption ? el('span', { class: 'frame__caption', text: t(caption) }) : null
    );
  }

  /* ---------- Эффекты ---------- */

  function spawnFloatingHearts() {
    var box = document.getElementById('floatingHearts');
    box.textContent = '';
    if (!motion) return;
    var n = window.innerWidth < 600 ? 9 : 15;
    var glyphs = ['❤', '♥', '❥', '♡'];
    for (var i = 0; i < n; i++) {
      var size = 10 + Math.random() * 18;
      box.appendChild(el('span', {
        class: 'float-heart',
        text: glyphs[i % glyphs.length],
        style: 'left:' + (Math.random() * 100).toFixed(1) + '%;--s:' + size.toFixed(0) + 'px;--d:' + (13 + Math.random() * 12).toFixed(1) +
          's;--delay:' + (-Math.random() * 20).toFixed(1) + 's;--x:' + (Math.random() * 60 - 30).toFixed(0) + 'px;--o:' + (0.18 + Math.random() * 0.3).toFixed(2)
      }));
    }
  }

  var PALETTE = ['#f1b3c3', '#ff7aa2', '#d9b26f', '#f8ecdf', '#c13a62'];

  function heartBurst(x, y, count) {
    if (!motion) return;
    count = count || 12;
    for (var i = 0; i < count; i++) {
      var ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var dist = 50 + Math.random() * 70;
      var node = el('span', {
        class: 'burst', text: Math.random() > 0.3 ? '❤' : '✦',
        style: 'left:' + x + 'px;top:' + y + 'px;--dx:' + Math.cos(ang) * dist + 'px;--dy:' + (Math.sin(ang) * dist - 30) + 'px;--s:' +
          (10 + Math.random() * 14) + 'px;--c:' + PALETTE[i % PALETTE.length] + ';--d:' + (0.8 + Math.random() * 0.6) + 's;--rot:' + (Math.random() * 80 - 40) + 'deg'
      });
      fxLayer.appendChild(node);
      setTimeout(node.remove.bind(node), 1600);
    }
  }
  function burstFrom(target, count) {
    if (!target || !target.getBoundingClientRect) return;
    var r = target.getBoundingClientRect();
    heartBurst(r.left + r.width / 2, r.top + r.height / 2, count);
  }

  function confetti(count) {
    if (!motion) return;
    count = count || 40;
    for (var i = 0; i < count; i++) {
      var node = el('span', {
        class: 'confetti', text: Math.random() > 0.25 ? '❤' : '✦',
        style: 'left:' + (Math.random() * 100) + '%;--s:' + (10 + Math.random() * 16) + 'px;--c:' + PALETTE[i % PALETTE.length] +
          ';--d:' + (2.8 + Math.random() * 2.4) + 's;--delay:' + (Math.random() * 1.2) + 's;--x:' + (Math.random() * 120 - 60) + 'px;--rot:' + (Math.random() * 600 - 300) + 'deg'
      });
      fxLayer.appendChild(node);
      setTimeout(node.remove.bind(node), 6000);
    }
  }

  function glowHearts(count) {
    if (!motion) return;
    for (var i = 0; i < count; i++) {
      var node = el('span', {
        class: 'glow-heart', text: '❤',
        style: 'left:' + (5 + Math.random() * 90) + '%;--s:' + (8 + Math.random() * 12) + 'px;--d:' + (4 + Math.random() * 3) + 's;--delay:' +
          (Math.random() * 1.5) + 's;--x:' + (Math.random() * 60 - 30) + 'px'
      });
      fxLayer.appendChild(node);
      setTimeout(node.remove.bind(node), 9000);
    }
  }

  function setVeil(level) {
    veil.classList.toggle('is-dim', level === 'dim');
    veil.classList.toggle('is-dark', level === 'dark');
  }

  var toastTimer;
  function toast(text) {
    var node = document.querySelector('.toast');
    if (!node) { node = el('div', { class: 'toast', role: 'status' }); document.body.appendChild(node); }
    node.textContent = text;
    requestAnimationFrame(function () { node.classList.add('is-shown'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-shown'); }, 2800);
  }

  function confirmModal(title, text, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var close = function (result) {
        modal.remove();
        document.removeEventListener('keydown', onKey);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      };
      var onKey = function (e) { if (e.key === 'Escape') close(false); };
      var ok = el('button', { class: 'btn btn--block', type: 'button', text: okLabel, onclick: function () { close(true); } });
      var modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modalTitle', onclick: function (e) { if (e.target === modal) close(false); } },
        el('div', { class: 'modal__box' },
          el('h2', { class: 'modal__title', id: 'modalTitle', text: title }),
          el('p', { class: 'modal__text', text: text }),
          el('div', { class: 'actions actions--stack' },
            ok,
            el('button', { class: 'btn btn--ghost btn--block', type: 'button', text: cancelLabel, onclick: function () { close(false); } })
          )
        )
      );
      document.body.appendChild(modal);
      document.addEventListener('keydown', onKey);
      ok.focus();
    });
  }

  /* ---------- Состояние и сохранение прогресса ---------- */

  function signature() {
    return [cfg.questions.map(function (q) { return q.id + ':' + q.type; }).join(','), cfg.secret.enabled ? 's' : 'n'].join('|');
  }

  function freshState() {
    return {
      v: 1, sig: signature(), screen: 'start', step: 0, answers: {}, drafts: {},
      finale: { opened: false, giftOpened: false },
      secret: { dramaticDone: false, bookOpened: false, page: 0, letterOpened: false, giftOpened: false },
      storyFrom: null
    };
  }

  function loadState() {
    var saved = S.storageGet(PROGRESS_KEY);
    if (!saved || saved.v !== 1 || saved.sig !== signature()) return freshState();
    var base = freshState();
    Object.keys(base).forEach(function (k) { if (saved[k] !== undefined) base[k] = saved[k]; });
    base.finale = Object.assign(freshState().finale, saved.finale || {});
    base.secret = Object.assign(freshState().secret, saved.secret || {});
    if (typeof base.step !== 'number' || base.step < 0) base.step = 0;
    if (base.step >= steps.length) base.step = Math.max(0, steps.length - 1);
    return base;
  }

  function save() { S.storageSet(PROGRESS_KEY, state); }

  /* ---------- Музыка ---------- */

  function isMuted() { return S.storageGet(MUTE_KEY) === true; }

  function setupAudio() {
    var src = S.safeSrc(cfg.music.src);
    if (!cfg.music.enabled || !src) { topbar.hidden = true; return; }
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = cfg.music.volume;
    audio.src = src;
    audio.addEventListener('error', function () {
      audioFailed = true;
      topbar.hidden = true;
    });
    audio.addEventListener('play', updateSoundBtn);
    audio.addEventListener('pause', updateSoundBtn);
    topbar.hidden = false;
    soundBtn.hidden = false;
    soundBtn.addEventListener('click', function () {
      if (!audio) return;
      if (audio.paused) { S.storageSet(MUTE_KEY, false); playMusic(true); } else { S.storageSet(MUTE_KEY, true); audio.pause(); }
    });
    updateSoundBtn();
  }

  function playMusic(force) {
    if (!audio || audioFailed) return;
    if (!force && isMuted()) return;
    var p = audio.play();
    if (p && p.catch) p.catch(function () { updateSoundBtn(); });
  }

  function updateSoundBtn() {
    if (!audio) return;
    var playing = !audio.paused;
    soundBtn.classList.toggle('is-playing', playing);
    soundBtn.classList.toggle('is-muted', !playing);
    soundBtn.setAttribute('aria-label', playing ? 'Выключить музыку' : 'Включить музыку');
    soundBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }

  /* ---------- Экраны ---------- */

  var currentScreen = null;

  function mount(screen, opts) {
    opts = opts || {};
    clearTimers();
    var old = currentScreen || stage.querySelector('.screen.is-active');
    if (old) {
      old.classList.remove('is-active');
      old.classList.add('is-leaving');
      old.setAttribute('aria-hidden', 'true');
      setTimeout(function () { old.remove(); }, motion ? 900 : 0);
    }
    stage.appendChild(screen);
    currentScreen = screen;
    void screen.offsetWidth; // запускаем переход
    screen.classList.add('is-active');
    screen.scrollTop = 0;
    var heading = screen.querySelector('[data-focus]');
    if (heading && !opts.noFocus) {
      heading.setAttribute('tabindex', '-1');
      setTimeout(function () { try { heading.focus({ preventScroll: true }); } catch (e) { heading.focus(); } }, motion ? 450 : 0);
    }
  }

  function screenShell(extraCls) {
    var inner = el('div', { class: 'screen__inner' });
    var screen = el('section', { class: 'screen ' + (extraCls || '') }, inner);
    return { screen: screen, inner: inner };
  }

  function go(name) {
    state.screen = name;
    save();
    render();
  }

  function render() {
    switch (state.screen) {
      case 'start': return renderStart();
      case 'step': return steps.length ? renderStep() : afterQuestions();
      case 'finale': return renderFinale();
      case 'gift': return renderFinaleGift();
      case 'story': return renderStory();
      case 'false': return cfg.secret.enabled ? renderFalseFinale() : go('finale');
      case 'dramatic': return cfg.secret.enabled ? renderDramatic() : go('finale');
      case 'book': return cfg.secret.enabled ? renderBook() : go('finale');
      case 'secretLetter': return cfg.secret.enabled ? renderSecretLetter() : go('finale');
      case 'secretGift': return cfg.secret.enabled ? renderSecretGift() : go('finale');
      case 'end': return renderEnd();
      default: state.screen = 'start'; return renderStart();
    }
  }

  function afterQuestions() {
    go(cfg.secret.enabled ? 'false' : 'finale');
  }

  /* ----- Старт ----- */

  function renderStart() {
    setVeil(null);
    var sh = screenShell('screen--center');
    var startBtn = el('button', { class: 'btn btn--pulse reveal', style: '--i:4', type: 'button', text: t(cfg.start.button) });
    startBtn.addEventListener('click', function (e) {
      burstFrom(e.currentTarget, 16);
      playMusic(true);
      state.step = 0;
      later(function () { if (steps.length) go('step'); else afterQuestions(); }, motion ? 350 : 0);
    });
    append(sh.inner, [
      cfg.start.eyebrow ? el('p', { class: 'eyebrow reveal', style: '--i:0', text: t(cfg.start.eyebrow) }) : null,
      el('div', { class: 'reveal', style: '--i:1' }, framed(cfg.start.photo, cfg.start.photoCaption)),
      el('h1', { class: 'title reveal', style: '--i:2', 'data-focus': true, text: t(cfg.start.title) }),
      el('p', { class: 'subtitle reveal', style: '--i:3', text: t(cfg.start.subtitle) }),
      startBtn
    ]);
    mount(sh.screen);
  }

  /* ----- Вопросы ----- */

  function buildSteps() {
    steps = [];
    var total = cfg.questions.length;
    cfg.questions.forEach(function (q, i) {
      steps.push({ kind: 'q', q: q, index: i });
      if (cfg.interludes.enabled) {
        cfg.interludes.items.forEach(function (it) {
          if (it.enabled && it.text.trim() && it.afterQuestion === i + 1 && i + 1 <= total) steps.push({ kind: 'i', it: it, index: i });
        });
      }
    });
  }

  function progressEl(qIndex, answered) {
    var total = cfg.questions.length;
    var wrap = el('div', { class: 'progress', 'aria-label': 'Вопрос ' + (qIndex + 1) + ' из ' + total });
    if (total <= 14) {
      var hearts = el('div', { class: 'progress__hearts', 'aria-hidden': 'true' });
      for (var i = 0; i < total; i++) {
        var done = i < qIndex || (i === qIndex && answered);
        hearts.appendChild(el('span', { class: 'progress__heart' + (done ? ' is-done' : '') + (i === qIndex && !answered ? ' is-current' : ''), text: '❤' }));
      }
      wrap.appendChild(hearts);
    } else {
      var pct = Math.round(((qIndex + (answered ? 1 : 0)) / total) * 100);
      wrap.appendChild(el('div', { class: 'progress__bar', 'aria-hidden': 'true' }, el('div', { class: 'progress__fill', style: 'width:' + pct + '%' })));
    }
    wrap.appendChild(el('div', { class: 'progress__label', text: 'Вопрос ' + (qIndex + 1) + ' из ' + total + ' · пройдено ' + countAnswered() }));
    return wrap;
  }

  function countAnswered() {
    return cfg.questions.filter(function (q) { var a = state.answers[q.id]; return a && !a.skipped; }).length;
  }

  function renderStep() {
    if (state.step >= steps.length) return afterQuestions();
    var step = steps[state.step];
    setVeil(null);
    if (step.kind === 'i') return renderInterlude(step);
    return renderQuestion(step.q, step.index);
  }

  function nextStep() {
    state.step += 1;
    if (state.step >= steps.length) { save(); afterQuestions(); return; }
    save();
    renderStep();
  }

  function prevStep() {
    var s = state.step - 1;
    while (s >= 0 && steps[s].kind === 'i') s -= 1; // вставки при возврате пропускаем
    if (s < 0) { state.step = 0; go('start'); return; }
    state.step = s;
    save();
    renderStep();
  }

  var HINTS = {
    single: 'Выбери один ответ',
    photo: 'Посмотри на фото и выбери ответ',
    yesno: '',
    scenario: 'Выбери, какой сценарий тебе ближе',
    text: 'Ответь своими словами — здесь нет неправильных ответов'
  };

  function stableReaction(q) {
    if (q.reaction && q.reaction.trim()) return t(q.reaction);
    var list = cfg.ui.reactions.length ? cfg.ui.reactions : ['❤️'];
    var h = 0;
    for (var i = 0; i < q.id.length; i++) h = (h * 31 + q.id.charCodeAt(i)) >>> 0;
    return t(list[h % list.length]);
  }

  function renderQuestion(q, qIndex) {
    var sh = screenShell();
    var answer = state.answers[q.id];
    var answered = !!(answer && !answer.skipped);
    var isMulti = q.type === 'multiple';
    var selected = answered ? (isMulti ? (answer.value || []).slice() : answer.value) : (isMulti ? [] : null);

    var card = el('div', { class: 'card reveal', style: '--i:1' });
    var reactionBox = el('div', { 'aria-live': 'polite' });
    var doneBtn = null;

    card.appendChild(el('span', { class: 'q-type', text: 'Глава ' + (qIndex + 1) }));
    if (q.type === 'photo') {
      card.appendChild(el('div', { class: 'q-image q-image--photo' }, picture(q.image, 'Фото к вопросу', '', 'здесь будет фото к вопросу')));
    } else if (S.safeSrc(q.image)) {
      card.appendChild(el('div', { class: 'q-image' }, picture(q.image, 'Фото к вопросу', '', '')));
    }
    card.appendChild(el('h2', { class: 'q-text', 'data-focus': true, text: t(q.text) }));
    var hint = isMulti ? cfg.ui.multipleHint : HINTS[q.type];
    if (hint) card.appendChild(el('p', { class: 'q-hint', text: hint }));

    function showReaction(animate) {
      reactionBox.textContent = '';
      var guess = null;
      if (cfg.meta.scoring && q.correct.length && q.type !== 'text') {
        var picked = isMulti ? selected : [selected];
        var ok = picked.length === q.correct.length && picked.every(function (v) { return q.correct.indexOf(v) !== -1; });
        guess = ok ? 'Ты угадала ✨' : 'Ты меня удивила ✨';
      }
      var cont = el('button', { class: 'btn', type: 'button', text: cfg.ui.continueButton, onclick: function (e) { burstFrom(e.currentTarget, 10); nextStep(); } });
      var box = el('div', { class: 'reaction' },
        el('p', { class: 'reaction__text' }, guess ? el('span', { class: 'reaction__guess', text: guess }) : null, stableReaction(q)),
        cont
      );
      if (!animate) box.style.animation = 'none';
      reactionBox.appendChild(box);
      if (animate) {
        later(function () {
          var r = box.getBoundingClientRect();
          if (r.bottom > window.innerHeight) sh.screen.scrollTo({ top: sh.screen.scrollTop + r.bottom - window.innerHeight + 24, behavior: motion ? 'smooth' : 'auto' });
        }, 80);
      }
      skipBtn && (skipBtn.hidden = true);
    }
    function hideReaction() { reactionBox.textContent = ''; }

    function commit(value) {
      state.answers[q.id] = { value: value, at: Date.now() };
      save();
    }

    var options;
    if (q.type === 'text') {
      var draft = answered ? answer.value : (state.drafts[q.id] || '');
      var area = el('textarea', { class: 'answer-text', rows: '5', maxlength: '2000', placeholder: cfg.ui.textPlaceholder, 'aria-label': 'Твой ответ' });
      area.value = draft;
      var counter = el('div', { class: 'char-count', text: draft.length + ' / 2000' });
      doneBtn = el('button', { class: 'btn', type: 'button', text: cfg.ui.doneButton });
      var sync = function () {
        doneBtn.disabled = q.required && !area.value.trim();
        counter.textContent = area.value.length + ' / 2000';
      };
      area.addEventListener('input', function () {
        state.drafts[q.id] = area.value;
        save();
        sync();
        if (reactionBox.firstChild) { hideReaction(); doneBtn.hidden = false; }
      });
      doneBtn.addEventListener('click', function (e) {
        var val = area.value.trim();
        if (!val && q.required) return;
        burstFrom(e.currentTarget, 14);
        if (!val) { state.answers[q.id] = { skipped: true }; save(); nextStep(); return; }
        commit(val);
        doneBtn.hidden = true;
        showReaction(true);
      });
      sync();
      options = el('div', null, area, counter);
    } else {
      var kind = q.type === 'yesno' ? 'yesno' : q.type === 'scenario' ? 'scenario' : 'list';
      options = el('div', { class: 'options' + (kind === 'yesno' ? ' options--yesno' : '') + (kind === 'scenario' ? ' options--scenario' : ''), role: isMulti ? 'group' : 'radiogroup', 'aria-label': 'Варианты ответа' });
      var buttons = [];
      var refresh = function () {
        buttons.forEach(function (b, idx) {
          var on = isMulti ? selected.indexOf(idx) !== -1 : selected === idx;
          b.classList.toggle('is-selected', on);
          b.setAttribute(isMulti ? 'aria-pressed' : 'aria-checked', on ? 'true' : 'false');
        });
        if (doneBtn) doneBtn.disabled = q.required && !selected.length;
      };
      q.options.forEach(function (opt, idx) {
        var b = el('button', {
          class: 'opt' + (isMulti ? ' opt--multi' : '') + (kind === 'scenario' ? ' scenario' : ''),
          type: 'button', role: isMulti ? null : 'radio'
        },
          el('span', { class: 'opt__emoji', 'aria-hidden': 'true', text: opt.emoji || '' }),
          el('span', { class: 'opt__text', text: t(opt.text) }),
          kind === 'scenario' && opt.desc ? el('span', { class: 'opt__desc', text: t(opt.desc) }) : null,
          el('span', { class: 'opt__check', 'aria-hidden': 'true', text: '❤' })
        );
        if (kind === 'list' && !opt.emoji) b.querySelector('.opt__emoji').textContent = '♡';
        b.addEventListener('click', function (e) {
          if (isMulti) {
            var at = selected.indexOf(idx);
            if (at === -1) { selected.push(idx); burstFrom(e.currentTarget, 8); } else selected.splice(at, 1);
            selected.sort(function (a, c) { return a - c; });
            refresh();
            if (reactionBox.firstChild) { hideReaction(); doneBtn.hidden = false; }
            return;
          }
          selected = idx;
          refresh();
          heartBurst(e.clientX || 0, e.clientY || 0, 12);
          if (!e.clientX) burstFrom(e.currentTarget, 12);
          commit(idx);
          showReaction(true);
        });
        buttons.push(b);
        options.appendChild(b);
        if (kind === 'scenario' && idx === 0) options.appendChild(el('span', { class: 'vs', 'aria-hidden': 'true', text: 'или' }));
      });
      if (isMulti) {
        doneBtn = el('button', { class: 'btn', type: 'button', text: cfg.ui.doneButton, onclick: function (e) {
          if (q.required && !selected.length) return;
          burstFrom(e.currentTarget, 14);
          if (!selected.length) { state.answers[q.id] = { skipped: true }; save(); nextStep(); return; }
          commit(selected.slice());
          doneBtn.hidden = true;
          showReaction(true);
        } });
      }
      refresh();
    }
    card.appendChild(options);
    card.appendChild(reactionBox);

    var backBtn = el('button', { class: 'link-btn', type: 'button', text: '← ' + cfg.ui.backButton, onclick: prevStep });
    var skipBtn = !q.required ? el('button', { class: 'link-btn', type: 'button', text: cfg.ui.skipButton + ' →', onclick: function () {
      state.answers[q.id] = { skipped: true };
      save();
      nextStep();
    } }) : null;

    if (doneBtn) {
      if (answered) doneBtn.hidden = true;
      card.appendChild(el('div', { class: 'q-actions' }, doneBtn));
    }

    append(sh.inner, [
      el('div', { class: 'reveal', style: '--i:0' }, progressEl(qIndex, answered)),
      card,
      el('div', { class: 'below-card reveal', style: '--i:2' }, backBtn, skipBtn || el('span'))
    ]);
    if (answered) showReaction(false);
    mount(sh.screen);
  }

  function renderInterlude(step) {
    var sh = screenShell('screen--center');
    append(sh.inner, [
      el('div', { class: 'interlude__mark reveal', style: '--i:0', 'aria-hidden': 'true', text: '❤' }),
      el('p', { class: 'interlude__text reveal multiline', style: '--i:1', 'data-focus': true, text: t(step.it.text) }),
      el('div', { class: 'ornament reveal', style: '--i:2', 'aria-hidden': 'true', text: '❦' }),
      el('div', { class: 'actions reveal', style: '--i:3' },
        el('button', { class: 'btn', type: 'button', text: cfg.ui.continueButton, onclick: function (e) { burstFrom(e.currentTarget, 10); nextStep(); } })
      ),
      el('div', { class: 'reveal', style: '--i:4;margin-top:10px' }, el('button', { class: 'link-btn', type: 'button', text: '← ' + cfg.ui.backButton, onclick: prevStep }))
    ]);
    mount(sh.screen);
    glowHearts(6);
  }

  /* ----- Конверт и письмо ----- */

  function envelopeEl(hint, onOpen) {
    var env = el('button', { class: 'envelope', type: 'button', 'aria-label': 'Открыть конверт' },
      el('span', { class: 'envelope__back' }),
      el('span', { class: 'envelope__letter', 'aria-hidden': 'true', text: '♡' }),
      el('span', { class: 'envelope__flap' }, el('span', { class: 'envelope__seal', 'aria-hidden': 'true', text: '❤' })),
      el('span', { class: 'envelope__front' })
    );
    var opened = false;
    env.addEventListener('click', function (e) {
      e.stopPropagation();
      if (opened) return;
      opened = true;
      env.classList.add('is-open');
      burstFrom(env, 18);
      setTimeout(onOpen, motion ? 1500 : 0);
    });
    return el('div', { class: 'envelope-wrap' }, env, hint ? el('p', { class: 'envelope-hint', text: hint }) : null);
  }

  function letterEl(greeting, text, signature, photo, withPhoto) {
    var letter = el('article', { class: 'letter' });
    if (withPhoto) letter.appendChild(el('figure', { class: 'letter__photo' }, picture(photo, 'Наше фото', '', '')));
    if (greeting) letter.appendChild(el('p', { class: 'letter__greeting', 'data-focus': true, text: t(greeting) }));
    letter.appendChild(paragraphs(text, 'letter__body'));
    if (signature) letter.appendChild(el('p', { class: 'letter__sign', text: t(signature) }));
    return letter;
  }

  /* ----- Обычный финал (если секретный выключен) ----- */

  function renderFinale() {
    setVeil('dim');
    var sh = screenShell('screen--center');
    var area = el('div', { class: 'letter-section' });

    function showLetter(animate) {
      area.textContent = '';
      append(area, [
        letterEl(cfg.finale.letterGreeting, cfg.finale.letter, cfg.finale.signature, '', false),
        el('div', { class: 'actions' },
          el('button', { class: 'btn btn--pulse', type: 'button', text: t(cfg.finale.surpriseButton), onclick: function (e) { burstFrom(e.currentTarget, 16); go('gift'); } })
        ),
        galleryEl()
      ]);
      if (animate) confetti(26);
    }

    append(sh.inner, [
      el('p', { class: 'eyebrow reveal', style: '--i:0', text: t(cfg.finale.intro) }),
      area
    ]);
    if (state.finale.opened) {
      showLetter(false);
    } else {
      area.appendChild(el('div', { class: 'reveal', style: '--i:1' }, envelopeEl(cfg.finale.envelopeHint, function () {
        state.finale.opened = true;
        save();
        showLetter(true);
        var letter = area.querySelector('.letter__greeting');
        if (letter) { letter.setAttribute('tabindex', '-1'); letter.focus({ preventScroll: true }); }
      })));
    }
    mount(sh.screen);
  }

  function galleryEl() {
    var list = cfg.finale.gallery.map(S.safeSrc).filter(Boolean);
    if (!list.length) return null;
    var grid = el('div', { class: 'gallery' });
    list.forEach(function (src) {
      var img = el('img', { src: src, alt: 'Наш момент', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', function () { img.remove(); }, { once: true });
      grid.appendChild(img);
    });
    return el('div', null, el('h2', { class: 'section-title', text: t(cfg.finale.galleryTitle) }), grid);
  }

  /* ----- Подарок (общий для обоих финалов) ----- */

  function giftBlock(gift, opened, onOpened) {
    var wrap = el('div');
    function showContent(animate) {
      wrap.textContent = '';
      if (gift.mode === 'reveal') {
        var items = el('div', { class: 'gift-items' });
        gift.items.forEach(function (it, i) {
          var fig = el('figure', { class: 'gift-item', style: '--i:' + i + ';--r:' + (i % 2 ? 4 : -4) + 'deg' },
            picture(it.image, it.title || 'Подарок', '', 'фото подарка'),
            it.title ? el('figcaption', { text: t(it.title) }) : null
          );
          if (!animate) fig.style.animation = 'none', fig.style.opacity = '1', fig.style.transform = 'none';
          items.appendChild(fig);
        });
        append(wrap, [
          gift.title ? el('h2', { class: 'gift-title', 'data-focus': true, text: t(gift.title) }) : null,
          gift.items.length ? items : null,
          gift.message ? paragraphs(gift.message, 'gift-message') : null
        ]);
      } else {
        wrap.appendChild(el('div', { class: 'intrigue' },
          el('span', { class: 'intrigue__lock', 'aria-hidden': 'true', text: '🎀' }),
          paragraphs(gift.intrigueText)
        ));
      }
      if (animate) confetti(gift.mode === 'reveal' ? 50 : 30);
    }
    if (opened) { showContent(false); return wrap; }

    var box = el('button', { class: 'gift-box', type: 'button', 'aria-label': 'Открыть подарок' },
      el('span', { class: 'gift-box__body' }), el('span', { class: 'gift-box__lid' }),
      el('span', { class: 'gift-box__ribbon-v' }), el('span', { class: 'gift-box__bow' })
    );
    var label = gift.revealButton || 'Открыть подарок';
    var btn = el('button', { class: 'btn btn--pulse', type: 'button', text: label + ' 🎁' });
    var open = function () {
      box.classList.add('is-open');
      btn.disabled = true;
      burstFrom(box, 22);
      onOpened();
      setTimeout(function () { showContent(true); }, motion ? 900 : 0);
    };
    box.addEventListener('click', open);
    btn.addEventListener('click', open);
    append(wrap, [box, el('div', { class: 'actions', style: 'margin-top:0' }, btn)]);
    return wrap;
  }

  function renderFinaleGift() {
    setVeil('dim');
    var sh = screenShell('screen--center');
    var gift = cfg.finale.gift;
    var next = el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', text: t(cfg.story.title) + ' ❤', onclick: function () { state.storyFrom = null; go('story'); } })
    );
    next.hidden = !state.finale.giftOpened;
    append(sh.inner, [
      gift.intro ? paragraphs(gift.intro, 'subtitle reveal') : null,
      el('div', { class: 'reveal', style: '--i:1' }, giftBlock(gift, state.finale.giftOpened, function () {
        state.finale.giftOpened = true;
        save();
        setTimeout(function () { next.hidden = false; }, motion ? 1600 : 0);
      })),
      next
    ]);
    mount(sh.screen);
  }

  /* ----- Наша маленькая история ----- */

  function answerText(q) {
    var a = state.answers[q.id];
    if (!a || a.skipped || a.value === undefined || a.value === null || a.value === '') return null;
    if (q.type === 'text') return String(a.value);
    if (Array.isArray(a.value)) return a.value.map(function (i) { return q.options[i] ? t(q.options[i].text) : ''; }).filter(Boolean).join(', ');
    return q.options[a.value] ? t(q.options[a.value].text) : null;
  }

  function storyText() {
    var lines = [t(cfg.story.title), '♡ ♡ ♡', ''];
    if (cfg.meta.girlName) lines.push('Для: ' + cfg.meta.girlName);
    lines.push('Дата: ' + new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }), '');
    cfg.questions.forEach(function (q, i) {
      lines.push((i + 1) + '. ' + t(q.text));
      lines.push('   — ' + (answerText(q) || t(cfg.story.emptyAnswer)).replace(/\n/g, '\n     '));
      lines.push('');
    });
    lines.push('Продолжение следует… ❤');
    return lines.join('\n');
  }

  function renderStory() {
    setVeil('dim');
    var sh = screenShell('screen--wide');
    var list = el('ol', { class: 'story-list' });
    var guessed = 0, scored = 0;
    cfg.questions.forEach(function (q, i) {
      var ans = answerText(q);
      if (cfg.meta.scoring && q.correct.length && q.type !== 'text') {
        scored += 1;
        var a = state.answers[q.id];
        if (a && !a.skipped) {
          var picked = Array.isArray(a.value) ? a.value : [a.value];
          if (picked.length === q.correct.length && picked.every(function (v) { return q.correct.indexOf(v) !== -1; })) guessed += 1;
        }
      }
      list.appendChild(el('li', { class: 'story-item reveal', style: '--i:' + Math.min(i + 2, 10) },
        el('span', { class: 'story-item__num', 'aria-hidden': 'true', text: String(i + 1) }),
        el('p', { class: 'story-item__q', text: t(q.text) }),
        el('p', { class: 'story-item__a' + (ans ? '' : ' story-item__a--empty'), text: ans || t(cfg.story.emptyAnswer) })
      ));
    });

    var actions = el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', text: '⬇ ' + t(cfg.story.saveButton), onclick: function () {
        S.downloadFile('Наша маленькая история.txt', '﻿' + storyText());
        toast('Наша история сохранена ❤');
      } }),
      el('button', { class: 'btn btn--ghost', type: 'button', text: '↗ ' + t(cfg.story.shareButton), onclick: shareStory })
    );
    var bottom = el('div', { class: 'actions' });
    if (state.storyFrom === 'end') {
      bottom.appendChild(el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: '← Вернуться', onclick: function () { go('end'); } }));
    }
    bottom.appendChild(el('button', { class: 'link-btn', type: 'button', text: '↺ ' + t(cfg.story.restartButton), onclick: askRestart }));

    append(sh.inner, [
      el('div', { class: 'big-heart reveal', style: '--i:0;margin-top:0', 'aria-hidden': 'true', text: '❤' }),
      el('h1', { class: 'title reveal', style: '--i:0', 'data-focus': true, text: t(cfg.story.title) }),
      el('p', { class: 'subtitle reveal', style: '--i:1', text: t(cfg.story.subtitle) }),
      scored ? el('p', { class: 'score-note', text: 'Ты угадала ' + guessed + ' из ' + scored + ' — и каждый ответ прекрасен ✨' }) : null,
      list,
      cfg.secret.enabled ? galleryEl() : null,
      actions,
      bottom
    ]);
    mount(sh.screen);
  }

  function shareStory() {
    var text = storyText();
    if (navigator.share) {
      navigator.share({ title: t(cfg.story.title), text: text }).catch(function () { /* пользователь закрыл меню */ });
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Текст скопирован — можно вставить в сообщение ❤'); }, function () {
        S.downloadFile('Наша маленькая история.txt', '﻿' + text);
      });
      return;
    }
    S.downloadFile('Наша маленькая история.txt', '﻿' + text);
    toast('Меню «Поделиться» недоступно — сохранила файл ❤');
  }

  function askRestart() {
    confirmModal('Начать заново?', 'Ответы на этом устройстве сотрутся, и история начнётся с первой страницы.', 'Начать сначала ❤', 'Остаться')
      .then(function (ok) { if (ok) restart(); });
  }

  function restart() {
    state = freshState();
    save();
    setVeil(null);
    render();
  }

  /* ----- Секретный финал: ложный финал ----- */

  function renderFalseFinale() {
    setVeil(null);
    var sh = screenShell('screen--center');
    var orbit = el('div', { class: 'false-hearts reveal', style: '--i:0', 'aria-hidden': 'true' });
    for (var i = 0; i < 6; i++) orbit.appendChild(el('span', { style: '--i:' + i, text: '❤' }));
    var ff = cfg.secret.falseFinale;
    append(sh.inner, [
      orbit,
      el('h1', { class: 'title reveal', style: '--i:1', 'data-focus': true, text: t(ff.title) }),
      el('p', { class: 'subtitle reveal', style: '--i:2', text: t(ff.subtitle) }),
      el('p', { class: 'thanks reveal', style: '--i:3', text: t(ff.thanks) }),
      el('div', { class: 'reveal', style: '--i:4' }, el('button', { class: 'btn', type: 'button', text: t(ff.button), onclick: function (e) {
        e.currentTarget.disabled = true;
        state.secret.dramaticDone = false;
        go('dramatic');
      } }))
    ]);
    mount(sh.screen);
    later(function () { confetti(24); }, 600);
  }

  function renderDramatic() {
    setVeil('dark');
    var sh = screenShell('screen--center');
    var l1 = el('p', { class: 'dramatic__line', text: t(cfg.secret.waitText) });
    var l2 = el('p', { class: 'dramatic__line', text: t(cfg.secret.forgotText) });
    var btn = el('button', { class: 'btn btn--pulse dramatic__btn', type: 'button', text: t(cfg.secret.openButton), onclick: function () {
      state.secret.bookOpened = false;
      go('book');
    } });
    btn.disabled = true;
    append(sh.inner, [el('div', { 'aria-live': 'polite' }, l1, l2), btn]);
    mount(sh.screen, { noFocus: true });

    var showAll = function () {
      l1.classList.add('is-shown'); l2.classList.add('is-shown'); btn.classList.add('is-shown'); btn.disabled = false;
    };
    if (state.secret.dramaticDone) { showAll(); return; }
    var dark = pace(cfg.secret.pauses.dark), between = pace(cfg.secret.pauses.between);
    later(function () { l1.classList.add('is-shown'); }, dark + (motion ? 600 : 0));
    later(function () { l2.classList.add('is-shown'); }, dark + between + (motion ? 900 : 0));
    later(function () {
      showAll();
      state.secret.dramaticDone = true;
      save();
      btn.focus({ preventScroll: true });
    }, dark + between + (motion ? 2000 : 300));
  }

  /* ----- Секретный финал: книга ----- */

  function bookPages() {
    var pages = cfg.secret.pages.map(function (p) { return { kind: 'page', data: p }; });
    pages.push({ kind: 'letter' });
    return pages;
  }

  function renderBook() {
    setVeil('dark');
    document.documentElement.style.setProperty('--cover', cfg.secret.book.coverColor);
    if (!state.secret.bookOpened) return renderClosedBook();
    return renderReader();
  }

  function renderClosedBook() {
    var sh = screenShell('screen--center');
    var bk = cfg.secret.book;
    var book = el('button', { class: 'book', type: 'button', 'aria-label': 'Открыть книгу «' + t(bk.title) + '»' },
      el('span', { class: 'book__pages' }),
      el('span', { class: 'book__inner', 'aria-hidden': 'true', text: '♡' }),
      el('span', { class: 'book__cover' },
        el('span', { class: 'book__front' },
          el('span', { class: 'book__corner book__corner--tl', text: '✦' }), el('span', { class: 'book__corner book__corner--tr', text: '✦' }),
          el('span', { class: 'book__corner book__corner--bl', text: '✦' }), el('span', { class: 'book__corner book__corner--br', text: '✦' }),
          el('span', { class: 'book__heart', 'aria-hidden': 'true', text: '❤' }),
          el('span', { class: 'book__title', text: t(bk.title) }),
          el('span', { class: 'book__subtitle', text: t(bk.subtitle) })
        ),
        el('span', { class: 'book__back' })
      )
    );
    var opened = false;
    book.addEventListener('click', function () {
      if (opened) return;
      opened = true;
      book.classList.add('is-open');
      var hint = sh.inner.querySelector('.book-hint');
      if (hint) hint.style.visibility = 'hidden';
      glowHearts(18);
      later(function () {
        state.secret.bookOpened = true;
        state.secret.page = 0;
        save();
        renderReader();
      }, motion ? 1700 : 0);
    });
    append(sh.inner, [
      el('h1', { class: 'sr-only', 'data-focus': true, text: t(bk.title) }),
      el('div', { class: 'book-scene reveal', style: '--i:0' }, book),
      el('p', { class: 'book-hint reveal', style: '--i:1', text: t(bk.hint) })
    ]);
    mount(sh.screen);
    glowHearts(8);
  }

  function renderReader() {
    var sh = screenShell('screen--center');
    var pages = bookPages();
    var index = Math.min(Math.max(0, state.secret.page || 0), pages.length - 1);
    var turning = false;

    var bookBox = el('div', { class: 'reader__book' });
    var base = el('div', { class: 'page' });
    bookBox.appendChild(base);
    var prev = el('button', { class: 'reader__arrow', type: 'button', 'aria-label': 'Предыдущая страница', text: '‹' });
    var next = el('button', { class: 'reader__arrow', type: 'button', 'aria-label': 'Следующая страница', text: '›' });
    var dots = el('div', { class: 'reader__dots', 'aria-hidden': 'true' });
    pages.forEach(function () { dots.appendChild(el('span', { class: 'reader__dot' })); });
    var status = el('p', { class: 'sr-only', 'aria-live': 'polite' });

    function fillPage(node, i) {
      node.textContent = '';
      var p = pages[i];
      var content = el('div', { class: 'page__content' });
      if (p.kind === 'page') {
        var d = p.data;
        var hasText = !!(d.text && d.text.trim());
        if (i === 0 && d.title) content.appendChild(el('p', { class: 'page__chapter', text: t(cfg.secret.book.title) }));
        if (S.safeSrc(d.image)) content.appendChild(el('figure', { class: 'page__img' }, picture(d.image, 'Фото на странице', '', '')));
        if (d.title) content.appendChild(el('h2', { class: 'page__title' + (hasText ? '' : ' page__title--only'), text: t(d.title) }));
        if (hasText) content.appendChild(paragraphs(d.text, 'page__text'));
        content.appendChild(el('p', { class: 'page__flourish', 'aria-hidden': 'true', text: '❦' }));
      } else {
        var lt = cfg.secret.letter;
        content.appendChild(el('h2', { class: 'page__title', text: t(lt.pageTitle) }));
        if (state.secret.letterOpened) {
          content.appendChild(el('div', { class: 'page__text' }, el('p', { text: 'Письмо уже ждёт тебя ✉️' })));
          content.appendChild(el('div', { class: 'actions', style: 'margin-top:14px' },
            el('button', { class: 'btn btn--small', type: 'button', text: 'Перечитать письмо', onclick: function (e) { e.stopPropagation(); go('secretLetter'); } })
          ));
        } else {
          content.appendChild(envelopeEl(t(lt.hint), function () {
            state.secret.letterOpened = true;
            save();
            go('secretLetter');
          }));
        }
      }
      node.appendChild(content);
      node.appendChild(el('span', { class: 'page__num', text: '— ' + (i + 1) + ' —' }));
      node.appendChild(el('span', { class: 'page__shade' }));
    }

    function updateNav() {
      prev.disabled = index === 0;
      next.disabled = index === pages.length - 1;
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('is-current', i === index); });
      status.textContent = 'Страница ' + (index + 1) + ' из ' + pages.length;
      state.secret.page = index;
      save();
    }

    function turn(dir) {
      var target = index + dir;
      if (turning || target < 0 || target >= pages.length) return;
      if (!motion) { index = target; fillPage(base, index); updateNav(); return; }
      turning = true;
      var overlay;
      if (dir > 0) {
        overlay = base.cloneNode(true);
        overlay.classList.add('page--turning');
        bookBox.appendChild(overlay);
        index = target;
        fillPage(base, index);
        void overlay.offsetWidth;
        overlay.classList.add('flip-next');
      } else {
        overlay = el('div', { class: 'page page--turning' });
        index = target;
        fillPage(overlay, index);
        bookBox.appendChild(overlay);
        void overlay.offsetWidth;
        overlay.classList.add('flip-prev');
      }
      glowHearts(4);
      var done = function () {
        if (dir < 0) fillPage(base, index);
        overlay.remove();
        turning = false;
      };
      overlay.addEventListener('animationend', done, { once: true });
      setTimeout(function () { if (overlay.isConnected) done(); }, 1300);
      updateNav();
    }

    prev.addEventListener('click', function () { turn(-1); });
    next.addEventListener('click', function () { turn(1); });

    // Свайпы и нажатия по краям страницы
    var sx = 0, sy = 0, st = 0, tracking = false;
    bookBox.addEventListener('pointerdown', function (e) { tracking = true; sx = e.clientX; sy = e.clientY; st = Date.now(); });
    bookBox.addEventListener('pointercancel', function () { tracking = false; });
    bookBox.addEventListener('pointerup', function (e) {
      if (!tracking) return;
      tracking = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) { turn(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - st < 500) {
        if (e.target.closest('button, a, .envelope-wrap')) return;
        var r = bookBox.getBoundingClientRect();
        turn(e.clientX - r.left < r.width * 0.35 ? -1 : 1);
      }
    });
    sh.screen.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') turn(1);
      if (e.key === 'ArrowLeft') turn(-1);
    });

    fillPage(base, index);
    append(sh.inner, [
      el('h1', { class: 'sr-only', 'data-focus': true, text: t(cfg.secret.book.title) }),
      el('div', { class: 'reader reveal', style: '--i:0' },
        bookBox,
        el('div', { class: 'reader__nav' }, prev, dots, next),
        el('p', { class: 'reader__hint', text: 'Листай свайпом или нажатием на край страницы' }),
        status
      )
    ]);
    updateNav();
    mount(sh.screen);
    glowHearts(10);
  }

  function renderSecretLetter() {
    setVeil('dark');
    var sh = screenShell('screen--center');
    var lt = cfg.secret.letter;
    var hasPhoto = !!S.safeSrc(lt.photo);
    append(sh.inner, [
      letterEl(lt.greeting, lt.text, lt.signature, lt.photo, hasPhoto),
      el('div', { class: 'actions reveal', style: '--i:3' },
        el('button', { class: 'btn btn--pulse', type: 'button', text: t(cfg.secret.moreButton), onclick: function (e) { burstFrom(e.currentTarget, 16); go('secretGift'); } })
      ),
      el('div', { class: 'reveal', style: '--i:4;margin-top:8px' },
        el('button', { class: 'link-btn', type: 'button', text: '← Вернуться к книге', onclick: function () { go('book'); } })
      )
    ]);
    mount(sh.screen);
    later(function () { glowHearts(12); }, 300);
  }

  function renderSecretGift() {
    setVeil('dim');
    var sh = screenShell('screen--center');
    var gift = cfg.secret.gift;
    var next = el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'button', text: cfg.ui.continueButton + ' ❤', onclick: function () { go('end'); } })
    );
    var ready = state.secret.giftOpened || gift.mode === 'intrigue';
    next.hidden = !ready;
    var block = gift.mode === 'intrigue'
      ? giftBlock(gift, true)
      : giftBlock(gift, state.secret.giftOpened, function () {
        state.secret.giftOpened = true;
        save();
        setTimeout(function () { next.hidden = false; }, motion ? 1600 : 0);
      });
    append(sh.inner, [
      el('div', { class: 'reveal', style: '--i:0', 'data-focus': true }, paragraphs(gift.intro, 'subtitle')),
      el('div', { class: 'reveal', style: '--i:2' }, block),
      el('div', { class: 'reveal', style: '--i:3' }, next)
    ]);
    mount(sh.screen);
    if (gift.mode === 'intrigue' && !state.secret.giftOpened) {
      state.secret.giftOpened = true;
      save();
      later(function () { confetti(30); }, 900);
    }
  }

  function renderEnd() {
    setVeil('dim');
    var sh = screenShell('screen--center');
    var en = cfg.secret.ending;
    var photo = en.photo || cfg.start.photo;
    append(sh.inner, [
      el('div', { class: 'reveal', style: '--i:0', 'data-focus': true }, paragraphs(en.text, 'ending__text')),
      el('div', { class: 'reveal', style: '--i:1;margin-top:28px' }, framed(photo, cfg.start.photoCaption, 'frame--small')),
      el('div', { class: 'big-heart reveal', style: '--i:2', 'aria-hidden': 'true', text: '❤' }),
      el('div', { class: 'actions actions--stack reveal', style: '--i:3;max-width:360px;margin-left:auto;margin-right:auto' },
        el('button', { class: 'btn', type: 'button', text: t(en.button), onclick: askRestart }),
        el('button', { class: 'btn btn--ghost', type: 'button', text: t(en.storyButton), onclick: function () { state.storyFrom = 'end'; go('story'); } })
      )
    ]);
    mount(sh.screen);
    later(function () { confetti(46); }, 700);
  }

  /* ---------- Запуск ---------- */

  function applyTheme() {
    var root = document.documentElement;
    var c = cfg.meta.primaryColor;
    root.style.setProperty('--primary', c);
    root.style.setProperty('--primary-hi', S.shade(c, 0.22));
    root.style.setProperty('--primary-lo', S.shade(c, -0.42));
    root.style.setProperty('--cover', cfg.secret.book.coverColor);
    motion = cfg.meta.animations && !reduceMotionMq.matches;
    root.classList.toggle('no-motion', !motion);
  }

  function showError(err) {
    var sh = screenShell('screen--center');
    append(sh.inner, el('div', { class: 'error-box' },
      el('div', { class: 'loader__heart', 'aria-hidden': 'true', text: '❤' }),
      el('h1', { class: 'modal__title', 'data-focus': true, text: 'Что-то пошло не так' }),
      el('p', { class: 'modal__text', text: 'История не смогла загрузиться. Попробуй обновить страницу — я уже держу за тебя кулачки.' }),
      el('button', { class: 'btn', type: 'button', text: 'Обновить', onclick: function () { window.location.reload(); } })
    ));
    mount(sh.screen);
    if (window.console && err) console.warn('[Наша история]', err);
  }

  function loadConfig() {
    if (PREVIEW) {
      var draft = S.storageGet(S.KEYS.draft);
      if (draft) return Promise.resolve(S.normalizeConfig(draft));
    }
    return S.loadPublishedConfig().then(function (r) { return r.config; });
  }

  function start() {
    loadConfig().then(function (config) {
      cfg = config;
      applyTheme();
      document.title = t(cfg.secret.book.title) + ' ❤';
      buildSteps();
      state = loadState();
      if (JUMP) {
        state = freshState();
        if (JUMP === 'secret') state.screen = cfg.secret.enabled ? 'false' : 'finale';
        else if (JUMP === 'finale') state.screen = cfg.secret.enabled ? 'false' : 'finale';
        else if (JUMP === 'story') state.screen = 'story';
        save();
        if (window.history && history.replaceState) history.replaceState(null, '', 'index.html?preview=1');
      }
      if (PREVIEW) document.getElementById('previewBadge').hidden = false;
      spawnFloatingHearts();
      setupAudio();
      var first = stage.querySelector('#loading');
      setTimeout(function () {
        currentScreen = first;
        render();
      }, motion ? 450 : 0);
    }).catch(showError);
  }

  if (PREVIEW) {
    window.addEventListener('storage', function (e) {
      if (e.key === S.KEYS.draft) { clearTimeout(window.__reloadT); window.__reloadT = setTimeout(function () { window.location.reload(); }, 600); }
    });
  }

  if (reduceMotionMq.addEventListener) {
    reduceMotionMq.addEventListener('change', function () { if (cfg) { applyTheme(); spawnFloatingHearts(); } });
  }

  start();
})();
