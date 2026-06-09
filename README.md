# SnapPin

跨平台桌面悬浮便签应用。支持截图贴和文字贴，可拖拽、缩放、磁力吸附，所有贴子置顶悬浮。

## 功能

- **截图贴** — 框选屏幕任意区域，自动钉在桌面，图片已复制到剪贴板
- **文字贴** — 快捷输入文字，双击编辑，失焦自动保存
- **磁力吸附** — 贴子靠近屏幕边缘或其他贴子时自动对齐
- **会话恢复** — 关闭应用后重新打开，所有贴子恢复原位置
- **全局快捷键** — 自定义快捷键快速截图 / 新建文字贴
- **托盘菜单** — 隐藏 / 显示 / 关闭全部贴子

## 安装

从 [Releases](https://github.com/hanyiwei/SnapPin/releases) 下载最新安装包：

- **Windows** — `SnapPin Setup x.x.x.exe`
- **macOS** — `SnapPin-x.x.x.dmg`（需在 Mac 上构建）

## 开发

```bash
# 安装依赖
npm install

# 启动开发
npm start

# 构建 Windows
npm run build:win

# 构建 macOS（仅 Mac 环境）
npm run build:mac
```

## 快捷键

| 功能 | 默认快捷键 |
|---|---|
| 新建截图贴 | `Alt + Shift + 3` |
| 新建文字贴 | `Alt + Shift + 4` |

可在托盘菜单 → 设置 中自定义。

## 技术栈

- Electron 28
- electron-store（持久化）
- electron-builder（打包）

## License

MIT
