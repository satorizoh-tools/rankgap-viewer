(function () {
  const STORAGE_KEY = "rankgap-viewer-settings";
  const COPY_BUTTON_RESET_MS = 1000;

  const state = {
    lastDurationMs: null,
    event: null,
    autoEnabled: true,
    autoIntervalSec: 30,
    timeLogic: null,
    copyButtonResetTimerId: null
  };

  const el = {};

  function getEnabledEvent(events) {
    const enabled = events.find(event => event.isEnabled);
    return enabled || events[0] || null;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateTimeJst(timestampMs) {
    const dt = new Date(timestampMs);
    return [
      pad2(dt.getFullYear() % 100),
      pad2(dt.getMonth() + 1),
      pad2(dt.getDate())
    ].join("/") + " " + [
      pad2(dt.getHours()),
      pad2(dt.getMinutes()),
      pad2(dt.getSeconds())
    ].join(":");
  }

  function formatDurationSec(durationMs) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  function formatCountdown(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return "0s";
    }

    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;
    return `${minutes}m ${restSeconds}s`;
  }

  function getCircleProgressSymbol(progressRatio) {
    if (!Number.isFinite(progressRatio) || progressRatio <= 0) return "○";
    if (progressRatio < 0.25) return "◔";
    if (progressRatio < 0.5) return "◑";
    if (progressRatio < 0.75) return "◕";
    return "●";
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (typeof parsed.autoEnabled === "boolean") {
        state.autoEnabled = parsed.autoEnabled;
      }
      if (Number.isFinite(parsed.autoIntervalSec)) {
        state.autoIntervalSec = Math.max(10, Math.min(600, Number(parsed.autoIntervalSec)));
      }
    } catch (error) {
      console.warn("settings load failed", error);
    }
  }

  function saveSettings() {
    const payload = {
      autoEnabled: state.autoEnabled,
      autoIntervalSec: state.autoIntervalSec
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function cacheElements() {
    el.title = document.getElementById("title");
    el.rank = document.getElementById("rank");
    el.points = document.getElementById("points");
    el.diff15 = document.getElementById("diff15");
    el.diff30 = document.getElementById("diff30");
    el.stateLine = document.getElementById("stateLine");
    el.lastUpdateLine = document.getElementById("lastUpdateLine");
    el.commentWrap = document.getElementById("commentWrap");
    el.comment = document.getElementById("comment");
    el.commentCloseBtn = document.getElementById("commentCloseBtn");
    el.error = document.getElementById("error");
    el.refreshBtn = document.getElementById("refreshBtn");
    el.refreshBtnLabel = el.refreshBtn.querySelector(".btn-label");
    el.copyBtn = document.getElementById("copyBtn");
    el.autoEnabled = document.getElementById("autoEnabled");
    el.autoIntervalSec = document.getElementById("autoIntervalSec");
  }

  function showError(message) {
    el.error.textContent = message;
  }

  function clearError() {
    el.error.textContent = "";
  }

  async function ensureEventLoaded() {
    if (state.event) {
      return state.event;
    }

    const events = await window.RankGapApi.fetchEvents();
    const event = getEnabledEvent(events);
    if (!event) {
      throw new Error("enabled event not found");
    }

    state.event = event;
    el.title.textContent = `${event.eventName || "イベント"}`;
    return event;
  }

  function buildCommentText(eventName, rankData, lastUpdateText) {
    return `${eventName}
ゆいか氏 現在 ${rankData.rank}位
ポイント ${rankData.points.toLocaleString()}pt
15位まで ${rankData.diff15.toLocaleString()}pt
30位まで ${rankData.diff30.toLocaleString()}pt
最終更新 ${lastUpdateText}`;
  }

  async function refreshRanking(reason) {
    clearError();

    const event = await ensureEventLoaded();
    const group = await window.RankGapApi.fetchBattleGroup(event.battleId, event.groupId);
    const rankData = window.RankGapApi.buildRankViewModel(group);

    el.rank.textContent = `${rankData.rank}位`;
    el.points.textContent = `${rankData.points.toLocaleString()}pt`;
    el.diff15.textContent = `${rankData.diff15.toLocaleString()}pt`;
    el.diff30.textContent = `${rankData.diff30.toLocaleString()}pt`;

    const completedAtText = formatDateTimeJst(Date.now());
    el.comment.value = buildCommentText(event.eventName || "イベント", rankData, completedAtText);
    resizeCommentArea();

    return { reason, rankData };
  }


  function resizeCommentArea() {
    if (!el.comment) return;
    el.comment.style.height = "auto";
    const nextHeight = Math.min(el.comment.scrollHeight, 196);
    el.comment.style.height = `${Math.max(nextHeight, 112)}px`;
    el.comment.style.overflowY = el.comment.scrollHeight > 196 ? "auto" : "hidden";
  }

  function showCommentArea() {
    el.commentWrap.classList.add("is-visible");
    resizeCommentArea();
  }

  function hideCommentArea() {
    el.commentWrap.classList.remove("is-visible");
  }

  function setCopyButtonCopiedState() {
    if (state.copyButtonResetTimerId) {
      clearTimeout(state.copyButtonResetTimerId);
    }

    el.copyBtn.classList.add("is-copied");
    el.copyBtn.textContent = "Copied!";

    state.copyButtonResetTimerId = setTimeout(() => {
      el.copyBtn.classList.remove("is-copied");
      el.copyBtn.textContent = "コメントコピー";
      state.copyButtonResetTimerId = null;
    }, COPY_BUTTON_RESET_MS);
  }

  function updateRefreshButton(snapshot) {
    const isCooldown = snapshot.manualCooldownRemainingMs > 0 && !snapshot.isUpdating;
    const totalCooldownMs = snapshot.manualCooldownTotalMs || 8000;
    const cooldownProgress = isCooldown
      ? Math.max(0, Math.min(100, ((totalCooldownMs - snapshot.manualCooldownRemainingMs) / totalCooldownMs) * 100))
      : 0;

    const isManualUpdating = snapshot.isUpdating && snapshot.lastReason === "manual";

    el.refreshBtn.classList.toggle("is-updating", isManualUpdating);
    el.refreshBtn.classList.toggle("is-cooldown", isCooldown);
    el.refreshBtn.style.setProperty("--progress", `${cooldownProgress}%`);

    if (isManualUpdating) {
      el.refreshBtnLabel.textContent = "Updating...";
    } else if (isCooldown) {
      el.refreshBtnLabel.textContent = "\u00A0";
    } else {
      el.refreshBtnLabel.textContent = "今すぐ更新";
    }

    el.refreshBtn.disabled = snapshot.isUpdating || isCooldown;
  }

  function updateStateLine(snapshot) {
    if (snapshot.isUpdating) {
      el.stateLine.textContent = "Updating";
      return;
    }

    if (snapshot.manualCooldownRemainingMs > 0) {
      const sec = Math.ceil(snapshot.manualCooldownRemainingMs / 1000);
      el.stateLine.textContent = `Manual Cooldown · ${sec}s`;
      return;
    }

    el.stateLine.textContent = "Waiting";
  }

  function updateLastUpdateLine(snapshot) {
    if (!snapshot.lastCompletedAtMs) {
      el.lastUpdateLine.textContent = "Last Update: --";
      return;
    }

    const timeText = formatDateTimeJst(snapshot.lastCompletedAtMs);
    let suffix = "";

    if (snapshot.autoEnabled && !snapshot.isUpdating && snapshot.autoRemainingSec > 0) {
      const countdownText = formatCountdown(snapshot.autoRemainingSec);
      suffix = ` ・ Auto ${countdownText} `;
    }

    el.lastUpdateLine.textContent = `Last Update: ${timeText}${suffix}`;
  }

  function updateStatusView(snapshot) {
    updateStateLine(snapshot);
    updateLastUpdateLine(snapshot);
    if(state.updateStartTime){
      state.lastDurationMs = performance.now() - state.updateStartTime;
    }
    updateRefreshTime(snapshot);
    updateRefreshButton(snapshot);

    el.autoIntervalSec.disabled = snapshot.isUpdating;
    el.autoEnabled.disabled = snapshot.isUpdating;
  }

  function bindEvents() {
    el.refreshBtn.addEventListener("click", async () => {
      const result = await state.timeLogic.runRefresh("manual");
      if (result && result.skipped && result.reason === "manual-cooldown") {
        showError("Manual更新は8秒クールダウン中です。");
      }
    });

    el.copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el.comment.value);
        showCommentArea();
        setCopyButtonCopiedState();
      } catch (error) {
        showError("コメントコピーに失敗しました。");
      }
    });

    el.commentCloseBtn.addEventListener("click", () => {
      hideCommentArea();
    });

    el.autoEnabled.addEventListener("change", () => {
      state.autoEnabled = el.autoEnabled.checked;
      saveSettings();
      state.timeLogic.updateAutoSettingChanged();
    });

    el.autoIntervalSec.addEventListener("change", () => {
      const value = Number(el.autoIntervalSec.value || 30);
      state.autoIntervalSec = Math.max(10, Math.min(600, value));
      el.autoIntervalSec.value = String(state.autoIntervalSec);
      saveSettings();
      state.timeLogic.updateAutoSettingChanged();
    });
  }

  async function initialize() {
    loadSettings();
    cacheElements();

    el.autoEnabled.checked = state.autoEnabled;
    el.autoIntervalSec.value = String(state.autoIntervalSec);

    state.timeLogic = new window.RankGapTimeLogic({
      onAutoRefresh: refreshRanking,
      onStateChange: updateStatusView,
      getAutoEnabled: () => state.autoEnabled,
      getUserIntervalSec: () => state.autoIntervalSec
    });

    bindEvents();

    try {
      await state.timeLogic.initialize();
    } catch (error) {
      showError(error.message || String(error));
      updateStatusView(state.timeLogic.getSnapshot());
    }
  }

  window.addEventListener("load", initialize);

  function updateProgressLoop(){
    if(!state.timeLogic){
      requestAnimationFrame(updateProgressLoop);
      return;
    }
    const snapshot = state.timeLogic.getSnapshot();
    const wrap = document.getElementById('progressWrap');
    const fill = document.getElementById('progressFill');
    if(!wrap || !fill){
      requestAnimationFrame(updateProgressLoop);
      return;
    }
    if (!state.autoEnabled || snapshot.isUpdating || snapshot.autoRemainingSec <= 0) {
      wrap.style.display = 'none';
      fill.style.width = '0%';
    } else {
      wrap.style.display = 'block';
      const ratio = snapshot.autoProgressRatio ?? 0;
      fill.style.width = (ratio * 100) + '%';
    }
    requestAnimationFrame(updateProgressLoop);
  }

  requestAnimationFrame(updateProgressLoop);


function updateRefreshTime(snapshot){
  const el = document.getElementById('refreshTime');
  if(!el) return;

  if(!state.autoEnabled || state.lastDurationMs == null){
    el.style.display='none';
    return;
  }

  el.style.display='block';
  const sec=(state.lastDurationMs/1000).toFixed(1);
  el.textContent=`Refresh Time ・ ${sec}s`;
}

})();
