/* ==========================================================================
   Визуальный редактор игры (admin.html)
   Всё сохраняется только в localStorage этого браузера (черновик).
   Публикация = скачать config.json и заменить им файл в репозитории.
   ========================================================================== */
(function () {
  'use strict';

  var S = window.LoveShared;
  var KEYS = S.KEYS;

  var panel = document.getElementById('panel');
  var tabsEl = document.getElementById('tabs');
  var statusEl = document.getElementById('status');
  var frame = document.getElementById('previewFrame');
  var hiddenFile = document.getElementById('hiddenFile');
  var toastEl = document.getElementById('toast');

  var draft = null;
  var published = null;
  var publishedSource = 'defaults';
  var openItems = {};

  var TABS = [
    ['general', 'Основное'],
    ['start', 'Стартовый экран'],
    ['questions', 'Вопросы'],
    ['interludes', 'Вставки'],
    ['finale', 'Финал'],
    ['secret', 'Секретный финал'],
    ['publish', 'Публикация']
  ];
  var currentTab = S.storageGet(KEYS.adminTab);
  if (!TABS.some(function (tb) { return tb[0] === currentTab; })) currentTab = 'questions';

  /* ---------- DOM ---------- */

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'value') node.value = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(parent, c); }); return; }
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  var toastTimer;
  function toast(text, isError) {
    toastEl.textContent = text;
    toastEl.classList.toggle('is-error', !!isError);
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-shown'); }, 3200);
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-ok', kind === 'ok');
    statusEl.classList.toggle('is-error', kind === 'error');
  }

  /* ---------- Данные ---------- */

  function get(path) {
    return path.split('.').reduce(function (o, k) { return o === null || o === undefined ? undefined : o[k]; }, draft);
  }
  function set(path, value) {
    var keys = path.split('.');
    var o = draft;
    for (var i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    touch();
  }

  var saveTimer;
  function touch() {
    clearTimeout(saveTimer);
    setStatus('Сохраняю черновик…');
    saveTimer = setTimeout(persist, 450);
  }

  function persist() {
    clearTimeout(saveTimer);
    var ok = S.storageSet(KEYS.draft, draft);
    if (!ok) {
      setStatus('Не удалось сохранить: в браузере закончилось место. Уменьшите количество встроенных фото — лучше положите их в assets/photos/.', 'error');
      return false;
    }
    var time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    var same = JSON.stringify(S.normalizeConfig(draft)) === JSON.stringify(published);
    setStatus(same
      ? 'Черновик совпадает с опубликованной версией · ' + time
      : 'Черновик сохранён в этом браузере · ' + time + ' · ещё не опубликован', 'ok');
    applyTheme();
    return true;
  }

  function applyTheme() {
    var c = draft.meta.primaryColor;
    if (!/^#[0-9a-f]{6}$/i.test(c)) return;
    document.documentElement.style.setProperty('--primary', c);
    document.documentElement.style.setProperty('--primary-hi', S.shade(c, 0.22));
    document.documentElement.style.setProperty('--primary-lo', S.shade(c, -0.42));
  }

  function kb(n) { return Math.max(1, Math.round(n / 1024)); }

  /* ---------- Поля формы ---------- */

  var fieldId = 0;
  function nextId() { fieldId += 1; return 'f' + fieldId; }

  function field(label, path, opts) {
    opts = opts || {};
    var id = nextId();
    var type = opts.type || 'text';
    var value = get(path);
    var control;
    if (type === 'textarea') {
      control = el('textarea', { class: 'a-textarea', id: id, rows: opts.rows || 4, placeholder: opts.placeholder || '' });
      control.value = value || '';
    } else if (type === 'select') {
      control = el('select', { class: 'a-select', id: id });
      opts.choices.forEach(function (c) {
        var o = el('option', { value: String(c[0]), text: c[1] });
        if (String(c[0]) === String(value)) o.selected = true;
        control.appendChild(o);
      });
    } else if (type === 'number') {
      control = el('input', { class: 'a-input', id: id, type: 'number', inputmode: 'decimal', min: opts.min, max: opts.max, step: opts.step || 1 });
      control.value = opts.toView ? opts.toView(value) : value;
    } else {
      control = el('input', { class: 'a-input', id: id, type: 'text', placeholder: opts.placeholder || '', maxlength: opts.maxlength || null });
      control.value = value || '';
    }
    var handler = function () {
      var v = control.value;
      if (type === 'number') {
        v = parseFloat(String(v).replace(',', '.'));
        if (!isFinite(v)) return;
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
        if (opts.fromView) v = opts.fromView(v);
      } else if (type === 'select' && opts.numeric) {
        v = parseInt(v, 10);
      }
      set(path, v);
      if (opts.onChange) opts.onChange(v);
    };
    control.addEventListener(type === 'select' ? 'change' : 'input', handler);
    return el('div', { class: 'a-field' },
      el('label', { class: 'a-label', for: id, text: label }),
      control,
      opts.help ? el('span', { class: 'a-help', text: opts.help }) : null
    );
  }

  function colorField(label, path, fallback, help) {
    var id = nextId();
    var input = el('input', { type: 'color', id: id });
    input.value = get(path);
    var text = el('input', { class: 'a-input', type: 'text', value: get(path), maxlength: 7, 'aria-label': label + ' (код цвета)', style: 'max-width:120px' });
    input.addEventListener('input', function () { text.value = input.value; set(path, input.value); });
    text.addEventListener('input', function () {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) { input.value = text.value; set(path, text.value.toLowerCase()); }
    });
    var reset = el('button', { class: 'a-btn a-btn--ghost a-btn--small', type: 'button', text: 'Сбросить', onclick: function () {
      input.value = fallback; text.value = fallback; set(path, fallback);
    } });
    return el('div', { class: 'a-field' },
      el('label', { class: 'a-label', for: id, text: label }),
      el('div', { class: 'a-color' }, input, text, reset),
      help ? el('span', { class: 'a-help', text: help }) : null
    );
  }

  function switchField(label, path, onChange, help) {
    var input = el('input', { type: 'checkbox' });
    input.checked = !!get(path);
    input.addEventListener('change', function () { set(path, input.checked); if (onChange) onChange(input.checked); });
    return el('div', { class: 'a-field' },
      el('label', { class: 'a-switch' }, input, el('span', { class: 'a-switch__ui', 'aria-hidden': 'true' }), el('span', { class: 'a-switch__text', text: label })),
      help ? el('span', { class: 'a-help', text: help }) : null
    );
  }

  function radioField(label, path, choices, onChange) {
    var name = nextId();
    var row = el('div', { class: 'a-radio-row', role: 'radiogroup', 'aria-label': label });
    choices.forEach(function (c) {
      var input = el('input', { type: 'radio', name: name, value: c[0] });
      input.checked = get(path) === c[0];
      input.addEventListener('change', function () { if (input.checked) { set(path, c[0]); if (onChange) onChange(c[0]); } });
      row.appendChild(el('label', { class: 'a-radio' }, input, c[1]));
    });
    return el('div', { class: 'a-field' }, el('span', { class: 'a-label', text: label }), row);
  }

  function pickImage() {
    return new Promise(function (resolve, reject) {
      hiddenFile.value = '';
      hiddenFile.onchange = function () {
        var file = hiddenFile.files && hiddenFile.files[0];
        if (!file) { reject(new Error('Файл не выбран')); return; }
        setStatus('Сжимаю фото…');
        S.fileToDataUrl(file, 1400, 0.82).then(resolve, reject);
      };
      hiddenFile.click();
    });
  }

  function imageField(label, path, help, onChange) {
    var wrap = el('div', { class: 'a-field' }, el('span', { class: 'a-label', text: label }));
    var thumb = el('div', { class: 'a-thumb' });
    var controls = el('div', { class: 'a-image__controls' });
    wrap.appendChild(el('div', { class: 'a-image' }, thumb, controls));
    if (help) wrap.appendChild(el('span', { class: 'a-help', text: help }));

    function drawThumb() {
      var v = get(path) || '';
      thumb.textContent = '';
      var safe = S.safeSrc(v);
      if (!safe) { thumb.textContent = v ? 'путь не подходит' : 'нет фото'; return; }
      var img = el('img', { src: safe, alt: '' });
      img.addEventListener('error', function () { thumb.textContent = 'файл не найден'; }, { once: true });
      thumb.appendChild(img);
    }
    function draw() {
      var v = get(path) || '';
      controls.textContent = '';
      if (/^data:/i.test(v)) {
        controls.appendChild(el('div', { class: 'a-embedded', text: '✓ Фото встроено в настройки · ' + kb(v.length) + ' КБ' }));
      } else {
        var input = el('input', { class: 'a-input', type: 'text', placeholder: 'assets/photos/имя-файла.jpg', 'aria-label': label + ' — путь к файлу' });
        input.value = v;
        input.addEventListener('input', function () { set(path, input.value.trim()); if (onChange) onChange(); });
        input.addEventListener('change', drawThumb);
        controls.appendChild(input);
      }
      var row = el('div', { class: 'a-image__row' },
        el('button', { class: 'a-btn a-btn--ghost a-btn--small', type: 'button', text: '📷 Загрузить с устройства', onclick: function () {
          pickImage().then(function (data) {
            set(path, data);
            draw(); drawThumb();
            if (onChange) onChange();
            toast('Фото сжато и встроено в черновик (' + kb(data.length) + ' КБ)');
          }, function (err) { if (err && err.message !== 'Файл не выбран') toast(err.message, true); persist(); });
        } }),
        v ? el('button', { class: 'a-btn a-btn--danger a-btn--small', type: 'button', text: 'Убрать', onclick: function () {
          set(path, ''); draw(); drawThumb(); if (onChange) onChange();
        } }) : null
      );
      controls.appendChild(row);
    }
    draw(); drawThumb();
    return wrap;
  }

  function section(title, desc) {
    var s = el('section', { class: 'a-section' }, el('h2', { class: 'a-section__title', text: title }));
    if (desc) s.appendChild(el('p', { class: 'a-section__desc', text: desc }));
    for (var i = 2; i < arguments.length; i++) add(s, arguments[i]);
    return s;
  }
  function grid2() { var g = el('div', { class: 'a-grid a-grid--2' }); for (var i = 0; i < arguments.length; i++) add(g, arguments[i]); return g; }
  function grid() { var g = el('div', { class: 'a-grid' }); for (var i = 0; i < arguments.length; i++) add(g, arguments[i]); return g; }

  function move(arr, from, to) {
    if (to < 0 || to >= arr.length) return false;
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    return true;
  }

  function rerender() {
    var y = window.scrollY;
    renderTab();
    window.scrollTo(0, y);
  }

  /* Общая карточка элемента списка (вопрос, страница, вставка…) */
  function itemCard(opts) {
    var isOpen = !!openItems[opts.id];
    var titleEl = el('span', { class: 'a-item__title', text: opts.title || 'Без текста' });
    var metaEl = el('span', { class: 'a-item__meta', text: opts.meta || '' });
    var card = el('div', { class: 'a-item' });
    var head = el('div', { class: 'a-item__head' },
      el('span', { class: 'a-item__num', text: String(opts.index + 1) }),
      el('button', { class: 'a-item__summary', type: 'button', 'aria-expanded': isOpen ? 'true' : 'false', onclick: function () {
        openItems[opts.id] = !openItems[opts.id];
        rerender();
      } }, titleEl, metaEl),
      el('div', { class: 'a-item__tools' },
        el('button', { class: 'a-icon', type: 'button', title: 'Выше', 'aria-label': 'Переместить выше', disabled: opts.index === 0, text: '↑', onclick: function () { if (move(opts.list, opts.index, opts.index - 1)) { touch(); rerender(); } } }),
        el('button', { class: 'a-icon', type: 'button', title: 'Ниже', 'aria-label': 'Переместить ниже', disabled: opts.index === opts.list.length - 1, text: '↓', onclick: function () { if (move(opts.list, opts.index, opts.index + 1)) { touch(); rerender(); } } }),
        opts.onDuplicate ? el('button', { class: 'a-icon a-icon--opt', type: 'button', title: 'Дублировать', 'aria-label': 'Дублировать', text: '⧉', onclick: opts.onDuplicate }) : null,
        el('button', { class: 'a-icon a-icon--danger', type: 'button', title: 'Удалить', 'aria-label': 'Удалить', text: '✕', onclick: function () {
          if (!window.confirm(opts.confirmText || 'Удалить этот элемент?')) return;
          opts.list.splice(opts.index, 1);
          if (opts.onDelete) opts.onDelete();
          touch(); rerender();
          toast('Удалено');
        } })
      )
    );
    card.appendChild(head);
    if (isOpen) {
      var body = el('div', { class: 'a-item__body' });
      opts.body(body, function (text) { titleEl.textContent = text || 'Без текста'; });
      card.appendChild(body);
    }
    return card;
  }

  function preview(text) { var s = String(text || '').replace(/\s+/g, ' ').trim(); return s.length > 80 ? s.slice(0, 80) + '…' : s; }

  /* ---------- Вкладки ---------- */

  function renderTabs() {
    tabsEl.textContent = '';
    TABS.forEach(function (tb) {
      tabsEl.appendChild(el('button', {
        class: 'a-tab', type: 'button', role: 'tab', id: 'tab-' + tb[0],
        'aria-selected': tb[0] === currentTab ? 'true' : 'false', text: tb[1],
        onclick: function () {
          currentTab = tb[0];
          S.storageSet(KEYS.adminTab, currentTab);
          renderTabs(); renderTab();
          window.scrollTo(0, 0);
        }
      }));
    });
  }

  function renderTab() {
    panel.textContent = '';
    panel.setAttribute('aria-labelledby', 'tab-' + currentTab);
    var map = { general: tabGeneral, start: tabStart, questions: tabQuestions, interludes: tabInterludes, finale: tabFinale, secret: tabSecret, publish: tabPublish };
    map[currentTab]();
  }

  /* ----- Основное ----- */

  function tabGeneral() {
    add(panel, [
      section('Главное', 'Имя подставляется во все тексты, где написано {имя}.',
        grid2(
          field('Имя девушки', 'meta.girlName', { placeholder: 'Например: Аня', help: 'Используйте {имя} в любом тексте — оно заменится на это имя.' }),
          colorField('Основной цвет оформления', 'meta.primaryColor', window.LOVE_DEFAULT_CONFIG.meta.primaryColor, 'Цвет кнопок, сердечек и акцентов.')
        ),
        grid2(
          switchField('Анимации включены', 'meta.animations', null, 'Если выключить — экраны и книга работают без движения. У тех, кто отключил анимации в системе, они выключаются сами.'),
          switchField('Режим угадывания (правильные ответы)', 'meta.scoring', null, 'По умолчанию выключен. Включите, чтобы отмечать правильные варианты во вкладке «Вопросы». Реакции всё равно останутся тёплыми.')
        )
      ),
      section('Музыка', 'Музыка начинает играть только после нажатия «Начать нашу историю» или кнопки ♫. Если файла нет, сайт просто работает без звука.',
        grid2(
          switchField('Музыкальное сопровождение', 'music.enabled'),
          field('Громкость, %', 'music.volume', { type: 'number', min: 0, max: 100, step: 5, toView: function (v) { return Math.round(v * 100); }, fromView: function (v) { return v / 100; } })
        ),
        field('Путь к MP3-файлу', 'music.src', { placeholder: 'assets/music/music.mp3', help: 'Положите файл в папку assets/music/ и укажите его имя здесь.' }),
        el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn a-btn--ghost a-btn--small', type: 'button', text: '▶ Проверить файл', onclick: testMusic }))
      ),
      section('Тексты кнопок и подсказок', null,
        grid2(
          field('Кнопка «Продолжить»', 'ui.continueButton'),
          field('Кнопка «Готово»', 'ui.doneButton'),
          field('Кнопка «Назад»', 'ui.backButton'),
          field('Кнопка «Пропустить»', 'ui.skipButton'),
          field('Подсказка для нескольких ответов', 'ui.multipleHint'),
          field('Подсказка в поле свободного ответа', 'ui.textPlaceholder')
        )
      ),
      section('Романтические фразы после ответа', 'Используются, если у вопроса нет своего текста после ответа. Одна фраза — одна строка.',
        reactionsField()
      ),
      section('Экран «Наша маленькая история»', 'Здесь девушка видит свои ответы, может сохранить их в файл или поделиться.',
        grid2(
          field('Заголовок', 'story.title'),
          field('Подзаголовок', 'story.subtitle'),
          field('Кнопка сохранения', 'story.saveButton'),
          field('Кнопка «Поделиться»', 'story.shareButton'),
          field('Текст, если ответа нет', 'story.emptyAnswer'),
          field('Кнопка «Начать заново»', 'story.restartButton')
        )
      )
    ]);
  }

  function reactionsField() {
    var id = nextId();
    var area = el('textarea', { class: 'a-textarea', id: id, rows: 6 });
    area.value = draft.ui.reactions.join('\n');
    area.addEventListener('input', function () {
      draft.ui.reactions = area.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      touch();
    });
    return el('div', { class: 'a-field' }, el('label', { class: 'a-label', for: id, text: 'Фразы' }), area);
  }

  function testMusic() {
    var src = S.safeSrc(draft.music.src);
    if (!src) { toast('Укажите путь к файлу', true); return; }
    var a = new Audio(src);
    a.volume = draft.music.volume;
    a.addEventListener('error', function () { toast('Файл не найден: ' + src, true); }, { once: true });
    var p = a.play();
    if (p && p.then) p.then(function () { toast('Музыка играет ♫ (5 секунд)'); setTimeout(function () { a.pause(); }, 5000); }, function () {});
  }

  /* ----- Стартовый экран ----- */

  function tabStart() {
    add(panel, section('Стартовый экран', 'Первое, что увидит девушка, открыв ссылку.',
      grid(
        field('Надпись над фото', 'start.eyebrow', { help: 'Можно оставить пустым.' }),
        imageField('Наше совместное фото', 'start.photo', 'Лучше всего: положите фото в assets/photos/ и укажите путь, например assets/photos/us.jpg. Если фото нет — покажется красивая заглушка. Это фото также используется на последнем экране.'),
        field('Подпись на рамке', 'start.photoCaption', { placeholder: 'мы ♡' }),
        field('Заголовок', 'start.title', { type: 'textarea', rows: 2 }),
        field('Подзаголовок', 'start.subtitle', { type: 'textarea', rows: 3 }),
        field('Кнопка запуска', 'start.button')
      )
    ));
  }

  /* ----- Вопросы ----- */

  var TYPE_CHOICES = Object.keys(S.QUESTION_TYPES).map(function (k) { return [k, S.QUESTION_TYPES[k]]; });

  function tabQuestions() {
    var list = draft.questions;
    var box = el('div');
    if (!list.length) box.appendChild(el('p', { class: 'a-empty', text: 'Пока нет ни одного вопроса. Добавьте первый ниже — или игра сразу перейдёт к финалу.' }));
    list.forEach(function (q, i) {
      box.appendChild(itemCard({
        id: q.id, index: i, list: list,
        title: preview(q.text),
        meta: S.QUESTION_TYPES[q.type] + ' · ' + (q.required ? 'обязательный' : 'можно пропустить') + (q.type !== 'text' ? ' · вариантов: ' + q.options.length : ''),
        confirmText: 'Удалить вопрос «' + preview(q.text) + '»?',
        onDuplicate: function () {
          var copy = S.clone(q);
          copy.id = S.uid('q');
          list.splice(i + 1, 0, copy);
          openItems[copy.id] = true;
          touch(); rerender();
          toast('Вопрос продублирован');
        },
        body: function (body, setTitle) { questionBody(body, q, i, setTitle); }
      }));
    });

    var typeSel = el('select', { class: 'a-select', 'aria-label': 'Тип нового вопроса', style: 'max-width:300px' });
    TYPE_CHOICES.forEach(function (c) { typeSel.appendChild(el('option', { value: c[0], text: c[1] })); });
    var addBtn = el('button', { class: 'a-btn', type: 'button', text: '+ Добавить вопрос', onclick: function () {
      var type = typeSel.value;
      var q = S.normalizeQuestion({
        type: type,
        text: '',
        options: type === 'text' ? [] : type === 'yesno' ? [{ text: 'Да ❤️' }, { text: 'Нет' }] : type === 'scenario'
          ? [{ text: 'Первый сценарий', emoji: '🌙', desc: '' }, { text: 'Второй сценарий', emoji: '☀️', desc: '' }]
          : [{ text: '', emoji: '❤️' }, { text: '', emoji: '✨' }, { text: '', emoji: '🌹' }]
      });
      list.push(q);
      openItems[q.id] = true;
      touch(); renderTab();
      setTimeout(function () {
        var cards = panel.querySelectorAll('.a-item');
        var last = cards[cards.length - 1];
        if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'start' }); var ta = last.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true }); }
      }, 50);
    } });

    add(panel, section('Вопросы', 'Нажмите на вопрос, чтобы развернуть его. Порядок меняется стрелками, удаление — крестиком (с подтверждением). Здесь нет неправильных ответов: каждая реакция тёплая.',
      box,
      el('div', { class: 'a-add-row' }, typeSel, addBtn)
    ));
  }

  function questionBody(body, q, i, setTitle) {
    var base = 'questions.' + i + '.';
    add(body, [
      field('Текст вопроса', base + 'text', { type: 'textarea', rows: 2, onChange: setTitle }),
      grid2(
        field('Тип вопроса', base + 'type', { type: 'select', choices: TYPE_CHOICES, onChange: function () {
          var n = S.normalizeQuestion(q);
          if (q.type === 'single' || q.type === 'multiple' || q.type === 'photo') {
            while (n.options.length < 2) n.options.push({ text: '', emoji: '', desc: '' });
          }
          draft.questions[i] = n;
          touch(); rerender();
        } }),
        switchField('Обязательный вопрос', base + 'required', function () { rerender(); }, 'Если выключить, появится кнопка «Пропустить».')
      ),
      imageField(q.type === 'photo' ? 'Фотография к вопросу (главная часть вопроса)' : 'Изображение к вопросу (необязательно)', base + 'image',
        q.type === 'photo' ? 'Вопрос покажет большое фото, а под ним — варианты ответа.' : null),
      q.type !== 'text' ? optionsEditor(q, i) : null,
      field('Текст после ответа', base + 'reaction', { type: 'textarea', rows: 2, help: 'Покажется после ответа вместе с кнопкой «Продолжить». Если пусто — одна из общих романтических фраз.' })
    ]);
  }

  function optionsEditor(q, qi) {
    var fixed = q.type === 'yesno' || q.type === 'scenario';
    var singleCorrect = q.type !== 'multiple';
    var wrap = el('div', { class: 'a-field' });
    wrap.appendChild(el('span', { class: 'a-label', text: fixed ? 'Варианты (их всегда два)' : 'Варианты ответа · ' + q.options.length }));
    var listEl = el('div', { class: 'a-options' });
    q.options.forEach(function (opt, oi) {
      var base = 'questions.' + qi + '.options.' + oi + '.';
      var emoji = el('input', { class: 'a-input a-option__emoji', type: 'text', maxlength: 8, 'aria-label': 'Эмодзи варианта ' + (oi + 1), placeholder: '♡' });
      emoji.value = opt.emoji;
      emoji.addEventListener('input', function () { set(base + 'emoji', emoji.value.trim()); });
      var text = el('input', { class: 'a-input', type: 'text', 'aria-label': 'Текст варианта ' + (oi + 1), placeholder: 'Вариант ' + (oi + 1) });
      text.value = opt.text;
      text.addEventListener('input', function () { set(base + 'text', text.value); });

      var tools = el('div', { class: 'a-option__tools' });
      if (draft.meta.scoring) {
        var cb = el('input', { type: 'checkbox' });
        cb.checked = q.correct.indexOf(oi) !== -1;
        cb.addEventListener('change', function () {
          if (singleCorrect) q.correct = cb.checked ? [oi] : [];
          else if (cb.checked) q.correct = q.correct.concat(oi).sort(); else q.correct = q.correct.filter(function (n) { return n !== oi; });
          touch(); rerender();
        });
        tools.appendChild(el('label', { class: 'a-correct', title: 'Правильный ответ' }, cb, '✓'));
      }
      if (!fixed) {
        tools.appendChild(el('button', { class: 'a-icon', type: 'button', 'aria-label': 'Вариант выше', disabled: oi === 0, text: '↑', onclick: function () { moveOption(q, oi, oi - 1); } }));
        tools.appendChild(el('button', { class: 'a-icon', type: 'button', 'aria-label': 'Вариант ниже', disabled: oi === q.options.length - 1, text: '↓', onclick: function () { moveOption(q, oi, oi + 1); } }));
        tools.appendChild(el('button', { class: 'a-icon a-icon--danger', type: 'button', 'aria-label': 'Удалить вариант', disabled: q.options.length <= 2, text: '✕', onclick: function () {
          q.options.splice(oi, 1);
          q.correct = q.correct.filter(function (n) { return n !== oi; }).map(function (n) { return n > oi ? n - 1 : n; });
          touch(); rerender();
        } }));
      }
      var row = el('div', { class: 'a-option' }, emoji, text, tools);
      listEl.appendChild(row);
      if (q.type === 'scenario') {
        var desc = el('input', { class: 'a-input a-option__desc', type: 'text', 'aria-label': 'Описание сценария ' + (oi + 1), placeholder: 'Короткое описание сценария' });
        desc.value = opt.desc;
        desc.addEventListener('input', function () { set(base + 'desc', desc.value); });
        listEl.appendChild(el('div', { class: 'a-option' }, el('span'), desc, el('span')));
      }
    });
    wrap.appendChild(listEl);
    if (!fixed) {
      wrap.appendChild(el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn a-btn--ghost a-btn--small', type: 'button', text: '+ Вариант ответа', onclick: function () {
        q.options.push({ text: '', emoji: '', desc: '' });
        touch(); rerender();
      } })));
    }
    if (!draft.meta.scoring) wrap.appendChild(el('span', { class: 'a-help', text: 'Хотите отметить правильный ответ? Включите «Режим угадывания» во вкладке «Основное».' }));
    else wrap.appendChild(el('span', { class: 'a-help', text: '✓ — правильный ответ. Если ничего не отмечено, вопрос не участвует в подсчёте.' }));
    return wrap;
  }

  function moveOption(q, from, to) {
    if (!move(q.options, from, to)) return;
    q.correct = q.correct.map(function (n) {
      if (n === from) return to;
      if (n === to) return from;
      return n;
    }).sort();
    touch(); rerender();
  }

  /* ----- Вставки ----- */

  function tabInterludes() {
    var list = draft.interludes.items;
    var n = draft.questions.length;
    var choices = [];
    for (var k = 1; k <= Math.max(1, n); k++) choices.push([k, 'После вопроса ' + k + (draft.questions[k - 1] ? ': ' + preview(draft.questions[k - 1].text).slice(0, 40) : '')]);
    var box = el('div');
    if (!list.length) box.appendChild(el('p', { class: 'a-empty', text: 'Вставок пока нет.' }));
    list.forEach(function (it, i) {
      box.appendChild(itemCard({
        id: it.id, index: i, list: list,
        title: preview(it.text),
        meta: 'после вопроса ' + it.afterQuestion + (it.enabled ? '' : ' · выключена') + (it.afterQuestion > n ? ' · такого вопроса нет — не покажется' : ''),
        confirmText: 'Удалить эту вставку?',
        body: function (body, setTitle) {
          var base = 'interludes.items.' + i + '.';
          add(body, [
            field('Текст', base + 'text', { type: 'textarea', rows: 3, onChange: setTitle }),
            grid2(
              field('Когда показывать', base + 'afterQuestion', { type: 'select', numeric: true, choices: choices, onChange: function () { rerender(); } }),
              switchField('Показывать эту вставку', base + 'enabled', function () { rerender(); })
            )
          ]);
        }
      }));
    });
    add(panel, section('Романтические вставки', 'Небольшие экраны с фразой между вопросами. Порядок в списке важен, если несколько вставок стоят после одного вопроса.',
      switchField('Показывать вставки между вопросами', 'interludes.enabled'),
      box,
      el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn', type: 'button', text: '+ Добавить вставку', onclick: function () {
        var it = { id: S.uid('i'), enabled: true, afterQuestion: Math.min(Math.max(1, n), 1), text: '' };
        list.push(it);
        openItems[it.id] = true;
        touch(); rerender();
      } }))
    ));
  }

  /* ----- Подарок (общая форма) ----- */

  function giftSection(title, base, desc) {
    var gift = get(base);
    var items = el('div');
    gift.items.forEach(function (it, i) {
      items.appendChild(el('div', { class: 'a-item', style: 'padding:14px' },
        grid2(
          imageField('Фото подарка ' + (i + 1), base + '.items.' + i + '.image'),
          el('div', { class: 'a-grid' },
            field('Подпись (название книги)', base + '.items.' + i + '.title'),
            el('div', { class: 'a-add-row' },
              el('button', { class: 'a-icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, text: '↑', onclick: function () { move(gift.items, i, i - 1); touch(); rerender(); } }),
              el('button', { class: 'a-icon', type: 'button', 'aria-label': 'Ниже', disabled: i === gift.items.length - 1, text: '↓', onclick: function () { move(gift.items, i, i + 1); touch(); rerender(); } }),
              el('button', { class: 'a-btn a-btn--danger a-btn--small', type: 'button', text: 'Удалить', onclick: function () {
                if (!window.confirm('Удалить это фото подарка?')) return;
                gift.items.splice(i, 1); touch(); rerender();
              } })
            )
          )
        )
      ));
    });
    var isReveal = gift.mode === 'reveal';
    return section(title, desc,
      radioField('Режим', base + '.mode', [['intrigue', '🎀 Сохранить интригу'], ['reveal', '🎁 Показать подарок']], function () { rerender(); }),
      grid(
        field('Вступление', base + '.intro', { type: 'textarea', rows: 3 }),
        base.indexOf('secret') === 0 && isReveal ? field('Кнопка открытия подарка', base + '.revealButton') : null,
        isReveal ? field('Название подарка', base + '.title') : null,
        isReveal ? el('div', { class: 'a-field' }, el('span', { class: 'a-label', text: 'Фотографии подарка (например, книг)' }),
          gift.items.length ? items : el('p', { class: 'a-empty', text: 'Фото пока нет — вместо них будут красивые заглушки. Добавьте фото книг.' }),
          el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn a-btn--ghost a-btn--small', type: 'button', text: '+ Фото подарка', onclick: function () {
            gift.items.push({ image: '', title: '' }); touch(); rerender();
          } }))) : null,
        isReveal ? field('Поздравление', base + '.message', { type: 'textarea', rows: 3 }) : null,
        !isReveal ? field('Текст интриги', base + '.intrigueText', { type: 'textarea', rows: 3 }) : null
      )
    );
  }

  /* ----- Финал ----- */

  function tabFinale() {
    if (draft.secret.enabled) {
      panel.appendChild(el('div', { class: 'a-warning', text: 'Сейчас включён секретный финал — после вопросов девушка попадёт в него, и этот экран не покажется. Чтобы использовать обычный финал, выключите секретный во вкладке «Секретный финал». Галерея ниже показывается в обоих случаях (на экране с ответами).' }));
    }
    var gallery = el('div');
    draft.finale.gallery.forEach(function (src, i) {
      gallery.appendChild(el('div', { class: 'a-item', style: 'padding:14px' },
        imageField('Фото ' + (i + 1), 'finale.gallery.' + i),
        el('div', { class: 'a-add-row' },
          el('button', { class: 'a-icon', type: 'button', 'aria-label': 'Выше', disabled: i === 0, text: '↑', onclick: function () { move(draft.finale.gallery, i, i - 1); touch(); rerender(); } }),
          el('button', { class: 'a-icon', type: 'button', 'aria-label': 'Ниже', disabled: i === draft.finale.gallery.length - 1, text: '↓', onclick: function () { move(draft.finale.gallery, i, i + 1); touch(); rerender(); } }),
          el('button', { class: 'a-btn a-btn--danger a-btn--small', type: 'button', text: 'Удалить', onclick: function () {
            if (!window.confirm('Удалить фото из галереи?')) return;
            draft.finale.gallery.splice(i, 1); touch(); rerender();
          } })
        )
      ));
    });
    add(panel, [
      section('Финал с конвертом', 'Фон затемняется, появляется конверт. Девушка нажимает — конверт открывается, и она читает письмо.',
        grid(
          field('Надпись над конвертом', 'finale.intro'),
          field('Подсказка под конвертом', 'finale.envelopeHint'),
          field('Обращение в письме', 'finale.letterGreeting', { help: 'Например: {имя}, или Любимая,' }),
          field('Текст письма', 'finale.letter', { type: 'textarea', rows: 8, help: 'Пустая строка — новый абзац.' }),
          field('Подпись', 'finale.signature'),
          field('Кнопка сюрприза', 'finale.surpriseButton')
        )
      ),
      giftSection('Сюрприз после письма', 'finale.gift', 'Выберите, раскрывать подарок или сохранить интригу.'),
      section('Галерея наших моментов', 'Фото показываются под письмом и на экране с ответами.',
        field('Заголовок галереи', 'finale.galleryTitle'),
        gallery,
        el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn a-btn--ghost a-btn--small', type: 'button', text: '+ Фото в галерею', onclick: function () {
          draft.finale.gallery.push(''); touch(); rerender();
        } }))
      )
    ]);
  }

  /* ----- Секретный финал ----- */

  function tabSecret() {
    var sec = draft.secret;
    var pages = el('div');
    if (!sec.pages.length) pages.appendChild(el('p', { class: 'a-empty', text: 'Страниц нет — книга сразу откроется на странице с письмом.' }));
    sec.pages.forEach(function (p, i) {
      pages.appendChild(itemCard({
        id: p.id, index: i, list: sec.pages,
        title: preview(p.title || p.text),
        meta: 'Страница ' + (i + 1) + (p.image ? ' · с фото' : ''),
        confirmText: 'Удалить страницу книги?',
        body: function (body, setTitle) {
          var base = 'secret.pages.' + i + '.';
          add(body, [
            field('Заголовок страницы', base + 'title', { onChange: function (v) { setTitle(v || p.text); }, help: 'Можно оставить пустым.' }),
            field('Текст страницы', base + 'text', { type: 'textarea', rows: 5, help: 'Пустая строка — новый абзац.' }),
            imageField('Фото на странице (необязательно)', base + 'image')
          ]);
        }
      }));
    });

    var secs = (function (v) { return Math.round(v / 100) / 10; });
    add(panel, [
      section('Секретный финал «Глава, которой не было»', 'После последнего вопроса — ложный финал, затем пауза, волшебная книга, личное письмо и подарок. О нём нигде не упоминается заранее.',
        switchField('Секретный финал включён', 'secret.enabled', function () { rerender(); }, 'Если выключить, после вопросов откроется обычный финал с конвертом.'),
        el('div', { class: 'a-add-row' },
          el('button', { class: 'a-btn', type: 'button', text: '▶ Просмотреть весь финал', onclick: function () { openPreview('secret', true); } }),
          el('button', { class: 'a-btn a-btn--ghost', type: 'button', text: 'Показать в окне справа', onclick: function () { openPreview('secret', false); } })
        )
      ),
      section('Этап 1 · Ложный финал', null,
        grid2(
          field('Заголовок', 'secret.falseFinale.title'),
          field('Подзаголовок', 'secret.falseFinale.subtitle'),
          field('Благодарность', 'secret.falseFinale.thanks'),
          field('Кнопка', 'secret.falseFinale.button')
        )
      ),
      section('Драматическая пауза', 'Экран темнеет, пауза, затем появляются надписи и кнопка.',
        grid2(
          field('Пауза в темноте, сек', 'secret.pauses.dark', { type: 'number', min: 0, max: 10, step: 0.5, toView: secs, fromView: function (v) { return Math.round(v * 1000); } }),
          field('Пауза между надписями, сек', 'secret.pauses.between', { type: 'number', min: 0, max: 10, step: 0.5, toView: secs, fromView: function (v) { return Math.round(v * 1000); } }),
          field('Первая надпись', 'secret.waitText'),
          field('Вторая надпись', 'secret.forgotText'),
          field('Кнопка', 'secret.openButton')
        )
      ),
      section('Этап 2 · Волшебная книга', null,
        grid2(
          field('Название книги', 'secret.book.title'),
          field('Подзаголовок на обложке', 'secret.book.subtitle'),
          colorField('Цвет обложки', 'secret.book.coverColor', window.LOVE_DEFAULT_CONFIG.secret.book.coverColor),
          field('Подсказка под книгой', 'secret.book.hint')
        )
      ),
      section('Этап 3 · Страницы книги', 'Девушка листает их нажатием на край страницы, стрелками или свайпом. Последней всегда идёт страница с конвертом.',
        pages,
        el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn', type: 'button', text: '+ Добавить страницу', onclick: function () {
          var p = { id: S.uid('p'), title: '', text: '', image: '' };
          sec.pages.push(p); openItems[p.id] = true; touch(); rerender();
        } }))
      ),
      section('Этап 4 · Личное письмо', 'Запечатанный конверт на последней странице книги.',
        grid(
          grid2(field('Заголовок страницы с конвертом', 'secret.letter.pageTitle'), field('Подсказка у конверта', 'secret.letter.hint')),
          field('Обращение', 'secret.letter.greeting'),
          field('Текст письма', 'secret.letter.text', { type: 'textarea', rows: 10, help: 'Пустая строка — новый абзац.' }),
          field('Подпись', 'secret.letter.signature'),
          imageField('Совместное фото рядом с письмом (необязательно)', 'secret.letter.photo'),
          field('Кнопка после письма', 'secret.moreButton')
        )
      ),
      giftSection('Этап 5 · Секретный подарок', 'secret.gift', 'По умолчанию интрига сохраняется.'),
      section('Этап 6 · Последний экран', null,
        grid(
          field('Текст', 'secret.ending.text', { type: 'textarea', rows: 5 }),
          imageField('Фото (если пусто — фото со стартового экрана)', 'secret.ending.photo'),
          grid2(field('Кнопка повторного прохождения', 'secret.ending.button'), field('Кнопка «Наша маленькая история»', 'secret.ending.storyButton'))
        )
      )
    ]);
  }

  /* ----- Публикация ----- */

  function configJson() { return JSON.stringify(S.normalizeConfig(draft), null, 2) + '\n'; }

  function exportJson() {
    if (!persist()) return;
    S.downloadFile('config.json', configJson(), 'application/json;charset=utf-8');
    toast('config.json скачан — замените им файл в репозитории');
  }

  function exportJs() {
    var body = '/* Настройки игры (экспортировано из редактора ' + new Date().toLocaleString('ru-RU') + '). */\nwindow.LOVE_DEFAULT_CONFIG = ' + JSON.stringify(S.normalizeConfig(draft), null, 2) + ';\n';
    S.downloadFile('config.js', body, 'text/javascript;charset=utf-8');
    toast('config.js скачан — положите его в папку js/');
  }

  function importJson(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        var text = String(reader.result).replace(/^﻿/, '');
        var m = /window\.LOVE_DEFAULT_CONFIG\s*=\s*([\s\S]*?);?\s*$/.exec(text);
        data = JSON.parse(m ? m[1] : text);
      } catch (e) {
        toast('Не получилось прочитать файл: это не похоже на config.json', true);
        return;
      }
      if (!data || typeof data !== 'object' || (!data.questions && !data.start && !data.secret)) {
        toast('В файле нет настроек игры', true);
        return;
      }
      if (!window.confirm('Заменить текущий черновик настройками из файла «' + file.name + '»?')) return;
      draft = S.normalizeConfig(data);
      openItems = {};
      if (persist()) toast('Настройки импортированы ✓');
      renderTab();
    };
    reader.onerror = function () { toast('Не удалось открыть файл', true); };
    reader.readAsText(file);
  }

  function tabPublish() {
    var size = new Blob([configJson()]).size;
    var pct = Math.min(100, Math.round((size / (4.5 * 1024 * 1024)) * 100));
    var importInput = el('input', { type: 'file', accept: '.json,.js,application/json', hidden: true });
    importInput.addEventListener('change', function () { importJson(importInput.files[0]); importInput.value = ''; });

    var embedded = (configJson().match(/data:image\//g) || []).length;

    add(panel, [
      section('Опубликовать изменения', 'GitHub Pages — статический хостинг: редактор не может сам отправить изменения на сайт. Публикация занимает пару минут:',
        el('ol', { class: 'a-steps' },
          el('li', null, 'Нажмите «Скачать config.json».'),
          el('li', null, 'Откройте свой репозиторий на github.com → файл ', el('code', { text: 'config.json' }), ' в корне → значок карандаша или «…» → «Delete file» и затем «Add file → Upload files», либо просто перетащите новый файл в корень репозитория — GitHub предложит заменить его.'),
          el('li', null, 'Нажмите «Commit changes».'),
          el('li', null, 'Подождите 1–2 минуты и обновите сайт. Если вы загружали фото в папку ', el('code', { text: 'assets/photos/' }), ', их тоже нужно добавить в репозиторий.')
        ),
        el('div', { class: 'a-add-row' },
          el('button', { class: 'a-btn', type: 'button', text: '⬇ Скачать config.json', onclick: exportJson }),
          el('button', { class: 'a-btn a-btn--ghost', type: 'button', text: '⬇ Скачать js/config.js', onclick: exportJs })
        ),
        el('p', { class: 'a-help', style: 'margin-top:10px', text: 'js/config.js — запасной файл. Он нужен, если открывать index.html двойным кликом без сервера (тогда браузер не даёт прочитать config.json). Для GitHub Pages достаточно config.json, но можно заменить оба.' })
      ),
      section('Импорт настроек', 'Загрузите ранее сохранённый config.json (или config.js), чтобы восстановить или изменить игру.',
        importInput,
        el('div', { class: 'a-add-row' }, el('button', { class: 'a-btn a-btn--ghost', type: 'button', text: '⬆ Импортировать JSON', onclick: function () { importInput.click(); } }))
      ),
      section('Размер настроек', null,
        el('div', { class: 'a-kv' }, el('span', { text: 'Сейчас: ' + kb(size) + ' КБ' }), el('span', { text: 'Встроенных фото: ' + embedded })),
        el('div', { class: 'a-meter' }, el('span', { style: 'width:' + Math.max(2, pct) + '%' })),
        el('p', { class: 'a-help', style: 'margin-top:8px', text: 'Браузер хранит черновик до ~5 МБ. Встроенные фото удобны, но тяжёлые. Чтобы сайт открывался быстро на телефоне, лучше класть фото в assets/photos/ и указывать путь.' })
      ),
      section('Сброс', null,
        el('div', { class: 'a-add-row' },
          el('button', { class: 'a-btn a-btn--ghost', type: 'button', text: 'Вернуть опубликованную версию', onclick: function () {
            if (!window.confirm('Удалить черновик и загрузить опубликованные настройки' + (publishedSource === 'config.json' ? ' из config.json' : ' по умолчанию') + '?')) return;
            draft = S.clone(published); openItems = {}; persist(); renderTab(); toast('Черновик сброшен');
          } }),
          el('button', { class: 'a-btn a-btn--ghost', type: 'button', text: 'Сбросить прогресс предпросмотра', onclick: function () {
            S.storageRemove(KEYS.progress + 'preview'); reloadFrame(''); toast('Прогресс предпросмотра сброшен');
          } }),
          el('button', { class: 'a-btn a-btn--danger', type: 'button', text: 'Сбросить прохождение на этом устройстве', onclick: function () {
            if (!window.confirm('Стереть ответы и прогресс настоящей игры в этом браузере?')) return;
            S.storageRemove(KEYS.progress + 'live'); toast('Прохождение на этом устройстве сброшено');
          } })
        )
      ),
      section('Приватность', null,
        el('ul', { class: 'a-steps' },
          el('li', null, 'Всё, что опубликовано на GitHub Pages (config.json, фото, музыка), может открыть любой, у кого есть ссылка. Не добавляйте то, что не готовы показать.'),
          el('li', null, 'Страница admin.html тоже будет доступна по ссылке. В ней нет паролей и секретов, а изменения в ней видит только тот, кто их сделал, — в своём браузере. При желании можно не загружать admin.html на GitHub.'),
          el('li', null, 'Ответы девушки сохраняются только на её устройстве. Сайт никуда их не отправляет — вы увидите их, только если она сама поделится ими через кнопку «Поделиться» или пришлёт сохранённый файл.')
        )
      )
    ]);
  }

  /* ---------- Предпросмотр ---------- */

  function reloadFrame(jump) {
    if (!frame) return;
    frame.src = 'index.html?preview=1' + (jump !== null && jump !== undefined ? '&jump=' + (jump || 'start') : '') + '&t=' + Date.now();
  }

  function openPreview(jump, newTab) {
    persist();
    var url = 'index.html?preview=1' + (jump ? '&jump=' + jump : '');
    var paneVisible = frame && frame.offsetParent !== null;
    if (newTab || !paneVisible) { window.open(url, '_blank', 'noopener'); return; }
    reloadFrame(jump);
  }

  document.getElementById('openPreview').addEventListener('click', function () { openPreview('', true); });
  document.getElementById('exportJson').addEventListener('click', exportJson);
  Array.prototype.forEach.call(document.querySelectorAll('[data-jump]'), function (b) {
    b.addEventListener('click', function () { persist(); reloadFrame(b.getAttribute('data-jump')); });
  });

  window.addEventListener('beforeunload', function () { if (saveTimer) persist(); });

  /* ---------- Запуск ---------- */

  S.loadPublishedConfig().then(function (r) {
    published = r.config;
    publishedSource = r.source;
    var saved = S.storageGet(KEYS.draft);
    draft = saved ? S.normalizeConfig(saved) : S.clone(published);
    renderTabs();
    renderTab();
    persist();
    if (!saved) {
      setStatus(r.source === 'config.json'
        ? 'Загружены опубликованные настройки из config.json · черновик создан в этом браузере'
        : 'Загружены настройки по умолчанию · черновик создан в этом браузере', 'ok');
    }
    if (window.matchMedia('(min-width: 1100px)').matches) reloadFrame(null);
  }).catch(function (e) {
    setStatus('Не удалось загрузить настройки: ' + (e && e.message ? e.message : 'неизвестная ошибка'), 'error');
  });
})();
