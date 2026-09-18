// Plain JS, no imports — loaded directly by options.html, no bundling.
const baseUrl = document.getElementById('baseUrl');
const token = document.getElementById('token');
const status = document.getElementById('status');

chrome.storage.local.get(['baseUrl', 'token']).then((cfg) => {
  baseUrl.value = cfg.baseUrl || 'http://localhost:7645';
  token.value = cfg.token || '';
});

document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault();
  chrome.storage.local.set({ baseUrl: baseUrl.value.trim(), token: token.value.trim() }).then(() => {
    status.textContent = 'Saved';
    setTimeout(() => (status.textContent = ''), 1500);
  });
});
