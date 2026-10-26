document.querySelector('#navigate').addEventListener('submit', event => {
  event.preventDefault();
  const value = document.querySelector('#address').value.trim();
  const error = document.querySelector('#error');
  error.textContent = '';
  if (!value) return;
  try {
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value) && !/^[^\s/:]+:\d+(?:\/|$)/.test(value);
    const looksLikeHost = !/\s/.test(value) && (value.includes('.') || /^localhost(?::|\/|$)/i.test(value) || value.startsWith('['));
    const target = hasScheme ? new URL(value) : looksLikeHost ? new URL(`https://${value}`) : new URL(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
    if (!['https:', 'http:'].includes(target.protocol) || !target.hostname || target.username || target.password) throw new Error('unsupported');
    window.location.assign(target.href);
  } catch {
    error.textContent = 'Địa chỉ không hợp lệ. Dùng http:// hoặc https://, không chứa tài khoản/mật khẩu.';
  }
});
