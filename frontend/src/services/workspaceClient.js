import api from './api';
import { createMockClient } from '../mocks/chatV5';

// REACT_APP_USE_MOCKS=1 — робоче місце працює на мок-бекенді (mocks/chatV5.js), без сервера.
export const USE_MOCKS = process.env.REACT_APP_USE_MOCKS === '1';

let mock = null;
export const getMockClient = () => {
  if (!mock) mock = createMockClient();
  return mock;
};

// Спільний інтерфейс: chat, syllabus, references, policies (як у services/api.js)
const workspaceClient = USE_MOCKS ? getMockClient() : api;
export default workspaceClient;
