import { writeFileSync } from 'node:fs';

import { searchFactChecks } from '../packages/sources/src/factcheck.ts';

const recordings = {};
for (const query of ['Wrocław darmowa komunikacja', 'PAP usunęła depeszę']) {
  const result = await searchFactChecks(
    { query },
    { apiKey: process.env.GOOGLE_FACTCHECK_API_KEY },
  );
  if (!result.ok) throw new Error(result.message);
  recordings[query] = result;
}
writeFileSync(
  new URL('./fixtures/factchecks.json', import.meta.url),
  JSON.stringify(recordings, null, 2) + '\n',
);
