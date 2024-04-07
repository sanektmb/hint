import { URL } from 'url';

import { Engine } from 'hint';
import {
    createHelpers,
    DocumentData,
    getElementByUrl,
    HTMLDocument,
    HTMLElement,
    restoreReferences,
    traverse
} from '@hint/utils-dom';
import {
    IConnector,
    FetchEnd,
    NetworkData
} from 'hint/dist/src/lib/types';
import { ConnectorOptionsConfig } from '@hint/utils';

import { browser, document, eval, location, window } from '../shared/globals';
import { Events } from '../shared/types';
import { Evaluator } from './evaluator';
import { Fetcher } from './fetcher';
import { setFetchType } from './set-fetch-type';

export default class WebExtensionConnector implements IConnector {
    private _document: HTMLDocument | undefined;
    private _originalDocument: HTMLDocument | undefined;
    private _engine: Engine;
    private _evaluator = new Evaluator();
    private _fetcher = new Fetcher();
    private _fetchEndQueue: FetchEnd[] = [];
    private _onComplete: (err: Error | null, resource?: string) => void = () => { };
    private _options: ConnectorOptionsConfig;

    public static schema = {
        additionalProperties: false,
        properties: {
            waitFor: {
                minimum: 0,
                type: 'number'
            }
        }
    };

    public constructor(engine: Engine, options?: ConnectorOptionsConfig) {
        this._engine = engine;
        this._options = options || {};

        /* istanbul ignore else */
        if (!this._options.waitFor) {
            this._options.waitFor = 1000;
        }

        (engine as Engine<import('@hint/parser-html').HTMLEvents>).on('parse::end::html', (event) => {
            /* istanbul ignore else */
            if (event.resource === location.href) {
                this._originalDocument = event.document;
            }
        });

        browser.runtime.onMessage.addListener(async (events: Events) => {
            try {
                /** Extension resources cause overhead and noise to the user so they are ignored. */
                if (this.isExtensionResource(events)) {
                    return;
                }

                if (this._fetcher.handle(events)) {
                    return;
                }

                if (events.fetchEnd) {
                    await this.notifyFetch(events.fetchEnd);
                }

                if (events.fetchStart) {
                    await this._engine.emitAsync('fetch::start', events.fetchStart);
                }
                // TODO: Trigger 'fetch::start::target'.
            } catch (err) /* istanbul ignore next */ {
                this._onComplete(err as Error);
            }
        });

        const onLoad = () => {
            const resource = location.href;

            setTimeout(async () => {
                try {
                    await this.evaluateInPage(`(${createHelpers})()`);

                    const snapshot: DocumentData = await this.evaluateInPage('__webhint.snapshotDocument(document)');

                    restoreReferences(snapshot);

                    this._document = new HTMLDocument(snapshot, location.href, this._originalDocument);

                    await this.sendFetchEndEvents();

                    await traverse(this._document, this._engine, resource);

                    /*
                     * Evaluate after the traversing, just in case something goes wrong
                     * in any of the evaluation and some scripts are left in the DOM.
                     */
                    const event = {
                        document: this._document,
                        resource
                    };

                    await this._engine.emitAsync('can-evaluate::script', event);

                    this._onComplete(null, resource);

                } catch (err) /* istanbul ignore next */ {
                    this._onComplete(err as Error);
                }
            }, this._options.waitFor);
        };

        if (document.readyState === 'complete') {
            setTimeout(onLoad, 0);
        } else {
            window.addEventListener('load', onLoad);
        }
    }

    private isExtensionResource(events: Events) {
        /** Only chromium resources seem to get tracked but just in case we add the Firefox protocol as well. */

        const event = events.fetchStart || events.fetchEnd;

        if (!event) {
            return false;
        }

        const resource = event.resource;

        return resource.startsWith('chrome-extension:') || resource.startsWith('moz-extension:');
    }

    private sendMessage(message: Events) {
        browser.runtime.sendMessage(message);
    }

    private async sendFetchEndEvents() {
        for (const event of this._fetchEndQueue) {
            await this.notifyFetch(event);
        }
    }

    private setFetchElement(event: FetchEnd) {
        const url = event.request.url;

        if (this._document) {
            event.element = getElementByUrl(this._document, url);
        }
    }

    private async notifyFetch(event: FetchEnd) {
        /*
         * Delay dispatching FetchEnd until we have the DOM snapshot to populate `element`.
         * But immediately process target's FetchEnd to populate `originalDocument`.
         */
        if (!this._document && event.response.url !== location.href) {
            this._fetchEndQueue.push(event);

            return;
        }

        this.setFetchElement(event);
        const type = await setFetchType(event);

        await this._engine.emitAsync(`fetch::end::${type}` as 'fetch::end::*', event);
    }

    /* istanbul ignore next */
    public fetchContent(target: string, headers?: any): Promise<NetworkData> {
        return this._fetcher.fetch(target, headers);
    }

    public async collect(target: URL) {
        const resource = target.href;

        await this._engine.emitAsync('scan::start', { resource });

        this.sendMessage({ ready: true });

        return new Promise<void>((resolve, reject) => {
            this._onComplete = async (err: Error | null, resource = '') => {
                /* istanbul ignore if */
                if (err) {
                    reject(err);

                    return;
                }

                try {
                    await this._engine.emitAsync('scan::end', { resource });
                    resolve();
                    this.sendMessage({ done: true });
                } catch (e) /* istanbul ignore next */ {
                    reject(e);
                }
            };
        });
    }

    private needsToRunInPage(source: string) {
        return source.includes('/*RunInPageContext*/');
    }

    /**
     * Runs a script in the website context.
     *
     * By default, `eval` runs the scripts in a different context
     * but, some scripts, needs to run in the same context
     * of the website.
     */
    private evaluateInPage(source: string): Promise<any> {
        return this._evaluator.evaluateInPage(source);
    }

    public evaluate(source: string): Promise<any> {
        /*
         * TODO: another option here is changing the interface of IConnector
         * to allow another parameter in evaluate to indicate if we should run
         * the script in the page context or if eval is enough.
         */
        if (this.needsToRunInPage(source)) {
            return this.evaluateInPage(source);
        }

        // `eval` will run the code inside the browser.
        return Promise.resolve(eval(source)); // eslint-disable-line no-eval
    }

    public querySelectorAll(selector: string): HTMLElement[] {
        return this._document ? this._document.querySelectorAll(selector) : [];
    }

    /* istanbul ignore next */
    public close() {
        return Promise.resolve();
    }

    public get dom(): HTMLDocument | undefined {
        return this._document;
    }

    /* istanbul ignore next */
    public get html(): string {
        return this._document ? this._document.pageHTML() : '';
    }
}
