import { getDepartments, getMilestoneTemplates, getNewHires, getCompletions } from './graphApi';

const ACTIVE_INTERVAL = 60 * 1000;   // 60s when tab visible
const HIDDEN_INTERVAL = 300 * 1000;  // 5 min when tab hidden

export function createDataSyncManager(onDataUpdate, onError) {
  let intervalId = null;
  let currentInterval = ACTIVE_INTERVAL;
  let isRunning = false;

  async function fetchAllData() {
    try {
      const [departments, milestoneTemplates, newHires, completions] = await Promise.all([
        getDepartments(),
        getMilestoneTemplates(),
        getNewHires(),
        getCompletions(),
      ]);
      const data = {
        departments, milestoneTemplates, newHires, completions,
        lastUpdated: new Date().toISOString(),
      };
      onDataUpdate(data);
      return data;
    } catch (error) {
      if (onError) onError(error);
      throw error;
    }
  }

  function handleVisibilityChange() {
    const next = document.hidden ? HIDDEN_INTERVAL : ACTIVE_INTERVAL;
    if (next !== currentInterval) {
      currentInterval = next;
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(fetchAllData, currentInterval);
    }
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      fetchAllData();
      currentInterval = document.hidden ? HIDDEN_INTERVAL : ACTIVE_INTERVAL;
      intervalId = setInterval(fetchAllData, currentInterval);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    },
    stop() {
      isRunning = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    },
    refresh: fetchAllData,
  };
}
