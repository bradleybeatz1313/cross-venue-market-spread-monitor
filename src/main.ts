import { setTimeout } from 'node:timers/promises';

import { Actor, log } from 'apify';

import { runAnalysis } from './pipeline.js';

await Actor.init();
Actor.on('aborting', async () => {
    await setTimeout(1000);
    await Actor.exit();
});

try {
    const input = (await Actor.getInput()) ?? {};
    const result = await runAnalysis(input);
    if (result.records.length > 0) await Actor.pushData(result.records);
    await Actor.setValue('OUTPUT', result.summary);
    log.info('Analysis complete', { mode: result.summary.mode, resultCount: result.summary.resultCount });
    await Actor.exit();
} catch (error) {
    log.exception(error instanceof Error ? error : new Error('Unknown Actor failure'), 'Analysis failed closed');
    await Actor.exit({ exitCode: 1 });
}
