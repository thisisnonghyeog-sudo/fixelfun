/**
 * PixelFun 인증 모듈 (Auth)
 * - Supabase Auth가 설정돼 있으면 사용, 없으면 게스트 모드 폴백
 * - 헤더의 #loginBtn 자동 바인딩 + 로그인 모달 동적 생성
 * - 글로벌: window.PixelAuth
 */
(function () {
  'use strict';

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
      'auth.email': '이메일', 'auth.password': '비밀번호',
      'auth.googleLogin': '구글로 로그인', 'auth.guestStart': '게스트로 시작',
      'auth.nickname': '닉네임', 'auth.welcome': '환영합니다, {name}님!',
      'auth.loginFailed': '로그인 실패', 'auth.guestModeOnly': '게스트 모드만 사용 가능합니다',
      'auth.emailPlaceholder': '이메일을 입력하세요',
      'auth.passwordPlaceholder': '비밀번호를 입력하세요 (6자 이상)',
      'auth.nicknamePlaceholder': '닉네임 (회원가입/게스트 공용)',
      'auth.or': '또는', 'auth.close': '닫기',
      'auth.signupSuccess': '회원가입 성공! 자동 로그인됩니다',
      'auth.confirmEmail': '가입 확인 메일을 보냈습니다. 메일함을 확인해 주세요',
      'auth.logoutSuccess': '로그아웃되었습니다',
      'auth.guestWelcome': '게스트 모드로 시작합니다',
      'auth.loading': '처리 중...'
    };
    var s = fb[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  var listeners = [];
  var currentUser = null;

  // Supabase 가용성 체크
  function getClient() {
    try { return window.sb || null; } catch (e) { return null; }
  }
  function hasCloud() { return getClient() != null; }

  // Supabase user 객체 → 내부 표준 형태
  function toInfo(u) {
    if (!u) return null;
    var meta = u.user_metadata || {};
    var name = meta.nickname || meta.full_name || meta.name ||
               (u.email ? String(u.email).split('@')[0] : 'user');
    return {
      uid: u.id,
      displayName: name,
      email: u.email || '',
      avatar: meta.avatar_url || '',
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

  // Supabase 에러 메시지 정리
  function errMsg(error) {
    if (!error) return '';
    var m = error.message || String(error);
    if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다';
    if (/Email not confirmed/i.test(m)) return '이메일 인증이 완료되지 않았습니다';
    if (/User already registered/i.test(m)) return '이미 가입된 이메일입니다';
    if (/Password should be at least/i.test(m)) return '비밀번호는 6자 이상이어야 합니다';
    if (/valid email/i.test(m)) return '올바른 이메일 형식이 아닙니다';
    return m;
  }

  // 이메일 로그인
  function loginWithEmail(email, password) {
    var sb = getClient();
    if (!sb) return Promise.reject(new Error(tr('auth.guestModeOnly')));
    return sb.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || '')
    }).then(function (res) {
      if (res.error) throw new Error(errMsg(res.error));
      var info = toInfo(res.data && res.data.user);
      if (info) {
        lsSet('pixelfun_user', JSON.stringify(info));
        setUser(info);
      }
      return info;
    });
  }

  // 회원가입 (닉네임은 user_metadata.nickname 에 저장)
  function signupWithEmail(email, password, nickname) {
    var sb = getClient();
    if (!sb) return Promise.reject(new Error(tr('auth.guestModeOnly')));
    var nick = (nickname && String(nickname).trim()) || String(email || '').split('@')[0];
    return sb.auth.signUp({
      email: String(email || '').trim(),
      password: String(password || ''),
      options: { data: { nickname: nick } }
    }).then(function (res) {
      if (res.error) throw new Error(errMsg(res.error));
      var data = res.data || {};
      // 이메일 확인이 켜져 있으면 session이 null로 돌아옵니다.
      if (!data.session) return { needsConfirm: true };
      var info = toInfo(data.user);
      if (info) {
        lsSet('pixelfun_user', JSON.stringify(info));
        setUser(info);
      }
      return info;
    });
  }

  // 구글 로그인 (OAuth 리다이렉트 → 돌아오면 onAuthStateChange가 처리)
  function loginWithGoogle() {
    var sb = getClient();
    if (!sb) return Promise.reject(new Error(tr('auth.guestModeOnly')));
    var redirect = window.location.origin + window.location.pathname;
    return sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirect }
    }).then(function (res) {
      if (res.error) throw new Error(errMsg(res.error));
      return null; // 페이지가 리다이렉트됩니다
    });
  }

  // 게스트 로그인 (즉시 처리)
  function loginAsGuest(nickname) {
    try {
      var nick = (nickname && String(nickname).trim()) || 'Guest' + Math.floor(Math.random() * 1000);
      var info = {
        uid: 'guest_' + Date.now(),
        displayName: nick,
        email: '',
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
        '.pa-btn{display:block;width:100%;padding:10px;margin:6px 0;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;transition:all .3s ease;}',
        '.pa-btn:disabled{opacity:.5;cursor:wait;}',
        '.pa-btn-primary{background:var(--neon-purple,#7b2ff7);color:#fff;}',
        '.pa-btn-primary:hover:not(:disabled){background:#9450ff;box-shadow:0 0 14px rgba(123,47,247,.6);}',
        '.pa-btn-secondary{background:transparent;color:var(--neon-blue,#00d4ff);border:1px solid var(--neon-blue,#00d4ff);}',
        '.pa-btn-secondary:hover:not(:disabled){background:rgba(0,212,255,.1);}',
        '.pa-btn-google{background:#fff;color:#333;}',
        '.pa-btn-google:hover:not(:disabled){background:#eee;}',
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

  // ===== 로그인 모달 =====
  function buildModal() {
    injectStyles();
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
    h2.textContent = tr('auth.login');

    var msg = document.createElement('div');
    msg.className = 'pa-msg';
    msg.id = 'paMsg';

    var emailIn = document.createElement('input');
    emailIn.type = 'email';
    emailIn.autocomplete = 'email';
    emailIn.placeholder = tr('auth.emailPlaceholder');
    emailIn.id = 'paEmail';

    var pwIn = document.createElement('input');
    pwIn.type = 'password';
    pwIn.autocomplete = 'current-password';
    pwIn.placeholder = tr('auth.passwordPlaceholder');
    pwIn.id = 'paPw';

    var nickIn = document.createElement('input');
    nickIn.type = 'text';
    nickIn.maxLength = 20;
    nickIn.placeholder = tr('auth.nicknamePlaceholder');
    nickIn.id = 'paNick';
    try { nickIn.value = lsGet('pixelfun_guest_name') || ''; } catch (e) { /* 무시 */ }

    var loginBtn = document.createElement('button');
    loginBtn.className = 'pa-btn pa-btn-primary';
    loginBtn.textContent = tr('auth.login');

    var signupBtn = document.createElement('button');
    signupBtn.className = 'pa-btn pa-btn-secondary';
    signupBtn.textContent = tr('auth.signup');

    var googleBtn = document.createElement('button');
    googleBtn.className = 'pa-btn pa-btn-google';
    googleBtn.textContent = tr('auth.googleLogin');

    var div = document.createElement('div');
    div.className = 'pa-divider';
    var sp = document.createElement('span');
    sp.textContent = tr('auth.or');
    div.appendChild(sp);

    var guestBtn = document.createElement('button');
    guestBtn.className = 'pa-btn pa-btn-guest';
    guestBtn.textContent = tr('auth.guestStart');

    box.appendChild(closeBtn);
    box.appendChild(h2);

    var cloudOn = hasCloud();
    if (!cloudOn) {
      var warn = document.createElement('div');
      warn.className = 'pa-warn';
      warn.textContent = tr('auth.guestModeOnly');
      box.appendChild(warn);
      // Supabase 미설정 시 이메일/구글 버튼 비활성화
      emailIn.disabled = true;
      pwIn.disabled = true;
      loginBtn.disabled = true;
      signupBtn.disabled = true;
      googleBtn.disabled = true;
      [loginBtn, signupBtn, googleBtn].forEach(function (b) { b.style.opacity = '0.4'; b.style.cursor = 'not-allowed'; });
    }

    box.appendChild(emailIn);
    box.appendChild(pwIn);
    box.appendChild(nickIn);
    box.appendChild(loginBtn);
    box.appendChild(signupBtn);
    box.appendChild(msg);
    box.appendChild(googleBtn);
    box.appendChild(div);
    box.appendChild(guestBtn);

    bg.appendChild(box);

    // 이벤트 핸들러
    function setMsg(text, ok) {
      msg.textContent = text || '';
      msg.className = 'pa-msg' + (ok ? ' ok' : '');
    }
    function busy(on) {
      [loginBtn, signupBtn, googleBtn].forEach(function (b) {
        if (!cloudOn) return;
        b.disabled = !!on;
      });
    }
    function fail(err) {
      busy(false);
      setMsg(tr('auth.loginFailed') + ': ' + (err && err.message ? err.message : ''));
    }

    loginBtn.addEventListener('click', function () {
      setMsg(tr('auth.loading'), true);
      busy(true);
      loginWithEmail(emailIn.value, pwIn.value)
        .then(function () {
          busy(false);
          closeModal();
          showToast(tr('auth.welcome', { name: getUser() ? getUser().displayName : '' }));
        })
        .catch(fail);
    });
    signupBtn.addEventListener('click', function () {
      setMsg(tr('auth.loading'), true);
      busy(true);
      signupWithEmail(emailIn.value, pwIn.value, nickIn.value)
        .then(function (r) {
          busy(false);
          if (r && r.needsConfirm) {
            setMsg(tr('auth.confirmEmail'), true);
            return;
          }
          closeModal();
          showToast(tr('auth.signupSuccess'));
        })
        .catch(fail);
    });
    googleBtn.addEventListener('click', function () {
      setMsg(tr('auth.loading'), true);
      busy(true);
      loginWithGoogle().catch(fail);
    });
    guestBtn.addEventListener('click', function () {
      var info = loginAsGuest(nickIn.value);
      if (info) closeModal();
    });

    // Enter 키로 로그인
    [emailIn, pwIn].forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !loginBtn.disabled) loginBtn.click();
      });
    });

    // 배경 클릭 시 닫기
    bg.addEventListener('click', function (e) {
      if (e.target === bg) closeModal();
    });

    return bg;
  }

  function openModal() {
    try {
      closeModal();
      var modal = buildModal();
      document.body.appendChild(modal);
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

      if (currentUser && currentUser.email) {
        var info = document.createElement('div');
        info.className = 'pa-dd-info';
        info.textContent = currentUser.email;
        dd.appendChild(info);
      }

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
    if (!sb) return;
    try {
      // 기존 세션 복원 (OAuth 리다이렉트 복귀 포함)
      sb.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (session && session.user) {
          var info = toInfo(session.user);
          lsSet('pixelfun_user', JSON.stringify(info));
          setUser(info);
        }
      }).catch(function () { /* 무시 */ });

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
    } catch (e) { /* 무시 */ }
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
    loginWithEmail: loginWithEmail,
    signupWithEmail: signupWithEmail,
    loginWithGoogle: loginWithGoogle,
    loginAsGuest: loginAsGuest,
    logout: logout,
    getUser: getUser,
    onChange: onChange,
    openModal: openModal,
    closeModal: closeModal,
    hasCloud: hasCloud,
    // 하위 호환 (기존 코드가 hasFirebase를 참조할 수 있음)
    hasFirebase: hasCloud
  };
})();
