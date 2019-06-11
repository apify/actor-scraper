const fs = require('fs');
const path = require('path');
const magic = require('markdown-magic');

const sourcePath = path.join(__dirname, 'web', 'tutorial.template.md');

const config = {
    DEBUG: true,
    outputDir: './build',
    matchWord: 'MM',
    transforms: {
        /* Match <!-- MM:START (injectFile:path=../file.js) --> */
        injectFile(content, options) {
            const docsDir = path.dirname(sourcePath);
            const pathToFile = path.resolve(docsDir, options.path);
            return fs.readFileSync(pathToFile);
        },
    },
};

magic(sourcePath, config);
