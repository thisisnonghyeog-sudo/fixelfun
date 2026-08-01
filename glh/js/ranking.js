/**
 * PixelFun - 랭킹/리더보드 시스템 (에이전트4)
 * Firebase Firestore가 있으면 사용, 없으면 localStorage 로컬 모드로 폴백
 * 글로벌 객체: window.PixelRanking
 */
(function () {
  'use strict';

  var LOCAL_KEY = 'pixelfun_local_ranking';

  var GAMES = {
    number:    { label: '숫자 맞추기', icon: '🔢', lowerIsBetter: true  },
    memory:    { label: '카드 뒤집기', icon: '🃏', lowerIsBetter: true  },
    typing:    { label: '타이핑 게임', icon: '⌨️', lowerIsBetter: false },
    math:      { label: '암산 챌린지', icon: '➕', lowerIsBetter: false },
    quiz:      { label: 'OX 퀴즈',     icon: '❓', lowerIsBetter: false },
    color:     { label: '색깔 맞추기', icon: '🎨', lowerIsBetter: false },
    tictactoe: { label: '틱택토',      icon: '⭕', lowerIsBetter: false },
    chess:     { label: '체스',        icon: '♟️', lowerIsBetter: false },
    sequence:  { label: '시퀀스 마스터', icon: '👾', lowerIsBetter: false },
    random:    { label: '랜덤 패턴 마스터', icon: '🎲', lowerIsBetter: false }
  };

  // Firestore 사용 가능 여부
  function getFirestore() {
    try {
      if (window.firebaseDb) return window.firebaseDb;
      if (window.firebase && typeof window.firebase.firestore === 'function') {
        return window.firebase.firestore();
      }
    } catch (e) {}
    return null;
  }

  // 사용자 이름 결정
  function resolveName() {
    try {
      if (window.PixelAuth && typeof window.PixelAuth.getUser === 'function') {
        var u = window.PixelAuth.getUser();
        if (u && u.displayName) return u.displayName;
        if (u && u.email) return String(u.email).split('@')[0];
      }
    } catch (e) {}
    try {
      // 로컬 보존된 게스트 이름 재사용
      var saved = localStorage.getItem('pixelfun_guest_name');
      if (saved) return saved;
      var gname = 'Guest_' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('pixelfun_guest_name', gname);
      return gname;
    } catch (e) {
      return '익명#' + Math.floor(1000 + Math.random() * 9000);
    }
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      return (data && typeof data === 'object') ? data : {};
    } catch (e) {
      return {};
    }
  }

  function saveLocal(data) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function sortEntries(entries, lowerIsBetter) {
    return entries.slice().sort(function (a, b) {
      if (lowerIsBetter) return a.score - b.score;
      return b.score - a.score;
    });
  }

  // 로컬 모드 등록
  function submitLocal(game, score, name) {
    try {
      var data = loadLocal();
      if (!data[game]) data[game] = [];
      data[game].push({
        name: name,
        score: Number(score),
        ts: Date.now()
      });
      // 상위 100개만 보관
      var meta = GAMES[game] || {};
      data[game] = sortEntries(data[game], !!meta.lowerIsBetter).slice(0, 100);
      saveLocal(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  function getTopLocal(game, limit) {
    try {
      var data = loadLocal();
      var arr = data[game] || [];
      var meta = GAMES[game] || {};
      return sortEntries(arr, !!meta.lowerIsBetter).slice(0, limit || 10);
    } catch (e) {
      return [];
    }
  }

  // Firestore 모드
  function submitFirestore(db, game, score, name) {
    try {
      return db.collection('rankings').add({
        game: game,
        name: name,
        score: Number(score),
        createdAt: (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue)
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : new Date()
      }).then(function () { return true; })
        .catch(function () {
          submitLocal(game, score, name);
          return false;
        });
    } catch (e) {
      submitLocal(game, score, name);
      return Promise.resolve(false);
    }
  }

  function getTopFirestore(db, game, limit) {
    try {
      var meta = GAMES[game] || {};
      var direction = meta.lowerIsBetter ? 'asc' : 'desc';
      return db.collection('rankings')
        .where('game', '==', game)
        .orderBy('score', direction)
        .limit(limit || 10)
        .get()
        .then(function (snap) {
          var arr = [];
          snap.forEach(function (doc) {
            var d = doc.data() || {};
            arr.push({
              name: d.name || '익명',
              score: typeof d.score === 'number' ? d.score : Number(d.score) || 0,
              ts: (d.createdAt && d.createdAt.toMillis) ? d.createdAt.toMillis() : 0
            });
          });
          return arr;
        })
        .catch(function () {
          return getTopLocal(game, limit);
        });
    } catch (e) {
      return Promise.resolve(getTopLocal(game, limit));
    }
  }

  // 공개: 등록
  function submit(game, score) {
    try {
      if (!game || score === undefined || score === null) return Promise.resolve(false);
      var name = resolveName();
      var db = getFirestore();
      if (db) {
        return Promise.resolve(submitFirestore(db, game, score, name));
      }
      submitLocal(game, score, name);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  // 공개: 상위 N명
  function getTop(game, limit) {
    try {
      var db = getFirestore();
      if (db) {
        return Promise.resolve(getTopFirestore(db, game, limit));
      }
      return Promise.resolve(getTopLocal(game, limit));
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(ms) {
    try {
      if (!ms) return '';
      var d = new Date(ms);
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return m + '/' + day;
    } catch (e) {
      return '';
    }
  }

  // 리더보드 렌더링
  function renderInto(elementId, game) {
    try {
      var el = document.getElementById(elementId);
      if (!el) return;

      // 컨테이너 구조 (셀렉트 + 리스트)
      var keys = Object.keys(GAMES);
      var current = (game && GAMES[game]) ? game : (el.getAttribute('data-current-game') || keys[0]);

      var heading = el.querySelector('.section-title');
      var html = heading ? heading.outerHTML : '';
      html += '<div class="ranking-controls">';
      html += '  <label class="ranking-label" for="rankingGameSelect">게임 선택:</label>';
      html += '  <select id="rankingGameSelect" class="ranking-select">';
      keys.forEach(function (k) {
        html += '<option value="' + k + '"' + (k === current ? ' selected' : '') + '>' +
                GAMES[k].icon + ' ' + escapeHtml(GAMES[k].label) + '</option>';
      });
      html += '  </select>';
      var mode = getFirestore() ? '온라인' : '로컬';
      html += '  <span class="ranking-mode">[' + mode + ' 모드]</span>';
      html += '</div>';
      html += '<ol class="ranking-list" id="rankingList"><li class="ranking-loading">불러오는 중...</li></ol>';

      el.innerHTML = html;
      el.setAttribute('data-current-game', current);

      var sel = document.getElementById('rankingGameSelect');
      if (sel) {
        sel.addEventListener('change', function () {
          renderInto(elementId, sel.value);
        });
      }

      // 데이터 로드
      getTop(current, 10).then(function (list) {
        try {
          var listEl = document.getElementById('rankingList');
          if (!listEl) return;
          if (!list || list.length === 0) {
            listEl.innerHTML = '<li class="ranking-empty">아직 기록이 없습니다. 첫 번째 챔피언이 되어보세요!</li>';
            return;
          }
          var inner = '';
          list.forEach(function (entry, idx) {
            var medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : (idx + 1) + '위'));
            inner += '<li class="ranking-row' + (idx < 3 ? ' ranking-top' : '') + '">';
            inner += '  <span class="ranking-rank">' + medal + '</span>';
            inner += '  <span class="ranking-name">' + escapeHtml(entry.name) + '</span>';
            inner += '  <span class="ranking-score">' + escapeHtml(String(entry.score)) + '</span>';
            inner += '  <span class="ranking-date">' + fmtDate(entry.ts) + '</span>';
            inner += '</li>';
          });
          listEl.innerHTML = inner;
        } catch (e) {}
      });
    } catch (e) {}
  }

  // 공개 API
  window.PixelRanking = {
    submit: submit,
    getTop: getTop,
    renderInto: renderInto,
    GAMES: GAMES
  };

  // gameComplete 이벤트 자동 등록
  function attachListener() {
    try {
      window.addEventListener('gameComplete', function (e) {
        try {
          var d = (e && e.detail) ? e.detail : {};
          if (!d.game || d.score === undefined || d.score === null) return;
          submit(d.game, d.score).then(function () {
            // 현재 표시 중인 랭킹 게임과 같으면 즉시 갱신
            var section = document.getElementById('rankingSection');
            if (section) {
              var current = section.getAttribute('data-current-game');
              if (!current || current === d.game) {
                renderInto('rankingSection', current || d.game);
              }
            }
          });
        } catch (err) {}
      });
    } catch (e) {}
  }

  function init() {
    attachListener();
    try {
      var section = document.getElementById('rankingSection');
      if (section) renderInto('rankingSection');
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
