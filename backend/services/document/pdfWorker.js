// pdf.js працює в окремому Node-контексті (також сумісно з Jest без ESM VM flags).
const { parentPort, workerData } = require('worker_threads');
(async () => {
  let pdf;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdf = await getDocument({ data: new Uint8Array(workerData.buffer), useSystemFonts: true, isEvalSupported: false }).promise;
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
    if (pdf) await pdf.destroy();
  }
})().catch((e) => { throw e; });
