const img = document.getElementById('img');
let winId = 0;

// 从 URL query 读取参数
const params = new URLSearchParams(window.location.search);
winId = parseInt(params.get('id')) || 0;
const imgPath = params.get('img') || '';

img.onload = () => {
  window.snappin.snapAspectRatio(winId, img.naturalWidth / img.naturalHeight || 1);
  window.snappin.snapReady(winId);
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
};
img.onerror = () => window.snappin.snapReady();
img.src = 'file:///' + encodeURI(imgPath.replace(/\\/g, '/')).replace(/^([A-Z]):/i, '$1:');

// ─── 窗口拖拽 ──────────────────────────────────────────────────
let dragging = false;
let lastX = 0, lastY = 0;

img.addEventListener('mousedown', (e) => {
  window.snappin.bringToTop(winId);
  window.snappin.dragStart(winId);
  img.style.width = window.innerWidth + 'px';
  img.style.height = window.innerHeight + 'px';
  dragging = true;
  lastX = e.screenX;
  lastY = e.screenY;
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  if (dx === 0 && dy === 0) return;
  lastX = e.screenX;
  lastY = e.screenY;
  window.snappin.moveWindow(winId, dx, dy);
});

document.addEventListener('mouseup', () => {
  if (dragging) {
    window.snappin.dragEnd(winId);
    img.style.width = '';
    img.style.height = '';
  }
  dragging = false;
});
document.addEventListener('mouseleave', () => {
  if (dragging) {
    window.snappin.dragEnd(winId);
    img.style.width = '';
    img.style.height = '';
  }
  dragging = false;
});

// 双击关闭
img.addEventListener('dblclick', () => {
  window.snappin.closeWindow(winId);
});
