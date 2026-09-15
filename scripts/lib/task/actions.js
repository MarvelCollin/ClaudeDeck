const fs = require('fs');
const { loadConfig } = require('../config');
const { readState, writeState } = require('../state');
const { configureSchedule } = require('./schedule-editor');

function createActions(context, platform) {
  function reloadContext() {
    Object.assign(context, loadConfig(context.configPath));
  }

  function install() {
    platform.install(context);
    writeState(context.configHash);
  }

  function syncInstalledTask() {
    if (!platform.exists(context)) return;
    if (readState().configHash === context.configHash) return;
    console.log('Updating background task from claudecron.config.json...');
    install();
  }

  function openLog() {
    if (!fs.existsSync(context.logPath)) {
      console.log(`Log not found: ${context.logPath}`);
      return;
    }
    platform.openLog(context);
  }

  function runBackground() {
    syncInstalledTask();
    if (!platform.exists(context)) install();
    platform.enable(context);
  }

  function stopBackground() {
    const info = platform.summary(context);
    if (!info.installed) {
      console.log('Task is not installed.');
      return;
    }
    if (info.running) platform.stop(context);
    platform.disable(context);
  }

  async function execute(choice) {
    if (choice === 'config' || choice === 'configure') await configureSchedule(context, platform, install, reloadContext);
    else if (choice === 'install') install();
    else if (choice === 'background' || choice === 'start' || choice === '1') runBackground();
    else if (choice === 'stop-background' || choice === 'disable' || choice === '2') stopBackground();
    else if (choice === 'run' || choice === '3') platform.runNow(context);
    else if (choice === 'log' || choice === '4') openLog();
    else if (choice === 'web' || choice === 'profiles' || choice === '5') await require('../../cli/web').openUi();
    else if (choice === 'stop') platform.stop(context);
    else if (choice === 'enable') platform.enable(context);
    else if (choice === 'status') platform.status(context);
    else if (choice === 'delete') platform.deleteTask(context);
    else if (choice !== '0') console.log('Invalid choice.');
  }

  return {
    execute,
    install,
    reloadContext,
    runBackground,
    stopBackground,
    syncInstalledTask,
  };
}

module.exports = {
  createActions,
};
