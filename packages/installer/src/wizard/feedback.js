/**
 * Visual Feedback Helpers
 *
 * Spinners, progress bars, and status indicators using CYRYX Color System v4.0.4
 *
 * @module wizard/feedback
 */

const ora = require('ora');
const cliProgress = require('cli-progress');
const { colors, status } = require('../utils/aexos-colors');
const { renderInstallPanel, renderInstallCompletion, renderInstallWelcome, getTerminalCapabilities, stripTerminalControls, wrapText } = require('./install-experience');
const activeSpinners = new Set();

/**
 * Create and start a spinner with CYRYX styling
 *
 * @param {string} text - Spinner text
 * @param {Object} options - Spinner options
 * @returns {Object} Ora spinner instance
 */
function createSpinner(text, options = {}) {
  if (getTerminalCapabilities().plain) {
    const spinner = {
      text,
      start(message) { if (message) this.text = message; console.log(`  ${stripTerminalControls(this.text)}`); return this; },
      stop() { return this; },
      succeed(message) { console.log(`  PASS ${stripTerminalControls(message || this.text)}`); return this; },
      fail(message) { console.log(`  FAIL ${stripTerminalControls(message || this.text)}`); return this; },
      warn(message) { console.log(`  WARN ${stripTerminalControls(message || this.text)}`); return this; },
      info(message) { console.log(`  INFO ${stripTerminalControls(message || this.text)}`); return this; },
    };
    return spinner;
  }
  const spinner = ora({
    text,
    color: 'cyan',
    spinner: 'dots',
    ...options,
    stream: process.stdout,
    isEnabled: true,
  });
  activeSpinners.add(spinner);
  return spinner;
}

function stopTerminalActivity() {
  for (const spinner of activeSpinners) spinner.stop();
  activeSpinners.clear();
}

/**
 * Show success message with checkmark
 *
 * @param {string} message - Success message
 */
function showSuccess(message) {
  console.log(status.success(message));
}

/**
 * Show error message with cross mark
 *
 * @param {string} message - Error message
 */
function showError(message) {
  console.log(status.error(message));
}

/**
 * Show warning message with warning symbol
 *
 * @param {string} message - Warning message
 */
function showWarning(message) {
  console.log(status.warning(message));
}

/**
 * Show info message
 *
 * @param {string} message - Info message
 */
function showInfo(message) {
  console.log(status.info(message));
}

/**
 * Show tip message
 *
 * @param {string} message - Tip message
 */
function showTip(message) {
  console.log(status.tip(message));
}

/**
 * Create progress bar with CYRYX styling
 *
 * @param {number} total - Total steps
 * @param {Object} options - Progress bar options
 * @returns {Object} Progress bar instance
 */
function createProgressBar(total, options = {}) {
  if (getTerminalCapabilities().plain) {
    return { update(value, payload = {}) { console.log(`  ${value}/${total} ${stripTerminalControls(payload.task || '')}`); }, stop() {} };
  }
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        colors.primary('Progress |') +
        colors.tertiary('{bar}') +
        colors.primary('| {percentage}% | {value}/{total} | {task}'),
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      ...options,
    },
    cliProgress.Presets.shades_classic,
  );

  progressBar.start(total, 0, { task: 'Initializing...' });
  return progressBar;
}

/**
 * Update progress bar
 *
 * @param {Object} progressBar - Progress bar instance
 * @param {number} current - Current step
 * @param {string} taskName - Current task name
 */
function updateProgress(progressBar, current, taskName) {
  progressBar.update(current, { task: taskName });
}

/**
 * Complete and hide progress bar
 *
 * @param {Object} progressBar - Progress bar instance
 */
function completeProgress(progressBar) {
  progressBar.stop();
}

/**
 * Show the welcome banner: AEXOS Monolith wordmark inside the container frame
 * (Cyryx Labs Design System v1.0).
 *
 * Delegates to the banner module, which pads from *visible* length rather than
 * raw string length. The previous implementation offset `padEnd` by magic
 * constants (+18/+24) to compensate for chalk's ANSI escapes, so the frame
 * overflowed by ~20 columns whenever colour was disabled (NO_COLOR, CI, pipes).
 */
function showWelcome() {
  console.log(renderInstallWelcome());
}

/**
 * Show completion message with excitement
 */
function showCompletion(answers = {}) {
  console.log('');
  console.log(renderInstallCompletion(answers));
  console.log('');
}

/**
 * Show section header
 *
 * @param {string} title - Section title
 */
function showSection(title) {
  console.log('');
  console.log(renderInstallPanel(title, [], { plain: true }));
}

/**
 * Show cancellation message
 */
function showCancellation(options = {}) {
  stopTerminalActivity();
  const lines = [
    '\nInstallation cancelled.',
    options.installationStarted ? 'Installation stopped. Files already written remain in place.' : 'No framework or configuration artifacts were installed.',
    ...(options.createdDirectory ? ['The target directory created by init remains in place.'] : []),
    'Run the same command to start again.\n',
  ];
  console.log(lines.flatMap((line) => wrapText(line, getTerminalCapabilities().width)).join('\n'));
}

/**
 * Estimate time remaining for progress
 *
 * @param {number} current - Current step
 * @param {number} total - Total steps
 * @param {number} startTime - Start timestamp
 * @returns {string} Formatted time estimate
 */
function estimateTimeRemaining(current, total, startTime) {
  if (current === 0) return 'Calculating...';

  const elapsed = Date.now() - startTime;
  const avgTimePerStep = elapsed / current;
  const remaining = (total - current) * avgTimePerStep;

  const seconds = Math.ceil(remaining / 1000);

  if (seconds < 60) {
    return `~${seconds}s remaining`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `~${minutes}m remaining`;
}

module.exports = {
  createSpinner,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showTip,
  createProgressBar,
  updateProgress,
  completeProgress,
  showWelcome,
  showCompletion,
  showSection,
  showCancellation,
  estimateTimeRemaining,
  stopTerminalActivity,
};
