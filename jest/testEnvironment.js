const puppeteer = require('puppeteer');
const NodeEnvironment = require('jest-environment-node');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');
const metaJsonPath = path.join(DIR, 'meta.json');

/**
 * @class PuppeteerTestNodeEnvironment
 * @description A custom Node Environment that defines a global function to obtain browser instances.
 */
class PuppeteerTestNodeEnvironment extends NodeEnvironment {
  constructor(config) {
    super(config);
    this._teardown = false;
    this._browserModels = [];
  }

  async setup() {
    await super.setup();

    this.global.__ppt = async (inputs) => {
      if (this._teardown) {
        throw new Error('Requested a new browser instance during teardown.');
      }

      let browser;
      let browserSize;
      let viewportSize;

      if (process.env.WITH_SHARED_BROWSER) {
        const metaJson = JSON.parse(fs.readFileSync(metaJsonPath, 'utf8'));
        if (!metaJson || !metaJson.wsEndpoint || !metaJson.browserSize || !metaJson.viewportSize) {
          throw new Error('meta.json is invalid');
        }
        browser = await puppeteer.connect({
          browserWSEndpoint: metaJson.wsEndpoint,
        });
        browserSize = metaJson.browserSize;
        viewportSize = metaJson.viewportSize;
      } else {
        viewportSize = (inputs && inputs.viewportSize) || { x: 1440, y: 665 };
        browserSize = (inputs && inputs.browserSize) || {
          x: viewportSize.x,
          y: viewportSize.y + 80,
        };
        const puppeteerArgs = []
          .concat(process.env.DISABLE_CHROMIUM_SANDBOX ? ['--no-sandbox'] : []) // For Travis CI
          .concat(['--disable-infobars']) // 'Chrome is being controlled by automated test software'
          .concat([`--window-size=${browserSize.x},${browserSize.y}`]);
        browser = await puppeteer.launch({
          headless: !!process.env.WITH_HEADLESS_BROWSER,
          slowMo: 0,
          args: puppeteerArgs,
        });
      }

      browser.on('disconnected', () => {
        if (!this._teardown) {
          console.error('Browser has disconnected unexpectedly.');
          process.exit(-1);
        }
      });

      const browserModel = {
        browser: browser,
        browserSize: browserSize,
        viewportSize: viewportSize,
      };
      this._browserModels.push(browserModel);

      return browserModel;
    };
  }

  async teardown() {
    this._teardown = true;
    while (this._browserModels.length > 0) {
      const browserModel = this._browserModels.pop();
      if (browserModel && browserModel.browser) {
        await browserModel.browser.close();
      }
    }
    await super.teardown();
  }
}

module.exports = PuppeteerTestNodeEnvironment;
