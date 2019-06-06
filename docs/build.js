const fs = require('fs');
const path = require('path');
const magic = require('markdown-magic');

const outputPath = path.join(__dirname, 'web', 'scraping_tutorial.md');

const config = {
    matchWord: 'MM',
    transforms: {
        /* Match <!-- MM:START (injectFile:path=../file.js) --> */
        injectFile(content, options) {
            const pathToFile = path.resolve(outputPath, options.path);
            return fs.readFileSync(pathToFile);
        },
    },
};

magic(outputPath, config);
