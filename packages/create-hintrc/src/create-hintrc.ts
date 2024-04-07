/**
 * @fileoverview Generates a valid `.hintrc` file based on user responses.
 */

/*
 * ------------------------------------------------------------------------------
 * Requirements
 * ------------------------------------------------------------------------------
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import * as inquirer from 'inquirer';

import { utils } from 'hint';
import {
    getOfficialPackages,
    installPackages,
    logger,
    NpmPackage,
    ResourceType,
    UserConfig
} from '@hint/utils';
import { cwd } from '@hint/utils-fs';
import { debug as d } from '@hint/utils-debug';

import { generateBrowserslistConfig } from './browserslist';

const { resourceLoader: { getInstalledResources, getCoreResources } } = utils;

const debug: debug.IDebugger = d(__filename);
const defaultFormatter = 'summary';

type InitUserConfig = {
    config: UserConfig;
    packages?: string[];
};

/** Validates if the given array is not empty and if so, prints an error message. */
const anyResources = (resources: any[], type: string) => {
    /* istanbul ignore else */
    if (resources.length > 0) {
        return true;
    }

    logger.error(`Couldn't find any installed ${type}s. Visit https://www.npmjs.com/search?q=hint%2F${type}.`);

    return false;
};

const getConfigurationName = (pkgName: string): string => {
    const nameSplitted = pkgName.split('/');

    return nameSplitted[1].replace('configuration-', '');
};

/** Shwos the user a list of official configuration packages available in npm to install. */
const extendConfig = async (): Promise<InitUserConfig | null> => {
    const configPackages: NpmPackage[] = await getOfficialPackages(ResourceType.configuration);

    if (!anyResources(configPackages, ResourceType.configuration)) {
        return null;
    }

    const configNames = configPackages.map((pkg) => {
        return {
            name: getConfigurationName(pkg.name),
            value: pkg.name
        };
    });

    const choices = configNames.filter((config) => {
        return config.name !== 'all';
    });

    const questions: inquirer.QuestionCollection = [{
        choices,
        message: 'Choose the configuration you want to extend from',
        name: 'configuration',
        pageSize: 15,
        type: 'list'
    }];

    const answers: inquirer.Answers = await inquirer.prompt(questions);
    const hintConfig = { extends: [getConfigurationName(answers.configuration)] };

    return {
        config: hintConfig,
        packages: [answers.configuration]
    };
};

/** Prompts a series of questions to create a new configuration object based on the installed packages. */
const customConfig = async (): Promise<InitUserConfig | null> => {
    const connectorKeys = getInstalledResources(ResourceType.connector).concat(getCoreResources(ResourceType.connector));
    const formattersKeys = getInstalledResources(ResourceType.formatter).concat(getCoreResources(ResourceType.formatter));
    const parsersKeys = getInstalledResources(ResourceType.parser).concat(getCoreResources(ResourceType.parser));
    const hintsKeys = getInstalledResources(ResourceType.hint).concat(getCoreResources(ResourceType.hint));

    if (!anyResources(connectorKeys, ResourceType.connector) ||
        !anyResources(formattersKeys, ResourceType.formatter) ||
        !anyResources(hintsKeys, ResourceType.hint)) {

        return null;
    }

    const customQuestions: inquirer.DistinctQuestion[] = [
        {
            choices: connectorKeys,
            message: 'What connector do you want to use?',
            name: 'connector',
            type: 'list'
        },
        {
            choices: formattersKeys,
            default: defaultFormatter,
            message: 'What formatter do you want to use?',
            name: 'formatters',
            pageSize: 15,
            type: 'checkbox'
        },
        {
            choices: hintsKeys,
            message: 'Choose the hints you want to add to your configuration',
            name: 'hints',
            pageSize: 15,
            type: 'checkbox',
            when: (answers: inquirer.Answers) => {
                return !answers.default;
            }
        }
    ];

    // Parsers are not mandatory
    if (parsersKeys.length > 0) {
        customQuestions.push({
            choices: parsersKeys,
            message: 'What parsers do you want to use?',
            name: 'parsers',
            pageSize: 15,
            type: 'checkbox'
        });
    }

    const results: inquirer.Answers = await inquirer.prompt(customQuestions);

    const hintConfig = {
        browserslist: [],
        connector: {
            name: '',
            options: { waitFor: 1000 }
        },
        extends: [],
        formatters: [defaultFormatter],
        hints: {},
        hintsTimeout: 120000,
        ignoredUrls: []
    };

    hintConfig.connector.name = results.connector;
    hintConfig.formatters = results.formatters;

    results.hints.forEach((hint: string) => {
        (hintConfig.hints as any)[hint] = 'error';
    });

    (hintConfig.browserslist as string[]) = await generateBrowserslistConfig();

    return { config: hintConfig };
};

/**
 * Initiates a wizard to generate a valid `.hintrc` file based on:
 * * an existing published configuration package
 * * the installed resources
 */
export default async (): Promise<boolean> => {

    debug('Starting --init');

    logger.log('Welcome to hint configuration generator');

    const initialQuestion: inquirer.QuestionCollection = [{
        choices: ['predefined', 'custom'],
        default: 'predefined',
        message: 'Do you want to use a predefined configuration or create your own based on your installed packages?',
        name: 'configType',
        type: 'list'
    }];

    const initialAnswer: inquirer.Answers = await inquirer.prompt(initialQuestion);

    const result = initialAnswer.configType === 'predefined' ?
        await extendConfig() :
        await customConfig();

    if (!result) {
        return false;
    }

    const filePath: string = path.join(cwd(), '.hintrc');

    await promisify(fs.writeFile)(filePath, JSON.stringify(result.config, null, 4), 'utf8');

    if (Array.isArray(result.packages) && result.packages.length > 0) {
        const isInstalled = getInstalledResources(ResourceType.configuration).includes(getConfigurationName(result.packages[0]));

        if (isInstalled) {
            return true;
        }

        await installPackages(result.packages);
    }

    return true;
};
