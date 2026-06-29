import { ApifyClient } from 'apify-client';

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

function requiredEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

const token = requiredEnv('APIFY_TOKEN');
const actorId = requiredEnv('APIFY_ACTOR');
const buildVersion = requiredEnv('BUILD_VERSION');
const buildTag = requiredEnv('BUILD_TAG');
const timeoutSecs = Number(process.env.APIFY_RELEASE_BUILD_TIMEOUT_SECS ?? 900);

if (!Number.isInteger(timeoutSecs) || timeoutSecs <= 0) {
    throw new Error(`APIFY_RELEASE_BUILD_TIMEOUT_SECS must be a positive integer, got "${timeoutSecs}"`);
}

const client = new ApifyClient({ token });
const actorClient = client.actor(actorId);
const versionClient = actorClient.version(buildVersion);

const version = await versionClient.get();

if (!version) {
    throw new Error(`Actor version "${buildVersion}" does not exist on "${actorId}"`);
}

if (version.buildTag !== buildTag) {
    throw new Error(
        `Actor version "${buildVersion}" has build tag "${version.buildTag}", but the workflow requested "${buildTag}". ` +
            'Align the workflow matrix with the Actor version configuration before building.',
    );
}

if (version.sourceType !== 'GIT_REPO') {
    throw new Error(
        `Actor version "${buildVersion}" uses sourceType "${version.sourceType}". This workflow only builds Git sources.`,
    );
}

console.log(
    `Building ${actorId} version ${buildVersion} (tag ${buildTag}) from ${version.gitRepoUrl ?? '<configured Git source>'}`,
);

const build = await actorClient.build(buildVersion, { tag: buildTag });

console.log(`Triggered build ${build.id} (${actorId}, version ${buildVersion}, tag ${buildTag})`);

const finishedBuild = await client.build(build.id).waitForFinish({ waitSecs: timeoutSecs });
const status = finishedBuild?.status ?? '<unknown>';

console.log(`Build ${build.id}: ${status}`);

if (!TERMINAL_STATUSES.has(status)) {
    throw new Error(`Timed out waiting for build ${build.id}; last status was ${status}`);
}

if (status !== 'SUCCEEDED') {
    const buildLog = await client.build(build.id).log().get({ raw: true });

    if (buildLog) {
        console.log(buildLog);
    }

    throw new Error(`Build ${build.id} ended as ${status}`);
}

console.log(`Build ${build.id} SUCCEEDED`);
