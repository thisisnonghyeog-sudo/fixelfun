/**
 * PixelFun - 통계/플레이 기록 시스템 (에이전트4)
 * gameComplete 이벤트를 자동 수신하여 localStorage에 누적 저장
 * 글로벌 객체: window.PixelStats
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pixelfun_stats';

  var GAMES = {
    number:    { label: '숫자 맞추기', icon: '🔢', unit: '회', lowerIsBetter: true },
    memory:    { label: '카드 뒤집기', icon: '🃏', unit: '초', lowerIsBetter: true },
    typing:    { label: '타이핑 게임', icon: '⌨️', unit: 'WPM' },
    math:      { label: '암산 챌린지', icon: '➕', unit: '점' },
    quiz:      { label: 'OX 퀴즈',     icon: '❓', unit: '점' },
    color:     { label: '색깔 맞추기', icon: '🎨', unit: '점' },
    tictactoe: { label: '틱택토',      icon: '⭕', unit: '연승' },
    chess:     { label: '체스',        icon: '♟️', unit: '점' },
    sequence:  { label: '시퀀스 마스터', icon: '👾', unit: '레벨' },
    random:    { label: '랜덤 패턴 마스터', icon: '🎲', unit: '레벨' }
  };

  function defaultStats() {
    return {
      total: 0,
      firstPlay: null,
      lastPlay: null,
      games: {} // { game: { plays, best, recent: [] } }
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStats();
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return defaultStats();
      if (!data.games) data.games = {};
      if (typeof data.total !== 'number') data.total = 0;
      Object.keys(data.games).forEach(function (k) {
        var g = data.games[k];
        if (g && typeof g === 'object' && g.best !== null && g.best !== undefined && typeof g.best !== 'number') {
          var num = Number(g.best);
          g.best = isFinite(num) ? num : null;
        }
      });
      return data;
    } catch (e) {
      return defaultStats();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function nowISO() {
    try {
      return new Date().toISOString();
    } catch (e) {
      return '';
    }
  }

  function record(game, score, isNewRecord) {
    try {
      if (!game) return;
      var data = load();
      if (!data.firstPlay) data.firstPlay = nowISO();
      data.lastPlay = nowISO();
      data.total = (data.total || 0) + 1;

      if (!data.games[game]) {
        data.games[game] = { plays: 0, best: null, recent: [] };
      }
      var g = data.games[game];
      g.plays = (g.plays || 0) + 1;

      var num = Number(score);
      if (!isNaN(num)) {
        if (g.best === null || g.best === undefined) {
          g.best = num;
        } else {
          var meta = GAMES[game] || {};
          if (meta.lowerIsBetter) {
            if (num < g.best) g.best = num;
          } else {
            if (num > g.best) g.best = num;
          }
        }
        if (isNewRecord) g.best = num; // 게임에서 신기록 표시한 값 우선
        if (!Array.isArray(g.recent)) g.recent = [];
        g.recent.push(num);
        if (g.recent.length > 5) g.recent = g.recent.slice(-5);
      }

      save(data);
      // 통계 변경 알림 (다른 모듈이 듣고 갱신)
      try {
        window.dispatchEvent(new CustomEvent('statsUpdated', { detail: { game: game, score: score } }));
      } catch (e) {}

      // 자동 렌더 (열려있는 통계 섹션 갱신)
      var section = document.getElementById('myStatsSection');
      if (section) {
        try { window.PixelStats.renderInto('myStatsSection'); } catch (e) {}
      }
    } catch (e) {}
  }

  function get() {
    return load();
  }

  function getGameStats(game) {
    try {
      var data = load();
      return data.games[game] || { plays: 0, best: null, recent: [] };
    } catch (e) {
      return { plays: 0, best: null, recent: [] };
    }
  }

  function reset() {
    try {
      var ok = window.confirm('정말 모든 통계를 초기화하시겠습니까?');
      if (!ok) return false;
      localStorage.removeItem(STORAGE_KEY);
      // 초기화한 상태를 서버에도 반영 (안 하면 다시 로그인할 때 되살아납니다)
      try { if (window.PixelCloud) window.PixelCloud.persist(); } catch (e) {}
      var section = document.getElementById('myStatsSection');
      if (section) renderInto('myStatsSection');
      return true;
    } catch (e) {
      return false;
    }
  }

  function fmtDate(iso) {
    try {
      if (!iso) return '-';
      var d = new Date(iso);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    } catch (e) {
      return '-';
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

  function renderInto(elementId) {
    try {
      var el = document.getElementById(elementId);
      if (!el) return;
      var data = load();
      var keys = Object.keys(GAMES);

      // 막대그래프 정규화 (높을수록 좋은 게임만 사용; 낮을수록 좋은 건 별도 표시)
      var maxBest = 0;
      keys.forEach(function (k) {
        var g = data.games[k];
        var meta = GAMES[k];
        if (!g || g.best === null || g.best === undefined) return;
        if (meta.lowerIsBetter) return;
        if (g.best > maxBest) maxBest = g.best;
      });

      var heading = el.querySelector('.section-title');
      var html = heading ? heading.outerHTML : '';
      html += '<div class="stats-summary">';
      html += '  <div class="stats-card"><div class="stats-num">' + (data.total || 0) + '</div><div class="stats-label">총 플레이</div></div>';
      html += '  <div class="stats-card"><div class="stats-num">' + Object.keys(data.games || {}).length + '</div><div class="stats-label">플레이한 게임</div></div>';
      html += '  <div class="stats-card"><div class="stats-num">' + fmtDate(data.firstPlay) + '</div><div class="stats-label">첫 플레이</div></div>';
      html += '  <div class="stats-card"><div class="stats-num">' + fmtDate(data.lastPlay) + '</div><div class="stats-label">최근 플레이</div></div>';
      html += '</div>';

      html += '<h3 class="stats-h3">게임별 최고기록</h3>';
      html += '<div class="stats-bars">';
      keys.forEach(function (k) {
        var meta = GAMES[k];
        var g = data.games[k] || { plays: 0, best: null, recent: [] };
        var bestNum = (g.best === null || g.best === undefined) ? null : Number(g.best);
        if (!isFinite(bestNum)) bestNum = null;
        var best = bestNum === null ? '-' : bestNum;
        var pct = 0;
        if (!meta.lowerIsBetter && bestNum !== null && maxBest > 0) {
          pct = Math.max(4, Math.round((bestNum / maxBest) * 100));
        } else if (meta.lowerIsBetter && bestNum !== null) {
          pct = 50; // 시간 기록은 별도 표시
        }
        html += '<div class="stats-bar-row">';
        html += '  <div class="stats-bar-label">' + meta.icon + ' ' + escapeHtml(meta.label) + '</div>';
        html += '  <div class="stats-bar-track"><div class="stats-bar-fill" style="width:' + pct + '%"></div></div>';
        html += '  <div class="stats-bar-value">' + escapeHtml(String(best)) + (best !== '-' ? ' ' + meta.unit : '') + '</div>';
        html += '  <div class="stats-bar-plays">' + (g.plays || 0) + '회</div>';
        html += '</div>';
      });
      html += '</div>';

      html += '<div class="stats-actions"><button class="stats-reset-btn" id="pixelStatsResetBtn">통계 초기화</button></div>';

      el.innerHTML = html;

      var btn = document.getElementById('pixelStatsResetBtn');
      if (btn) btn.addEventListener('click', function () { reset(); });
    } catch (e) {}
  }

  // 공개 API
  window.PixelStats = {
    record: record,
    get: get,
    getGameStats: getGameStats,
    reset: reset,
    renderInto: renderInto,
    GAMES: GAMES
  };

  // 자동 이벤트 수신
  function attachListener() {
    try {
      window.addEventListener('gameComplete', function (e) {
        try {
          var d = e && e.detail ? e.detail : {};
          if (!d.game) return;
          record(d.game, d.score, !!d.isNewRecord);
        } catch (err) {}
      });
    } catch (e) {}
  }

  // 게임별 단독 저장 키와 통계의 best를 동기화 (lowerIsBetter 게임에서 더 낮은 값이 있으면 교체)
  function migrate() {
    try {
      var data = load();
      var changed = false;
      Object.keys(GAMES).forEach(function (k) {
        var meta = GAMES[k];
        var raw = localStorage.getItem('pixelfun_' + k + '_best');
        if (raw === null || raw === undefined) return;
        var v = Number(raw);
        if (isNaN(v)) return;
        if (!data.games[k]) data.games[k] = { plays: 0, best: null, recent: [] };
        var g = data.games[k];
        if (g.best === null || g.best === undefined) {
          g.best = v; changed = true;
        } else if (meta.lowerIsBetter) {
          if (v < g.best) { g.best = v; changed = true; }
        } else {
          if (v > g.best) { g.best = v; changed = true; }
        }
        // 게임별 best 키가 있으면 최소 1회는 플레이한 것으로 간주
        if (!g.plays || g.plays < 1) { g.plays = 1; changed = true; }
      });
      if (changed) {
        // 총 플레이 횟수도 보정 (실제 누적이 더 크면 유지)
        var sum = 0;
        Object.keys(data.games).forEach(function (k) {
          sum += (data.games[k] && data.games[k].plays) || 0;
        });
        if ((data.total || 0) < sum) data.total = sum;
        save(data);
        // 다른 모듈(배지 등)이 다시 검사하도록 알림
        try {
          window.dispatchEvent(new CustomEvent('statsUpdated', { detail: { migrated: true } }));
        } catch (e) {}
      }
    } catch (e) {}
  }

  function init() {
    migrate();
    attachListener();
    try {
      var section = document.getElementById('myStatsSection');
      if (section) renderInto('myStatsSection');
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
