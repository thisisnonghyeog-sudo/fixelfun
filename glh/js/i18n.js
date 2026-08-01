/**
 * PixelFun 다국어 모듈 (i18n)
 * - 한국어/영어 사전을 fetch로 로드, 실패 시 인라인 폴백 사용
 * - data-i18n 속성 가진 DOM 요소를 자동 갱신
 */
(function () {
  'use strict';

  // localStorage 안전 래퍼 (실패 시 메모리 폴백)
  var memStore = {};
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return memStore[key] || null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { memStore[key] = val; }
  }

  // 인라인 폴백 사전 (fetch 실패 대비)
  var FALLBACK = {
    ko: {
      brand: { name: 'PIXELFUN', slogan: '두뇌를 깨우는 미니게임 모음' },
      nav: { home: '홈으로', ranking: '랭킹', mypage: '마이페이지', badges: '배지' },
      auth: {
        login: '로그인', logout: '로그아웃', signup: '회원가입',
        email: '이메일', password: '비밀번호',
        googleLogin: '구글로 로그인', guestStart: '게스트로 시작',
        nickname: '닉네임', welcome: '환영합니다, {name}님!',
        loginFailed: '로그인 실패', guestModeOnly: '게스트 모드만 사용 가능합니다',
        emailPlaceholder: '이메일을 입력하세요',
        passwordPlaceholder: '비밀번호를 입력하세요',
        nicknamePlaceholder: '닉네임을 입력하세요',
        or: '또는', close: '닫기',
        signupSuccess: '회원가입 성공! 자동 로그인됩니다',
        logoutSuccess: '로그아웃되었습니다',
        guestWelcome: '게스트 모드로 시작합니다'
      },
      game: {
        start: '게임 시작', retry: '다시하기', result: '결과',
        score: '점수', best: '최고기록', newRecord: '신기록!',
        time: '시간', combo: '콤보', grade: '등급',
        playing: '플레이 중...', gameOver: '게임 종료'
      },
      games: {
        number: { name: '숫자 맞추기', desc: '1~100 사이 숫자를 맞춰보세요' },
        memory: { name: '카드 뒤집기', desc: '같은 카드 짝을 찾으세요' },
        typing: { name: '타이핑 게임', desc: '60초 동안 빠르게 타이핑' },
        math: { name: '암산 챌린지', desc: '60초 동안 암산 풀기' },
        quiz: { name: 'OX 퀴즈', desc: '상식 OX 퀴즈' },
        color: { name: '색깔 맞추기', desc: '스트룹 효과 도전' }
      },
      stats: { title: '내 통계', totalPlays: '총 플레이', firstPlay: '첫 플레이', lastPlay: '최근 플레이', reset: '초기화' },
      ranking: { title: '리더보드', rank: '순위', player: '플레이어', score: '점수', noData: '기록이 없습니다', selectGame: '게임 선택' },
      badge: { title: '배지', owned: '획득', locked: '미획득', newBadge: '🎉 새 배지 획득: {name}' },
      sound: { on: '사운드 켜짐', off: '사운드 꺼짐' },
      footer: { copy: '© 2026 PixelFun. All rights reserved.' }
    },
    en: {
      brand: { name: 'PIXELFUN', slogan: 'Mini Games That Wake Up Your Brain' },
      nav: { home: 'Home', ranking: 'Ranking', mypage: 'My Page', badges: 'Badges' },
      auth: {
        login: 'Login', logout: 'Logout', signup: 'Sign Up',
        email: 'Email', password: 'Password',
        googleLogin: 'Login with Google', guestStart: 'Start as Guest',
        nickname: 'Nickname', welcome: 'Welcome, {name}!',
        loginFailed: 'Login failed', guestModeOnly: 'Guest mode only available',
        emailPlaceholder: 'Enter your email',
        passwordPlaceholder: 'Enter your password',
        nicknamePlaceholder: 'Enter a nickname',
        or: 'or', close: 'Close',
        signupSuccess: 'Sign up successful! Logging in automatically',
        logoutSuccess: 'Logged out successfully',
        guestWelcome: 'Starting in guest mode'
      },
      game: {
        start: 'Start Game', retry: 'Retry', result: 'Result',
        score: 'Score', best: 'Best', newRecord: 'New Record!',
        time: 'Time', combo: 'Combo', grade: 'Grade',
        playing: 'Playing...', gameOver: 'Game Over'
      },
      games: {
        number: { name: 'Number Guess', desc: 'Guess a number between 1 and 100' },
        memory: { name: 'Memory Cards', desc: 'Find matching card pairs' },
        typing: { name: 'Typing Game', desc: 'Type fast for 60 seconds' },
        math: { name: 'Math Challenge', desc: 'Solve math in 60 seconds' },
        quiz: { name: 'OX Quiz', desc: 'True or false trivia' },
        color: { name: 'Color Match', desc: 'Stroop effect challenge' }
      },
      stats: { title: 'My Stats', totalPlays: 'Total Plays', firstPlay: 'First Play', lastPlay: 'Last Play', reset: 'Reset' },
      ranking: { title: 'Leaderboard', rank: 'Rank', player: 'Player', score: 'Score', noData: 'No records yet', selectGame: 'Select Game' },
      badge: { title: 'Badges', owned: 'Owned', locked: 'Locked', newBadge: '🎉 New Badge: {name}' },
      sound: { on: 'Sound On', off: 'Sound Off' },
      footer: { copy: '© 2026 PixelFun. All rights reserved.' }
    }
  };

  var dict = { ko: FALLBACK.ko, en: FALLBACK.en };
  var currentLang = lsGet('pixelfun_lang') || 'ko';
  if (currentLang !== 'ko' && currentLang !== 'en') currentLang = 'ko';

  // 점 표기법 키 조회 ('a.b.c')
  function getByPath(obj, path) {
    try {
      var parts = path.split('.');
      var cur = obj;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null) return null;
        cur = cur[parts[i]];
      }
      return cur;
    } catch (e) { return null; }
  }

  // 변수 치환: "{name}" → vars.name
  function interpolate(str, vars) {
    if (typeof str !== 'string' || !vars) return str;
    try {
      return str.replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] != null ? vars[k] : m;
      });
    } catch (e) { return str; }
  }

  // 핵심 번역 함수
  function t(key, vars) {
    try {
      var val = getByPath(dict[currentLang], key);
      if (val == null) val = getByPath(dict.ko, key); // 한국어 폴백
      if (val == null) return key; // 키 자체 반환
      return interpolate(val, vars);
    } catch (e) {
      return key;
    }
  }

  // DOM 일괄 갱신
  function apply() {
    try {
      // textContent 갱신
      var els = document.querySelectorAll('[data-i18n]');
      els.forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (!key) return;
        var v = t(key);
        if (typeof v === 'string') el.textContent = v;
      });
      // 속성 갱신: data-i18n-attr="placeholder:auth.email"
      var attrEls = document.querySelectorAll('[data-i18n-attr]');
      attrEls.forEach(function (el) {
        var spec = el.getAttribute('data-i18n-attr') || '';
        var pairs = spec.split(',');
        pairs.forEach(function (pair) {
          var idx = pair.indexOf(':');
          if (idx < 0) return;
          var attr = pair.slice(0, idx).trim();
          var key = pair.slice(idx + 1).trim();
          if (attr && key) el.setAttribute(attr, t(key));
        });
      });
      // html lang 속성 동기화
      if (document.documentElement) document.documentElement.lang = currentLang;
      // 토글 버튼 아이콘 업데이트
      var btn = document.getElementById('langToggleBtn');
      if (btn) btn.textContent = currentLang === 'ko' ? '🇰🇷 KO' : '🇺🇸 EN';
    } catch (e) { /* 무시 */ }
  }

  function setLang(lang) {
    if (lang !== 'ko' && lang !== 'en') return;
    currentLang = lang;
    lsSet('pixelfun_lang', lang);
    apply();
    try {
      window.dispatchEvent(new CustomEvent('langChange', { detail: { lang: lang } }));
    } catch (e) { /* 무시 */ }
  }

  function getLang() { return currentLang; }

  // lang/*.json fetch (페이지 위치에 따라 경로 두 번 시도)
  function loadDict(lang) {
    var paths = ['./lang/' + lang + '.json', '../lang/' + lang + '.json', 'lang/' + lang + '.json'];
    var i = 0;
    function tryNext() {
      if (i >= paths.length) return Promise.resolve(null);
      var p = paths[i++];
      return fetch(p).then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      }).catch(function () {
        return tryNext();
      });
    }
    return tryNext();
  }

  function init() {
    // 두 사전 모두 로드 시도
    Promise.all([loadDict('ko'), loadDict('en')]).then(function (results) {
      if (results[0]) dict.ko = results[0];
      if (results[1]) dict.en = results[1];
    }).catch(function () { /* 폴백 유지 */ })
      .then(function () {
        apply();
        bindToggle();
      });
  }

  function bindToggle() {
    try {
      var btn = document.getElementById('langToggleBtn');
      if (btn && !btn._i18nBound) {
        btn._i18nBound = true;
        btn.addEventListener('click', function () {
          setLang(currentLang === 'ko' ? 'en' : 'ko');
        });
      }
    } catch (e) { /* 무시 */ }
  }

  // DOM 준비 완료 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 글로벌 노출
  window.t = t;
  window.PixelI18n = {
    t: t,
    setLang: setLang,
    getLang: getLang,
    apply: apply
  };
})();
