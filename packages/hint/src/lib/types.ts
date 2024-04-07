import { IFormatterConstructor } from './types/formatters';
import { IConnectorConstructor } from './types/connector';
import { IParserConstructor } from './types/parser';
import { IHintConstructor } from './types/hints';

export * from './types/connector';
export * from './types/events';
export * from './types/formatters';
export * from './types/network';
export * from './types/hints';
export * from './types/parser';
export * from './types/analyzer';
export * from './types/analyzer-error';

/** A resource required by hint: Connector, Formatter, Hint. */
export type Resource = IConnectorConstructor | IFormatterConstructor | IHintConstructor;

export type CLIOptions = {
    _: string[];
    'analytics-debug': boolean;
    config: string;
    debug: boolean;
    help: boolean;
    language: string;
    output: string;
    version: boolean;
    watch: boolean;

    /**
     * formatter name(s) to be used. If provided this will override the config file setting value
     * For more than one formatter, use comma separated, with no spaces values. E.g.: "excel,summary"
     */
    formatters: string;

    /**
     * hint name(s) to be used. If provided this will override the config file setting value
     * For more than one hint, use comma separated, with no spaces values. E.g.: "content-type,axe"
     */
    hints: string;
};

export type HintResources = {
    connector: IConnectorConstructor | null;
    formatters: IFormatterConstructor[];
    incompatible: string[];
    missing: string[];
    parsers: IParserConstructor[];
    hints: IHintConstructor[];
};

/**
 * Get just the `string` keys of `T` as `keyof T` can be `string | number | symbol`.
 * https://github.com/Microsoft/TypeScript/issues/23724#issuecomment-384807714
 */
export type StringKeyOf<T> = Extract<keyof T, string>;
