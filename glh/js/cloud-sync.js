/**
 * PixelFun - 클라우드 동기화 (Supabase user_data 테이블)
 *
 * 통계/배지/최고기록은 계속 localStorage에 저장되고, 로그인한 사용자에 한해
 * Supabase에 사본을 올려 기기 간 이어하기를 지원합니다.
 * 게스트나 Supabase 미설정 시에는 아무 일도 하지 않고 로컬 모드로 남습니다.
 *
 * 로그인 시: 원격 데이터를 받아 로컬과 병합 → 로컬 반영 → 원격 재업로드
 * 플레이 시: 디바운스 후 업로드
 *
 * 글로벌: window.PixelCloud
 */
(function () {
  'use strict';

  var TABLE = 'user_data';
  var STATS_KEY = 'pixelfun_stats';
  var BADGE_KEY = 'pixelfun_badges';
  var COUNT_KEY = 'pixelfun_record_count';

  // ranking.js / stats.js와 동일한 게임 목록 (점수 방향 판단용)
  var LOWER_IS_BETTER = { number: true, memory: true };
  var GAME_KEYS = ['number', 'memory', 'typing', 'math', 'quiz', 'color',
                   'tictactoe', 'chess', 'sequence', 'random'];

  var pushTimer = null;
  var syncing = false;

  function getClient() {
    try { return window.sb || null; } catch (e) { return null; }
  }

  function activeUserId() {
    try {
      if (!window.PixelAuth || typeof window.PixelAuth.getUser !== 'function') return null;
      var u = window.PixelAuth.getUser();
      if (u && !u.isGuest && u.uid) return u.uid;
    } catch (e) {}
    return null;
  }

  function jsonGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function jsonSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // 로컬 전체 스냅샷 수집
  function collectLocal() {
    var bests = {};
    GAME_KEYS.forEach(function (g) {
      try {
        var raw = localStorage.getItem('pixelfun_' + g + '_best');
        if (raw !== null && raw !== '') {
          var n = Number(raw);
          if (isFinite(n)) bests[g] = n;
        }
      } catch (e) {}
    });
    var count = 0;
    try { count = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) || 0; } catch (e) {}

    return {
      stats: jsonGet(STATS_KEY, null),
      badges: jsonGet(BADGE_KEY, []),
      recordCount: count,
      bests: bests
    };
  }

  // 병합된 스냅샷을 localStorage에 반영
  function applyLocal(snap) {
    if (!snap) return;
    if (snap.stats) jsonSet(STATS_KEY, snap.stats);
    if (Array.isArray(snap.badges)) jsonSet(BADGE_KEY, snap.badges);
    try { localStorage.setItem(COUNT_KEY, String(snap.recordCount || 0)); } catch (e) {}
    if (snap.bests) {
      Object.keys(snap.bests).forEach(function (g) {
        try { localStorage.setItem('pixelfun_' + g + '_best', String(snap.bests[g])); } catch (e) {}
      });
    }
  }

  function betterScore(game, a, b) {
    if (a === undefined || a === null || !isFinite(a)) return b;
    if (b === undefined || b === null || !isFinite(b)) return a;
    return LOWER_IS_BETTER[game] ? Math.min(a, b) : Math.max(a, b);
  }

  function laterISO(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (new Date(a).getTime() >= new Date(b).getTime()) ? a : b;
  }

  function earlierISO(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (new Date(a).getTime() <= new Date(b).getTime()) ? a : b;
  }

  // 통계 객체 병합
  function mergeStats(local, remote) {
    if (!local) return remote || null;
    if (!remote) return local;

    var out = {
      firstPlay: earlierISO(local.firstPlay, remote.firstPlay),
      lastPlay: laterISO(local.lastPlay, remote.lastPlay),
      games: {},
      total: 0
    };
    var remoteIsNewer = laterISO(local.lastPlay, remote.lastPlay) === remote.lastPlay;

    var names = {};
    Object.keys(local.games || {}).forEach(function (k) { names[k] = 1; });
    Object.keys(remote.games || {}).forEach(function (k) { names[k] = 1; });

    Object.keys(names).forEach(function (g) {
      var lg = (local.games && local.games[g]) || {};
      var rg = (remote.games && remote.games[g]) || {};
      // plays는 같은 기록이 양쪽에 있을 수 있으므로 합이 아닌 최댓값을 씁니다.
      var plays = Math.max(lg.plays || 0, rg.plays || 0);
      var recent = remoteIsNewer
        ? (Array.isArray(rg.recent) ? rg.recent : (lg.recent || []))
        : (Array.isArray(lg.recent) ? lg.recent : (rg.recent || []));
      out.games[g] = {
        plays: plays,
        best: betterScore(g, lg.best, rg.best),
        recent: recent.slice(-5)
      };
      out.total += plays;
    });

    return out;
  }

  // 전체 스냅샷 병합
  function mergeSnapshot(local, remote) {
    if (!remote) return local;
    var badges = {};
    (Array.isArray(local.badges) ? local.badges : []).forEach(function (b) { badges[b] = 1; });
    (Array.isArray(remote.badges) ? remote.badges : []).forEach(function (b) { badges[b] = 1; });

    var bests = {};
    var keys = {};
    Object.keys(local.bests || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(remote.bests || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (g) {
      var v = betterScore(g, (local.bests || {})[g], (remote.bests || {})[g]);
      if (v !== undefined && v !== null) bests[g] = v;
    });

    return {
      stats: mergeStats(local.stats, remote.stats),
      badges: Object.keys(badges),
      recordCount: Math.max(local.recordCount || 0, remote.recordCount || 0),
      bests: bests
    };
  }

  // 원격에서 내려받기
  function pull(sb, uid) {
    return sb.from(TABLE)
      .select('data')
      .eq('user_id', uid)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data && res.data.data) ? res.data.data : null;
      });
  }

  // 원격으로 올리기
  function push(sb, uid, snap) {
    return sb.from(TABLE)
      .upsert({ user_id: uid, data: snap, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' })
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      });
  }

  // 로그인 직후 양방향 동기화
  function syncNow() {
    var sb = getClient();
    var uid = activeUserId();
    if (!sb || !uid || syncing) return Promise.resolve(false);
    syncing = true;

    var local = collectLocal();
    return pull(sb, uid)
      .then(function (remote) {
        var merged = mergeSnapshot(local, remote);
        applyLocal(merged);
        return push(sb, uid, merged);
      })
      .then(function () {
        syncing = false;
        try {
          window.dispatchEvent(new CustomEvent('cloudSynced'));
          // 화면에 열려 있는 통계/배지 섹션 갱신
          if (window.PixelStats && document.getElementById('myStatsSection')) {
            window.PixelStats.renderInto('myStatsSection');
          }
          if (window.PixelBadge && document.getElementById('badgeSection')) {
            window.PixelBadge.renderInto('badgeSection');
          }
        } catch (e) {}
        return true;
      })
      .catch(function (err) {
        syncing = false;
        console.warn('[PixelFun] 클라우드 동기화 실패 (로컬 데이터는 그대로 유지됩니다).', err && err.message);
        return false;
      });
  }

  // 플레이 후 업로드 (디바운스)
  function schedulePush() {
    var sb = getClient();
    var uid = activeUserId();
    if (!sb || !uid) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      var id = activeUserId();
      if (!id) return;
      push(sb, id, collectLocal()).catch(function (err) {
        console.warn('[PixelFun] 기록 업로드 실패.', err && err.message);
      });
    }, 1500);
  }

  function init() {
    if (!getClient()) return;

    // 로그인 상태가 되면 동기화
    try {
      window.addEventListener('authChange', function (e) {
        var u = e && e.detail ? e.detail.user : null;
        if (u && !u.isGuest) syncNow();
      });
    } catch (e) {}

    // 이미 로그인된 상태로 진입한 경우
    if (activeUserId()) syncNow();

    // 기록 변동 시 업로드
    try {
      window.addEventListener('statsUpdated', schedulePush);
      window.addEventListener('gameComplete', schedulePush);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PixelCloud = {
    sync: syncNow,
    push: schedulePush,
    collectLocal: collectLocal,
    mergeSnapshot: mergeSnapshot
  };
})();
