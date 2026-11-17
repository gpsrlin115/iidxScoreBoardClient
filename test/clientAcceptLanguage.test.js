import test from 'node:test';
import assert from 'node:assert/strict';

// client.js uses extensionless imports, so it is loaded through Vite like the
// other API tests. The i18n module is loaded the same way so both share one
// module instance.
test('requests carry the active UI language in Accept-Language', async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  globalThis.document = { cookie: '' };
  try {
    const { default: client } = await vite.ssrLoadModule('/src/api/client.js');
    const { setLanguage } = await vite.ssrLoadModule('/src/i18n/index.js');
    const sent = [];
    client.defaults.adapter = async (config) => {
      sent.push(config.headers.get('Accept-Language'));
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await client.get('/ping');
    await setLanguage('ja');
    await client.get('/ping');
    await setLanguage('en');
    await client.get('/ping');

    assert.deepEqual(sent, ['ko', 'ja', 'en']);
  } finally {
    delete globalThis.document;
    await vite.close();
  }
});
