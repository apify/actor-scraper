import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, Worker, workerData } from 'node:worker_threads';

import log from '@apify/log';

import { clearStorage, colors } from './tools.mjs';

const basePath = join(dirname(fileURLToPath(import.meta.url)), 'scrapers');

// If any of the tests failed - we want to exit with a non-zero code
// so that the CI knows that e2e test suite has failed
let failure = false;

async function run() {
    log.info(`Running E2E scraper tests`);

    const paths = await readdir(basePath, { withFileTypes: true });
    const dirs = paths.filter((dirent) => dirent.isDirectory());

    for (const dir of dirs) {
        if (process.argv.length === 3 && dir.name !== process.argv[2]) {
            continue;
        }

        const now = Date.now();
        const worker = new Worker(fileURLToPath(import.meta.url), {
            workerData: dir.name,
            stdout: true,
            stderr: true,
        });
        /** @type Map<string, string[]> */
        const allLogs = new Map();
        let passedAssertions = 0;
        worker.stderr.on('data', (data) => {
            const str = data.toString();
            const taskLogs = allLogs.get(dir.name) ?? [];
            allLogs.set(dir.name, taskLogs);
            taskLogs.push(str);
        });
        worker.stdout.on('data', (data) => {
            const str = data.toString();
            const taskLogs = allLogs.get(dir.name) ?? [];
            allLogs.set(dir.name, taskLogs);
            taskLogs.push(str);

            const match = str.match(/\[assertion] (passed|failed): (.*)/);

            if (match) {
                if (match[1] === 'passed') passedAssertions++;
                const c = match[1] === 'passed' ? colors.green : colors.red;
                log.info(`${colors.yellow(`[${dir.name}] `)}${match[2]}: ${c(match[1])}`);
            }
        });
        const [code] = await once(worker, 'exit');

        const took = (Date.now() - now) / 1000;
        // A test that exits with 0 before calling expect() is not a pass.
        const passed = code === 0 && passedAssertions > 0;
        const status = passed ? 'success' : 'failure';
        const color = passed ? 'green' : 'red';
        log.info(
            `${colors.yellow(`[${dir.name}] `)}${colors[color](`Test finished with status: ${status} `)}${colors.grey(`[took ${took}s]`)}`,
        );

        await clearStorage(`${basePath}/${dir.name}`);
        const taskLogs = allLogs.get(dir.name);

        if (!passed && taskLogs?.length > 0) {
            // Each log line already end with '\n',
            // So we join them with an empty string.
            log.info(taskLogs.join(''));
        }

        if (!passed) failure = true;
    }
}

if (isMainThread) {
    await run();
    // We want to exit with non-zero code if any of the tests failed
    if (failure) process.exit(1);
} else {
    await import(`${basePath}/${workerData}/test.mjs`);
}
