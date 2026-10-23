const AUTH_API = '/api/auth';
const ERROR_MESSAGES = {
  invalid_state: '로그인 요청이 만료되었거나 확인되지 않았어요. 다시 시작해주세요.',
  invalid_response: '로그인 응답을 확인하지 못했어요. 다시 시도해주세요.',
  provider_error: '소셜 로그인 연결이 원활하지 않아요. 잠시 후 다시 시도해주세요.',
  cancelled: '로그인을 취소했어요. 작품은 계속 둘러볼 수 있어요.',
  unavailable: '소셜 로그인 연결 설정이 아직 완료되지 않았어요.'
};

/** Inject the account button and dialogs; never treats a local taste profile as login. */
export function initAuth({ mount = document.querySelector('.header-top') } = {}) {
  if (!mount || document.getElementById('auth-account-button')) return null;
  if (!document.querySelector('link[data-chalpick-auth-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/auth.css'; style.dataset.chalpickAuthStyle = ''; document.head.append(style);
  }
  let current = { authenticated: false, user: null, providers: [] }, lastFocus, pending = false;
  const button = document.createElement('button'); button.type = 'button'; button.id = 'auth-account-button'; button.className = 'auth-account-button'; button.textContent = '로그인'; button.setAttribute('aria-haspopup', 'dialog');
  const library = mount.querySelector('.library-button'); if (library) library.before(button); else mount.append(button);
  const dialog = document.createElement('dialog'); dialog.id = 'auth-dialog'; dialog.className = 'auth-dialog'; dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.innerHTML = `<button type="button" class="auth-close" aria-label="로그인 창 닫기">×</button><div class="auth-symbol" aria-hidden="true">✦</div><p class="auth-eyebrow">WELCOME TO CHALPICK</p><h2 id="auth-title">반가워요, 찰픽입니다</h2><p class="auth-intro">네이버 또는 카카오 계정으로<br>간편하게 시작하세요.</p><div class="auth-providers"></div><p class="auth-message" role="status" aria-live="polite"></p><div class="auth-account" hidden><p class="auth-account-name"></p><p class="auth-account-provider"></p><button type="button" class="auth-logout">로그아웃</button></div><p class="auth-footnote">보관함과 취향 정보는 현재 브라우저에 저장됩니다.</p>`;
  document.body.append(dialog);
  const message = dialog.querySelector('.auth-message');
  const close = () => { dialog.close(); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); };
  const open = () => { lastFocus = document.activeElement; if (!dialog.open) dialog.showModal(); };
  const publish = () => document.dispatchEvent(new CustomEvent('chalpick:authchange', { detail: { authenticated: current.authenticated, user: current.user } }));
  const render = () => {
    const user = current.authenticated && current.user;
    button.textContent = user ? '내 계정' : '로그인';
    button.setAttribute('aria-label', user ? `${user.name} 내 계정` : '로그인');
    dialog.querySelector('#auth-title').textContent = user ? '찰픽에 오신 걸 환영해요' : '반가워요, 찰픽입니다';
    dialog.querySelector('.auth-intro').hidden = Boolean(user);
    dialog.querySelector('.auth-account').hidden = !user;
    dialog.querySelector('.auth-providers').hidden = Boolean(user);
    if (user) {
      dialog.querySelector('.auth-account-name').textContent = `${user.name}님`;
      dialog.querySelector('.auth-account-provider').textContent = `${user.provider === 'naver' ? '네이버' : '카카오'} 계정으로 로그인했어요.`;
      message.textContent = '';
    } else {
      const container = dialog.querySelector('.auth-providers'); container.replaceChildren();
      for (const [id, name, icon] of [['naver', '네이버', 'N'], ['kakao', '카카오', '●']]) {
        const enabled = current.providers.find(provider => provider.id === id)?.enabled === true;
        const providerButton = document.createElement('button'); providerButton.type = 'button'; providerButton.className = `auth-provider auth-provider-${id}`; providerButton.dataset.provider = id; providerButton.disabled = !enabled || pending;
        const mark = document.createElement('span'); mark.className = 'auth-provider-mark'; mark.textContent = icon; mark.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.textContent = `${name}로 계속하기`;
        providerButton.append(mark, label); if (!enabled) { const hint = document.createElement('small'); hint.textContent = '연결 준비 중'; providerButton.append(hint); }
        container.append(providerButton);
      }
      if (!current.providers.some(provider => provider.enabled)) message.textContent = '소셜 로그인 연결 설정이 아직 완료되지 않았어요. 작품 탐색과 보관함은 계속 이용할 수 있어요.';
    }
  };
  async function refresh() {
    try {
      const result = await fetch(`${AUTH_API}?action=status`, { credentials: 'same-origin', cache: 'no-store' });
      if (!result.ok) throw new Error('unavailable');
      const data = await result.json();
      current = { authenticated: data.authenticated === true && Boolean(data.user), user: data.user || null, providers: Array.isArray(data.providers) ? data.providers : [] };
      render(); publish();
    } catch {
      current = { authenticated: false, user: null, providers: [] }; render(); message.textContent = '로그인 연결을 확인하지 못했어요. 잠시 후 다시 시도해주세요.'; publish();
    }
  }
  button.addEventListener('click', () => { open(); refresh(); });
  dialog.querySelector('.auth-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.querySelector('.auth-providers').addEventListener('click', async event => {
    const providerButton = event.target.closest('button[data-provider]'); if (!providerButton || providerButton.disabled || pending) return;
    pending = true; render(); message.textContent = '로그인 페이지로 이동하고 있어요.';
    try {
      const result = await fetch(`${AUTH_API}?action=start&provider=${encodeURIComponent(providerButton.dataset.provider)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Chalpick-Auth': '1' }, body: '{}' });
      const data = await result.json(); if (!result.ok) throw new Error('unavailable');
      const destination = new URL(data.authorizationUrl);
      if (destination.protocol !== 'https:' || !['nid.naver.com', 'kauth.kakao.com'].includes(destination.hostname)) throw new Error('invalid_destination');
      location.assign(destination.href);
    } catch { pending = false; render(); message.textContent = '로그인을 시작하지 못했어요. 연결 설정을 확인한 뒤 다시 시도해주세요.'; }
  });
  dialog.querySelector('.auth-logout').addEventListener('click', async event => {
    const logout = event.currentTarget; logout.disabled = true;
    try {
      const result = await fetch(`${AUTH_API}?action=logout`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Chalpick-Auth': '1' }, body: '{}' });
      if (!result.ok) throw new Error('logout_failed');
      await refresh(); message.textContent = '로그아웃했어요. 저장해 둔 작품은 이 브라우저에 남아 있어요.';
    } catch { message.textContent = '로그아웃하지 못했어요. 다시 시도해주세요.'; }
    finally { logout.disabled = false; }
  });
  render();
  const url = new URL(location.href), authResult = url.searchParams.get('auth'), error = url.searchParams.get('auth_error');
  if (authResult || error) { url.searchParams.delete('auth'); url.searchParams.delete('auth_error'); history.replaceState(history.state, '', url); }
  refresh().then(() => {
    if (error) { message.textContent = ERROR_MESSAGES[error] || '로그인을 완료하지 못했어요. 다시 시도해주세요.'; open(); }
    else if (authResult === 'success' && current.authenticated) { open(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { pending = false; refresh(); } });
  return { refresh, openLogin: open };
}
