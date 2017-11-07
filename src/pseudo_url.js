/**
 * This module defines the PseudoUrl class, which represents a regex-like pattern for URLs.
 *
 * Author: Jan Curn (jan@apifier.com)
 * Copyright(c) 2014 Apifier. All rights reserved.
 *
 * TODO: IPv6 address is also enclosed in [] brackets!!! (see http://en.wikipedia.org/wiki/Uniform_resource_locator)
 * TODO: "http://direct.asda.com/george/[(women|womens)/[[a-z\\-]+]/D[[A-Z0-9]+],default,sc.html" will not fail!!
 *                                                    | missing bracket here!!!
 * TODO: the syntax is not great, what if the regex is using '\\]' symbol ???
 */

import _ from 'underscore';
import { logDebug } from './utils';

export default class PseudoUrl {
    constructor(purl) {
        purl = _.isString(purl) ? purl.trim() : '';
        if (purl.length === 0) throw new Error(`Cannot parse PURL '${purl}': it must be an non-empty string`);

        // Generate a regular expression from the pseudo-URL
        // TODO: if input URL contains '[' or ']', they should be matched their URL-escaped counterparts !!!
        try {
            let regex = '^';
            let openBrackets = 0;
            for (let i = 0; i < purl.length; i++) {
                const ch = purl.charAt(i);

                if (ch === '[' && ++openBrackets === 1) {
                    // Beginning of '[regex]' section
                    // Enclose regex in () brackets to enforce operator priority
                    regex += '(';
                } else if (ch === ']' && openBrackets > 0 && --openBrackets === 0) {
                    // End of '[regex]' section
                    regex += ')';
                } else if (openBrackets > 0) {
                    // Inside '[regex]' section
                    regex += ch;
                } else {
                    // Outside '[regex]' section, parsing the URL part
                    const code = ch.charCodeAt(0);
                    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
                        // Alphanumeric character => copy it.
                        regex += ch;
                    } else {
                        // Special character => escape it
                        const hex = code < 16 ? `0${code.toString(16)}` : code.toString(16);
                        regex += `\\x${hex}`;
                    }
                }
            }
            regex += '$';
            this.regExpString = regex; // useful for debugging, prepared config is printed out including this filed
            this.regExp = new RegExp(regex);

            logDebug(`PURL parsed: PURL='${purl}', REGEX='${regex}'`);
        } catch (e) {
            throw new Error(`Cannot parse PURL '${purl}': ${e}`);
        }
    }

    /**
     * Determines whether a URL matches this pseudo-URL pattern.
     */
    matches(url) {
        return _.isString(url) && url.match(this.regExp) !== null;
    }
}
