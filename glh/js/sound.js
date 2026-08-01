/**
 * PixelFun - 사운드 시스템 (에이전트4)
 * Web Audio API 기반 동적 효과음 합성 (외부 파일 의존 X)
 * 글로벌 객체: window.PixelSound
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pixelfun_sound_enabled';
  var audioCtx = null;
  var enabled = true;

  // 초기 상태 로드
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      enabled = saved === 'true';
    }
  } catch (e) {
    enabled = true;
  }

  // AudioContext 지연 생성 (브라우저 자동재생 정책 대응)
  function getCtx() {
    try {
      if (!audioCtx) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        audioCtx = new Ctor();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(function () {});
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  // 단일 톤 재생 헬퍼
  function tone(freq, startTime, duration, type, volume) {
    try {
      var ctx = getCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume || 0.2, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch (e) {}
  }

  // 글라이드 톤
  function glide(fromFreq, toFreq, startTime, duration, type, volume) {
    try {
      var ctx = getCtx();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(fromFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(toFreq, startTime + duration);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume || 0.2, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch (e) {}
  }

  // 짧은 노이즈 클릭
  function clickNoise(startTime, duration, volume) {
    try {
      var ctx = getCtx();
      if (!ctx) return;
      var bufferSize = Math.floor(ctx.sampleRate * duration);
      var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var gain = ctx.createGain();
      gain.gain.value = volume || 0.15;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(startTime);
    } catch (e) {}
  }

  // 사운드 정의
  var sounds = {
    success: function () {
      var ctx = getCtx();
      if (!ctx) return;
      var t = ctx.currentTime;
      glide(523.25, 659.25, t, 0.18, 'square', 0.18); // C5 → E5
    },
    fail: function () {
      var ctx = getCtx();
      if (!ctx) return;
      var t = ctx.currentTime;
      glide(440.0, 349.23, t, 0.25, 'sawtooth', 0.18); // A4 → F4
    },
    clear: function () {
      var ctx = getCtx();
      if (!ctx) return;
      var t = ctx.currentTime;
      tone(523.25, t,        0.12, 'square', 0.18); // C5
      tone(659.25, t + 0.12, 0.12, 'square', 0.18); // E5
      tone(783.99, t + 0.24, 0.12, 'square', 0.18); // G5
      tone(1046.50, t + 0.36, 0.25, 'square', 0.22); // C6
    },
    flip: function () {
      var ctx = getCtx();
      if (!ctx) return;
      var t = ctx.currentTime;
      tone(800, t, 0.05, 'square', 0.12);
      clickNoise(t, 0.04, 0.08);
    },
    start: function () {
      var ctx = getCtx();
      if (!ctx) return;
      var t = ctx.currentTime;
      // 픽셀 게임 시작음
      tone(659.25, t,        0.10, 'square', 0.18); // E5
      tone(783.99, t + 0.10, 0.10, 'square', 0.18); // G5
      tone(1046.50, t + 0.20, 0.18, 'square', 0.22); // C6
    }
  };

  // UI 토글 버튼 동기화
  function syncToggleBtn() {
    try {
      var btn = document.getElementById('soundToggleBtn');
      if (!btn) return;
      btn.textContent = enabled ? '🔊' : '🔇';
      btn.setAttribute('aria-label', enabled ? '사운드 끄기' : '사운드 켜기');
      btn.title = enabled ? '사운드 ON' : '사운드 OFF';
    } catch (e) {}
  }

  // 공개 API
  window.PixelSound = {
    play: function (name) {
      try {
        if (!enabled) return;
        var fn = sounds[name];
        if (typeof fn === 'function') fn();
      } catch (e) {}
    },
    toggle: function () {
      try {
        enabled = !enabled;
        localStorage.setItem(STORAGE_KEY, String(enabled));
        syncToggleBtn();
        return enabled;
      } catch (e) {
        return enabled;
      }
    },
    isOn: function () {
      return enabled;
    },
    setEnabled: function (v) {
      try {
        enabled = !!v;
        localStorage.setItem(STORAGE_KEY, String(enabled));
        syncToggleBtn();
      } catch (e) {}
    }
  };

  // DOM 준비 시 토글 버튼 자동 바인딩
  function init() {
    try {
      var btn = document.getElementById('soundToggleBtn');
      if (btn) {
        btn.addEventListener('click', function () {
          window.PixelSound.toggle();
          // 사용자 제스처로 AudioContext unlock
          getCtx();
        });
        syncToggleBtn();
      }
      // 첫 클릭에서 AudioContext unlock
      var unlock = function () {
        getCtx();
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('touchstart', unlock);
      };
      document.addEventListener('click', unlock);
      document.addEventListener('keydown', unlock);
      document.addEventListener('touchstart', unlock);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
