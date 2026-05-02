// OCR Web Worker — 使用 tesseract.js 离线识别，支持中英文

importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js');

let workerReady = false;
let tessWorker = null;

async function init() {
  tessWorker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, {
    // 使用 CDN 加载训练数据
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    cacheMethod: 'none'
  });
  workerReady = true;
}

const initPromise = init();

self.onmessage = async (e) => {
  const { imgPath } = e.data;
  try {
    await initPromise;
    const result = await tessWorker.recognize(imgPath);
    self.postMessage({ type: 'result', text: result.data.text.trim() });
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message });
  }
};
