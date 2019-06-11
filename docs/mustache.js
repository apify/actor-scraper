const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');

const defaultPartials = loadPartials('common');

buildTutorial('intro');
buildTutorial('web');
buildTutorial('cheerio');
buildTutorial('puppeteer');

function buildTutorial(dirname) {
    const filename = `${dirname}.md`;
    const templatePath = path.join(__dirname, dirname, filename);
    const template = fs.readFileSync(templatePath, 'utf8');
    const view = getView(dirname);
    const partials = {
        ...defaultPartials,
        ...loadPartials(dirname),
    };
    const markdown = Mustache.render(template, view, partials);
    const buildFilename = `${dirname}-scraper-tutorial.md`;
    const buildPath = path.join(__dirname, 'build', buildFilename);
    fs.writeFileSync(buildPath, markdown);
}

function loadPartials(dirname) {
    const dirPath = path.join(__dirname, dirname, 'partials');
    try {
        return fs
            .readdirSync(dirPath)
            .reduce((partials, filename) => {
                const partialName = filename.split('.')[0];
                partials[partialName] = fs.readFileSync(path.join(dirPath, filename), 'utf8');
                return partials;
            }, {});
    } catch (err) {
        console.log('No partials found for dir: ', dirname);
        return {};
    }
}

function getView(dirname) {
    return {
        name: dirname,
        capitalizedName: dirname.charAt(0).toUpperCase() + dirname.substr(1),
        code: () => (filename) => {
            const codeFile = path.join(__dirname, dirname, 'code', filename);
            const code = fs.readFileSync(codeFile, 'utf8');
            const header = '```js\n';
            const footer = '```';
            return header + code + footer;
        },
        dontForget: dirname === 'web' ? '(don\'t forget to tick that **Inject jQuery** box)' : '',
    };
}
