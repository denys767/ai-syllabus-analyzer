// Витягує повідомлення, код і деталі з помилки Axios. Для responseType 'blob'
// тіло помилки теж приходить як Blob, тому його треба розпарсити окремо.
export async function describeError(err, fallback = 'Не вдалося виконати дію') {
  let data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch {
      data = null;
    }
  }
  const status = err?.response?.status || null;
  const message = data?.message
    || (err?.code === 'ECONNABORTED' ? 'Сервер не відповів вчасно. Спробуйте ще раз.' : null)
    || err?.message
    || fallback;
  return { message, code: data?.code || null, status, data: data || {} };
}
