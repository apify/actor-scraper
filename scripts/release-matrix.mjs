/**
 * Resolves the release matrix for `.github/workflows/release-generic-actors.yaml`.
 *
 * Every Actor in `.github/release-actors.json` has its own version line and can be released on its
 * own, so the workflow inputs decide which of them take part in a run. This script turns those
 * inputs into a single matrix that both the changelog jobs and the build job consume, which keeps
 * the Actor list in one place instead of duplicating it per job.
 *
 * For the `stable` channel it also predicts the build number Apify will assign - the platform bumps
 * the patch of the build currently under the build tag. The changelog heading has to be written
 * before the build is triggered (the Actors build from the Git source, so Apify reads whatever is on
 * master at that moment), which means the number has to be known up front.
 */

import { appendFile, readFile } from 'node:fs/promises';

const CHANNELS = new Set(['stable', 'development', 'custom']);

function requiredEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function nextBuildNumber(current, version) {
    const prefix = `${version}.`;

    if (!current.startsWith(prefix)) {
        throw new Error(
            `Build number "${current}" does not belong to version "${version}". ` +
                'Align .github/release-actors.json with the Actor version configuration on Apify.',
        );
    }

    const patch = Number(current.slice(prefix.length));

    if (!Number.isInteger(patch)) {
        throw new Error(`Cannot parse the patch part of build number "${current}"`);
    }

    return `${prefix}${patch + 1}`;
}

async function predictBuildNumber({ apifyActor, version, buildTag }) {
    // Every generic scraper is public, so this read needs no token - and sending one would add a 401
    // to a step that has nothing to authenticate. A private Actor would fail here with a 404.
    const response = await fetch(`https://api.apify.com/v2/acts/${apifyActor.replace('/', '~')}`);

    if (!response.ok) {
        throw new Error(`Cannot read "${apifyActor}" from the Apify API: ${response.status} ${response.statusText}`);
    }

    const { data } = await response.json();
    const current = data?.taggedBuilds?.[buildTag]?.buildNumber;

    if (!current) {
        console.log(`::warning::"${apifyActor}" has no build under tag "${buildTag}" yet, starting at ${version}.0`);

        return `${version}.0`;
    }

    return nextBuildNumber(current, version);
}

const channel = requiredEnv('BUILD_CHANNEL');

if (!CHANNELS.has(channel)) {
    throw new Error(`Unknown build channel "${channel}"`);
}

const customVersion = process.env.CUSTOM_VERSION?.trim();
const customBuildTag = process.env.CUSTOM_BUILD_TAG?.trim();

if (channel === 'custom' && !(customVersion && customBuildTag)) {
    throw new Error('The "custom" build channel requires both the version and the build tag inputs');
}

const actors = JSON.parse(await readFile('.github/release-actors.json', 'utf8'));
const selection = JSON.parse(requiredEnv('SELECTED_ACTORS'));

const include = [];

for (const actor of actors) {
    // `github.event.inputs` renders booleans as strings, the `inputs` context keeps them as
    // booleans - accept both so the workflow can use either context.
    if (String(selection[actor.actor]) !== 'true') {
        continue;
    }

    const channelSettings =
        channel === 'custom' ? { version: customVersion, buildTag: customBuildTag } : actor[channel];

    if (!channelSettings) {
        throw new Error(`Actor "${actor.actor}" has no "${channel}" channel configured`);
    }

    const entry = {
        actor: actor.actor,
        apifyActor: actor.apifyActor,
        path: actor.path,
        version: channelSettings.version,
        buildTag: channelSettings.buildTag,
    };

    // Only stable releases get a changelog entry, a Git tag and a GitHub release - development and
    // custom builds are throwaway and would just pollute the changelog with versions nobody can run.
    if (channel === 'stable') {
        entry.buildNumber = await predictBuildNumber(entry);
        entry.tag = `${actor.actor}-v${entry.buildNumber}`;
    }

    include.push(entry);
}

if (include.length === 0) {
    throw new Error('No Actor was selected for this release');
}

for (const entry of include) {
    const build = entry.buildNumber ? `, build ${entry.buildNumber}` : '';

    console.log(`${entry.actor}: version ${entry.version}, build tag ${entry.buildTag}${build}`);
}

const outputs = [`matrix=${JSON.stringify({ include })}`, `changelog-enabled=${channel === 'stable'}`].join('\n');

if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${outputs}\n`);
} else {
    console.log(outputs);
}
