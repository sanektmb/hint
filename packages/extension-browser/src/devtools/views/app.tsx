import * as React from 'react';
import { useCallback, useState } from 'react';

import { Config as ConfigData, ErrorData, Results as ResultsData } from '../../shared/types';

import Analyze from './pages/analyze';

import ConfigPage from './pages/config';
import ErrorPage from './pages/error';
import ResultsPage from './pages/results';

import { useCurrentDesignStyles, useCurrentTheme, withCurrentDesign } from '../utils/themes';

import * as fluent from './app.fluent.css';
import * as photon from './app.photon.css';

export const enum Page {
    Config,
    Error,
    Results
}

const emptyResults: ResultsData = { categories: [], url: '' };

export type Props = {
    config?: ConfigData;
    error?: ErrorData;
    isAnalyzing?: boolean;
    page?: Page;
    results?: ResultsData;
};

const App = (props: Props) => {
    const [page, setPage] = useState(props.page || Page.Config);
    const [error, setError] = useState(props.error || {} as ErrorData);
    const [config, setConfig] = useState(props.config || {} as ConfigData);
    const [results, setResults] = useState(props.results || emptyResults);
    const [isAnalyzing, setIsAnalyzing] = useState(props.isAnalyzing || false);

    const styles = useCurrentDesignStyles({ fluent, photon });
    const theme = useCurrentTheme();

    /*
     * Utilize `useCallback` to memoize handlers passed to child components.
     * Allows `shouldComponentUpdate` optimizations to reduce nested re-render.
     *
     * TODO: Pass dispatch from `useReducer` instead.
     *
     * https://reactjs.org/docs/hooks-faq.html#are-hooks-slow-because-of-creating-functions-in-render
     */

    const onCancel = useCallback((duration: number) => {
        setIsAnalyzing(false);
    }, []);

    const onConfigure = useCallback(() => {
        setPage(Page.Config);
    }, []);

    const onError = useCallback((error: ErrorData) => {
        setIsAnalyzing(false);
        setPage(Page.Error);
        setError(error);
    }, []);

    const onRestart = useCallback(() => {
        setIsAnalyzing(true);
    }, []);

    const onResults = useCallback((results: ResultsData, duration: number) => {
        setIsAnalyzing(false);
        setPage(Page.Results);
        setResults(results);
    }, []);

    const onStart = useCallback((newConfig: ConfigData) => {
        setConfig(newConfig);
        onRestart();
    }, [onRestart]);

    const onTimeout = useCallback((duration: number) => {
        setIsAnalyzing(false);
        setPage(Page.Error);
        setError({ message: 'Scan timed out.', stack: '' });
    }, []);

    const getCurrentPage = () => {
        switch (page) {
            case Page.Config:
                return <ConfigPage disabled={isAnalyzing} onStart={onStart} />;
            case Page.Error:
                return <ErrorPage config={config} disabled={isAnalyzing} error={error} onConfigure={onConfigure} onRestart={onRestart} />;
            case Page.Results:
                return <ResultsPage disabled={isAnalyzing} config={config} results={results} onConfigure={onConfigure} onRestart={onRestart} />;
            default:
                throw new Error(`Unknown page: ${page}`);
        }
    };

    return (
        <div className={styles.root} data-theme={theme}>
            {getCurrentPage()}
            {isAnalyzing && <Analyze config={config} onCancel={onCancel} onError={onError} onResults={onResults} onTimeout={onTimeout} />}
        </div>
    );
};

export default withCurrentDesign(App);
