/**
 * Playwright config for THiNC / corporate environment.
 * Uses installed Google Chrome and disables video to avoid FFmpeg download.
 */
module.exports = {
  timeout: 120000,
  use: {
    channel: 'chrome',
    headless: false,
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true
  }
};
