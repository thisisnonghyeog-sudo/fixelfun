/**
 * PixelFun 인증 모듈 (Auth)
 * - 닉네임 + 비밀번호 로그인 / 회원가입 (Supabase Auth)
 * - Supabase 미설정 시 게스트 모드로 폴백
 * - 헤더의 #loginBtn 자동 바인딩 + 로그인 모달 동적 생성
 * - 글로벌: window.PixelAuth
 *
 * ▸ 닉네임 → 내부 이메일 변환
 *   Supabase Auth는 이메일(또는 전화번호)이 반드시 필요합니다.
 *   그래서 닉네임을 SHA-256으로 해시해 `u<hash>@pixelfun.local` 이라는
 *   내부 전용 주소를 만들어 씁니다. 사용자에게는 노출되지 않고 메일도 오가지 않습니다.
 *   같은 닉네임 → 항상 같은 주소이므로 로그인 시 다시 계산해 찾아갑니다.
 *   ⚠️ Supabase 대시보드에서 "Confirm email"을 반드시 꺼야 합니다 (SETUP.md 참고).
 */
(function () {
  'use strict';

  var EMAIL_DOMAIN = '@pixelfun.local';
  var NICK_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;
  var PW_MIN = 6;

  // localStorage 안전 래퍼
  var memStore = {};
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return memStore[k] || null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { memStore[k] = v; } }
  function lsRemove(k) { try { localStorage.removeItem(k); } catch (e) { delete memStore[k]; } }

  // 다국어 헬퍼 (i18n.js 없을 때도 안전)
  function tr(key, vars) {
    try {
      if (typeof window.t === 'function') return window.t(key, vars);
    } catch (e) { /* 무시 */ }
    // 폴백 한국어
    var fb = {
      'auth.login': '로그인', 'auth.logout': '로그아웃', 'auth.signup': '회원가입',
      'auth.password': '비밀번호', 'auth.passwordConfirm': '비밀번호 확인',
      'auth.guestStart': '게스트로 시작',
      'auth.nickname': '닉네임', 'auth.welcome': '환영합니다, {name}님!',
      'auth.loginFailed': '로그인 실패', 'auth.signupFailed': '회원가입 실패',
      'auth.guestModeOnly': '게스트 모드만 사용 가능합니다',
      'auth.passwordPlaceholder': '비밀번호 (6자 이상)',
      'auth.passwordConfirmPlaceholder': '비밀번호를 한 번 더 입력하세요',
      'auth.nicknamePlaceholder': '닉네임 (2~12자)',
      'auth.or': '또는', 'auth.close': '닫기',
      'auth.checkDuplicate': '중복확인',
      'auth.checking': '확인 중...',
      'auth.nickAvailable': '사용 가능한 닉네임입니다',
      'auth.nickTaken': '이미 사용 중인 닉네임입니다',
      'auth.nickInvalid': '닉네임은 한글/영문/숫자/밑줄 2~12자여야 합니다',
      'auth.nickCheckFailed': '중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요',
      'auth.nickCheckRequired': '닉네임 중복확인을 먼저 해주세요',
      'auth.pwTooShort': '비밀번호는 6자 이상이어야 합니다',
      'auth.pwMismatch': '비밀번호가 일치하지 않습니다',
      'auth.signupSuccess': '회원가입 성공! 자동 로그인됩니다',
      'auth.logoutSuccess': '로그아웃되었습니다',
      'auth.guestWelcome': '게스트 모드로 시작합니다',
      'auth.loading': '처리 중...',
      'auth.insecureContext': 'HTTPS 또는 localhost 에서만 로그인할 수 있습니다'
    };
    var s = fb[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  var listeners = [];
  var currentUser = null;

  // 저장된 세션 확인이 끝났음을 알리는 신호.
  // cloud-sync.js가 프로필을 전환하기 전에 이걸 기다립니다.
  // (기다리지 않으면 세션 복원 직전의 "로그아웃 상태"를 보고 잘못 전환합니다)
  var readyResolve;
  var readyPromise = new Promise(function (res) { readyResolve = res; });
  var readyDone = false;
  function markReady() {
    if (readyDone) return;
    readyDone = true;
    try { readyResolve(currentUser); } catch (e) { /* 무시 */ }
  }
  function whenReady(cb) {
    readyPromise.then(function () {
      try { cb(currentUser); } catch (e) { /* 무시 */ }
    });
  }

  // Supabase 가용성 체크
  function getClient() {
    try { return window.sb || null; } catch (e) { return null; }
  }
  function hasCloud() { return getClient() != null; }

  // SHA-256은 보안 컨텍스트(HTTPS/localhost)에서만 제공됩니다.
  function canHash() {
    try {
      return !!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function');
    } catch (e) { return false; }
  }
  function cloudReady() { return hasCloud() && canHash(); }

  // ===== 닉네임 처리 =====
  function normalizeNick(nick) {
    var s = String(nick == null ? '' : nick).trim();
    try { s = s.normalize('NFC'); } catch (e) { /* 구형 브라우저 무시 */ }
    return s;
  }
  function isValidNick(nick) {
    return NICK_RE.test(normalizeNick(nick));
  }

  // 닉네임 → 내부 전용 이메일 (대소문자 무시, 결정적)
  function emailForNick(nick) {
    var norm = normalizeNick(nick).toLowerCase();
    var bytes = new TextEncoder().encode(norm);
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
      // 이메일 local part 길이 제한(64자)을 넘지 않도록 앞 40자만 사용
      return 'u' + hex.slice(0, 40) + EMAIL_DOMAIN;
    });
  }

  // Supabase user 객체 → 내부 표준 형태
  function toInfo(u) {
    if (!u) return null;
    var meta = u.user_metadata || {};
    return {
      uid: u.id,
      displayName: meta.nickname || 'user',
      isGuest: false
    };
  }

  // 사용자 상태 알림
  function notify() {
    try {
      listeners.forEach(function (cb) {
        try { cb(currentUser); } catch (e) { /* 무시 */ }
      });
      window.dispatchEvent(new CustomEvent('authChange', { detail: { user: currentUser } }));
      updateHeaderUI();
    } catch (e) { /* 무시 */ }
  }

  function setUser(u) { currentUser = u; notify(); }
  function getUser() { return currentUser; }

  // 페이지 로드 시 게스트 정보 복원
  function restoreGuest() {
    try {
      var raw = lsGet('pixelfun_user');
      if (!raw) return;
      var u = JSON.parse(raw);
      if (u && u.isGuest) currentUser = u;
    } catch (e) { /* 무시 */ }
  }

  // Supabase 에러 메시지 → 사용자용 한국어
  function errMsg(error) {
    if (!error) return '';
    var m = error.message || String(error);
    if (/Invalid login credentials/i.test(m)) return '닉네임 또는 비밀번호가 올바르지 않습니다';
    if (/User already registered/i.test(m)) return tr('auth.nickTaken');
    // 프로필 트리거의 unique 제약 위반은 GoTrue가 이 메시지로 감싸서 돌려줍니다.
    if (/Database error saving new user/i.test(m)) return tr('auth.nickTaken');
    if (/duplicate key|already exists/i.test(m)) return tr('auth.nickTaken');
    if (/Password should be at least/i.test(m)) return tr('auth.pwTooShort');
    if (/Email not confirmed/i.test(m)) {
      return '이메일 확인 설정이 켜져 있습니다. Supabase → Authentication → Providers → Email 에서 "Confirm email"을 꺼주세요';
    }
    if (/signups? (are )?disabled/i.test(m)) return '회원가입이 비활성화되어 있습니다 (Supabase 설정 확인)';
    return m;
  }

  // ===== 닉네임 중복 확인 =====
  // 반환: { ok: true|false, reason: 'available'|'taken'|'invalid'|'error'|'offline' }
  function checkNickname(nick) {
    if (!isValidNick(nick)) {
      return Promise.resolve({ ok: false, reason: 'invalid' });
    }
    var sb = getClient();
    if (!sb) return Promise.resolve({ ok: false, reason: 'offline' });

    return sb.rpc('nickname_exists', { p_nick: normalizeNick(nick) })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data
          ? { ok: false, reason: 'taken' }
          : { ok: true, reason: 'available' };
      })
      .catch(function (err) {
        console.warn('[PixelFun] 닉네임 중복 확인 실패.', err && err.message);
        return { ok: false, reason: 'error' };
      });
  }

  // ===== 회원가입 =====
  function signupWithNickname(nick, password) {
    var sb = getClient();
    if (!sb) return Promise.reject(new Error(tr('auth.guestModeOnly')));
    if (!canHash()) return Promise.reject(new Error(tr('auth.insecureContext')));
    if (!isValidNick(nick)) return Promise.reject(new Error(tr('auth.nickInvalid')));
    if (String(password || '').length < PW_MIN) return Promise.reject(new Error(tr('auth.pwTooShort')));

    var name = normalizeNick(nick);
    return emailForNick(name).then(function (email) {
      return sb.auth.signUp({
        email: email,
        password: String(password),
        options: { data: { nickname: name } }
      });
    }).then(function (res) {
      if (res.error) throw new Error(errMsg(res.error));
      var data = res.data || {};
      // Confirm email이 켜져 있으면 세션이 없습니다 → 이 방식에서는 확인 메일을 받을 수 없음
      if (!data.session) {
        throw new Error('Supabase의 "Confirm email" 설정을 꺼주세요. 닉네임 로그인은 실제 메일 주소를 쓰지 않습니다');
      }
      var info = toInfo(data.user);
      if (info) {
        lsSet('pixelfun_user', JSON.stringify(info));
        lsSet('pixelfun_guest_name', info.displayName);
        setUser(info);
      }
      return info;
    });
  }

  // ===== 로그인 =====
  function loginWithNickname(nick, password) {
    var sb = getClient();
    if (!sb) return Promise.reject(new Error(tr('auth.guestModeOnly')));
    if (!canHash()) return Promise.reject(new Error(tr('auth.insecureContext')));
    if (!normalizeNick(nick)) return Promise.reject(new Error(tr('auth.nickInvalid')));

    return emailForNick(nick).then(function (email) {
      return sb.auth.signInWithPassword({ email: email, password: String(password || '') });
    }).then(function (res) {
      if (res.error) throw new Error(errMsg(res.error));
      var info = toInfo(res.data && res.data.user);
      if (info) {
        lsSet('pixelfun_user', JSON.stringify(info));
        lsSet('pixelfun_guest_name', info.displayName);
        setUser(info);
      }
      return info;
    });
  }

  // 게스트 로그인 (즉시 처리)
  function loginAsGuest(nickname) {
    try {
      var nick = normalizeNick(nickname) || 'Guest' + Math.floor(Math.random() * 1000);
      var info = {
        uid: 'guest_' + Date.now(),
        displayName: nick,
        isGuest: true
      };
      lsSet('pixelfun_user', JSON.stringify(info));
      lsSet('pixelfun_guest_name', nick);
      setUser(info);
      showToast(tr('auth.guestWelcome'));
      return info;
    } catch (e) {
      return null;
    }
  }

  // 로그아웃
  function logout() {
    var sb = getClient();
    function clear() {
      lsRemove('pixelfun_user');
      setUser(null);
      showToast(tr('auth.logoutSuccess'));
    }
    if (sb && currentUser && !currentUser.isGuest) {
      return sb.auth.signOut().then(clear).catch(function () { clear(); });
    }
    clear();
    return Promise.resolve();
  }

  // 리스너 등록
  function onChange(cb) {
    if (typeof cb === 'function') {
      listeners.push(cb);
      try { cb(currentUser); } catch (e) { /* 무시 */ }
    }
    return function unsub() {
      var idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  // ===== UI: 스타일 주입 =====
  function injectStyles() {
    if (document.getElementById('pixelauth-styles')) return;
    try {
      var s = document.createElement('style');
      s.id = 'pixelauth-styles';
      s.textContent = [
        '.pa-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;animation:paFade .25s ease;}',
        '@keyframes paFade{from{opacity:0}to{opacity:1}}',
        '.pa-modal{background:var(--bg-card,#1a1a2e);color:var(--text-primary,#fff);border:2px solid var(--neon-purple,#7b2ff7);border-radius:12px;padding:28px;width:90%;max-width:380px;box-shadow:0 0 30px rgba(123,47,247,.5);font-family:"Noto Sans KR",sans-serif;}',
        '.pa-modal h2{font-family:"Press Start 2P",monospace;font-size:14px;margin:0 0 18px;color:var(--neon-blue,#00d4ff);text-align:center;}',
        '.pa-modal input{width:100%;box-sizing:border-box;padding:10px 12px;margin:6px 0;background:var(--bg-main,#0a0a1a);border:1px solid #333;border-radius:8px;color:var(--text-primary,#fff);font-family:inherit;font-size:14px;transition:all .3s ease;}',
        '.pa-modal input:focus{outline:none;border-color:var(--neon-blue,#00d4ff);box-shadow:0 0 8px rgba(0,212,255,.4);}',
        '.pa-tabs{display:flex;gap:6px;margin-bottom:14px;}',
        '.pa-tab{flex:1;padding:9px 0;background:transparent;border:1px solid #333;border-radius:8px;color:var(--text-secondary,#a0a0b0);cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;transition:all .3s ease;}',
        '.pa-tab.active{border-color:var(--neon-purple,#7b2ff7);color:var(--text-primary,#fff);background:rgba(123,47,247,.18);}',
        '.pa-nick-row{display:flex;gap:6px;align-items:center;}',
        '.pa-nick-row input{flex:1;}',
        '.pa-check-btn{flex:0 0 auto;padding:10px 12px;white-space:nowrap;background:transparent;border:1px solid var(--neon-blue,#00d4ff);border-radius:8px;color:var(--neon-blue,#00d4ff);cursor:pointer;font-family:inherit;font-size:13px;transition:all .3s ease;}',
        '.pa-check-btn:hover:not(:disabled){background:rgba(0,212,255,.12);}',
        '.pa-check-btn:disabled{opacity:.5;cursor:not-allowed;}',
        '.pa-hint{min-height:16px;margin:2px 0 4px;font-size:12px;color:var(--text-secondary,#a0a0b0);}',
        '.pa-hint.ok{color:var(--neon-green,#00ff88);}',
        '.pa-hint.bad{color:var(--neon-red,#ff4757);}',
        '.pa-btn{display:block;width:100%;padding:10px;margin:6px 0;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;transition:all .3s ease;}',
        '.pa-btn:disabled{opacity:.5;cursor:not-allowed;}',
        '.pa-btn-primary{background:var(--neon-purple,#7b2ff7);color:#fff;}',
        '.pa-btn-primary:hover:not(:disabled){background:#9450ff;box-shadow:0 0 14px rgba(123,47,247,.6);}',
        '.pa-btn-guest{background:var(--neon-yellow,#ffd700);color:#0a0a1a;}',
        '.pa-btn-guest:hover:not(:disabled){background:#ffe44d;}',
        '.pa-divider{display:flex;align-items:center;margin:14px 0;color:var(--text-secondary,#a0a0b0);font-size:12px;}',
        '.pa-divider::before,.pa-divider::after{content:"";flex:1;height:1px;background:#333;}',
        '.pa-divider span{padding:0 10px;}',
        '.pa-msg{min-height:18px;margin:4px 0;font-size:12px;text-align:center;color:var(--neon-red,#ff4757);}',
        '.pa-msg.ok{color:var(--neon-green,#00ff88);}',
        '.pa-close{background:none;border:none;color:var(--text-secondary,#a0a0b0);float:right;font-size:18px;cursor:pointer;line-height:1;margin-top:-8px;margin-right:-8px;}',
        '.pa-warn{background:rgba(255,71,87,.1);border:1px solid var(--neon-red,#ff4757);color:var(--neon-red,#ff4757);padding:8px;border-radius:6px;font-size:12px;margin-bottom:10px;text-align:center;}',
        '.pa-toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--bg-card,#1a1a2e);color:var(--text-primary,#fff);border:1px solid var(--neon-purple,#7b2ff7);padding:12px 22px;border-radius:8px;z-index:10000;box-shadow:0 0 16px rgba(123,47,247,.4);font-family:"Noto Sans KR",sans-serif;font-size:14px;animation:paToast .35s ease;}',
        '@keyframes paToast{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}',
        '.pa-dropdown{position:absolute;background:var(--bg-card,#1a1a2e);border:1px solid var(--neon-purple,#7b2ff7);border-radius:8px;padding:6px;min-width:140px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.5);}',
        '.pa-dropdown .pa-dd-info{padding:6px 12px;font-size:12px;color:var(--text-secondary,#a0a0b0);border-bottom:1px solid #333;margin-bottom:4px;word-break:break-all;}',
        '.pa-dropdown button{width:100%;padding:8px 12px;background:none;border:none;color:var(--text-primary,#fff);text-align:left;cursor:pointer;border-radius:6px;font-family:inherit;font-size:13px;}',
        '.pa-dropdown button:hover{background:var(--bg-hover,#16213e);}'
      ].join('\n');
      document.head.appendChild(s);
    } catch (e) { /* 무시 */ }
  }

  // ===== Toast =====
  function showToast(msg) {
    try {
      injectStyles();
      var t = document.createElement('div');
      t.className = 'pa-toast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (e) { } }, 2400);
    } catch (e) { /* 무시 */ }
  }

  // ===== 로그인 / 회원가입 모달 =====
  function buildModal() {
    injectStyles();

    var ready = cloudReady();
    var mode = 'login'; // 'login' | 'signup'

    var bg = document.createElement('div');
    bg.className = 'pa-modal-bg';
    bg.id = 'paModal';

    var box = document.createElement('div');
    box.className = 'pa-modal';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'pa-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = tr('auth.close');
    closeBtn.addEventListener('click', closeModal);

    var h2 = document.createElement('h2');
    h2.textContent = 'PixelFun';

    // 탭
    var tabs = document.createElement('div');
    tabs.className = 'pa-tabs';
    var loginTab = document.createElement('button');
    loginTab.className = 'pa-tab active';
    loginTab.textContent = tr('auth.login');
    var signupTab = document.createElement('button');
    signupTab.className = 'pa-tab';
    signupTab.textContent = tr('auth.signup');
    tabs.appendChild(loginTab);
    tabs.appendChild(signupTab);

    box.appendChild(closeBtn);
    box.appendChild(h2);

    if (!hasCloud()) {
      var warn = document.createElement('div');
      warn.className = 'pa-warn';
      warn.textContent = tr('auth.guestModeOnly');
      box.appendChild(warn);
    } else if (!canHash()) {
      var warn2 = document.createElement('div');
      warn2.className = 'pa-warn';
      warn2.textContent = tr('auth.insecureContext');
      box.appendChild(warn2);
    }

    box.appendChild(tabs);

    // ---- 닉네임 행 (입력 + 중복확인 버튼) ----
    var nickRow = document.createElement('div');
    nickRow.className = 'pa-nick-row';
    var nickIn = document.createElement('input');
    nickIn.type = 'text';
    nickIn.maxLength = 12;
    nickIn.autocomplete = 'username';
    nickIn.placeholder = tr('auth.nicknamePlaceholder');
    nickIn.id = 'paNick';
    var checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'pa-check-btn';
    checkBtn.textContent = tr('auth.checkDuplicate');
    nickRow.appendChild(nickIn);
    nickRow.appendChild(checkBtn);

    var hint = document.createElement('div');
    hint.className = 'pa-hint';

    var pwIn = document.createElement('input');
    pwIn.type = 'password';
    pwIn.autocomplete = 'current-password';
    pwIn.placeholder = tr('auth.passwordPlaceholder');
    pwIn.id = 'paPw';

    var pw2In = document.createElement('input');
    pw2In.type = 'password';
    pw2In.autocomplete = 'new-password';
    pw2In.placeholder = tr('auth.passwordConfirmPlaceholder');
    pw2In.id = 'paPw2';

    var submitBtn = document.createElement('button');
    submitBtn.className = 'pa-btn pa-btn-primary';
    submitBtn.textContent = tr('auth.login');

    var msg = document.createElement('div');
    msg.className = 'pa-msg';
    msg.id = 'paMsg';

    var div = document.createElement('div');
    div.className = 'pa-divider';
    var sp = document.createElement('span');
    sp.textContent = tr('auth.or');
    div.appendChild(sp);

    var guestBtn = document.createElement('button');
    guestBtn.className = 'pa-btn pa-btn-guest';
    guestBtn.textContent = tr('auth.guestStart');

    box.appendChild(nickRow);
    box.appendChild(hint);
    box.appendChild(pwIn);
    box.appendChild(pw2In);
    box.appendChild(submitBtn);
    box.appendChild(msg);
    box.appendChild(div);
    box.appendChild(guestBtn);
    bg.appendChild(box);

    // ---- 상태 ----
    // 중복확인을 통과한 닉네임. 입력이 바뀌면 초기화됩니다.
    var verifiedNick = null;
    var checkTimer = null;

    function setMsg(text, ok) {
      msg.textContent = text || '';
      msg.className = 'pa-msg' + (ok ? ' ok' : '');
    }
    function setHint(text, kind) {
      hint.textContent = text || '';
      hint.className = 'pa-hint' + (kind ? ' ' + kind : '');
    }

    function applyMode() {
      var signup = (mode === 'signup');
      loginTab.className = 'pa-tab' + (signup ? '' : ' active');
      signupTab.className = 'pa-tab' + (signup ? ' active' : '');
      checkBtn.style.display = signup ? '' : 'none';
      hint.style.display = signup ? '' : 'none';
      pw2In.style.display = signup ? '' : 'none';
      pwIn.autocomplete = signup ? 'new-password' : 'current-password';
      pwIn.placeholder = tr('auth.passwordPlaceholder');
      submitBtn.textContent = signup ? tr('auth.signup') : tr('auth.login');
      submitBtn.disabled = !ready;
      checkBtn.disabled = !ready;
      setMsg('');
      setHint('');
      verifiedNick = null;
      nickIn.focus();
    }

    loginTab.addEventListener('click', function () { mode = 'login'; applyMode(); });
    signupTab.addEventListener('click', function () { mode = 'signup'; applyMode(); });

    // ---- 닉네임 중복 확인 ----
    function runCheck() {
      var nick = normalizeNick(nickIn.value);
      verifiedNick = null;
      if (!nick) { setHint(''); return Promise.resolve(false); }
      if (!isValidNick(nick)) {
        setHint(tr('auth.nickInvalid'), 'bad');
        return Promise.resolve(false);
      }
      setHint(tr('auth.checking'));
      checkBtn.disabled = true;
      return checkNickname(nick).then(function (r) {
        checkBtn.disabled = !ready;
        // 확인하는 사이에 입력이 바뀌었으면 결과를 버립니다.
        if (normalizeNick(nickIn.value) !== nick) return false;
        if (r.ok) {
          verifiedNick = nick;
          setHint(tr('auth.nickAvailable'), 'ok');
          return true;
        }
        if (r.reason === 'taken') setHint(tr('auth.nickTaken'), 'bad');
        else if (r.reason === 'invalid') setHint(tr('auth.nickInvalid'), 'bad');
        else setHint(tr('auth.nickCheckFailed'), 'bad');
        return false;
      });
    }

    checkBtn.addEventListener('click', function () { runCheck(); });

    nickIn.addEventListener('input', function () {
      verifiedNick = null;
      if (mode !== 'signup') return;
      setHint('');
      if (checkTimer) clearTimeout(checkTimer);
      // 입력을 멈추면 자동으로 한 번 확인해 줍니다.
      checkTimer = setTimeout(function () { runCheck(); }, 600);
    });

    // ---- 제출 ----
    function busy(on) {
      submitBtn.disabled = !!on || !ready;
      checkBtn.disabled = !!on || !ready;
    }
    function fail(prefixKey) {
      return function (err) {
        busy(false);
        setMsg(tr(prefixKey) + ': ' + (err && err.message ? err.message : ''));
      };
    }

    function doLogin() {
      setMsg(tr('auth.loading'), true);
      busy(true);
      loginWithNickname(nickIn.value, pwIn.value)
        .then(function () {
          busy(false);
          closeModal();
          showToast(tr('auth.welcome', { name: getUser() ? getUser().displayName : '' }));
        })
        .catch(fail('auth.loginFailed'));
    }

    function doSignup() {
      var nick = normalizeNick(nickIn.value);
      if (!isValidNick(nick)) { setHint(tr('auth.nickInvalid'), 'bad'); return; }
      if (pwIn.value.length < PW_MIN) { setMsg(tr('auth.pwTooShort')); return; }
      if (pwIn.value !== pw2In.value) { setMsg(tr('auth.pwMismatch')); return; }
      if (verifiedNick !== nick) { setMsg(tr('auth.nickCheckRequired')); runCheck(); return; }

      setMsg(tr('auth.loading'), true);
      busy(true);
      signupWithNickname(nick, pwIn.value)
        .then(function () {
          busy(false);
          closeModal();
          showToast(tr('auth.signupSuccess'));
        })
        .catch(fail('auth.signupFailed'));
    }

    submitBtn.addEventListener('click', function () {
      if (mode === 'signup') doSignup(); else doLogin();
    });

    [nickIn, pwIn, pw2In].forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !submitBtn.disabled) submitBtn.click();
      });
    });

    guestBtn.addEventListener('click', function () {
      var info = loginAsGuest(nickIn.value);
      if (info) closeModal();
    });

    // 배경 클릭 시 닫기
    bg.addEventListener('click', function (e) {
      if (e.target === bg) closeModal();
    });

    applyMode();
    return bg;
  }

  function openModal() {
    try {
      closeModal();
      var modal = buildModal();
      document.body.appendChild(modal);
      var n = document.getElementById('paNick');
      if (n) n.focus();
    } catch (e) { /* 무시 */ }
  }
  function closeModal() {
    try {
      var ex = document.getElementById('paModal');
      if (ex) ex.remove();
      var dd = document.getElementById('paUserDropdown');
      if (dd) dd.remove();
    } catch (e) { /* 무시 */ }
  }

  // 사용자 드롭다운(로그아웃)
  function toggleDropdown(btn) {
    try {
      var ex = document.getElementById('paUserDropdown');
      if (ex) { ex.remove(); return; }
      injectStyles();
      var rect = btn.getBoundingClientRect();
      var dd = document.createElement('div');
      dd.id = 'paUserDropdown';
      dd.className = 'pa-dropdown';
      dd.style.top = (rect.bottom + window.scrollY + 6) + 'px';
      dd.style.left = (rect.left + window.scrollX) + 'px';

      if (currentUser) {
        var info = document.createElement('div');
        info.className = 'pa-dd-info';
        info.textContent = currentUser.displayName + (currentUser.isGuest ? ' (게스트)' : '');
        dd.appendChild(info);
      }

      // 기록 초기화는 화면에 노출하지 않습니다.
      // 필요하면 콘솔에서 PixelCloud.resetProfile() 을 호출하세요 (SETUP.md 참고).
      var out = document.createElement('button');
      out.textContent = tr('auth.logout');
      out.addEventListener('click', function () { logout(); dd.remove(); });
      dd.appendChild(out);

      document.body.appendChild(dd);
      // 외부 클릭 시 닫기
      setTimeout(function () {
        document.addEventListener('click', function onDoc(e) {
          if (!dd.contains(e.target) && e.target !== btn) {
            try { dd.remove(); } catch (er) { }
            document.removeEventListener('click', onDoc);
          }
        });
      }, 10);
    } catch (e) { /* 무시 */ }
  }

  // 헤더 UI 업데이트
  function updateHeaderUI() {
    try {
      var btn = document.getElementById('loginBtn');
      if (!btn) return;
      if (currentUser) {
        btn.textContent = currentUser.displayName + (currentUser.isGuest ? ' (Guest)' : '');
      } else {
        btn.textContent = tr('auth.login');
      }
    } catch (e) { /* 무시 */ }
  }

  function bindLoginBtn() {
    try {
      var btn = document.getElementById('loginBtn');
      if (!btn || btn._paBound) return;
      btn._paBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (currentUser) {
          toggleDropdown(btn);
        } else {
          openModal();
        }
      });
    } catch (e) { /* 무시 */ }
  }

  // Supabase 세션 복원 + 상태 동기화
  function syncSupabase() {
    var sb = getClient();
    if (!sb) { markReady(); return; }
    try {
      sb.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (session && session.user) {
          var info = toInfo(session.user);
          lsSet('pixelfun_user', JSON.stringify(info));
          setUser(info);
        }
      }).catch(function () { /* 무시 */ })
        .then(markReady);
      // getSession이 응답하지 않아도 무한정 막히지 않도록 안전장치
      setTimeout(markReady, 5000);

      sb.auth.onAuthStateChange(function (event, session) {
        try {
          if (session && session.user) {
            var info = toInfo(session.user);
            lsSet('pixelfun_user', JSON.stringify(info));
            setUser(info);
          } else if (event === 'SIGNED_OUT') {
            if (currentUser && !currentUser.isGuest) {
              lsRemove('pixelfun_user');
              setUser(null);
            }
          }
        } catch (e) { /* 무시 */ }
      });
    } catch (e) { markReady(); }
  }

  function init() {
    restoreGuest();
    bindLoginBtn();
    updateHeaderUI();
    syncSupabase();
    notify();
    // 언어 변경 시 헤더 다시 그리기
    window.addEventListener('langChange', updateHeaderUI);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 글로벌 노출
  window.PixelAuth = {
    loginWithNickname: loginWithNickname,
    signupWithNickname: signupWithNickname,
    checkNickname: checkNickname,
    isValidNick: isValidNick,
    loginAsGuest: loginAsGuest,
    logout: logout,
    getUser: getUser,
    onChange: onChange,
    openModal: openModal,
    closeModal: closeModal,
    hasCloud: hasCloud,
    ready: readyPromise,
    whenReady: whenReady
  };
})();
