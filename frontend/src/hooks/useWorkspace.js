import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import { describeError } from '../utils/apiError';
import { downloadOutput as saveOutput, syllabusOutputs } from '../utils/download';

export const ANALYSIS_POLL_INTERVAL_MS = 5000;
export const ANALYSIS_POLL_LIMIT_MS = 10 * 60 * 1000;

const normalizeView = (data) => ({
  conversation: data?.conversation || null,
  messages: data?.messages || [],
  suggestions: data?.suggestions || [],
  readiness: data?.readiness || null,
  syllabus: data?.syllabus || null,
});

const needsStart = (view) => view.syllabus?.status === 'in_progress'
  && !view.conversation
  && !view.syllabus?.legacy;

// Уся логіка чату: завантаження, опитування аналізу, мутації пропозицій, файли.
// Кожна мутація повертає повний view — його одразу застосовуємо, без окремого refetch.
export default function useWorkspace(syllabusId, { onNotFound, onLoaded } = {}) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState({ stage: null, error: null, timedOut: false });
  const [pollEpoch, setPollEpoch] = useState(0);
  const [pendingText, setPendingText] = useState(null);
  const [downloading, setDownloading] = useState('');
  const [docPreview, setDocPreview] = useState({ open: false, loading: false, blocks: null, error: '' });

  const idRef = useRef(syllabusId);
  idRef.current = syllabusId;
  const onNotFoundRef = useRef(onNotFound);
  onNotFoundRef.current = onNotFound;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const status = view?.syllabus?.status;

  // Завантаження при зміні силабуса; автостарт чату, коли аналіз завершено, а розмови ще немає.
  useEffect(() => {
    setView(null);
    setError('');
    setAnalysis({ stage: null, error: null, timedOut: false });
    setPendingText(null);
    if (!syllabusId) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.chat.get(syllabusId);
        if (cancelled) return;
        let next = normalizeView(data);
        if (needsStart(next)) {
          const started = await api.chat.start(syllabusId);
          if (cancelled) return;
          next = normalizeView(started.data);
        }
        setView(next);
        onLoadedRef.current?.(next.syllabus);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          onNotFoundRef.current?.(syllabusId);
          return;
        }
        setError((await describeError(err, 'Не вдалося завантажити силабус')).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [syllabusId]);

  // Опитування етапу аналізу; після ANALYSIS_POLL_LIMIT_MS зупиняємось і пропонуємо повторити.
  useEffect(() => {
    if (!syllabusId || status !== 'analyzing') return undefined;
    let cancelled = false;
    let inFlight = false;
    let timer = null;
    const startedAt = Date.now();
    setAnalysis({ stage: null, error: null, timedOut: false });

    const tick = async () => {
      if (inFlight) return;
      if (Date.now() - startedAt > ANALYSIS_POLL_LIMIT_MS) {
        clearInterval(timer);
        setAnalysis((a) => ({ ...a, timedOut: true }));
        return;
      }
      inFlight = true;
      try {
        const { data } = await api.syllabus.getStatus(syllabusId);
        if (cancelled) return;
        if (data.status === 'analyzing') {
          setAnalysis((a) => ({ ...a, stage: data.stage || null }));
          return;
        }
        clearInterval(timer);
        if (data.status === 'error') {
          setAnalysis({ stage: data.stage || null, error: data.error || null, timedOut: false });
          setView((v) => (v ? { ...v, syllabus: { ...v.syllabus, status: 'error' } } : v));
          return;
        }
        const started = await api.chat.start(syllabusId);
        if (cancelled) return;
        const next = normalizeView(started.data);
        setView(next);
        onLoadedRef.current?.(next.syllabus);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          clearInterval(timer);
          onNotFoundRef.current?.(syllabusId);
        }
        // Тимчасові мережеві збої ігноруємо — наступний тік повторить запит.
      } finally {
        inFlight = false;
      }
    };

    tick();
    timer = setInterval(tick, ANALYSIS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [syllabusId, status, pollEpoch]);

  // Якщо силабус уже в статусі error при відкритті — підтягуємо текст помилки.
  useEffect(() => {
    if (!syllabusId || status !== 'error') return undefined;
    let cancelled = false;
    api.syllabus.getStatus(syllabusId)
      .then(({ data }) => {
        if (!cancelled) setAnalysis((a) => ({ ...a, error: data.error || a.error }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [syllabusId, status]);

  // Мутація: застосовує повернутий view. Повертає { ok } або { ok:false, error, code, conflicts }.
  const mutate = useCallback(async (call) => {
    const id = idRef.current;
    setBusy(true);
    try {
      const { data } = await call(id);
      if (idRef.current === id) setView(normalizeView(data));
      return { ok: true };
    } catch (err) {
      const info = await describeError(err);
      return {
        ok: false,
        error: info.message,
        code: info.code,
        status: info.status,
        conflicts: info.data.conflicts || [],
      };
    } finally {
      setBusy(false);
    }
  }, []);

  const actions = useMemo(() => ({
    accept: (sid, body = {}) => mutate((id) => api.chat.accept(id, sid, body)),
    reject: (sid, body = {}) => mutate((id) => api.chat.reject(id, sid, body)),
    refine: (sid, body = {}) => mutate((id) => api.chat.refine(id, sid, body)),
    answer: (sid, answer) => mutate((id) => api.chat.answer(id, sid, answer)),
    reopen: (sid) => mutate((id) => api.chat.reopen(id, sid)),
  }), [mutate]);

  // Слайди для pptx: не змінюють view, тому без mutate. Повертає { ok, slides } або { ok:false, error }.
  const loadSlides = useCallback(async (sid, optionId) => {
    try {
      const { data } = await api.chat.suggestionSlides(idRef.current, sid, optionId);
      return { ok: true, slides: data?.slides || [] };
    } catch (err) {
      return { ok: false, error: (await describeError(err, 'Не вдалося завантажити слайди')).message };
    }
  }, []);

  const reportFailure = useCallback((result) => {
    if (!result.ok) setError(result.error);
    return result.ok;
  }, []);

  // Вільне повідомлення: показуємо його одразу, відповідь (або refine поточної картки) приходить у view.
  const sendMessage = useCallback(async (text) => {
    setError('');
    setPendingText(text);
    const result = await mutate((id) => api.chat.sendMessage(id, text));
    setPendingText(null);
    return reportFailure(result);
  }, [mutate, reportFailure]);

  const submit = useCallback(async () => {
    setError('');
    return reportFailure(await mutate((id) => api.chat.submit(id)));
  }, [mutate, reportFailure]);

  const reanalyze = useCallback(async () => {
    const id = idRef.current;
    setBusy(true);
    setError('');
    try {
      await api.syllabus.reanalyze(id);
      setView((v) => (v ? {
        ...v,
        conversation: null,
        messages: [],
        suggestions: [],
        readiness: null,
        syllabus: { ...v.syllabus, status: 'analyzing' },
      } : v));
      setAnalysis({ stage: null, error: null, timedOut: false });
      setPollEpoch((n) => n + 1);
    } catch (err) {
      setError((await describeError(err, 'Не вдалося повторити аналіз')).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const downloadOutput = useCallback(async (name) => {
    setDownloading(name);
    setError('');
    const title = view?.syllabus?.title || 'syllabus';
    const failure = await saveOutput(idRef.current, name, title);
    if (failure) setError(failure);
    setDownloading('');
  }, [view?.syllabus?.title]);

  const openDocumentPreview = useCallback(async () => {
    setDocPreview({ open: true, loading: true, blocks: null, error: '' });
    try {
      const { data } = await api.chat.documentPreview(idRef.current);
      setDocPreview({ open: true, loading: false, blocks: data?.blocks || [], error: '' });
    } catch (err) {
      const info = await describeError(err, 'Не вдалося сформувати перегляд документа');
      setDocPreview({ open: true, loading: false, blocks: null, error: info.message });
    }
  }, []);

  const closeDocumentPreview = useCallback(() => {
    setDocPreview((p) => ({ ...p, open: false }));
  }, []);

  const syllabus = view?.syllabus || null;
  const readiness = view?.readiness || null;
  const pendingCount = readiness?.counts?.pending ?? 0;
  const submitted = status === 'submitted';
  const legacy = !!syllabus?.legacy;
  // canMutate: власник, не submitted, не legacy (адмін — лише читання)
  const readOnly = syllabus?.canMutate === false || legacy || submitted;

  return {
    syllabus,
    outputs: syllabusOutputs(syllabus),
    conversation: view?.conversation || null,
    messages: view?.messages || [],
    suggestions: view?.suggestions || [],
    readiness,
    loaded: !!view,
    loading,
    error,
    clearError: () => setError(''),
    busy,
    analysis,
    pendingText,
    downloading,
    docPreview,
    legacy,
    submitted,
    readOnly,
    pendingCount,
    canSubmit: status === 'in_progress' && !readOnly && !!view?.conversation && pendingCount === 0,
    actions,
    loadSlides,
    sendMessage,
    submit,
    reanalyze,
    downloadOutput,
    openDocumentPreview,
    closeDocumentPreview,
  };
}
