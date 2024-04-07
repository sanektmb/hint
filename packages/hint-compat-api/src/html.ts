/**
 * @fileoverview Validate if HTML features used are supported in target browsers.
 */

import { HintContext } from 'hint/dist/src/lib/hint-context';
import { IHint } from 'hint/dist/src/lib/types';
import { HTMLAttribute, HTMLElement } from '@hint/utils-dom';
import { getUnsupportedDetails, UnsupportedBrowsers } from '@hint/utils-compat-data';
import { Severity } from '@hint/utils-types';

import { filterBrowsers, joinBrowsers } from './utils/browsers';
import { resolveIgnore } from './utils/ignore';

import meta from './meta/html';
import { getMessage } from './i18n.import';

type ReportData = {
    feature: string;
    unsupported: UnsupportedBrowsers;
};

type Context = {
    browsers: string[];
    ignore: Set<string>;
    report: (data: ReportData) => void;
};

const validateAttributeValue = (element: string, attr: HTMLAttribute, context: Context) => {
    if (context.ignore.has(`${element}[${attr.name}=${attr.value}]`)) {
        return;
    }

    const unsupported = getUnsupportedDetails({ attribute: attr.name, element, value: attr.value }, context.browsers);

    if (unsupported) {
        context.report({ feature: `${element}[${attr.name}=${attr.value}]`, unsupported });
    }
};

const validateAttribute = (element: string, attr: HTMLAttribute, context: Context) => {
    if (context.ignore.has(attr.name) || context.ignore.has(`${element}[${attr.name}]`)) {
        return;
    }

    const unsupported = getUnsupportedDetails({ attribute: attr.name, element }, context.browsers);

    if (unsupported) {
        context.report({ feature: `${element}[${attr.name}]`, unsupported });
    } else {
        validateAttributeValue(element, attr, context);
    }
};

const validateElement = (node: HTMLElement, context: Context) => {
    const element = node.nodeName.toLowerCase();

    if (context.ignore.has(element)) {
        return;
    }

    const unsupported = getUnsupportedDetails({ element }, context.browsers);

    if (unsupported) {
        context.report({ feature: element, unsupported });
    } else {
        for (let i = 0; i < node.attributes.length; i++) {
            validateAttribute(element, node.attributes[i], context);
        }
    }
};

export default class HTMLCompatHint implements IHint {
    public static readonly meta = meta;

    public constructor(context: HintContext) {
        const ignore = resolveIgnore([
            'a[rel=noopener]', // handled by hint-disown-opener
            'autocomplete',
            'crossorigin',
            'input[inputmode]',
            'integrity',
            'link[rel]',
            'main',
            'spellcheck'
        ], context.hintOptions);

        context.on('element::*', ({ element, resource }) => {
            const browsers = filterBrowsers(context.targetedBrowsers);

            const report = ({ feature, unsupported }: ReportData) => {
                const message = getMessage('featureNotSupported', context.language, [feature, joinBrowsers(unsupported)]);
                const documentation = unsupported.mdnUrl ? [{
                    link: unsupported.mdnUrl,
                    text: getMessage('learnMoreHTML', context.language)
                }] : undefined;

                context.report(
                    resource,
                    message,
                    {
                        browsers: unsupported.browsers,
                        documentation,
                        element,
                        severity: Severity.warning
                    }
                );
            };

            validateElement(element, { browsers, ignore, report });
        });
    }
}
