const fs = require('fs');
const { promisify } = require('util');

const read = promisify(fs.readFile);

const clientUtilsPath = require.resolve('apify-shared/utilities.client');
const logPath = require.resolve('apify-shared/utilities.client');
const contextPath = require.resolve('./context');

const getSources = async () => {
    const sources = {
        clientUtils: read(clientUtilsPath),
        log: read(logPath),
        context: read(contextPath),
    };
    await Promise.all(Object.values(sources));
    return sources;
};

