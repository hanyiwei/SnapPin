const img = document.getElementById('img');
let winId = 0;

window.snappin.onSnapInit((data) => {
  winId = data.id;
  img.src = 'file:///' + data.imgPath.replace(/\\/g, '/').replace(/^([A-Z]):/i, '$1:');
});

// 点击任意位置提升层级
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
