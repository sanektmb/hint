/* eslint-disable */
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import anyTest, { TestFn, ExecutionContext } from 'ava';
import * as InquirerTypes from 'inquirer';

import * as handlebarsUtils from '../src/handlebars-utils';

type Inquirer = {
    prompt: (questions: InquirerTypes.Question[]) => Promise<any>;
};

type FsExtra = {
    copy: (orig: string, dest: string) => void;
};

type Mkdirp = (dir: string, callback: Function) => void;
type ReadFileAsync = () => Promise<string>;
type WriteFileAsync = () => void;
type IsOfficial = () => Promise<boolean>;
type NormalizeStringByDelimiter = () => string;

type HandlebarsUtils = {
    escapeSafeString: (str: string) => hbs.SafeString;
    compileTemplate: (filePath: string, data: any) => Promise<string>;
};

type NewParserContext = {
    sandbox: sinon.SinonSandbox;
    fsExtra: FsExtra;
    fsExtraCopyStub: sinon.SinonStub<[string, string], void>;
    handlebarsUtils: HandlebarsUtils
    handlebarsUtilsCompileTemplateStub: sinon.SinonStub<[string, any], Promise<string>>;
    inquirer: Inquirer;
    isOfficial: IsOfficial;
    mkdirp: Mkdirp;
    normalizeStringByDelimiter: NormalizeStringByDelimiter;
    normalizeStringByDelimiterDefaultStub: sinon.SinonStub<[], string>;
    readFileAsync: ReadFileAsync;
    readFileAsyncDefaultStub: sinon.SinonStub<[], Promise<string>>;
    writeFileAsync: WriteFileAsync;
    writeFileAsyncDefaultStub: sinon.SinonStub<[], void>;
};

const test = anyTest as TestFn<NewParserContext>;

const initContext = (t: ExecutionContext<NewParserContext>) => {
    const sandbox = sinon.createSandbox();

    t.context.fsExtra = { copy() { } };
    t.context.fsExtraCopyStub = sandbox.stub(t.context.fsExtra, 'copy').resolves();
    t.context.handlebarsUtils = {
        compileTemplate(filePath: string, data: any) {
            return Promise.resolve('');
        },
        escapeSafeString: handlebarsUtils.escapeSafeString
    };
    t.context.handlebarsUtilsCompileTemplateStub = sandbox.stub(t.context.handlebarsUtils, 'compileTemplate').resolves('');
    t.context.inquirer = { prompt(questions: InquirerTypes.Question[]) { return Promise.resolve(); } };
    t.context.isOfficial = () => { return Promise.resolve(false); };
    t.context.mkdirp = (dir: string, callback: Function) => {
        callback();
    };
    t.context.normalizeStringByDelimiter = (): string => {
        return '';
    };
    t.context.normalizeStringByDelimiterDefaultStub = sandbox.stub(t.context, 'normalizeStringByDelimiter').returns('');
    t.context.readFileAsync = () => { return Promise.resolve(''); };
    t.context.readFileAsyncDefaultStub = sandbox.stub(t.context, 'readFileAsync').resolves('');
    t.context.sandbox = sandbox;
    t.context.writeFileAsync = () => { };
    t.context.writeFileAsyncDefaultStub = sandbox.stub(t.context, 'writeFileAsync').resolves();
};

const loadScript = (context: NewParserContext) => {
    const script = proxyquire('../src/new-parser', {
        '../src/handlebars-utils': context.handlebarsUtils,
        '@hint/utils': {
            isOfficial: context.isOfficial,
            normalizeStringByDelimiter: context.normalizeStringByDelimiter,

        },
        '@hint/utils-fs': {
            readFileAsync: context.readFileAsync,
            writeFileAsync: context.writeFileAsync
        },
        'fs-extra': context.fsExtra,
        inquirer: context.inquirer,
        mkdirp: context.mkdirp
    });

    return script.default;
};

test.beforeEach(initContext);

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('It should create a new official parser.', async (t) => {
    const parserInfoResult = {
        description: 'description',
        name: 'name'
    };
    const parserEventsResult = {
        again: false,
        event: 'fetch::end::*'
    };
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'isOfficial').resolves(true);
    sandbox.stub(t.context.inquirer, 'prompt')
        .onFirstCall()
        .resolves(parserInfoResult)
        .onSecondCall()
        .resolves(parserEventsResult);

    const newParser = loadScript(t.context);
    const result = await newParser();

    // 6 files (2 code + test + doc + tsconfig.json + package.json)
    t.is(t.context.handlebarsUtilsCompileTemplateStub.callCount, 6, `Handlebars doesn't complile the right number of files`);
    // 6 files (2 code + test + doc + tsconfig.json + package.json)
    t.is(t.context.writeFileAsyncDefaultStub.callCount, 6, 'Invalid number of files created');

    t.true(result);
    t.true(t.context.fsExtraCopyStub.calledOnce);
});

test('It should create a new official parser with no duplicate events.', async (t) => {
    const parserInfoResult = {
        description: 'description',
        name: 'name'
    };
    const parserEventsResult1 = {
        again: true,
        event: 'fetch::end::*'
    };
    const parserEventsResult2 = {
        again: true,
        element: 'div',
        event: 'element::'
    };
    const parserEventsResult3 = {
        again: false,
        element: 'script',
        event: 'element::'
    };
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'isOfficial').resolves(true);
    const inquirerPromptStub = sandbox.stub(t.context.inquirer, 'prompt')
        .onCall(0)
        .resolves(parserInfoResult)
        .onCall(1)
        .resolves(parserEventsResult1)
        .onCall(2)
        .resolves(parserEventsResult2)
        .onCall(3)
        .resolves(parserEventsResult3);

    const newParser = loadScript(t.context);
    const result = await newParser();
    const questions = inquirerPromptStub.args[3][0] as InquirerTypes.Question[];

    const eventQuestion = questions.find((question) => {
        return question.name === 'event';
    });
    const eventList = (eventQuestion as any).choices as Array<string>;
    const containFetchEnd = eventList!.includes('fetch::end::*');
    const containElement = eventList!.includes('element::');
    const data = t.context.handlebarsUtilsCompileTemplateStub.args[0][1];
    const events = data.events.map((event: { event: string }) => {
        return event.event;
    });
    const eventsSet = new Set(events);

    // 6 files (2 code + test + doc + tsconfig.json + package.json)
    t.is(t.context.handlebarsUtilsCompileTemplateStub.callCount, 6, `Handlebars doesn't complile the right number of files`);
    // 6 files (2 code + test + doc + tsconfig.json + package.json)
    t.is(t.context.writeFileAsyncDefaultStub.callCount, 6, 'Invalid number of files created');

    t.false(containFetchEnd);
    t.true(containElement);

    t.is(events.length, eventsSet.size);

    t.true(result);
    t.true(t.context.fsExtraCopyStub.calledOnce);
});

test('It should create a new non-official parser.', async (t) => {
    const parserInfoResult = {
        description: 'description',
        name: 'name'
    };
    const parserEventsResult = {
        again: false,
        event: 'fetch::end::*'
    };
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'isOfficial').resolves(false);
    sandbox.stub(t.context.inquirer, 'prompt')
        .onFirstCall()
        .resolves(parserInfoResult)
        .onSecondCall()
        .resolves(parserEventsResult);

    const newParser = loadScript(t.context);
    const result = await newParser();

    // 7 files (2 code + test + doc + tsconfig.json + package.json + .hintrc)
    t.is(t.context.handlebarsUtilsCompileTemplateStub.callCount, 7, `Handlebars doesn't complile the right number of files`);
    // 7 files (2 code + test + doc + tsconfig.json + package.json + .hintrc)
    t.is(t.context.writeFileAsyncDefaultStub.callCount, 7, 'Invalid number of files created');

    t.true(result);
    t.true(t.context.fsExtraCopyStub.calledTwice);
});
