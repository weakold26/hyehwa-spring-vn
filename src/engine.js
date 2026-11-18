/* =========================================================
   혜화의 봄, 4번 출구에서 — engine.js
   Visual novel engine: stage layers, typewriter, choices,
   affinity/flags, backlog, 3 save slots, WebAudio SFX.
   ========================================================= */
(function () {
  'use strict';

  var KEY = {
    auto: 'hyehwa.vn.auto',
    slot: 'hyehwa.vn.slot.',
    endings: 'hyehwa.vn.endings',
    settings: 'hyehwa.vn.settings'
  };

  var ASSETS = {
    bg: {
      campus: 'assets/img/bg_campus.webp?v=10',
      cafe: 'assets/img/bg_cafe.webp?v=10',
      alley: 'assets/img/bg_alley.webp?v=10'
    },
    char: {
      yeon: {
        base: 'assets/img/yeon.webp?v=10',
        smile: 'assets/img/yeon_smile.webp?v=10',
        blush: 'assets/img/yeon_blush.webp?v=10',
        surprised: 'assets/img/yeon_surprised.webp?v=10'
      },
      harin: {
        base: 'assets/img/harin.webp?v=10',
        smile: 'assets/img/harin_smile.webp?v=10',
        blush: 'assets/img/harin_blush.webp?v=10',
        surprised: 'assets/img/harin_surprised.webp?v=10'
      }
    }
  };

  /* ---------------- state ---------------- */
  var meta, nodes;
  var state = newState();
  var history = [];
  var typingTimer = null, fullText = '', charIndex = 0, afterTyping = null;
  var choiceOpen = false, modalOpen = false, ended = false;
  var bgFront = 'A';
  var charFront = 'A';
  var currentChar = null;
  var settings = { sound: true, speed: 26 };

  function newState() {
    return { node: null, aff: { yeon: 0, harin: 0 }, flags: {}, chapter: '' };
  }

  function $(id) { return document.getElementById(id); }

  /* ---------------- audio ---------------- */
  var ac = null;

  function audio() {
    if (!settings.sound) return null;
    try {
      if (!ac) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ac = new C();
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) { return null; }
  }

  function tone(freq, dur, type, vol, delay) {
    var a = audio();
    if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.04, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function sfxBlip() { tone(1180 + Math.random() * 90, 0.018, 'sine', 0.011); }
  function sfxAdvance() { tone(520, 0.06, 'triangle', 0.03); }
  function sfxSelect() { tone(660, 0.07, 'triangle', 0.045); tone(990, 0.1, 'sine', 0.035, 0.06); }
  function sfxOpen() { tone(880, 0.06, 'sine', 0.03); tone(1170, 0.09, 'sine', 0.025, 0.05); }
  function sfxChime() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone(f, 0.55, 'sine', 0.05, i * 0.12);
    });
  }

  /* ---------------- boot ---------------- */
  function init() {
    loadSettings();
    buildPetals();
    bindGlobal();
    fetch('src/data/scenario.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        meta = json.meta;
        nodes = json.nodes;
        preload().then(function () {
          document.body.classList.remove('loading');
          readyTitle();
        });
      })
      .catch(function (e) {
        document.body.classList.remove('loading');
        var box = $('title-menu');
        if (box) box.innerHTML = '<p class="err">시나리오를 불러오지 못했습니다.<br>새로고침해 주세요.</p>';
        console.error(e);
      });
  }

  function preload() {
    var urls = [];
    Object.keys(ASSETS.bg).forEach(function (k) { urls.push(ASSETS.bg[k]); });
    Object.keys(ASSETS.char).forEach(function (k) {
      Object.keys(ASSETS.char[k]).forEach(function (e) { urls.push(ASSETS.char[k][e]); });
    });
    var done = 0;
    return Promise.all(urls.map(function (u) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { done++; progress(done / urls.length); res(); };
        img.onerror = function () { done++; progress(done / urls.length); res(); };
        img.src = u;
      });
    }));
  }

  function progress(p) {
    var bar = $('loader-bar');
    if (bar) bar.style.width = Math.round(p * 100) + '%';
  }

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY.settings) || 'null');
      if (s) settings = { sound: s.sound !== false, speed: (typeof s.speed === 'number' ? s.speed : 26) };
    } catch (e) { /* ignore */ }
    syncSoundButton();
  }

  function saveSettings() {
    try { localStorage.setItem(KEY.settings, JSON.stringify(settings)); } catch (e) {}
    syncSoundButton();
  }

  function syncSoundButton() {
    var b = $('btn-sound');
    if (b) {
      b.textContent = settings.sound ? '♪' : '✕';
      b.classList.toggle('off', !settings.sound);
      b.setAttribute('aria-label', settings.sound ? '효과음 끄기' : '효과음 켜기');
    }
    var t = $('title-sound');
    if (t) t.textContent = settings.sound ? '효과음 · 켜짐' : '효과음 · 꺼짐';
  }

  /* ---------------- petals ---------------- */
  function buildPetals() {
    var box = $('petals');
    if (!box) return;
    for (var i = 0; i < 16; i++) {
      var s = document.createElement('span');
      s.className = 'petal';
      s.style.left = (Math.random() * 100).toFixed(1) + '%';
      s.style.animationDuration = (9 + Math.random() * 9).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 18).toFixed(1) + 's';
      s.style.transform = 'scale(' + (0.6 + Math.random() * 0.8).toFixed(2) + ')';
      box.appendChild(s);
    }
  }

  /* ---------------- title ---------------- */
  function readyTitle() {
    var cont = $('btn-continue');
    if (cont) cont.disabled = !hasAnySave();
    updateGalleryCount();
  }

  function hasAnySave() {
    try {
      if (localStorage.getItem(KEY.auto)) return true;
      for (var i = 1; i <= 3; i++) if (localStorage.getItem(KEY.slot + i)) return true;
    } catch (e) { /* storage unavailable */ }
    return false;
  }

  function showTitle() {
    ended = false;
    document.body.classList.add('is-title');
    $('title-screen').classList.add('on');
    $('ending-screen').classList.remove('on');
    closeModal();
    readyTitle();
  }

  function startNew() {
    audio();
    document.body.classList.remove('is-title');
    $('title-screen').classList.remove('on');
    history = [];
    state = newState();
    ended = false;
    currentChar = null;
    hideChar(true);
    updateHud();
    goNode(meta.start);
  }

  function continueGame() {
    var raw = localStorage.getItem(KEY.auto);
    if (!raw) {
      var best = null, bestTs = 0;
      for (var i = 1; i <= 3; i++) {
        var s = readSlot(KEY.slot + i);
        if (s && s.ts > bestTs) { best = s; bestTs = s.ts; }
      }
      if (!best) return;
      raw = JSON.stringify(best);
    }
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    document.body.classList.remove('is-title');
    $('title-screen').classList.remove('on');
    loadData(data);
  }

  /* ---------------- stage ---------------- */
  function setBg(key) {
    if (!key) return;
    document.body.dataset.bg = key;
    var frontEl = $(bgFront === 'A' ? 'bgA' : 'bgB');
    var backEl = $(bgFront === 'A' ? 'bgB' : 'bgA');
    if (frontEl.dataset.key === key) return;
    backEl.style.backgroundImage = 'url("' + ASSETS.bg[key] + '")';
    backEl.dataset.key = key;
    backEl.classList.add('on');
    frontEl.classList.remove('on');
    bgFront = bgFront === 'A' ? 'B' : 'A';
  }

  function showChar(id, expr) {
    expr = expr || 'base';
    var src = (ASSETS.char[id] || {})[expr] || (ASSETS.char[id] || {}).base;
    if (!src) return;
    currentChar = { id: id, expr: expr };
    if (charFront === 'A' && $('charA').getAttribute('src') === src && $('charA').classList.contains('on')) return;
    var frontEl = $(charFront === 'A' ? 'charA' : 'charB');
    var backEl = $(charFront === 'A' ? 'charB' : 'charA');
    backEl.src = src;
    backEl.alt = (meta.heroines[id] ? meta.heroines[id].name : id);
    backEl.classList.add('on');
    frontEl.classList.remove('on');
    charFront = charFront === 'A' ? 'B' : 'A';
    var stage = $('stage');
    stage.classList.add('has-char');
  }

  function setWeather(w) {
    document.body.dataset.weather = w || 'clear';
  }

  function hideChar(instant) {
    ['charA', 'charB'].forEach(function (id) {
      var el = $(id);
      el.classList.remove('on');
      if (instant) el.removeAttribute('src');
    });
    currentChar = null;
    $('stage').classList.remove('has-char');
  }

  function showChapterCard(ch) {
    var card = $('chapter-card');
    if (!card) return;
    card.textContent = ch;
    card.classList.remove('on');
    // restart CSS animation
    void card.offsetWidth;
    card.classList.add('on');
    sfxOpen();
  }

  /* ---------------- flow ---------------- */
  function goNode(id, restore) {
    var n = nodes[id];
    if (!n) return;

    state.node = id;

    if (!restore) {
      if (n.ch && n.ch !== state.chapter) {
        state.chapter = n.ch;
        updateHud();
        showChapterCard(n.ch);
      }
      if (n.bg) setBg(n.bg);
      if (n.weather !== undefined) setWeather(n.weather);
      if (n.hide) hideChar();
      else if (n.show) showChar(n.show.id, n.show.expr);
      if (n.eff) applyEff(n.eff);
    }

    // branch-only node
    if (!n.text && n.branch) {
      var nextId = resolveBranch(n);
      return goNode(nextId, restore);
    }

    autosave();
    render(n);
  }

  function applyEff(eff) {
    if (!eff) return;
    var toast = [];
    if (eff.yeon) { state.aff.yeon += eff.yeon; toast.push(['yeon', eff.yeon]); }
    if (eff.harin) { state.aff.harin += eff.harin; toast.push(['harin', eff.harin]); }
    if (eff.lead) {
      var lead = state.aff.yeon > state.aff.harin ? 'yeon' : (state.aff.harin > state.aff.yeon ? 'harin' : null);
      if (lead && eff.lead) { state.aff[lead] += eff.lead; toast.push([lead, eff.lead]); }
    }
    if (eff.flag) state.flags[eff.flag] = true;
    if (toast.length) {
      updateHud();
      toast.forEach(function (t) { floatAff(t[0], t[1]); });
    }
  }

  function resolveBranch(n) {
    for (var i = 0; i < n.branch.length; i++) {
      var b = n.branch[i];
      if (!b.if || testCond(b.if)) return b.next;
    }
    return n.branch[n.branch.length - 1].next;
  }

  function testCond(c) {
    if (c.flag && !state.flags[c.flag]) return false;
    if (c.noflag && state.flags[c.noflag]) return false;
    if (c.affMin) {
      for (var k in c.affMin) if ((state.aff[k] || 0) < c.affMin[k]) return false;
    }
    if (c.affMax) {
      for (var k2 in c.affMax) if ((state.aff[k2] || 0) > c.affMax[k2]) return false;
    }
    if (c.lead) {
      var other = c.lead === 'yeon' ? 'harin' : 'yeon';
      if (!(state.aff[c.lead] > state.aff[other]) || state.aff[c.lead] <= 0) return false;
    }
    return true;
  }

  function render(n) {
    choiceOpen = false;
    $('choices').innerHTML = '';
    $('choices').classList.remove('on');

    var nameEl = $('namebox');
    if (n.who) {
      nameEl.classList.add('on');
      $('name').textContent = n.who;
      var cid = n.who.indexOf('서연') === 0 ? 'yeon' : (n.who.indexOf('하린') === 0 ? 'harin' : null);
      nameEl.dataset.who = cid || 'me';
    } else {
      nameEl.classList.remove('on');
      $('name').textContent = '';
      nameEl.dataset.who = 'me';
    }

    $('dialogue').classList.toggle('narration', !n.who);

    if (n.text) {
      history.push({ who: n.who || '', text: n.text, ch: state.chapter });
      if (history.length > 400) history.shift();
    }

    typeText(n.text || '', function () {
      if (n.choices) showChoices(n.choices);
      else if (n.ending) $('next-ind').classList.add('hot');
    });

    $('next-ind').classList.remove('hot');
  }

  function typeText(text, done) {
    clearInterval(typingTimer);
    typingTimer = null;
    fullText = text;
    charIndex = 0;
    afterTyping = done;
    var el = $('text');

    if (settings.speed <= 0) {
      el.textContent = text;
      charIndex = text.length;
      typingTimer = null;
      afterTyping = null;
      if (done) done();
      $('next-ind').classList.add('done');
      return;
    }
    el.textContent = '';
    $('next-ind').classList.remove('done');
    typingTimer = setInterval(function () {
      charIndex++;
      if (charIndex % 2 === 0 && charIndex % 6 !== 0) sfxBlip();
      el.textContent = fullText.slice(0, charIndex);
      if (charIndex >= fullText.length) finishTyping();
    }, settings.speed);
  }

  function finishTyping() {
    clearInterval(typingTimer);
    typingTimer = null;
    $('text').textContent = fullText;
    charIndex = fullText.length;
    $('next-ind').classList.add('done');
    var cb = afterTyping;
    afterTyping = null;
    if (cb) cb();
  }

  function showChoices(list) {
    choiceOpen = true;
    var box = $('choices');
    box.innerHTML = '';
    list.forEach(function (c, i) {
      var b = document.createElement('button');
      b.className = 'choice';
      b.type = 'button';
      b.style.animationDelay = (i * 70) + 'ms';
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="txt"></span>';
      b.querySelector('.txt').textContent = c.t;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!choiceOpen) return;
        choiceOpen = false;
        sfxSelect();
        box.classList.remove('on');
        if (c.eff) applyEff(c.eff);
        $('choices').innerHTML = '';
        goNode(c.next);
      });
      box.appendChild(b);
    });
    box.classList.add('on');
  }

  function advance() {
    if (modalOpen || ended) return;
    if (document.body.classList.contains('is-title')) return;
    if (typingTimer) { finishTyping(); return; }
    if (choiceOpen) return;
    var n = nodes[state.node];
    if (!n) return;
    if (n.ending) { showEnding(n.ending); return; }
    if (n.next) { sfxAdvance(); goNode(n.next); }
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    var chip = $('day-chip');
    if (chip) {
      var ch = state.chapter || '프롤로그';
      chip.textContent = window.innerWidth < 480 ? ch.split(' · ')[0] : ch;
    }
    ['yeon', 'harin'].forEach(function (k) {
      var bar = document.querySelector('.aff[data-k="' + k + '"] .bar > i');
      var num = document.querySelector('.aff[data-k="' + k + '"] .num');
      var v = state.aff[k] || 0;
      if (bar) bar.style.width = Math.min(100, Math.round(v / 15 * 100)) + '%';
      if (num) num.textContent = v;
    });
  }

  function floatAff(who, delta) {
    var host = document.querySelector('.aff[data-k="' + who + '"]');
    if (!host) return;
    var s = document.createElement('span');
    s.className = 'float';
    s.textContent = '+' + delta;
    host.appendChild(s);
    setTimeout(function () { s.remove(); }, 900);
  }

  /* ---------------- save / load ---------------- */
  function snapshot() {
    return {
      v: 1,
      node: state.node,
      aff: state.aff,
      flags: state.flags,
      chapter: state.chapter,
      bg: document.body.dataset.bg || 'campus',
      char: currentChar,
      weather: document.body.dataset.weather || 'clear',
      history: history.slice(-80),
      ts: Date.now()
    };
  }

  function autosave() {
    try { localStorage.setItem(KEY.auto, JSON.stringify(snapshot())); } catch (e) {}
  }

  function readSlot(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }

  function loadData(data) {
    if (!data || !nodes[data.node]) return;
    state = newState();
    state.node = data.node;
    state.aff = { yeon: (data.aff && data.aff.yeon) || 0, harin: (data.aff && data.aff.harin) || 0 };
    state.flags = data.flags || {};
    state.chapter = data.chapter || '';
    history = data.history || [];
    ended = false;
    currentChar = null;
    hideChar(true);
    if (data.bg) setBg(data.bg);
    if (data.weather) setWeather(data.weather);
    if (data.char) showChar(data.char.id, data.char.expr);
    updateHud();
    closeModal();
    var n = nodes[data.node];
    if (n.ending && !n.text) { showEnding(n.ending); return; }
    goNode(data.node, true);
  }

  function slotLabel(i) {
    if (i === 0) return '자동';
    return 'SLOT ' + i;
  }

  function renderSlots(mode) {
    var html = '<div class="slots">';
    for (var i = 0; i <= 3; i++) {
      var key = i === 0 ? KEY.auto : KEY.slot + i;
      var d = readSlot(key);
      html += '<div class="slot" data-i="' + i + '">';
      html += '<div class="slot-head"><b>' + slotLabel(i) + '</b>';
      html += '<span class="slot-time">' + (d ? fmtDate(d.ts) : '비어 있음') + '</span></div>';
      html += '<div class="slot-body">' + (d ? esc(d.chapter || '') + ' · ' + esc(preview(d)) : '—') + '</div>';
      html += '<div class="slot-btns">';
      if (mode === 'save' && i > 0) html += '<button class="mini" data-act="save">저장</button>';
      if (d) html += '<button class="mini" data-act="load">불러오기</button>';
      if (d && mode === 'save' && i > 0) html += '<button class="mini ghost" data-act="del">삭제</button>';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function preview(d) {
    var h = (d.history || []).slice().reverse();
    for (var i = 0; i < h.length; i++) {
      if (h[i].text) return h[i].text.replace(/\n/g, ' ').slice(0, 46) + (h[i].text.length > 46 ? '…' : '');
    }
    return '—';
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function openSave(mode) {
    if (ended) return;
    modalOpen = true;
    sfxOpen();
    var box = $('modal');
    $('modal-title').textContent = mode === 'save' ? '저장' : '불러오기';
    $('modal-body').innerHTML = renderSlots(mode);
    box.classList.add('on');
    $('modal-body').querySelectorAll('.slot').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
        if (!act) return;
        var idx = parseInt(row.getAttribute('data-i'), 10);
        var key = idx === 0 ? KEY.auto : KEY.slot + idx;
        if (act === 'save') {
          try { localStorage.setItem(key, JSON.stringify(snapshot())); } catch (e) {}
          sfxSelect();
          openSave(mode);
        } else if (act === 'load') {
          var d = readSlot(key);
          if (d) { sfxSelect(); modalOpen = false; $('modal').classList.remove('on'); loadData(d); }
        } else if (act === 'del') {
          localStorage.removeItem(key);
          openSave(mode);
        }
      });
    });
  }

  function openLog() {
    modalOpen = true;
    audio(); sfxOpen();
    var rows = history.slice(-200).map(function (h) {
      return '<div class="log-row' + (h.who ? '' : ' nar') + '">' +
        (h.who ? '<span class="log-who">' + esc(h.who) + '</span>' : '') +
        '<span class="log-txt">' + esc(h.text) + '</span></div>';
    }).join('');
    $('modal-title').textContent = '백로그';
    $('modal-body').innerHTML = '<div class="log">' + (rows || '<p class="muted">아직 대사가 없습니다.</p>') + '</div>';
    $('modal').classList.add('on');
    var log = $('modal-body').querySelector('.log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function openSettings() {
    modalOpen = true;
    sfxOpen();
    var speeds = [[46, '느리게'], [26, '보통'], [12, '빠르게'], [0, '즉시']];
    var html = '<div class="setting"><span>텍스트 속도</span><div class="seg">';
    speeds.forEach(function (s) {
      html += '<button class="seg-btn' + (settings.speed === s[0] ? ' on' : '') + '" data-speed="' + s[0] + '">' + s[1] + '</button>';
    });
    html += '</div></div>';
    html += '<div class="setting"><span>효과음</span><div class="seg"><button class="seg-btn' +
      (settings.sound ? ' on' : '') + '" data-sound="on">켜짐</button><button class="seg-btn' +
      (!settings.sound ? ' on' : '') + '" data-sound="off">꺼짐</button></div></div>';
    html += '<p class="muted small">진행 상황은 자동으로 저장됩니다. 아래에서 타이틀로 돌아갈 수 있습니다.</p>';
    html += '<div class="row"><button class="mini ghost" data-act="title">타이틀로</button></div>';
    $('modal-title').textContent = '설정';
    $('modal-body').innerHTML = html;
    $('modal').classList.add('on');
  }

  function closeModal() {
    modalOpen = false;
    $('modal').classList.remove('on');
  }

  /* ---------------- endings ---------------- */
  function unlocked() {
    try { return JSON.parse(localStorage.getItem(KEY.endings) || '{}'); } catch (e) { return {}; }
  }

  function showEnding(id) {
    ended = true;
    var e = meta.endings[id];
    if (!e) return;
    var u = unlocked();
    var isNew = !u[id];
    u[id] = u[id] || new Date().toISOString();
    try { localStorage.setItem(KEY.endings, JSON.stringify(u)); } catch (err) {}
    sfxChime();

    var screen = $('ending-screen');
    var total = Object.keys(meta.endings).length;
    var got = Object.keys(unlocked()).length;
    screen.innerHTML =
      '<div class="ending-inner">' +
      '<div class="ending-label">' + e.label + (isNew ? ' · NEW' : '') + '</div>' +
      '<div class="ending-no">ENDING ' + e.no + '</div>' +
      '<h2>' + esc(e.title) + '</h2>' +
      '<p class="ending-desc">' + esc(e.desc) + '</p>' +
      '<p class="ending-progress">엔딩 도감 ' + got + ' / ' + total + '</p>' +
      '<div class="ending-btns">' +
      '<button class="btn" data-act="gallery">엔딩 도감</button>' +
      '<button class="btn ghost" data-act="title">타이틀로</button>' +
      '</div></div>';
    screen.classList.add('on');
    screen.querySelector('[data-act="gallery"]').addEventListener('click', function () { openGallery(); });
    screen.querySelector('[data-act="title"]').addEventListener('click', function () {
      screen.classList.remove('on');
      autosave();
      showTitle();
    });
    autosave();
  }

  function openGallery() {
    modalOpen = true;
    sfxOpen();
    var u = unlocked();
    var html = '<div class="gallery">';
    Object.keys(meta.endings).forEach(function (k) {
      var e = meta.endings[k];
      var has = !!u[k];
      html += '<div class="g-card' + (has ? ' got' : ' locked') + '">' +
        '<div class="g-no">' + e.no + '</div>' +
        '<div class="g-label">' + (has ? e.label : 'LOCKED') + '</div>' +
        '<h4>' + (has ? esc(e.title) : '？？？') + '</h4>' +
        '<p>' + (has ? esc(e.desc) : '아직 만나지 못한 결말입니다.') + '</p>' +
        '</div>';
    });
    html += '</div>';
    $('modal-title').textContent = '엔딩 도감 ' + Object.keys(u).length + ' / ' + Object.keys(meta.endings).length;
    $('modal-body').innerHTML = html;
    $('modal').classList.add('on');
  }

  function updateGalleryCount() {
    var el = $('gallery-count');
    if (!el) return;
    var u = unlocked();
    el.textContent = Object.keys(u).length + ' / ' + Object.keys(meta.endings).length;
  }

  /* ---------------- input ---------------- */
  function bindGlobal() {
    var stage = $('stage');
    stage.addEventListener('click', function (ev) {
      if (ev.target.closest('#topbar, #hud, #choices, #modal, #title-screen, #ending-screen')) return;
      advance();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { closeModal(); return; }
      if (modalOpen) return;
      if (document.body.classList.contains('is-title')) {
        if (ev.key === 'Enter') startNew();
        return;
      }
      if (ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        advance();
      } else if (ev.key === 'l' || ev.key === 'L') openLog();
    });

    $('btn-log').addEventListener('click', function (e) { e.stopPropagation(); openLog(); });
    $('btn-save').addEventListener('click', function (e) { e.stopPropagation(); openSave('save'); });
    $('btn-load').addEventListener('click', function (e) { e.stopPropagation(); openSave('load'); });
    $('btn-menu').addEventListener('click', function (e) { e.stopPropagation(); openSettings(); });
    $('btn-sound').addEventListener('click', function (e) {
      e.stopPropagation();
      settings.sound = !settings.sound;
      saveSettings();
      if (settings.sound) sfxSelect();
    });

    // one delegated handler for settings controls (bound once)
    $('modal-body').addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-speed],[data-sound],[data-act]');
      if (!t) return;
      if (t.dataset.speed !== undefined && t.dataset.speed !== '') {
        settings.speed = parseInt(t.dataset.speed, 10);
        saveSettings();
        openSettings();
      } else if (t.dataset.sound) {
        settings.sound = t.dataset.sound === 'on';
        saveSettings();
        if (settings.sound) sfxSelect();
        openSettings();
      } else if (t.dataset.act === 'title') {
        modalOpen = false;
        $('modal').classList.remove('on');
        autosave();
        showTitle();
      }
    });

    $('modal-close').addEventListener('click', closeModal);
    $('modal').addEventListener('click', function (e) {
      if (e.target === $('modal')) closeModal();
    });

    $('btn-start').addEventListener('click', startNew);
    $('btn-continue').addEventListener('click', continueGame);
    $('btn-gallery').addEventListener('click', function () { openGallery(); });
    $('title-sound').addEventListener('click', function () {
      settings.sound = !settings.sound;
      saveSettings();
      if (settings.sound) sfxSelect();
    });

    // keep iOS from zooming the layout on double taps
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
