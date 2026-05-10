const dragArea = document.getElementById('drag-area');
const content = document.getElementById('content');
const closeBtn = document.getElementById('close-btn');

let winId = 0;
let saveTimer = null;

window.snappin.onNoteInit((data) => {
  winId = data.id;
  if (data.text) content.innerText = data.text;
  // 把光标放到末尾
  if (data.text) {
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

// ─── 编辑自动保存（2 秒防抖）─────────────────────────────────
content.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.snappin.contentChange(winId, content.innerText);
  }, 2000);
});

// ─── 拖拽移动（仅顶部 20px 区域）────────────────────────────
let dragging = false;
let lastX = 0, lastY = 0;

dragArea.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.screenX;
  lastY = e.screenY;
  window.snappin.bringToTop(winId);
  e.preventDefault();
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

document.addEventListener('mouseup', () => { dragging = false; });

// ─── 点击内容区提升层级 ──────────────────────────────────────
content.addEventListener('mousedown', () => {
  window.snappin.bringToTop(winId);
});

// ─── 关闭按钮 ────────────────────────────────────────────────
closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // 关闭前保存当前内容
  clearTimeout(saveTimer);
  window.snappin.contentChange(winId, content.innerText);
  window.snappin.closeWindow(winId);
});
