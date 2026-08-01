/**
 * PixelFun - 랭킹/리더보드 시스템
 * Supabase가 설정돼 있으면 rankings 테이블을 사용, 없으면 localStorage 로컬 모드로 폴백
 * 글로벌 객체: window.PixelRanking
 */
(function () {
  'use strict';

  var LOCAL_KEY = 'pixelfun_local_ranking';
  var TABLE = 'rankings';

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

  // Supabase 사용 가능 여부
  function getClient() {
    try { return window.sb || null; } catch (e) { return null; }
  }

  // 로그인한 사용자 id (게스트면 null)
  function currentUserId() {
    try {
      if (window.PixelAuth && typeof window.PixelAuth.getUser === 'function') {
        var u = window.PixelAuth.getUser();
        if (u && !u.isGuest && u.uid) return u.uid;
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

  // ===== Supabase 모드 =====
  function submitCloud(sb, game, score, name) {
    try {
      var row = {
        game: game,
        name: String(name).slice(0, 20),
        score: Number(score)
      };
      var uid = currentUserId();
      if (uid) row.user_id = uid;

      return sb.from(TABLE).insert(row).then(function (res) {
        if (res.error) throw res.error;
        // 온라인 저장에 성공해도 로컬 사본은 남겨 오프라인 조회를 돕습니다.
        submitLocal(game, score, name);
        return true;
      }).catch(function (err) {
        console.warn('[PixelFun] 랭킹 등록 실패, 로컬에 저장합니다.', err && err.message);
        submitLocal(game, score, name);
        return false;
      });
    } catch (e) {
      submitLocal(game, score, name);
      return Promise.resolve(false);
    }
  }

  function getTopCloud(sb, game, limit) {
    try {
      var meta = GAMES[game] || {};
      var asc = !!meta.lowerIsBetter;
      return sb.from(TABLE)
        .select('name,score,created_at')
        .eq('game', game)
        .order('score', { ascending: asc })
        .order('created_at', { ascending: true })
        .limit(limit || 10)
        .then(function (res) {
          if (res.error) throw res.error;
          return (res.data || []).map(function (d) {
            return {
              name: d.name || '익명',
              score: typeof d.score === 'number' ? d.score : Number(d.score) || 0,
              ts: d.created_at ? new Date(d.created_at).getTime() : 0
            };
          });
        })
        .catch(function (err) {
          console.warn('[PixelFun] 랭킹 조회 실패, 로컬 기록을 표시합니다.', err && err.message);
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
      var sb = getClient();
      if (sb) return submitCloud(sb, game, score, name);
      submitLocal(game, score, name);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  // 공개: 상위 N명
  function getTop(game, limit) {
    try {
      var sb = getClient();
      if (sb) return getTopCloud(sb, game, limit);
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
      var mode = getClient() ? '온라인' : '로컬';
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
    // 로그인/로그아웃 시 리더보드 갱신 (이름 표시 변경 반영)
    try {
      window.addEventListener('authChange', function () {
        var section = document.getElementById('rankingSection');
        if (section) renderInto('rankingSection', section.getAttribute('data-current-game'));
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
