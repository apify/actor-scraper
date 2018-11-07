const Apify = require('apify');
const _ = require('underscore');
const { resolve } = require('url');
const vm = require('vm');
const Ajv = require('ajv');

const { META_KEY } = require('./consts');
const schema = require('../INPUT_SCHEMA.json');

exports.requestToRpOpts = (request) => {
    const opts = _.pick(request, 'url', 'method', 'headers');
    opts.body = request.payload;

    return opts;
};

exports.evalPageFunctionOrThrow = (funcString) => {
    let func;

    try {
        func = vm.runInThisContext(funcString);
    } catch (err) {
        throw new Error(`Compilation of pageFunction failed.\n${err.stack.substr(err.stack.indexOf('\n'))}`);
    }

    if (!_.isFunction(func)) throw new Error('Input parameter "pageFunction" is not a function!');

    return func;
};

exports.enqueueLinks = async ($, selector, purls, requestQueue, parentRequest) => {
    const requests = [];

    $(selector).each((index, el) => {
        const pathOrUrl = $(el).attr('href');
        if (!pathOrUrl) return;

        const url = pathOrUrl.includes('://')
            ? pathOrUrl
            : resolve(parentRequest.url, pathOrUrl);

        purls
            .filter(purl => purl.matches(url))
            .forEach(purl => requests.push(purl.createRequest(url)));
    });

    const requestOperationInfos = [];
    for (const request of requests) {
        // When parent has no depth, it must be the first one.
        const parentDepth = parentRequest.userData[META_KEY].depth || 0;

        // Since constructor does not support custom parameters,
        // we need to attach the metadata later.
        const newRequest = new Apify.Request(request);
        newRequest.userData[META_KEY] = {
            depth: parentDepth + 1,
            parent: parentRequest.id,
            children: [],
        };
        // Enqueue the new request.
        requestOperationInfos.push(await requestQueue.addRequest(newRequest));
        // Add it to its parent's list.
        parentRequest.userData[META_KEY].children[newRequest.id] = 1;
    }
    return requestOperationInfos;
};

exports.maybeParseJson = (maybeJson, paramName) => {
    if (!_.isString(maybeJson)) return maybeJson;

    try {
        return JSON.parse(maybeJson);
    } catch (err) {
        throw new Error(`Input parameter ${paramName} is not valid JSON: ${err}`);
    }
};

exports.checkInputOrThrow = (input) => {
    const ajv = new Ajv({ allErrors: true, useDefaults: true });
    const valid = ajv.validate(schema, input);
    if (!valid) throw new Error(`Invalid input:\n${JSON.stringify(ajv.errors, null, 2)}`);
};

exports.ensureMetaData = ({ id, userData }) => {
    const metadata = userData[META_KEY];
    if (!metadata) {
        userData[META_KEY] = {
            depth: 0,
            parent: null,
            children: {},
        };
        return;
    }
    if (typeof metadata !== 'object') throw new Error(`Request ${id} contains invalid metadata value.`);
};
