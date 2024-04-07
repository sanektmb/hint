import { rxLocalhost } from '@hint/utils-network/dist/src/rx-localhost';
import { rxLocalFile } from '@hint/utils-network/dist/src/rx-local-file';
import { Category } from '@hint/utils-types';
import { HintMetadata, HintScope } from 'hint';

import * as Connections from './connections';
import { getMessage } from './i18n.import';

const meta: HintMetadata = {
    docs: {
        category: Category.performance,
        description: getMessage('description', 'en'),
        name: getMessage('name', 'en')
    },
    /* istanbul ignore next */
    getDescription(language: string) {
        return getMessage('description', language);
    },
    /* istanbul ignore next */
    getName(language: string) {
        return getMessage('name', language);
    },
    id: 'performance-budget',
    ignoredUrls: [rxLocalhost, rxLocalFile],
    schema: [{
        additionalProperties: false,
        properties: {
            connectionType: {
                enum: Connections.ids,
                type: 'string'
            },
            loadTime: {
                minimum: 1,
                type: 'number'
            }
        },
        type: 'object'
    }],
    scope: HintScope.site
};

export default meta;
