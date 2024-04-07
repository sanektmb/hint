/**
 * @fileoverview Validate if CSS features used are supported in target browsers.
 */

import intersection = require('lodash/intersection');
import { AtRule, Container, Rule, Declaration, ChildNode } from 'postcss';

import { HintContext } from 'hint/dist/src/lib/hint-context';
import { IHint } from 'hint/dist/src/lib/types';
import { Severity } from '@hint/utils-types';
import { StyleEvents } from '@hint/parser-css/dist/src/types';
import { getUnsupportedDetails, UnsupportedBrowsers } from '@hint/utils-compat-data';
import { getCSSCodeSnippet, getCSSLocationFromNode, getUnprefixed, getVendorPrefix } from '@hint/utils-css';

import { formatAlternatives } from './utils/alternatives';
import { filterBrowsers, joinBrowsers } from './utils/browsers';
import { filterSupports } from './utils/filter-supports';
import { resolveIgnore } from './utils/ignore';

import meta from './meta/css';
import { getMessage } from './i18n.import';

type ReportData = {
    feature: string;
    formatFeature?: (name: string) => string;
    isValue?: boolean;
    node: ChildNode;
    unsupported: UnsupportedBrowsers;
};

type ReportMap = Map<string, ReportData[] | 'supported'>;

type Context = {
    browsers: string[];
    ignore: Set<string>;
    report: (data: ReportData) => void;
    walk: (ast: Container, context: Context) => void;
};

const validateAtSupports = (node: AtRule, context: Context): void => {
    const supported = filterSupports(node.params, context.browsers);

    if (supported) {
        context.walk(node, { ...context, browsers: supported });
    }
};

const validateAtRule = (node: AtRule, context: Context): ReportData | null => {
    if (node.name === 'supports') {
        validateAtSupports(node, context);

        return null;
    }

    const unsupported = getUnsupportedDetails({ rule: node.name }, context.browsers);

    if (unsupported) {
        const formatFeature = (name: string) => {
            return `@${name}`;
        };

        return { feature: formatFeature(node.name), formatFeature, node, unsupported };
    }

    context.walk(node, context);

    return null;
};

const validateDeclValue = (node: Declaration, context: Context, browsers: string[]): ReportData | null => {
    if (context.ignore.has(`${node.prop}: ${node.value}`)) {
        return null;
    }

    const unsupported = getUnsupportedDetails({ property: node.prop, value: node.value }, browsers);

    if (unsupported) {
        const formatFeature = (value: string) => {
            return `${node.prop}: ${value}`;
        };

        return { feature: formatFeature(node.value), formatFeature, isValue: true, node, unsupported };
    }

    return null;
};

const validateDecl = (node: Declaration, context: Context): ReportData | null => {
    const property = node.prop;

    if (context.ignore.has(property) || context.ignore.has(`${property}: ${node.value}`)) {
        return null;
    }

    const unsupported = getUnsupportedDetails({ property }, context.browsers);

    if (unsupported) {
        return { feature: `${property}`, node, unsupported };
    }

    return null;
};

const validateRule = (node: Rule, context: Context): void => {
    /**
     * TODO: Validate selectors.
     *
     * Commented-out implementation generates too much noise. Need to
     * consider parsing the selector at this level instead of inside
     * `getUnsupported` so the report can contain just the part of
     * the selector that was not supported instead of the entire selector.
     *
     * Also need to handle multiple vendor-prefixed versions of certain
     * selectors in adjacent rules to avoid false positives. We may want to
     * start with pseudo-states like `:valid` only and leave pseudo-elements
     * like `::placeholder` for later.
     *
     * ```ts
     * const unsupported = getUnsupported({ selector: node.selector }, context.browsers);
     *
     * if (unsupported) {
     *     return { feature: `${node.selector}`, node, unsupported };
     * }
     * ```
     */

    context.walk(node, context);
};

/**
 * Filter reports for the same CSS feature (prefixed or not) and only emit
 * those for browsers that were unsupported in ALL reports in the same block,
 * favoring unprefixed reports (if any).
 */
const reportUnsupported = (reportsMap: ReportMap, context: Context): void => {
    for (const reports of reportsMap.values()) {
        if (reports === 'supported') {
            continue;
        }

        // Remove browsers not included in ALL reports for this property.
        const browsers = intersection(...reports.map((report) => {
            return report.unsupported.browsers;
        }));

        // Ignore if every browser passed at least one report for this property.
        if (!browsers.length) {
            continue;
        }

        // Prefer reporting unprefixed reports (if any).
        const unprefixedReports = reports.filter(({ node }) => {
            switch (node.type) {
                case 'atrule':
                    return !getVendorPrefix(node.name);
                case 'decl':
                    return !getVendorPrefix(node.prop) && !getVendorPrefix(node.value);
                default:
                    return false;
            }
        });

        const finalReports = unprefixedReports.length ? unprefixedReports : reports;

        for (const report of finalReports) {
            const unsupported: UnsupportedBrowsers = {
                browsers,
                details: report.unsupported.details,
                mdnUrl: report.unsupported.mdnUrl
            };

            context.report({ ...report, unsupported });
        }
    }
};

const walk = (ast: Container, context: Context) => {
    if (!ast.nodes) {
        return;
    }

    /*
     * Hold reports de-dupe within this block. Used to eliminate reports for
     * unsupported features when a supported vendor prefixed or unprefixed
     * version of the same feature also exists.
     */
    const reportsMap: ReportMap = new Map();

    const addToReportsMap = (key: string, report: ReportData | null) => {
        // No report means a given feature is fully supported for this block.
        if (!report) {
            reportsMap.set(key, 'supported');

            return;
        }

        const reports = reportsMap.get(key) || [];

        // Track reports unless a feature is fully supported for this block.
        if (reports !== 'supported') {
            reports.push(report);
            reportsMap.set(key, reports);
        }
    };

    for (const node of ast.nodes) {
        let key = '';
        let report: ReportData | null = null;

        switch (node.type) {
            case 'atrule':
                key = `@${getUnprefixed(node.name)} ${node.params}`;
                report = validateAtRule(node, context);
                break;
            case 'comment':
                break; // Ignore comment nodes.
            case 'decl':
                key = `${getUnprefixed(node.prop)}`;
                report = validateDecl(node, context);
                break;
            case 'rule':
                validateRule(node, context);
                break;
            default:
                throw new Error('Unrecognized node type');
        }

        // Only track block-level reports if a feature key was provided.
        if (!key) {
            continue;
        }

        addToReportsMap(key, report);

        // Declaration nodes need special treatment.
        if (node.type === 'decl') {
            /*
             * The property name might be supported everywhere, or on some browsers only, in which case we need to now
             * drill down to the property value on those browsers.
             */
            const supportedBrowsers = !report || !report.unsupported ? context.browsers : context.browsers.filter((browser) => {
                return report && !report.unsupported.browsers.includes(browser);
            });

            key = `${getUnprefixed(node.prop)}: ${getUnprefixed(node.value)}`;
            report = validateDeclValue(node, context, supportedBrowsers);

            addToReportsMap(key, report);
        }
    }

    reportUnsupported(reportsMap, context);
};

export default class CSSCompatHint implements IHint {
    public static readonly meta = meta;

    public constructor(context: HintContext<StyleEvents>) {
        const ignore = resolveIgnore([
            '-moz-appearance: none',
            '-webkit-appearance: none',
            'appearance: none',
            'cursor',
            'zoom: 1'
        ], context.hintOptions);

        context.on('parse::end::css', ({ ast, element, resource }) => {
            const browsers = filterBrowsers(context.targetedBrowsers);

            const report = ({ feature, formatFeature, isValue, node, unsupported }: ReportData) => {
                const alternatives = formatAlternatives(context.language, unsupported, formatFeature);
                const message = [
                    getMessage('featureNotSupported', context.language, [feature, joinBrowsers(unsupported)]),
                    ...alternatives
                ].join(' ');
                const codeSnippet = getCSSCodeSnippet(node);
                const location = getCSSLocationFromNode(node, { isValue });
                const severity = alternatives.length ? Severity.error : Severity.warning;

                const documentation = unsupported.mdnUrl ? [{
                    link: unsupported.mdnUrl,
                    text: getMessage('learnMoreCSS', context.language)
                }] : undefined;

                context.report(
                    resource,
                    message,
                    {
                        browsers: unsupported.browsers,
                        codeLanguage: 'css',
                        codeSnippet,
                        documentation,
                        element,
                        location,
                        severity
                    });
            };

            walk(ast, { browsers, ignore, report, walk });
        });
    }
}
