/**
 * @typedef {Object} GuideStep
 * @property {string} selector           CSS selector for the target element.
 * @property {string} [instruction]      Optional instruction text for tooltips/logs.
 * @property {boolean} [autoClick=false] Whether to synthesize a click on arrival.
 * @property {number} [dwellMs=600]      Delay after arriving before advancing automatically.
 */

export class GuideController {
  /**
   * @param {object} options
   * @param {(selector: string) => Element | null} options.resolve
   * @param {(el: Element) => void} options.onBeforeStep
   * @param {(el: Element, step: GuideStep) => Promise<void> | void} options.onAnimate
   * @param {(step: GuideStep, state: { index: number; total: number }) => void} [options.onStepStart]
   * @param {(step: GuideStep, state: { index: number; total: number }) => void} [options.onStepComplete]
   * @param {() => void} [options.onTourComplete]
   */
  constructor({
    resolve,
    onBeforeStep,
    onAnimate,
    onStepStart = () => {},
    onStepComplete = () => {},
    onTourComplete = () => {}
  }) {
    this._resolve = resolve;
    this._onBeforeStep = onBeforeStep;
    this._onAnimate = onAnimate;
    this._onStepStart = onStepStart;
    this._onStepComplete = onStepComplete;
    this._onTourComplete = onTourComplete;

    this._steps = [];
    this._state = { index: -1, status: 'idle' };
    this._pendingTimer = null;
  }

  /**
   * Loads steps and resets controller state.
   * @param {GuideStep[]} steps
   */
  loadSteps(steps) {
    this.stop();
    this._steps = Array.isArray(steps) ? steps.slice() : [];
    this._state = { index: -1, status: this._steps.length ? 'ready' : 'idle' };
  }

  /** Starts playback from the current position (or first step). */
  play() {
    if (!this._steps.length) {
      return;
    }
    if (this._state.status === 'running') {
      return;
    }
    const nextIndex = this._state.index < 0 ? 0 : this._state.index;
    this._goTo(nextIndex);
  }

  /** Pauses playback. */
  pause() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    if (this._state.status === 'running') {
      this._state.status = 'paused';
    }
  }

  /** Advances to the next step. */
  next() {
    if (!this._steps.length) {
      return;
    }
    const nextIndex = this._state.index + 1;
    this._goTo(nextIndex);
  }

  /** Stops the tour completely. */
  stop() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    this._state = { index: -1, status: 'idle' };
  }

  /** Returns current step info. */
  getState() {
    return { ...this._state, total: this._steps.length };
  }

  _goTo(index) {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }

    if (index >= this._steps.length) {
      this._state = { index: this._steps.length - 1, status: 'completed' };
      this._onTourComplete();
      return;
    }

    const step = this._steps[index];
    const target = this._resolve(step.selector);
    if (!target) {
      this._onStepComplete(step, { index, total: this._steps.length });
      this._state = { index, status: 'skipped' };
      this.next();
      return;
    }

    this._state = { index, status: 'running' };
    this._onStepStart(step, { index, total: this._steps.length });
    this._onBeforeStep(target);

    Promise.resolve(this._onAnimate(target, step))
      .then(() => {
        this._onStepComplete(step, { index, total: this._steps.length });
        const dwellMs = typeof step.dwellMs === 'number' ? Math.max(0, step.dwellMs) : 600;
        if (dwellMs) {
          this._pendingTimer = setTimeout(() => {
            this._pendingTimer = null;
            this.next();
          }, dwellMs);
        }
      })
      .catch(() => {
        this._state = { index, status: 'error' };
      });
  }
}
