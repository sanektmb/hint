import { debug as d } from '@hint/utils-debug';
import { HTMLElement } from './htmlelement';
import { HTMLDocument } from './htmldocument';

const debug: debug.IDebugger = d(__filename);

type Predicate = (element: HTMLElement) => boolean;

/**
 * Find all elements matching the provided query and test in the target document.
 */
const findMatches = (document: HTMLDocument, query: string, test?: Predicate): HTMLElement[] => {
    let matches: HTMLElement[] = [];

    try {
        matches = document.querySelectorAll(query);
    } catch (e) {
        debug(`Selector is invalid (${query}): ${(e as Error).message}`);
    }

    if (test) {
        matches = matches.filter((match) => {
            return test(match);
        });
    }

    return matches;
};

/**
 * Find the best matching element for the provided query and test in the target document.
 */
const findMatch = (document: HTMLDocument, element: HTMLElement, query: string, test?: Predicate): HTMLElement | null => {
    const matches = findMatches(document, query, test);
    let matchIndex = 0;

    // Handle duplicates by aligning on the nth match across current and original docs.
    if (matches.length > 1) {
        const ownerMatches = findMatches(element.ownerDocument, query, test);

        matchIndex = ownerMatches.findIndex((match) => {
            return match.isSame(element);
        });
    }

    // Return the nth match if possible.
    return matches[matchIndex] || null;
};

/**
 * Perform a best-effort search to find an element in the provided document
 * which is likely the original source for the provided element. Used to
 * resolve element locations to the original HTML when possible.
 */
export const findOriginalElement = (document: HTMLDocument, element: HTMLElement): HTMLElement | null => {
    const name = element.nodeName.toLowerCase();

    // Elements with attributes whose values are typically unique (e.g. IDs or URLs).
    for (const attribute of ['id', 'name', 'data', 'href', 'src', 'srcset', 'charset']) {
        const value = element.getAttribute(attribute);

        if (value) {
            /*
             * Return when a unique attribute exists regardless of whether a match is found.
             * This ensures later tests don't match elements with different IDs or URLs.
             */
            return findMatch(document, element, `${name}[${attribute}="${value}"]`);
        }
    }

    // Elements that typically only occur once.
    if (['base', 'body', 'head', 'html', 'title'].includes(name)) {
        return findMatch(document, element, name);
    }

    // Elements with content that is typically unique.
    if (['audio', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'script', 'style', 'video'].includes(name)) {
        return findMatch(document, element, name, (potentialMatch) => {
            return potentialMatch.innerHTML === element.innerHTML;
        });
    }

    const firstClass = (element.getAttribute('class') || '').split(' ')[0];

    // Elements with class names (try just the first).
    if (firstClass) {
        return findMatch(document, element, `${name}.${firstClass}`);
    }

    // Otherwise use the nth match.
    return findMatch(document, element, name);
};
