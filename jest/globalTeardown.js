const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');

const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');

module.exports = async function() {
  // Close the browser / Chromium process
  if (global.__PUPPETEER_BROWSER__) {
    await global.__PUPPETEER_BROWSER__.close();
  }
  // Remove the filed wsEndpoint
  rimraf.sync(DIR);
};
