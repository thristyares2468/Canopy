let horizontalDistance = 0;
let resetTimer = null;
let lockedUntil = 0;

window.addEventListener('wheel', event => {
  if (!event.isTrusted || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15) return;
  horizontalDistance += event.deltaX;
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => { horizontalDistance = 0; }, 180);
  const now = Date.now();
  if (now < lockedUntil || Math.abs(horizontalDistance) < 150) return;
  chrome.runtime.sendMessage({ type: 'cycleSpace', direction: horizontalDistance > 0 ? 'next' : 'previous' });
  horizontalDistance = 0;
  lockedUntil = now + 650;
}, { capture: true, passive: true });
