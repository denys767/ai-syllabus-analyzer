// pdf.js працює в окремому Node-контексті (також сумісно з Jest без ESM VM flags).
const { parentPort, workerData } = require('worker_threads');
(async () => {
  let task;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = getDocument({ data: new Uint8Array(workerData.buffer), useSystemFonts: true, isEvalSupported: false });
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      if (workerData.annotations) pages.push(await page.getAnnotations());
      else {
        const { items, styles } = await page.getTextContent();
        pages.push({ items, styles, view: page.view });
      }
      page.cleanup();
    }
    parentPort.postMessage({ pages });
  } catch (e) {
    parentPort.postMessage({ error: { message: e.message, name: e.name } });
  } finally {
    // Помилка звільнення ресурсів не повинна підміняти вже надісланий результат
    if (task) await task.destroy().catch(() => {});
  }
})();
