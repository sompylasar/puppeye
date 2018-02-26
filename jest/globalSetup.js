const puppeteer = require('puppeteer');
const fs = require('fs');
const mkdirp = require('mkdirp');
const os = require('os');
const path = require('path');

const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');
const metaJsonPath = path.join(DIR, 'meta.json');

module.exports = async function() {
  require('util').inspect.defaultOptions.depth = 20;

  process.on('unhandledRejection', (reason, promise) => {
    console.error('unhandledRejection', reason ? reason.stack || reason : reason, promise);
  });

  if (process.env.WITH_SHARED_BROWSER) {
    const browserSize = { x: 1440, y: 745 };
    const viewportSize = { x: browserSize.x, y: browserSize.y - 80 };
    const puppeteerArgs = []
      .concat(process.env.DISABLE_CHROMIUM_SANDBOX ? ['--no-sandbox'] : []) // For Travis CI
      .concat(['--disable-infobars']) // 'Chrome is being controlled by automated test software'
      .concat([`--window-size=${browserSize.x},${browserSize.y}`]);
    const browser = await puppeteer.launch({
      headless: !!process.env.WITH_HEADLESS_BROWSER,
      slowMo: 0,
      args: puppeteerArgs,
    });
    // Cache the browser instance so we can close it in globalTeardown
    global.__PUPPETEER_BROWSER__ = browser;
    // File the wsEndpoint and size so we have access in the sandboxed testEnvironment
    mkdirp.sync(DIR);
    fs.writeFileSync(
      metaJsonPath,
      JSON.stringify(
        {
          wsEndpoint: browser.wsEndpoint(),
          browserSize: browserSize,
          viewportSize: viewportSize,
        },
        null,
        2,
      ),
    );
  }
};
