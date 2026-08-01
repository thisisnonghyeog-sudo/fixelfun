/**
 * PixelFun - Supabase 클라이언트 초기화
 *
 * ⚠️ 배포 전 아래 두 값을 본인의 Supabase 프로젝트 값으로 교체하세요.
 *    Supabase 대시보드 → Project Settings → API 에서 확인:
 *      - Project URL      →  SUPABASE_URL
 *      - anon / public key →  SUPABASE_ANON_KEY
 *
 * anon key는 공개되어도 되는 키입니다(브라우저에 노출되는 것이 정상).
 * 실제 보안은 supabase/schema.sql 의 RLS 정책이 담당합니다.
 * service_role 키는 절대 여기에 넣지 마세요.
 *
 * 이 파일은 supabase-js SDK 다음, 나머지 js/*.js 보다 먼저 로드되어야 합니다.
 * 글로벌: window.sb (Supabase 클라이언트 또는 null)
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://cmxyzudgvucmbrsfcoba.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNteHl6dWRndnVjbWJyc2Zjb2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDA2NzMsImV4cCI6MjEwMTExNjY3M30.heCWZmf88JlStA0bwRvsV7nypSezF25UVHTH7M3vPpM';

  window.sb = null;

  function isPlaceholder(v) {
    return !v || v.indexOf('YOUR_SUPABASE') === 0;
  }

  try {
    if (isPlaceholder(SUPABASE_URL) || isPlaceholder(SUPABASE_ANON_KEY)) {
      console.warn('[PixelFun] Supabase 설정이 비어 있습니다. js/supabase-config.js 를 채우기 전까지 로컬(게스트) 모드로 동작합니다.');
      return;
    }
    // supabase-js UMD 번들이 window.supabase 네임스페이스를 만듭니다.
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[PixelFun] supabase-js SDK를 불러오지 못했습니다. 로컬 모드로 동작합니다.');
      return;
    }
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (e) {
    console.warn('[PixelFun] Supabase 초기화 실패, 로컬 모드로 폴백합니다.', e);
    window.sb = null;
  }
})();
