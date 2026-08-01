/**
 * PixelFun - 프로필별 데이터 분리 + 클라우드 동기화
 *
 * 문제: 통계/배지/최고기록이 localStorage의 고정된 키에 저장되기 때문에
 *       한 브라우저에서 계정을 바꿔도 이전 사람의 기록이 그대로 보였습니다.
 *
 * 해결: "프로필 스코프" 개념을 둡니다.
 *   - 게스트          → 스코프 'guest'
 *   - 로그인한 계정   → 스코프 'u_<uid>'
 *   각 스코프의 데이터는 `pixelfun_profile_<스코프>` 에 따로 보관하고,
 *   현재 활성 스코프의 데이터만 게임들이 쓰는 원래 키에 올려둡니다.
 *   로그인/로그아웃 시 → 쓰던 데이터를 보관함에 넣고, 새 스코프 것을 꺼내옵니다.
 *   (게스트 기록이 계정으로 넘어가지 않고, 계정끼리도 섞이지 않습니다)
 *
 * 로그인 상태에서는 추가로 Supabase `user_data` 테이블과 동기화해
 * 다른 기기에서도 같은 기록을 이어갈 수 있습니다.
 *
 * 글로벌: window.PixelCloud
 */
(function () {
  'use strict';

  var TABLE = 'user_data';
  var SCOPE_KEY = 'pixelfun_active_scope';    // 현재 활성 프로필
  var CACHE_PREFIX = 'pixelfun_profile_';     // 프로필별 보관함

  // 게임들이 실제로 읽고 쓰는 키 (= 프로필 전환 대상)
  var STATS_KEY = 'pixelfun_stats';
  var BADGE_KEY = 'pixelfun_badges';
  var COUNT_KEY = 'pixelfun_record_count';

  var GAME_KEYS = ['number', 'memory', 'typing', 'math', 'quiz', 'color',
                   'tictactoe', 'chess', 'sequence', 'random'];
  var LOWER_IS_BETTER = { number: true, memory: true };

  // 프로필과 무관한 키(사운드 on/off, 언어, 난이도 설정 등)는 건드리지 않습니다.

  var pushTimer = null;
  var pushScope = null;
  var syncing = false;

  function getClient() {
    try { return window.sb || null; } catch (e) { return null; }
  }

  function bestKey(game) { return 'pixelfun_' + game + '_best'; }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsRemove(k) { try { localStorage.removeItem(k); } catch (e) {} }

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
  function jsonSet(key, val) { lsSet(key, JSON.stringify(val)); }

  // ===== 스코프 =====
  function scopeOf(user) {
    return (user && !user.isGuest && user.uid) ? ('u_' + user.uid) : 'guest';
  }
  function currentUser() {
    try {
      if (window.PixelAuth && typeof window.PixelAuth.getUser === 'function') {
        return window.PixelAuth.getUser();
      }
    } catch (e) {}
    return null;
  }
  function activeScope() { return lsGet(SCOPE_KEY) || 'guest'; }
  function uidOfScope(scope) {
    return (scope && scope.indexOf('u_') === 0) ? scope.slice(2) : null;
  }

  // ===== 작업 영역(게임이 쓰는 키) 읽기/쓰기/비우기 =====
  function collectWorking() {
    var bests = {};
    GAME_KEYS.forEach(function (g) {
      var raw = lsGet(bestKey(g));
      if (raw !== null && raw !== '' && raw !== 'null' && raw !== 'undefined') {
        var n = Number(raw);
        if (isFinite(n)) bests[g] = n;
      }
    });
    var count = 0;
    try { count = parseInt(lsGet(COUNT_KEY) || '0', 10) || 0; } catch (e) {}

    return {
      stats: jsonGet(STATS_KEY, null),
      badges: jsonGet(BADGE_KEY, []),
      recordCount: count,
      bests: bests
    };
  }

  function clearWorking() {
    lsRemove(STATS_KEY);
    lsRemove(BADGE_KEY);
    lsRemove(COUNT_KEY);
    GAME_KEYS.forEach(function (g) { lsRemove(bestKey(g)); });
  }

  // 항상 비운 뒤 채웁니다. 그래야 새 계정이 빈 상태로 시작합니다.
  function applyWorking(snap) {
    clearWorking();
    if (!snap) return;
    if (snap.stats) jsonSet(STATS_KEY, snap.stats);
    if (Array.isArray(snap.badges) && snap.badges.length) jsonSet(BADGE_KEY, snap.badges);
    if (snap.recordCount) lsSet(COUNT_KEY, String(snap.recordCount));
    if (snap.bests) {
      Object.keys(snap.bests).forEach(function (g) {
        var v = snap.bests[g];
        if (v !== null && v !== undefined && isFinite(v)) lsSet(bestKey(g), String(v));
      });
    }
  }

  // ===== 프로필 보관함 =====
  function cacheKey(scope) { return CACHE_PREFIX + scope; }
  function loadCache(scope) { return jsonGet(cacheKey(scope), null); }
  function saveCache(scope, snap) { jsonSet(cacheKey(scope), snap); }

  // ===== 병합 (같은 계정의 로컬 사본 ↔ 서버 기록) =====
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
      // 같은 플레이가 양쪽에 기록돼 있을 수 있으므로 합이 아닌 최댓값
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

  function mergeSnapshot(local, remote) {
    if (!remote) return local;
    if (!local) return remote;

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

  // ===== Supabase 입출력 =====
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

  function push(sb, uid, snap) {
    return sb.from(TABLE)
      .upsert({ user_id: uid, data: snap, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' })
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      });
  }

  // ===== 화면 갱신 =====
  function refreshUI() {
    try {
      // 메인 페이지의 게임별 최고기록 표시
      if (typeof window.pixelfunRefreshBests === 'function') window.pixelfunRefreshBests();
      if (window.PixelStats && document.getElementById('myStatsSection')) {
        window.PixelStats.renderInto('myStatsSection');
      }
      if (window.PixelBadge && document.getElementById('badgeSection')) {
        window.PixelBadge.renderInto('badgeSection');
      }
      // 히든 카드 해금 상태 등 배지 기반 UI 재계산
      window.dispatchEvent(new CustomEvent('profileSwitched', { detail: { scope: activeScope() } }));
      window.dispatchEvent(new CustomEvent('statsUpdated', { detail: { reason: 'profileSwitch' } }));
    } catch (e) { /* 무시 */ }
  }

  // ===== 프로필 전환 =====
  function switchScope(newScope) {
    var oldScope = activeScope();
    if (oldScope === newScope) return false;

    // 1) 쓰던 데이터를 이전 프로필 보관함에 넣기
    saveCache(oldScope, collectWorking());
    // 2) 새 프로필 데이터 꺼내오기 (없으면 빈 상태)
    applyWorking(loadCache(newScope));
    lsSet(SCOPE_KEY, newScope);

    refreshUI();
    return true;
  }

  // 로그인 계정이면 서버와 맞춥니다.
  function syncCloud(scope) {
    var sb = getClient();
    var uid = uidOfScope(scope);
    if (!sb || !uid || syncing) return Promise.resolve(false);
    syncing = true;

    var local = collectWorking();
    return pull(sb, uid)
      .then(function (remote) {
        // 도중에 프로필이 바뀌었으면 결과를 버립니다.
        if (activeScope() !== scope) return false;
        var merged = mergeSnapshot(local, remote);
        applyWorking(merged);
        saveCache(scope, merged);
        refreshUI();
        return push(sb, uid, merged);
      })
      .then(function (r) {
        syncing = false;
        try { window.dispatchEvent(new CustomEvent('cloudSynced')); } catch (e) {}
        return r;
      })
      .catch(function (err) {
        syncing = false;
        console.warn('[PixelFun] 클라우드 동기화 실패 (로컬 데이터는 그대로 유지됩니다).', err && err.message);
        return false;
      });
  }

  // 로그인/로그아웃 처리
  function onUser(user) {
    var scope = scopeOf(user);
    switchScope(scope);
    if (uidOfScope(scope)) syncCloud(scope);
  }

  // ===== 기록 변동 시 저장 =====
  function persist() {
    var scope = activeScope();
    // 현재 프로필 보관함을 최신 상태로 유지 (전환 없이 탭을 닫아도 안전)
    saveCache(scope, collectWorking());

    var sb = getClient();
    var uid = uidOfScope(scope);
    if (!sb || !uid) return;

    if (pushTimer) clearTimeout(pushTimer);
    pushScope = scope;
    pushTimer = setTimeout(function () {
      pushTimer = null;
      // 디바운스 대기 중에 계정이 바뀌었으면 올리지 않습니다.
      if (activeScope() !== pushScope) return;
      push(sb, uid, collectWorking()).catch(function (err) {
        console.warn('[PixelFun] 기록 업로드 실패.', err && err.message);
      });
    }, 1500);
  }

  // ===== 초기화 =====
  // 현재 프로필의 기록을 로컬과 서버 양쪽에서 완전히 지웁니다.
  // 서버 행을 지우지 않으면 다시 로그인할 때 그대로 돌아옵니다.
  function resetProfile() {
    var scope = activeScope();
    // 대기 중인 업로드가 지운 상태를 덮어쓰지 않도록 취소
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }

    clearWorking();
    lsRemove(cacheKey(scope));
    refreshUI();

    var sb = getClient();
    var uid = uidOfScope(scope);
    if (!sb || !uid) return Promise.resolve(true);

    return sb.from(TABLE).delete().eq('user_id', uid).then(function (res) {
      if (res.error) throw res.error;
      return true;
    }).catch(function (err) {
      console.warn('[PixelFun] 서버 기록 삭제 실패.', err && err.message);
      return false;
    });
  }

  // 이 브라우저에 남은 모든 프로필 보관함까지 비웁니다 (서버는 건드리지 않음).
  function resetAllLocal() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    clearWorking();
    try {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(lsRemove);
    } catch (e) { /* 무시 */ }
    lsRemove(SCOPE_KEY);
    refreshUI();
    return true;
  }

  function init() {
    // 저장된 세션 확인이 끝난 뒤에 판단해야 합니다.
    // (그 전에는 로그인 상태여도 잠시 로그아웃으로 보입니다)
    try {
      if (window.PixelAuth && typeof window.PixelAuth.whenReady === 'function') {
        window.PixelAuth.whenReady(function (user) {
          onUser(user);
          window.addEventListener('authChange', function (e) {
            onUser(e && e.detail ? e.detail.user : null);
          });
        });
      } else {
        onUser(null);
      }
    } catch (e) { /* 무시 */ }

    try {
      window.addEventListener('statsUpdated', function (e) {
        // 프로필 전환 때문에 발생한 이벤트는 무시 (되돌아 저장할 필요 없음)
        if (e && e.detail && e.detail.reason === 'profileSwitch') return;
        persist();
      });
      window.addEventListener('gameComplete', persist);
    } catch (e) { /* 무시 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PixelCloud = {
    sync: function () { return syncCloud(activeScope()); },
    persist: persist,
    resetProfile: resetProfile,
    resetAllLocal: resetAllLocal,
    getScope: activeScope,
    collect: collectWorking,
    mergeSnapshot: mergeSnapshot
  };
})();
