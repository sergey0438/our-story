/* Общие функции для игры (index.html) и редактора (admin.html). */
(function () {
  'use strict';

  var KEYS = {
    draft: 'love-quiz:draft',            // черновик настроек из редактора
    progress: 'love-quiz:progress:',     // + 'live' | 'preview'
    adminTab: 'love-quiz:admin-tab'
  };

  var QUESTION_TYPES = {
    single: 'Один вариант ответа',
    multiple: 'Несколько вариантов',
    text: 'Свободный текст',
    yesno: 'Да / нет',
    photo: 'Вопрос с фотографией',
    scenario: 'Выбор между двумя сценариями'
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* Дополняет пользовательские настройки значениями по умолчанию.
     Объекты сливаются рекурсивно, массивы и простые значения берутся из пользовательских. */
  function mergeDefaults(defaults, custom) {
    if (custom === undefined || custom === null) return clone(defaults);
    if (Array.isArray(defaults)) return Array.isArray(custom) ? clone(custom) : clone(defaults);
    if (isPlainObject(defaults)) {
      if (!isPlainObject(custom)) return clone(defaults);
      var out = {};
      Object.keys(defaults).forEach(function (k) { out[k] = mergeDefaults(defaults[k], custom[k]); });
      Object.keys(custom).forEach(function (k) { if (!(k in out)) out[k] = clone(custom[k]); });
      return out;
    }
    if (typeof defaults === 'number') {
      var n = Number(custom);
      return isFinite(n) ? n : defaults;
    }
    if (typeof defaults === 'boolean') return typeof custom === 'boolean' ? custom : defaults;
    if (typeof defaults === 'string') return typeof custom === 'string' ? custom : String(custom);
    return custom;
  }

  var idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return (prefix || 'id') + Date.now().toString(36) + idCounter.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function normalizeOption(o) {
    if (typeof o === 'string') o = { text: o };
    if (!isPlainObject(o)) o = {};
    return {
      text: typeof o.text === 'string' ? o.text : '',
      emoji: typeof o.emoji === 'string' ? o.emoji : '',
      desc: typeof o.desc === 'string' ? o.desc : ''
    };
  }

  function normalizeQuestion(q) {
    if (!isPlainObject(q)) q = {};
    var type = QUESTION_TYPES[q.type] ? q.type : 'single';
    var opts = Array.isArray(q.options) ? q.options.map(normalizeOption) : [];
    if (type === 'yesno' && opts.length < 2) opts = [{ text: 'Да ❤️', emoji: '', desc: '' }, { text: 'Нет', emoji: '', desc: '' }];
    if (type === 'scenario') {
      while (opts.length < 2) opts.push({ text: 'Сценарий ' + (opts.length + 1), emoji: '✨', desc: '' });
      opts = opts.slice(0, 2);
    }
    if (type === 'yesno') opts = opts.slice(0, 2);
    var correct = Array.isArray(q.correct) ? q.correct.filter(function (n) {
      return Number.isInteger(n) && n >= 0 && n < opts.length;
    }) : [];
    return {
      id: typeof q.id === 'string' && q.id ? q.id : uid('q'),
      type: type,
      text: typeof q.text === 'string' ? q.text : '',
      image: typeof q.image === 'string' ? q.image : '',
      required: q.required !== false,
      reaction: typeof q.reaction === 'string' ? q.reaction : '',
      correct: correct,
      options: type === 'text' ? [] : opts
    };
  }

  function normalizeConfig(raw) {
    var defaults = window.LOVE_DEFAULT_CONFIG;
    var cfg = mergeDefaults(defaults, isPlainObject(raw) ? raw : {});
    cfg.questions = (Array.isArray(cfg.questions) ? cfg.questions : []).map(normalizeQuestion);
    var seen = {};
    cfg.questions.forEach(function (q) { if (seen[q.id]) q.id = uid('q'); seen[q.id] = true; });

    cfg.interludes.items = (cfg.interludes.items || []).filter(isPlainObject).map(function (it) {
      return {
        id: typeof it.id === 'string' && it.id ? it.id : uid('i'),
        enabled: it.enabled !== false,
        afterQuestion: Math.max(1, parseInt(it.afterQuestion, 10) || 1),
        text: typeof it.text === 'string' ? it.text : ''
      };
    });
    cfg.secret.pages = (cfg.secret.pages || []).filter(isPlainObject).map(function (p) {
      return {
        id: typeof p.id === 'string' && p.id ? p.id : uid('p'),
        title: typeof p.title === 'string' ? p.title : '',
        text: typeof p.text === 'string' ? p.text : '',
        image: typeof p.image === 'string' ? p.image : ''
      };
    });
    [cfg.finale.gift, cfg.secret.gift].forEach(function (g) {
      if (g.mode !== 'reveal' && g.mode !== 'intrigue') g.mode = 'intrigue';
      g.items = (g.items || []).map(function (it) {
        if (typeof it === 'string') it = { image: it };
        if (!isPlainObject(it)) it = {};
        return { image: typeof it.image === 'string' ? it.image : '', title: typeof it.title === 'string' ? it.title : '' };
      });
    });
    cfg.finale.gallery = (cfg.finale.gallery || []).filter(function (s) { return typeof s === 'string' && s; });
    cfg.ui.reactions = (cfg.ui.reactions || []).filter(function (s) { return typeof s === 'string' && s.trim(); });
    cfg.secret.pauses.dark = clamp(cfg.secret.pauses.dark, 0, 10000);
    cfg.secret.pauses.between = clamp(cfg.secret.pauses.between, 0, 10000);
    cfg.music.volume = clamp(cfg.music.volume, 0, 1);
    if (!/^#[0-9a-f]{6}$/i.test(cfg.meta.primaryColor)) cfg.meta.primaryColor = defaults.meta.primaryColor;
    if (!/^#[0-9a-f]{6}$/i.test(cfg.secret.book.coverColor)) cfg.secret.book.coverColor = defaults.secret.book.coverColor;
    return cfg;
  }

  function clamp(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) v = min;
    return Math.min(max, Math.max(min, v));
  }

  /* Разрешаем только безопасные источники картинок/аудио:
     относительные пути, https://, data:image|audio. */
  function safeSrc(src) {
    if (typeof src !== 'string') return '';
    src = src.trim();
    if (!src) return '';
    if (/^data:(image|audio)\//i.test(src)) return src;
    if (/^https:\/\//i.test(src)) return src;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return ''; // javascript:, http: и т.п.
    if (src.indexOf('//') === 0) return '';
    return src.replace(/^\/+/, ''); // путь от корня ломается в подпапке GitHub Pages
  }

  function storageGet(key) {
    try { var v = window.localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* недоступно — ничего страшного */ }
  }

  /* Загружает опубликованные настройки: config.json → запасной js/config.js. */
  function loadPublishedConfig() {
    var fallback = function () { return normalizeConfig(window.LOVE_DEFAULT_CONFIG); };
    if (!/^https?:$/.test(window.location.protocol) || !window.fetch) return Promise.resolve({ config: fallback(), source: 'defaults' });
    return fetch('config.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) { return { config: normalizeConfig(json), source: 'config.json' }; })
      .catch(function () { return { config: fallback(), source: 'defaults' }; });
  }

  function personalize(text, cfg) {
    if (typeof text !== 'string') return '';
    var name = (cfg && cfg.meta && cfg.meta.girlName) || '';
    return text.replace(/\{имя\}|\{name\}/gi, name);
  }

  /* Сдвиг цвета к белому (amount > 0) или к чёрному (amount < 0). */
  function shade(hex, amount) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var t = amount < 0 ? 0 : 255, p = Math.abs(amount);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* Сжимает фото с устройства, чтобы оно поместилось в настройки. */
  function fileToDataUrl(file, maxSide, quality) {
    maxSide = maxSide || 1400; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Это не изображение')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Не удалось открыть изображение')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, maxSide / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var type = file.type === 'image/png' && file.size < 400000 ? 'image/png' : 'image/jpeg';
          resolve(canvas.toDataURL(type, quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function downloadFile(name, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  window.LoveShared = {
    KEYS: KEYS,
    QUESTION_TYPES: QUESTION_TYPES,
    clone: clone,
    uid: uid,
    normalizeConfig: normalizeConfig,
    normalizeQuestion: normalizeQuestion,
    safeSrc: safeSrc,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    loadPublishedConfig: loadPublishedConfig,
    personalize: personalize,
    shade: shade,
    fileToDataUrl: fileToDataUrl,
    downloadFile: downloadFile
  };
})();
