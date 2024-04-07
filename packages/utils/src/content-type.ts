import { fromBuffer } from 'file-type';
import isSvg from 'is-svg';

import { parse, MediaType } from 'content-type';

import { HTMLElement } from '@hint/utils-dom';
import { debug as d } from '@hint/utils-debug';
import mimeDB from './mime-db';
import { HttpHeaders } from '@hint/utils-types';
import { fileExtension as getFileExtension, fileName as getFileName } from '@hint/utils-fs';
import { normalizeString } from '@hint/utils-string';

const debug = d(__filename);

/*
 * ---------------------------------------------------------------------
 * Private methods
 * ---------------------------------------------------------------------
 */
const getMediaTypeBasedOnFileExtension = (fileExtension: string): string | null => {
    return fileExtension && Object.keys(mimeDB).find((key) => {
        return !!mimeDB[key].extensions && mimeDB[key].extensions!.includes(fileExtension);
    }) || null; // if nothing is found, we return null to be consistent
};

const determineCharset = (originalCharset: string | null, mediaType: string | null): string | null => {

    /*
     * Prior to HTML5, for web pages, `ISO-8859-1` was the
     * default charset:
     *
     * " For example, user agents typically assume that
     *   in the absence of other indicators, the character
     *   encoding is ISO-8859-1. "
     *
     * From: https://www.w3.org/TR/WD-html40-970708/html40.txt
     *
     * However, `ISO-8859-1` is not supported by node directly.
     * https://github.com/webhintio/hint/issues/89
     */

    const charsetAliases: Map<string, string> = new Map([
        ['iso-8859-1', 'latin1']
    ]);

    const defaultCharset = originalCharset && charsetAliases.get(originalCharset) || originalCharset;

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    const typeInfo = (mimeDB as any)[mediaType || ''];
    let determinedCharset = typeInfo && normalizeString(typeInfo.charset);

    if (defaultCharset && (determinedCharset === defaultCharset)) {
        return defaultCharset;
    }

    /*
     * If the determined charset is different from what the server
     * provided, try to figure out which one should be used.
     */

    /*
     * Check if (according to the determined media type) the
     * document is a binary file, and if it is, ignore the charset.
     */

    if (!isTextMediaType(mediaType || '')) { // eslint-disable-line @typescript-eslint/no-use-before-define
        return null;
    }

    /*
     * If it's a text based document, and the charset could
     * not be determined, default to `utf-8`.
     */

    determinedCharset = determinedCharset || 'utf-8';

    /*
     * If the charset was not specified, use the determined
     * one, otherwise, go with the specified one even though
     * it might not be the best charset (e.g.: `ISO-8859-1`
     * vs. `utf-8`).
     *
     * Notes:
     *
     *  * Not going with the specified charset when there is one
     *    might make some of our hints not detect some problems.
     *
     *  * The `content-type` role is responsable for suggesting
     *    the correct/best charset.
     */

    return defaultCharset ? defaultCharset : determinedCharset;
};

const determineMediaTypeForScript = (element: HTMLElement): string | null => {
    const typeAttribute = normalizeString(element.getAttribute('type') || '');

    /*
     * Valid JavaScript media types:
     * https://html.spec.whatwg.org/multipage/scripting.html#javascript-mime-type
     */

    const validJavaScriptMediaTypes = [
        'application/ecmascript',
        'application/javascript',
        'application/x-ecmascript',
        'application/x-javascript',
        'text/ecmascript',
        'text/javascript',
        'text/javascript1.0',
        'text/javascript1.1',
        'text/javascript1.2',
        'text/javascript1.3',
        'text/javascript1.4',
        'text/javascript1.5',
        'text/jscript',
        'text/livescript',
        'text/x-ecmascript',
        'text/x-javascript'
    ];

    /*
     * If the type attribute is:
     *
     *  * omitted (doesn't have a value, or is an empty string)
     *  * set to one of the valid JavaScript media types
     *  * 'module'
     *
     * it means the content is not intended as an data block,
     * and the official JavaScript media type can be suggested.
     *
     * See: https://html.spec.whatwg.org/multipage/scripting.html#attr-script-type
     */

    if (!typeAttribute ||
        validJavaScriptMediaTypes.includes(typeAttribute) ||
        typeAttribute === 'module') {

        /*
         * From https://html.spec.whatwg.org/multipage/scripting.html#scriptingLanguages
         *
         * " Servers should use `text/javascript` for JavaScript
         *   resources. Servers should not use other JavaScript
         *   MIME types for JavaScript resources, and must not
         *   use non-JavaScript MIME types. "
         */

        return 'text/javascript';
    }

    return null;
};

/* istanbul ignore next */
const determineMediaTypeBasedOnElement = (element: HTMLElement | null): string | null => {
    const nodeName = element && normalizeString(element.nodeName);

    if (element && nodeName) {

        if (nodeName === 'script') {
            return determineMediaTypeForScript(element);
        }

        if (nodeName === 'link') {
            const relValue = element.getAttribute('rel');

            /* eslint-disable default-case */
            switch (relValue) {
                case 'stylesheet':
                    // See: https://tools.ietf.org/html/rfc2318.
                    return 'text/css';
                case 'manifest':
                    // See: https://w3c.github.io/manifest/#media-type-registration.
                    return 'application/manifest+json';
            }
            /* eslint-enable default-case */
        }
    }

    return null;
};

const determineMediaTypeBasedOnFileExtension = (resource: string, originalMediaType: string | null = null): string | null => {
    const fileExtension = getFileExtension(resource);

    if (!fileExtension) {
        return null;
    }

    /*
     * The following list is order based on the expected encounter
     * rate and different statistics (e.g. for images, except `ico`,
     * http://httparchive.org/interesting.php#imageformats)
     */

    /*
     * The reasons for hard-coding some of the values here are:
     *
     *  * `mime-db` is quite big, so querying it is expensive.
     *  * `mime-db` sometimes has multiple media types for
     *     the same file type (e.g.: for `js` the result will be
     *     "application/javascript" instead of what this project
     *     recommends, namely `text/javascript`).
     *
     * See also: http://www.iana.org/assignments/media-types/media-types.xhtml
     */

    /* eslint-disable default-case */
    switch (fileExtension) {
        case 'html':
        case 'htm':
            return 'text/html';
        case 'php':
            /**
             * originalMediaType will be null for connector local.
             * In local connector, php doesn't need to be processed
             * as html.
             */
            if (originalMediaType) {
                return 'text/html';
            }
            break;
        case 'xhtml':
            return 'application/xhtml+xml';
        case 'js':
            return 'text/javascript';
        case 'ts':
        case 'tsx':
            return 'text/x-typescript';
        case 'css':
            return 'text/css';
        case 'ico':
            return 'image/x-icon';
        case 'webmanifest':
            // See: https://w3c.github.io/manifest/#media-type-registration.
            return 'application/manifest+json';
        case 'jpeg':
        case 'jpg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'gif':
            return 'image/gif';
        case 'svg':
            // See: https://www.w3.org/TR/SVG/mimereg.html.
            return 'image/svg+xml';
        case 'webp':
            return 'image/webp';
        case 'woff2':
            return 'font/woff2';
        case 'woff':
            return 'font/woff';
        case 'ttf':
            return 'font/ttf';
        case 'otf':
            return 'font/otf';
        case 'xml':
            // See: https://tools.ietf.org/html/rfc3023#page-5.
            return 'text/xml';
    }
    /* eslint-enable default-case */

    // If the file extension is not in the list above, query `mime-db`.

    return getMediaTypeBasedOnFileExtension(fileExtension);
};

/**
 * Determine the media type based on the file name, extension and content.
 * This is only for edge cases. So far it detects:
 *
 * * `.configrc` files: If the content is a valid `json`, it will return `text/json`, `text/plain` otherwise
 *
 */
const determineMediaTypeBasedOnFileName = (resource: string, rawContent: Buffer): string | null => {
    const fileName = getFileName(resource);

    if (!fileName) {
        return null;
    }

    const configFileNameRegex = /^\.[a-z0-9]+rc$/i;

    if (!configFileNameRegex.test(fileName)) {
        return null;
    }

    try {
        // Determine if this is a json file.
        JSON.parse(rawContent.toString());
    } catch (err) {
        return 'text/plain';
    }

    return 'text/json';
};

/* istanbul ignore next */
const determineMediaTypeBasedOnFileType = async (rawContent: Buffer) => {

    if (!rawContent) {
        return null;
    }

    const detectedFileType = await fromBuffer(rawContent);

    if (detectedFileType) {

        /*
         * If the file is XML, check if it's a specific
         * type of XML such as a SVG.
         */

        if (detectedFileType.mime === 'application/xml' &&
            isSvg(rawContent)) {
            // See: https://www.w3.org/TR/SVG/mimereg.html.
            return 'image/svg+xml';
        }

        // Use the media types from `mime-db`, not `file-type`.
        return determineMediaTypeBasedOnFileExtension(detectedFileType.ext);
    }

    return null;
};

/* istanbul ignore next */
const getPreferedMediaType = (mediaType: string | null): string | null => {

    // Prefer certain media types over others.

    switch (mediaType) {
        case 'application/xml':
            /*
             * From https://tools.ietf.org/html/rfc3023#page-5:
             *
             *  " If an XML document -- that is, the unprocessed,
             *    source XML document -- is readable by casual users,
             *    text/xml is preferable to application/xml. "
             */
            return 'text/xml';
        default:
            return mediaType;
    }
};

/* istanbul ignore next */
const parseContentTypeHeader = (headers: HttpHeaders | null): MediaType | null => {
    const contentTypeHeaderValue: string | null = normalizeString(headers ? headers['content-type'] : null);

    // Check if the `Content-Type` header was sent.

    if (contentTypeHeaderValue === null) {
        debug(`'content-type' header was not specified`);

        return null;
    }

    // Check if the `Content-Type` header was sent with a valid value.

    let contentType: MediaType;

    /* istanbul ignore next */
    try {
        if (contentTypeHeaderValue === '') {
            throw new TypeError('invalid media type');
        }

        contentType = parse(contentTypeHeaderValue);
    } catch (e) {
        debug(`'content-type' header value is invalid (${(e as Error).message})`);

        return null;
    }

    return contentType;
};

/*
 * ---------------------------------------------------------------------
 * Public methods
 * ---------------------------------------------------------------------
 */

/*
 * Try to determine the media type and charset based on the response's
 * content-type header value, but also (because sometimes serers are
 * misconfigured) on things such as the file type, element type, and
 * file extension.
 */
/* istanbul ignore next */
const getContentTypeData = async (element: HTMLElement | null, resource: string, headers: HttpHeaders | null, rawContent: Buffer) => {

    let originalMediaType: string | null = null;
    let originalCharset: string | null = null;
    const contentType = parseContentTypeHeader(headers);

    if (contentType) {
        originalCharset = contentType.parameters ? contentType.parameters.charset : null;
        originalMediaType = contentType.type;
    }

    /*
     * Try to determine the media type and charset using
     * what the server specified, but also other available
     * information, as sometimes servers are misconfigured.
     */

    let mediaType =
        determineMediaTypeBasedOnElement(element) ||
        await determineMediaTypeBasedOnFileType(rawContent) ||
        determineMediaTypeBasedOnFileExtension(resource, originalMediaType) ||
        determineMediaTypeBasedOnFileName(resource, rawContent) ||
        originalMediaType;

    mediaType = getPreferedMediaType(mediaType);

    const charset = determineCharset(originalCharset, mediaType);

    return {
        charset,
        mediaType
    };
};

/** Checks if a media type is one of a file type that is text based. */
const isTextMediaType = (mediaType: string): boolean => {
    const textMediaTypes: RegExp[] = [
        /application\/(?:javascript|json|x-javascript|xml)/i,
        /application\/.*\+(?:json|xml)/i,
        /image\/svg\+xml/i,
        /text\/.*/i
    ];

    if (textMediaTypes.some((regex) => {
        return regex.test(mediaType);
    })) {
        return true;
    }

    return false;
};

/**
 * Returns the group to which the mediaType belongs to. E.g.:
 * `image`, `font`, `script`, `css`, `html`, `manifest`, `xml`
 * or `unkown`.
 */
const getType = (mediaType: string) => {
    // e.g, `.babelrc`, mediaType can't be decided from extension or from the file type.
    if (!mediaType) {
        return 'unknown';
    }

    if (mediaType.startsWith('image')) {
        return 'image';
    }

    if (mediaType.startsWith('font') || mediaType === 'application/vnd.ms-fontobject') {
        return 'font';
    }

    /* eslint-disable default-case */
    switch (mediaType) {
        case 'application/javascript':
        case 'text/javascript':
            return 'script';
        case 'text/css':
            return 'css';
        case 'application/json':
        case 'text/json':
            return 'json';
        case 'application/manifest+json':
            return 'manifest';
        case 'text/html':
        case 'application/xhtml+xml':
            return 'html';
        case 'text/xml':
            return 'xml';
        case 'text/plain':
            return 'txt';
    }
    /* eslint-enable default-case */

    return 'unknown';
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export {
    determineMediaTypeBasedOnFileExtension,
    determineMediaTypeBasedOnFileName,
    determineMediaTypeForScript,
    getContentTypeData,
    getFileExtension,
    getType,
    isTextMediaType
};
