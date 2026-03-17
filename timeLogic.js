(function () {
  const MANUAL_COOLDOWN_MS = 8 * 1000;
  const TICK_MS = 50;

  class RankGapTimeLogic {
    constructor(options) {
      this.onAutoRefresh = options.onAutoRefresh;
      this.onStateChange = options.onStateChange;
      this.getAutoEnabled = options.getAutoEnabled;
      this.getUserIntervalSec = options.getUserIntervalSec;

      this.autoTimerId = null;
      this.manualCooldownIntervalId = null;
      this.manualCooldownUntil = null;
      this.isUpdating = false;
      this.lastCompletedAtMs = null;
      this.lastDurationMs = null;
      this.lastReason = null;
    }

    getSnapshot() {
      const autoEnabled = this.getAutoEnabled();
      const intervalSec = this.getUserIntervalSec();
      const cooldownRemainingMs = this.manualCooldownUntil
        ? Math.max(this.manualCooldownUntil - Date.now(), 0)
        : 0;

      return {
        autoEnabled,
        intervalSec,
        isUpdating: this.isUpdating,
        lastCompletedAtMs: this.lastCompletedAtMs,
        lastDurationMs: this.lastDurationMs,
        lastReason: this.lastReason,
        manualCooldownRemainingMs: cooldownRemainingMs,
        nextAutoScheduled: !!this.autoTimerId,
        manualCooldownTotalMs: MANUAL_COOLDOWN_MS
      };
    }

    notifyState() {
      if (typeof this.onStateChange === "function") {
        this.onStateChange(this.getSnapshot());
      }
    }

    clearAutoTimer() {
      if (this.autoTimerId) {
        clearTimeout(this.autoTimerId);
        this.autoTimerId = null;
      }
    }

    clearManualCooldownTimer() {
      if (this.manualCooldownIntervalId) {
        clearInterval(this.manualCooldownIntervalId);
        this.manualCooldownIntervalId = null;
      }
    }

    isManualCooldownActive() {
      return !!this.manualCooldownUntil && this.manualCooldownUntil > Date.now();
    }

    startManualCooldown() {
      this.clearManualCooldownTimer();
      this.manualCooldownUntil = Date.now() + MANUAL_COOLDOWN_MS;
      this.notifyState();

      this.manualCooldownIntervalId = setInterval(() => {
        if (!this.isManualCooldownActive()) {
          this.manualCooldownUntil = null;
          this.clearManualCooldownTimer();
        }
        this.notifyState();
      }, TICK_MS);
    }

    scheduleNextAutoFromCompletion() {
      this.clearAutoTimer();

      if (!this.getAutoEnabled()) {
        this.notifyState();
        return;
      }

      const intervalMs = this.getUserIntervalSec() * 1000;
      this.autoTimerId = setTimeout(async () => {
        this.autoTimerId = null;
        await this.runRefresh("auto");
      }, intervalMs);

      this.notifyState();
    }

    async runRefresh(reason) {
      if (this.isUpdating) {
        return { skipped: true, reason: "already-updating" };
      }

      if (reason === "manual" && this.isManualCooldownActive()) {
        return { skipped: true, reason: "manual-cooldown" };
      }

      this.isUpdating = true;
      this.lastReason = reason;
      this.notifyState();

      const startedAt = performance.now();

      try {
        const result = await this.onAutoRefresh(reason);
        const durationMs = performance.now() - startedAt;

        this.lastCompletedAtMs = Date.now();
        this.lastDurationMs = durationMs;

        if (reason === "manual") {
          this.startManualCooldown();
        }

        this.scheduleNextAutoFromCompletion();
        return { skipped: false, result };
      } finally {
        this.isUpdating = false;
        this.notifyState();
      }
    }

    updateAutoSettingChanged() {
      this.scheduleNextAutoFromCompletion();
    }

    async initialize() {
      await this.runRefresh("initial");
    }

    destroy() {
      this.clearAutoTimer();
      this.clearManualCooldownTimer();
    }
  }

  window.RankGapTimeLogic = RankGapTimeLogic;
})();
