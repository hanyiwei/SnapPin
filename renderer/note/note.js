const bg = document.getElementById('bg');
const content = document.getElementById('content');
const closeBtn = document.getElementById('close-btn');
const resizeHandle = document.getElementById('resize-handle');

let winId = 0;
let saveTimer = null;
let isEditing = false;

// ─── 初始化：默认不可编辑 ────────────────────────────────────
content.contentEditable = 'false';

window.snappin.onNoteInit((data) => {
  try {
    winId = data.id;
    if (data.text) content.textContent = data.text;
  } catch (e) { console.error('onNoteInit error:', e); }
});

// ─── 进入 / 退出编辑 ─────────────────────────────────────────
function enterEditMode() {
  isEditing = true;
  content.contentEditable = 'true';
  content.focus();
  document.body.classList.add('editing');
}

function exitEditMode() {
  isEditing = false;
  content.contentEditable = 'false';
  document.body.classList.remove('editing');
  window.getSelection().removeAllRanges();
  // 退出时立即保存
  clearTimeout(saveTimer);
  window.snappin.contentChange(winId, content.innerText);
}

content.addEventListener('dblclick', () => {
  if (!isEditing) enterEditMode();
});

content.addEventListener('blur', () => {
  if (isEditing) exitEditMode();
});

// ─── 编辑自动保存（2 秒防抖）─────────────────────────────────
content.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.snappin.contentChange(winId, content.innerText);
  }, 2000);
});

// ─── 拖拽移动（整个窗口可拖，编辑模式下仅边缘/顶部可拖）─────
let dragging = false;
let lastX = 0, lastY = 0;

document.addEventListener('mousedown', (e) => {
  // 不拦截关闭按钮和缩放手柄
  if (e.target === closeBtn || e.target === resizeHandle) return;
  // 编辑模式下，点击正文区域不拖拽（留给文本选择）
  if (isEditing && content.contains(e.target)) return;

  window.snappin.bringToTop(winId);
  window.snappin.dragStart(winId);
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
  if (dragging) window.snappin.dragEnd(winId);
  dragging = false;
});
document.addEventListener('mouseleave', () => {
  if (dragging) window.snappin.dragEnd(winId);
  dragging = false;
});

// ─── 关闭按钮 ────────────────────────────────────────────────
closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearTimeout(saveTimer);
  window.snappin.contentChange(winId, content.innerText);
  window.snappin.closeWindow(winId);
});
