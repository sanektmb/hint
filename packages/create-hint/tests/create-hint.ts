import * as path from 'path';

import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import anyTest, { TestFn, ExecutionContext } from 'ava';

import * as utilsFs from '@hint/utils-fs';

import * as handlebarsUtils from '../src/handlebars-utils';

type Inquirer = {
    prompt: () => Promise<any>;
};

type FsExtra = {
    copy: (orig: string, dest: string) => void;
};

type WriteFileAsyncModule = () => void;
type IsOfficialModule = () => Promise<boolean>;
type CWD = () => string;

type HandlebarsUtils = {
    escapeSafeString: (str: string) => hbs.SafeString;
    compileTemplate: (filePath: string, data: any) => Promise<string>;
};

type fsPromisesType = {
        mkdir: (dir: string, options: any) => Promise<string | undefined>;
};

type CreateHintContext = {
    cwd: CWD;
    inquirer: Inquirer;
    isOfficialModule: IsOfficialModule;
    fsExtra: FsExtra;
    handlebarsUtils: HandlebarsUtils;
    sandbox: sinon.SinonSandbox;
    writeFileAsyncModule: WriteFileAsyncModule;
    fsPromises: fsPromisesType;
}

const test = anyTest as TestFn<CreateHintContext>;

const initContext = (t: ExecutionContext<CreateHintContext>) => {
    t.context.cwd = (): string => {
        return '';
    };
    t.context.fsExtra = { copy(orig: string, dest: string) { } };
    t.context.handlebarsUtils = {
        compileTemplate(filePath: string, data: any) {
            return Promise.resolve('');
        },
        escapeSafeString: handlebarsUtils.escapeSafeString
    };
    t.context.inquirer = {
        prompt() {
            return Promise.resolve({});
        }
    };
    t.context.isOfficialModule = () => {
        return Promise.resolve(false);
    };
    t.context.sandbox = sinon.createSandbox();
    t.context.writeFileAsyncModule = () => { };
    t.context.fsPromises = {
        mkdir(dir: string) {
            return Promise.resolve(dir);
        }
    };
};

const loadScript = (context: CreateHintContext) => {
    const script = proxyquire('../src/create-hint', {
        '../src/handlebars-utils': context.handlebarsUtils,
        '@hint/utils': { isOfficial: context.isOfficialModule },
        '@hint/utils-fs': {
            cwd: context.cwd,
            readFile: utilsFs.readFile,
            writeFileAsync: context.writeFileAsyncModule
        },
        'fs-extra': context.fsExtra,
        'fs/promises': context.fsPromises,
        inquirer: context.inquirer
    });

    return script.default;
};

test.beforeEach(initContext);

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('It creates a hint if the option multiple hints is false', async (t) => {
    const results = {
        category: 'pwa',
        description: 'An awesome new hint',
        multi: false,
        name: 'awesome hint',
        useCase: 'request'
    };
    const root = '/tests/';
    const sandbox = sinon.createSandbox();

    const fsExtraCopyStub = sandbox.stub(t.context.fsExtra, 'copy').resolves();
    const miscWriteFileAsyncStub = sandbox.stub(t.context, 'writeFileAsyncModule').resolves();
    const handlebarsCompileTemplateStub = sandbox.stub(t.context.handlebarsUtils, 'compileTemplate').resolves('');

    sandbox.stub(t.context, 'isOfficialModule').resolves(true);
    sandbox.stub(t.context.fsPromises, 'mkdir').resolves();
    sandbox.stub(t.context, 'cwd').returns(root);
    sandbox.stub(t.context.inquirer, 'prompt').resolves(results);

    const newHint = loadScript(t.context);
    const result = await newHint();

    t.true(fsExtraCopyStub.args[0][0].endsWith('files'), 'Unexpected path for official files');
    t.is(fsExtraCopyStub.args[0][1], path.join(root, 'packages', 'hint-awesome-hint'), 'Copy path is not the expected one');

    // package.json, readme.md, tsconfig.json, hint.ts, meta.ts, tests/hint.ts
    t.is(handlebarsCompileTemplateStub.callCount, 7, `Handlebars doesn't complile the right number of files`);
    t.is(miscWriteFileAsyncStub.callCount, 7, 'Invalid number of files created');

    t.true(result);

    sandbox.restore();
});

test('It creates a package with multiple hints', async (t) => {
    const packageResults = {
        description: 'An awesome new package',
        multi: true,
        name: 'awesome package'
    };
    const hint1Results = {
        again: true,
        category: 'pwa',
        description: 'An awesome hint 1',
        name: 'hint',
        useCase: 'request'
    };
    const hint2Results = {
        again: false,
        category: 'pwa',
        description: 'An awesome hint 2',
        name: 'awesome hint 2',
        useCase: 'request'
    };
    const root = '/tests/';
    const sandbox = sinon.createSandbox();

    const fsExtraCopyStub = sandbox.stub(t.context.fsExtra, 'copy').resolves();
    const miscWriteFileAsyncStub = sandbox.stub(t.context, 'writeFileAsyncModule').resolves();
    const handlebarsCompileTemplateStub = sandbox.stub(t.context.handlebarsUtils, 'compileTemplate').resolves('');

    sandbox.stub(t.context, 'isOfficialModule').resolves(false);
    sandbox.stub(t.context, 'cwd').returns(root);
    sandbox.stub(t.context.inquirer, 'prompt')
        .onFirstCall()
        .resolves(packageResults)
        .onSecondCall()
        .resolves(hint1Results)
        .onThirdCall()
        .resolves(hint2Results);

    const newHint = loadScript(t.context);
    const result = await newHint();

    t.true(fsExtraCopyStub.args[0][0].endsWith('no-official-files'), 'Unexpected path for non official files');
    t.true(fsExtraCopyStub.args[1][0].endsWith('files'), 'Unexpected path for official files');
    t.is(fsExtraCopyStub.args[0][1], path.join(root, 'hint-awesome-package'), 'Copy path is not the expected one');
    t.is(fsExtraCopyStub.args[1][1], path.join(root, 'hint-awesome-package'), 'Copy path is not the expected one');

    // index.ts, package.json, readme.md, tsconfig.json, .hintrc, hint.ts * 2, meta.ts * 2 (one for each rule) + 1 for the meta.ts (index), tests/hint.ts * 2, docs/hint.md * 2
    t.is(handlebarsCompileTemplateStub.callCount, 14, `Handlebars doesn't complile the right number of files`);
    t.is(miscWriteFileAsyncStub.callCount, 14, 'Invalid number of files created');

    t.true(result);

    sandbox.restore();
});
