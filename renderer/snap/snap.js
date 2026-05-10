const img = document.getElementById('img');
const handle = document.getElementById('resize-handle');
let winId = 0, aspectRatio = 1;

// 从 URL query 读取参数
const params = new URLSearchParams(window.location.search);
winId = parseInt(params.get('id')) || 0;
const imgPath = params.get('img') || '';

img.onload = () => {
  aspectRatio = img.naturalWidth / img.naturalHeight || 1;
  window.snappin.snapAspectRatio(aspectRatio);
  window.snappin.snapReady();
  // toast 提示
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
};
img.onerror = () => window.snappin.snapReady();
img.src = 'file:///' + encodeURI(imgPath.replace(/\\/g, '/')).replace(/^([A-Z]):/i, '$1:');

// 点击任意位置提升层级 + 开始拖拽
img.addEventListener('mousedown', (e) => {
  window.snappin.bringToTop(winId);
  startDrag(e);
});

// 双击关闭
img.addEventListener('dblclick', () => {
  window.snappin.closeWindow(winId);
});

// ─── 拖拽移动 ────────────────────────────────────────────────
let dragging = false;
let lastX = 0, lastY = 0;

function startDrag(e) {
  dragging = true;
  lastX = e.screenX;
  lastY = e.screenY;
}

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
  dragging = false;
});

// ─── 拖拽缩放（主进程轮询全局鼠标位置）───────────────────────
let resizing = false;

// 手柄仅作视觉提示，缩放由 OS 原生处理（resizable: true）
