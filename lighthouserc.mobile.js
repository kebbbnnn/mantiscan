const targetUrl = process.env.TARGET_URL || 'https://example.com';

export default {
  ci: {
    collect: {
      url: [targetUrl],
      numberOfRuns: 3,
      settings: {
        emulatedFormFactor: 'mobile',
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci/mobile',
    },
  },
};
