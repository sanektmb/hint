import * as React from 'react';
import { useCallback, useState } from 'react';

import { Config as ConfigData } from '../../../shared/types';

import { getMessage } from '../../utils/i18n';
import { getItem, setItem } from '../../utils/storage';

import Button from '../controls/button';

import PoweredBy from '../powered-by';
import Page from '../page';

import BrowsersConfig from './config/sections/browsers';
import CategoriesConfig from './config/sections/categories';
import ResourcesConfig from './config/sections/resources';
import ConfigHeader from './config/header';
import SeveritiesConfig from './config/sections/severities';

import { resolveIgnoreQuery } from './config/sections/resources';

import * as styles from './config.css';

const configKey = 'webhint-config';

/** Get a saved configuration from a previous session. */
const loadConfig = (): ConfigData => {
    return getItem(configKey) || {};
};

/** Persist the provided configuration for future sessions. */
const saveConfig = (config: ConfigData) => {
    setItem(configKey, config);
};

type Props = {
    disabled?: boolean;

    /** Listener for when the user decides to run a scan. */
    onStart: (config: ConfigData) => void;
};

/**
 * Display options to configure and initialize a scan.
 */
const ConfigPage = ({ disabled, onStart }: Props) => {
    const [config, setConfig] = useState(loadConfig);

    const onAnalyzeClick = useCallback(async () => {
        saveConfig(config);

        const ignoredUrls = await resolveIgnoreQuery(config.ignoredUrls);

        onStart({ ...config, ignoredUrls });
    }, [config, onStart]);

    const onCategoriesChange = useCallback((disabledCategories?: string[]) => {
        setConfig({ ...config, disabledCategories });
    }, [config]);

    const onBrowsersChange = useCallback((browserslist?: string) => {
        setConfig({ ...config, browserslist });
    }, [config]);

    const onResourcesChange = useCallback((ignoredUrls?: string) => {
        setConfig({ ...config, ignoredUrls });
    }, [config]);

    const onSeverityChange = useCallback((severityThreshold?: string) => {
        setConfig({ ...config, severityThreshold });
    }, [config]);

    const onRestoreClick = useCallback(() => {
        setConfig({});
    }, []);

    return (
        <Page className={styles.root} disabled={disabled} onAction={onAnalyzeClick}>
            <ConfigHeader config={config} />
            <main className={styles.main}>
                <div className={styles.categories}>
                    <CategoriesConfig disabled={config.disabledCategories} onChange={onCategoriesChange} />
                    <BrowsersConfig query={config.browserslist} onChange={onBrowsersChange} />
                    <ResourcesConfig query={config.ignoredUrls} onChange={onResourcesChange} />
                    <SeveritiesConfig query={config.severityThreshold} onChange={onSeverityChange} />
                </div>
                <Button className={styles.button} onClick={onRestoreClick}>
                    {getMessage('restoreDefaultsLabel')}
                </Button>
            </main>
            <footer>
                <PoweredBy className={styles.poweredBy} />
            </footer>
        </Page>
    );
};

export default ConfigPage;
