let peekLinks = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'setTabBehavior') {
    peekLinks = message.peekLinks === true;
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'copyText') {
    navigator.clipboard.writeText(String(message.text || ''))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message.type !== 'enterPictureInPicture') return false;
  const video = [...document.querySelectorAll('video')]
    .filter(candidate => candidate.readyState > 0)
    .sort((left, right) => (right.clientWidth * right.clientHeight) - (left.clientWidth * left.clientHeight))[0];
  if (!video) {
    sendResponse({ ok: false, message: 'No playable video found on this page.' });
    return false;
  }
  video.requestPictureInPicture()
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, message: error.message }));
  return true;
});

chrome.runtime.sendMessage({ type: 'getTabBehavior' })
  .then(value => { peekLinks = value?.peekLinks === true; })
  .catch(() => {});

document.addEventListener('click', event => {
  if (!peekLinks || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[href]');
  if (!link || link.target === '_self' || link.hasAttribute('download')) return;
  const href = link.href;
  if (!/^https?:/i.test(href)) return;
  event.preventDefault();
  event.stopPropagation();
  chrome.runtime.sendMessage({ type: 'openPeek', value: href }).catch(() => { location.href = href; });
}, true);
