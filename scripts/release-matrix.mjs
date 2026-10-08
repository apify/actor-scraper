/**
 * Resolves the release matrix for `.github/workflows/release-generic-actors.yaml`.
 *
 * Every Actor in `.github/release-actors.json` has its own version line and can be released on its
 * own, so the workflow inputs decide which of them take part in a run. This script turns those
 * inputs into a single matrix that both the changelog jobs and the build job consume, which keeps
 * the Actor list in one place instead of duplicating it per job.
 *
 * For the `stable` channel it also predicts the build number Apify will assign - the platform bumps
 * the patch of the latest build of the version, whether that build succeeded or not. The changelog
 * heading has to be written before the build is triggered (the Actors build from the Git source, so
 * Apify reads whatever is on master at that moment), which means the number has to be known up front.
 */

import { appendFile, readFile } from 'node:fs/promises';

function requiredEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

async function readApify(path) {
    const response = await fetch(`https://api.apify.com/v2${path}`, {
        headers: { Authorization: `Bearer ${requiredEnv('APIFY_TOKEN')}` },
    });

    if (!response.ok) {
        throw new Error(`Cannot read ${path} from the Apify API: ${response.status} ${response.statusText}`);
    }

    const { data } = await response.json();

    return data;
}

async function predictBuildNumber({ apifyActor, version, buildTag }) {
    const actorPath = `/acts/${apifyActor.replace('/', '~')}`;
    const prefix = `${version}.`;

    // The build under the tag shows which version the tag serves on Apify. Comparing it with the
    // configured version stops a stale .github/release-actors.json before anything is published.
    const tagged = (await readApify(actorPath)).taggedBuilds?.[buildTag]?.buildNumber;

    if (tagged && !tagged.startsWith(prefix)) {
        throw new Error(
            `"${apifyActor}" serves build ${tagged} under tag "${buildTag}", not version "${version}". ` +
                'Align .github/release-actors.json with the Actor version configuration on Apify.',
        );
    }

    // The number itself does not come from the tag: the tag only moves when a build succeeds, while a
    // failed build consumes its number all the same, so after one the prediction would fall a number
    // behind. Listing the builds needs a token even for a public Actor.
    const { items } = await readApify(`${actorPath}/builds?desc=1&limit=1000`);
    const patches = items
        .map(({ buildNumber }) => buildNumber)
        .filter((buildNumber) => buildNumber?.startsWith(prefix))
        .map((buildNumber) => Number(buildNumber.slice(prefix.length)));

    if (patches.length === 0 || !patches.every(Number.isInteger)) {
        throw new Error(
            `Cannot read the builds of version "${version}" of "${apifyActor}". ` +
                'Align .github/release-actors.json with the Actor version configuration on Apify.',
        );
    }

    return `${prefix}${Math.max(...patches) + 1}`;
}

const channel = requiredEnv('BUILD_CHANNEL');

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
