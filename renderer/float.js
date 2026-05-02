// 浮窗通用逻辑：标题栏按钮、置顶状态管理
// 由 screenshot.html 和 note.html 共同引用

(function () {
  let winId = null;
  let isPinned = true;

  function init(id) {
    winId = id;

    document.getElementById('btn-pin').addEventListener('click', () => {
      window.snappin.togglePin(winId);
    });

    document.getElementById('btn-min').addEventListener('click', () => {
      window.snappin.minimizeWin(winId);
    });

    document.getElementById('btn-close').addEventListener('click', () => {
      window.snappin.closeWin(winId);
    });

    window.snappin.onPinState((state) => {
      isPinned = state;
      document.getElementById('btn-pin').classList.toggle('active', state);
      document.getElementById('btn-pin').title = state ? '取消置顶' : '置顶';
    });
  }

  // 由各页面调用
  window.floatInit = init;
})();
