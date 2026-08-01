/**
 * PixelFun - 배지/업적 시스템 (에이전트4)
 * gameComplete 이벤트 자동 수신, 조건 충족 시 토스트 알림 표시
 * 글로벌 객체: window.PixelBadge
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pixelfun_badges';

  // 배지 정의
  var BADGES = [
    {
      id: 'first_play',
      icon: '🎮',
      name: '첫 도전',
      desc: '어떤 게임이든 1회 플레이',
      check: function (ctx) {
        return (ctx.stats.total || 0) >= 1;
      }
    },
    {
      id: 'all_games',
      icon: '🔥',
      name: '연속 정복자',
      desc: '모든 8개 게임을 1회씩 플레이',
      check: function (ctx) {
        var games = ['number','memory','typing','math','quiz','color','chess','tictactoe'];
        var played = ctx.stats.games || {};
        return games.every(function (g) {
          return played[g] && (played[g].plays || 0) >= 1;
        });
      },
      // 진행도 표시 (UI에서 잠겨 있을 때 보여줌)
      progress: function (ctx) {
        var games = ['number','memory','typing','math','quiz','color','chess','tictactoe'];
        var played = ctx.stats.games || {};
        var done = 0;
        var missing = [];
        var labels = {
          number:'숫자', memory:'카드', typing:'타이핑', math:'암산',
          quiz:'OX', color:'색깔', chess:'체스', tictactoe:'틱택토'
        };
        games.forEach(function (g) {
          if (played[g] && (played[g].plays || 0) >= 1) done++;
          else missing.push(labels[g]);
        });
        return { done: done, total: games.length, missing: missing };
      }
    },
    {
      id: 'record_master',
      icon: '🏆',
      name: '신기록 마스터',
      desc: '신기록 3회 달성',
      check: function (ctx) {
        return (ctx.recordCount || 0) >= 3;
      },
      // 누적 카운트 별도 저장 (이벤트 detail 누적)
      counter: 'records'
    },
    {
      id: 'brain_fully_loaded',
      icon: '🧠',
      name: '두뇌 풀가동',
      desc: '누적 플레이 25회',
      check: function (ctx) {
        return (ctx.stats.total || 0) >= 25;
      }
    },
    {
      id: 'speedrunner',
      icon: '⚡',
      name: '스피드러너',
      desc: '카드 뒤집기 30초 이내 클리어',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'memory' && typeof ctx.event.score === 'number') {
          if (ctx.event.score <= 30 && ctx.event.score > 0) return true;
        }
        var memory = (ctx.stats.games || {}).memory;
        return memory && typeof memory.best === 'number' && memory.best > 0 && memory.best <= 30;
      }
    },
    {
      id: 'sharpshooter',
      icon: '🎯',
      name: '백발백중',
      desc: 'OX 퀴즈 등급 S 달성',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'quiz') {
          if (ctx.event.grade === 'S') return true;
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 100) return true;
        }
        return false;
      }
    },
    {
      id: 'math_genius',
      icon: '💯',
      name: '수학 천재',
      desc: '암산 챌린지 등급 S 달성',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'math') {
          if (ctx.event.grade === 'S') return true;
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 100) return true;
        }
        return false;
      }
    },
    {
      id: 'typing_master',
      icon: '⌨️',
      name: '타이핑 마스터',
      desc: '타이핑 WPM 25 이상',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'typing') {
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 25) return true;
        }
        var typing = (ctx.stats.games || {}).typing;
        return typing && typeof typing.best === 'number' && typing.best >= 25;
      }
    },
    {
      id: 'color_master',
      icon: '🌈',
      name: '색의 달인',
      desc: '색깔 맞추기 등급 S 달성',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'color') {
          if (ctx.event.grade === 'S') return true;
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 100) return true;
        }
        return false;
      }
    },
    {
      id: 'chess_checkmate',
      icon: '♚',
      name: '체크메이트',
      desc: '체스에서 외통수로 AI를 잡기',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'chess' && ctx.event.outcome === 'win') return true;
        return false;
      }
    },
    {
      id: 'chess_grandmaster',
      icon: '♛',
      name: '그랜드마스터',
      desc: '체스 등급 S 달성',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'chess') {
          if (ctx.event.grade === 'S') return true;
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 30) return true;
        }
        var chess = (ctx.stats.games || {}).chess;
        return chess && typeof chess.best === 'number' && chess.best >= 30;
      }
    },
    {
      id: 'chess_flawless',
      icon: '🛡️',
      name: '무결점 승리',
      desc: '체스에서 기물 하나도 잃지 않고 승리',
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'chess'
                  && ctx.event.outcome === 'win'
                  && ctx.event.lost === 0);
      }
    },
    {
      id: 'tictactoe_first_win',
      icon: '❎',
      name: '첫 승리',
      desc: '틱택토에서 AI를 상대로 첫 승리',
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'tictactoe' && ctx.event.outcome === 'win');
      }
    },
    {
      id: 'tictactoe_streak',
      icon: '🔥',
      name: '3연승의 기세',
      desc: '틱택토 3연승 달성',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'tictactoe' && typeof ctx.event.score === 'number') {
          if (ctx.event.score >= 3) return true;
        }
        var tt = (ctx.stats.games || {}).tictactoe;
        return tt && typeof tt.best === 'number' && tt.best >= 3;
      }
    },
    {
      id: 'tictactoe_hard_slayer',
      icon: '🧠',
      name: '하드 슬레이어',
      desc: '틱택토 어려움 난이도에서 승리',
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'tictactoe'
                  && ctx.event.outcome === 'win'
                  && ctx.event.difficulty === 'hard');
      }
    },
    {
      id: 'tictactoe_flawless',
      icon: '✨',
      name: '완벽한 한 수',
      desc: '틱택토에서 최소 수로 AI 격파 (3턴 만에 승리)',
      check: function (ctx) {
        if (!(ctx.event && ctx.event.game === 'tictactoe' && ctx.event.outcome === 'win')) return false;
        if (typeof ctx.event.lost !== 'number') return false;
        // 선공일 때 최소 AI 수 = 2, 후공일 때 최소 AI 수 = 3
        var minLost = ctx.event.firstPlayer === 'ai' ? 3 : 2;
        return ctx.event.lost <= minLost;
      }
    },
    {
      id: 'tictactoe_second_strike',
      icon: '🥷',
      name: '후공의 반격',
      desc: '틱택토 후공으로 시작해 AI에게 승리',
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'tictactoe'
                  && ctx.event.outcome === 'win'
                  && ctx.event.firstPlayer === 'ai');
      }
    },
    // ===== 히든 보스(시퀀스 마스터) 전용 배지 =====
    // boss:true 인 배지는 "모든 배지 획득(해금)" 계산에서 제외된다.
    // (보스를 플레이해야 얻을 수 있으므로 해금 조건에 넣으면 순환이 됨)
    {
      id: 'boss_awaken',
      icon: '🌀',
      name: '보스 각성',
      desc: '시퀀스 마스터에 첫 발을 내딛다 (1레벨 클리어)',
      boss: true,
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'sequence'
                  && typeof ctx.event.score === 'number' && ctx.event.score >= 1);
      }
    },
    {
      id: 'boss_conqueror',
      icon: '🐉',
      name: '보스 정복자',
      desc: '시퀀스 마스터 등급 S 달성 (12레벨 돌파)',
      boss: true,
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'sequence') {
          if (ctx.event.grade === 'S') return true;
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 12) return true;
        }
        return false;
      }
    },
    {
      id: 'boss_aspirant',
      icon: '⚔️',
      name: '보스 도전자',
      desc: '시퀀스 마스터 5레벨 이상 클리어',
      boss: true,
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'sequence') {
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 5) return true;
        }
        var sequence = (ctx.stats.games || {}).sequence;
        return sequence && typeof sequence.best === 'number' && sequence.best >= 5;
      }
    },
    {
      id: 'boss_veteran',
      icon: '🏹',
      name: '보스 베테랑',
      desc: '시퀀스 마스터 10레벨 이상 클리어',
      boss: true,
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'sequence') {
          if (typeof ctx.event.score === 'number' && ctx.event.score >= 10) return true;
        }
        var sequence = (ctx.stats.games || {}).sequence;
        return sequence && typeof sequence.best === 'number' && sequence.best >= 10;
      }
    },
    {
      id: 'boss_slayer',
      icon: '🗡️',
      name: '보스 슬레이어',
      desc: '시퀀스 마스터의 보스를 처치 (15레벨 격파)',
      boss: true,
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'sequence' && ctx.event.outcome === 'win');
      }
    },
    {
      id: 'random_pattern_master',
      icon: '🎲',
      name: '랜덤 패턴 마스터',
      desc: '랜덤 패턴 마스터를 클리어했습니다',
      check: function (ctx) {
        return !!(ctx.event && ctx.event.game === 'random' && ctx.event.outcome === 'win');
      }
    },
    {
      id: 'random_pattern_expert',
      icon: '💎',
      name: '랜덤 패턴 전문가',
      desc: '랜덤 패턴 마스터에서 10레벨 이상 도달',
      check: function (ctx) {
        if (ctx.event && ctx.event.game === 'random' && typeof ctx.event.score === 'number') {
          return ctx.event.score >= 10;
        }
        var randomStats = (ctx.stats.games || {}).random;
        return randomStats && typeof randomStats.best === 'number' && randomStats.best >= 10;
      }
    },
    {
      id: 'badge_collector',
      icon: '👑',
      name: '배지 컬렉터',
      desc: '모든 비보스 배지를 획득한 진정한 마스터',
      check: function (ctx) {
        var owned = ctx.owned || [];
        var required = BADGES.filter(function (b) {
          return !b.boss && b.id !== 'badge_collector';
        }).map(function (b) { return b.id; });
        return required.every(function (id) {
          return owned.indexOf(id) !== -1;
        });
      }
    }
  ];

  function loadOwned() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveOwned(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  // 신기록 누적 카운터 (별도 저장)
  function getRecordCount() {
    try {
      return parseInt(localStorage.getItem('pixelfun_record_count') || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }
  function bumpRecordCount() {
    try {
      var n = getRecordCount() + 1;
      localStorage.setItem('pixelfun_record_count', String(n));
      return n;
    } catch (e) {
      return 0;
    }
  }

  function getStats() {
    try {
      if (window.PixelStats && typeof window.PixelStats.get === 'function') {
        return window.PixelStats.get() || { total: 0, games: {} };
      }
      var raw = localStorage.getItem('pixelfun_stats');
      if (!raw) return { total: 0, games: {} };
      var data = JSON.parse(raw);
      return data || { total: 0, games: {} };
    } catch (e) {
      return { total: 0, games: {} };
    }
  }

  function showToast(badge) {
    try {
      var toast = document.createElement('div');
      toast.className = 'toast badge-toast';
      toast.innerHTML =
        '<div class="badge-toast-icon">' + badge.icon + '</div>' +
        '<div class="badge-toast-body">' +
          '<div class="badge-toast-title">🏅 배지 획득!</div>' +
          '<div class="badge-toast-name">' + escapeHtml(badge.name) + '</div>' +
          '<div class="badge-toast-desc">' + escapeHtml(badge.desc) + '</div>' +
        '</div>';
      document.body.appendChild(toast);
      // 사운드
      try { if (window.PixelSound) window.PixelSound.play('clear'); } catch (e) {}
      // 자동 제거
      setTimeout(function () {
        try { toast.classList.add('toast-out'); } catch (e) {}
        setTimeout(function () {
          try { toast.parentNode && toast.parentNode.removeChild(toast); } catch (e) {}
        }, 500);
      }, 3500);
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function check(eventDetail) {
    try {
      var owned = loadOwned();
      var ctx = {
        stats: getStats(),
        event: eventDetail || null,
        recordCount: getRecordCount(),
        owned: owned
      };
      var newly = [];
      BADGES.forEach(function (b) {
        if (owned.indexOf(b.id) !== -1) return;
        try {
          if (b.check(ctx)) {
            owned.push(b.id);
            newly.push(b);
          }
        } catch (e) {}
      });
      if (newly.length > 0) {
        saveOwned(owned);
        // 순차 토스트
        newly.forEach(function (b, i) {
          setTimeout(function () { showToast(b); }, i * 600);
        });
        // 배지 진열장 갱신
        var section = document.getElementById('badgeSection');
        if (section) {
          try { renderInto('badgeSection'); } catch (e) {}
        }
      }
      return newly;
    } catch (e) {
      return [];
    }
  }

  function renderInto(elementId) {
    try {
      var el = document.getElementById(elementId);
      if (!el) return;
      var owned = loadOwned();
      var ctx = {
        stats: getStats(),
        event: null,
        recordCount: getRecordCount(),
        owned: owned
      };
      var heading = el.querySelector('.section-title');
      var html = heading ? heading.outerHTML : '';
      html += '<div class="badge-grid">';
      BADGES.forEach(function (b) {
        var got = owned.indexOf(b.id) !== -1;
        var extra = '';
        if (!got && typeof b.progress === 'function') {
          try {
            var p = b.progress(ctx);
            if (p && typeof p.done === 'number' && typeof p.total === 'number') {
              extra = '<div class="badge-progress-mini" style="margin-top:6px;font-size:11px;color:var(--neon-yellow);line-height:1.4;">' +
                      p.done + ' / ' + p.total +
                      (p.missing && p.missing.length ? ' · 남은: ' + escapeHtml(p.missing.join(', ')) : '') +
                      '</div>';
            }
          } catch (e) {}
        }
        html += '<div class="badge-item ' + (got ? 'badge-owned' : 'badge-locked') + '" title="' + escapeHtml(b.desc) + '">';
        html += '  <div class="badge-icon">' + b.icon + '</div>';
        html += '  <div class="badge-name">' + escapeHtml(b.name) + '</div>';
        html += '  <div class="badge-desc">' + escapeHtml(b.desc) + '</div>';
        html += extra;
        html += '  <div class="badge-status">' + (got ? '획득' : '잠김') + '</div>';
        html += '</div>';
      });
      html += '</div>';
      html += '<div class="badge-progress">획득: ' + owned.length + ' / ' + BADGES.length + '</div>';
      el.innerHTML = html;
    } catch (e) {}
  }

  // 공개 API
  window.PixelBadge = {
    getAll: function () {
      return BADGES.map(function (b) {
        return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, boss: !!b.boss };
      });
    },
    getOwned: function () {
      return loadOwned();
    },
    check: function () {
      return check(null);
    },
    renderInto: renderInto,
    reset: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('pixelfun_record_count');
        // 초기화한 상태를 서버에도 반영 (안 하면 다시 로그인할 때 되살아납니다)
        try { if (window.PixelCloud) window.PixelCloud.persist(); } catch (e) {}
        var section = document.getElementById('badgeSection');
        if (section) renderInto('badgeSection');
      } catch (e) {}
    }
  };

  // 자동 이벤트 수신
  function attachListener() {
    try {
      window.addEventListener('gameComplete', function (e) {
        try {
          var d = (e && e.detail) ? e.detail : {};
          if (d.isNewRecord) bumpRecordCount();
          // PixelStats가 먼저 처리하도록 살짝 지연
          setTimeout(function () { check(d); }, 50);
        } catch (err) {}
      });
      window.addEventListener('statsUpdated', function () {
        try { check(null); } catch (e) {}
      });
    } catch (e) {}
  }

  function init() {
    attachListener();
    try {
      var section = document.getElementById('badgeSection');
      if (section) renderInto('badgeSection');
      // 초기 1회 검사
      check(null);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
