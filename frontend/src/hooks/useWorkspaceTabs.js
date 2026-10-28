import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Per-user ключ, щоб інший користувач у тому ж браузері не бачив чужі вкладки.
const OPEN_TABS_KEY_PREFIX = 'pt.openTabs.v1.';
const LAST_CHAT_KEY_PREFIX = 'pt.lastChat.v1.';

const tabsKeyFor = (userId) => `${OPEN_TABS_KEY_PREFIX}${userId || 'anon'}`;
const lastChatKeyFor = (userId) => `${LAST_CHAT_KEY_PREFIX}${userId || 'anon'}`;

function readOpenTabs(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function writeOpenTabs(key, tabs) {
  localStorage.setItem(key, JSON.stringify(tabs));
}

function removeWorkspaceReference(tabsKey, lastChatKey, syllabusId) {
  try {
    writeOpenTabs(tabsKey, readOpenTabs(tabsKey).filter((tab) => tab.id !== syllabusId));
    if (localStorage.getItem(lastChatKey) === syllabusId) localStorage.removeItem(lastChatKey);
  } catch {
    // Очищення сховища — best-effort; маршрутизація нижче є остаточною.
  }
}

export default function useWorkspaceTabs(user, syllabusId) {
  const navigate = useNavigate();
  const userId = user?.id || user?._id;
  const tabsKey = useMemo(() => tabsKeyFor(userId), [userId]);
  const lastChatKey = useMemo(() => lastChatKeyFor(userId), [userId]);
  const [openTabs, setOpenTabs] = useState(() => readOpenTabs(tabsKey));
  const lastTabsKeyRef = useRef(tabsKey);

  // При зміні користувача спершу читаємо його вкладки, інакше запишемо чужі у новий слот.
  useEffect(() => {
    if (lastTabsKeyRef.current !== tabsKey) {
      lastTabsKeyRef.current = tabsKey;
      setOpenTabs(readOpenTabs(tabsKey));
      return;
    }
    writeOpenTabs(tabsKey, openTabs);
  }, [tabsKey, openTabs]);

  useEffect(() => {
    if (syllabusId) localStorage.setItem(lastChatKey, syllabusId);
  }, [lastChatKey, syllabusId]);

  const closeTab = useCallback((id) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t.id !== id);
      if (id === syllabusId) {
        const fallback = next[0]?.id;
        navigate(fallback ? `/workspace/${fallback}` : '/workspace');
      }
      return next;
    });
  }, [syllabusId, navigate]);

  const ensureTab = useCallback((id, title) => {
    setOpenTabs((tabs) => {
      if (tabs.some((t) => t.id === id)) {
        return tabs.map((t) => (t.id === id && title ? { ...t, title } : t));
      }
      return [...tabs, { id, title: title || "Syllabus" }];
    });
  }, []);

  // Силабус видалено або недоступний: прибираємо вкладку і повертаємось до завантаження.
  const dropMissing = useCallback((id) => {
    removeWorkspaceReference(tabsKey, lastChatKey, id);
    setOpenTabs(readOpenTabs(tabsKey));
    navigate('/workspace', { replace: true });
  }, [tabsKey, lastChatKey, navigate]);

  return { openTabs, closeTab, ensureTab, dropMissing };
}
