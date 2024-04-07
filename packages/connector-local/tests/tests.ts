import * as path from 'path';
import { Stream } from 'stream';

import * as Chokidar from 'chokidar';
import * as sinon from 'sinon';
import anyTest, { TestFn } from 'ava';
import * as proxyquire from 'proxyquire';
import { EventEmitter2 } from 'eventemitter2';

import {
    delay,
    logger
} from '@hint/utils';
import { readFileAsync } from '@hint/utils-fs';
import { asPathString, getAsUri } from '@hint/utils-network';
import { Engine, FetchEnd } from 'hint';
import { HTMLEvents } from '@hint/parser-html';

type SandboxContext = {
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestFn<SandboxContext>;

const mockContext = (context: SandboxContext) => {
    const engine = new EventEmitter2({
        delimiter: '::',
        maxListeners: 0,
        wildcard: true
    }) as Engine<HTMLEvents>;

    engine.clear = () => { };
    engine.clean = () => { };
    engine.notify = () => {
        return Promise.resolve();
    };

    const chokidar = {
        watch(target: string, options: Chokidar.WatchOptions): Stream {
            return new Stream();
        }
    };

    const fsMocks = {
        cwd(): string {
            return '';
        },
        isFile(filePath: string): boolean {
            return false;
        }
    };

    const cwdStub = context.sandbox.stub(fsMocks, 'cwd');
    const isFileStub = context.sandbox.stub(fsMocks, 'isFile');

    const script: typeof import('../src/connector') = proxyquire('../src/connector', {
        '@hint/utils': { logger },
        '@hint/utils-fs': {
            cwd: cwdStub,
            isFile: isFileStub,
            readFileAsync
        },
        chokidar
    });

    return {
        chokidar,
        cwdStub,
        engine,
        isFileStub,
        LocalConnector: script.default
    };
};

test.beforeEach((t) => {
    t.context.sandbox = sinon.createSandbox();
});

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test(`it should not throw if target path has spaces and [brackets]`, async (t) => {
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'folder with spaces and [brackets]', 'script with spaces and [brackets].js'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(true);

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await t.notThrowsAsync(connector.collect(fileUri), 'connector does not throw');
    }
});

test(`If target is a file, it should emit 'fetch::start::target' event`, async (t) => {
    const sandbox = t.context.sandbox;
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch', 'script.js'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);


    isFileStub.returns(true);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await connector.collect(fileUri);
    }

    t.is(engineEmitAsyncSpy.callCount, 4);
    t.is(engineEmitAsyncSpy.args[0][0], 'scan::start');
    t.is(engineEmitAsyncSpy.args[1][0], 'fetch::start::target');
    t.is(engineEmitAsyncSpy.args[2][0], 'fetch::end::script');
});

test(`If target is a html file, it should emit 'fetch::end::html' event instead of 'fetch::end'`, async (t) => {
    const sandbox = t.context.sandbox;
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch', 'test.html'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(true);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await connector.collect(fileUri);
    }

    t.is(engineEmitAsyncSpy.callCount, 4);
    t.is(engineEmitAsyncSpy.args[0][0], 'scan::start');
    t.is(engineEmitAsyncSpy.args[1][0], 'fetch::start::target');
    t.is(engineEmitAsyncSpy.args[2][0], 'fetch::end::html');
});

test(`If target is a file (text), 'content' is setted`, async (t) => {
    const sandbox = t.context.sandbox;
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch', 'script.js'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(true);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await connector.collect(fileUri);
    }

    const event = engineEmitAsyncSpy.args[2][1];

    t.is(typeof (event as FetchEnd).response.body.content, 'string');
    t.not((event as FetchEnd).response.body.content, '');
});

test(`If content is passed, it is used instead of the file`, async (t) => {
    const sandbox = t.context.sandbox;
    const testContent = '"Test Content";';
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch', 'script.js'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(true);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await connector.collect(fileUri, { content: testContent });
    }

    const event = engineEmitAsyncSpy.args[2][1];

    t.is(typeof (event as FetchEnd).response.body.content, 'string');
    t.is((event as FetchEnd).response.body.content, testContent);
});

test(`If target is a file (image), 'content' is empty`, async (t) => {
    const sandbox = t.context.sandbox;
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch', 'stylish-output.png'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(true);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await connector.collect(fileUri);
    }

    const event = engineEmitAsyncSpy.args[2][1];

    t.is(typeof (event as FetchEnd).response.body.content, 'string');
    t.is((event as FetchEnd).response.body.content, '');
});

test(`If target is an image, 'content' is empty`, async (t) => {
    const sandbox = t.context.sandbox;
    const fileUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch', 'stylish-output.png'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(true);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (fileUri) {
        await connector.collect(fileUri);
    }

    const event = engineEmitAsyncSpy.args[2][1];

    t.is(typeof (event as FetchEnd).response.body.content, 'string');
    t.is((event as FetchEnd).response.body.content, '');
});

test(`If target is a directory, shouldn't emit the event 'fetch::start::target'`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch'));
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(false);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (directoryUri) {
        await connector.collect(directoryUri);
    }

    t.is(engineEmitAsyncSpy.callCount, 5);

    const events: string[] = engineEmitAsyncSpy.args.map((arg: any[]) => {
        return arg[0];
    }).sort();

    t.is(events[0], 'fetch::end::html');
    t.is(events[1], 'fetch::end::image');
    t.is(events[2], 'fetch::end::script');
    t.is(events[3], 'scan::end');
    t.is(events[4], 'scan::start');
});

test(`If target is a directory, passed content should be ignored`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'no-watch'));
    const testContent = 'Test Content';
    const { engine, isFileStub, LocalConnector } = mockContext(t.context);

    isFileStub.returns(false);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    const connector = new LocalConnector(engine as any, {});

    if (directoryUri) {
        await connector.collect(directoryUri, { content: testContent });
    }

    t.is(engineEmitAsyncSpy.callCount, 5);

    const events: any[][] = engineEmitAsyncSpy.args.map((args: any[]) => {
        return args;
    }).sort();

    t.is(events[0][0], 'fetch::end::html');
    t.not(events[0][1].response.body.content, testContent);
    t.is(events[1][0], 'fetch::end::image');
    t.not(events[1][1].response.body.content, testContent);
    t.is(events[2][0], 'fetch::end::script');
    t.not(events[2][1].response.body.content, testContent);
    t.is(events[3][0], 'scan::end');
    t.is(events[4][0], 'scan::start');
});

test(`If watch is true, it should watch the right files`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-no-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');
    const chokidarWatchStub = sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(1000);

    stream.emit('close');

    await promise;

    t.is(engineEmitAsyncSpy.callCount, 2);

    const events: string[] = engineEmitAsyncSpy.args.map((arg: any[]) => {
        return arg[0];
    }).sort();

    t.is(events[0], 'fetch::end::json');
    t.is(events[1], 'scan::start');

    const args = chokidarWatchStub.args[0];

    t.true(chokidarWatchStub.calledOnce);
    t.is(args[0], '.');
    t.is(args[1].cwd, directory);
    t.is((args[1].ignored as string[]).length, 1);
    t.is((args[1].ignored as string[])[0], '.git/');
});

test(`If watch is true, it should use the .gitignore`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    sandbox.spy(engine, 'emitAsync');
    const chokidarWatchStub = sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(1000);

    stream.emit('close');

    await promise;

    const args = chokidarWatchStub.args[0];

    t.true(chokidarWatchStub.calledOnce);
    t.is(args[0], '.');
    t.is(args[1].cwd, directory);
    t.is((args[1].ignored as string[]).length, 2);
    t.is((args[1].ignored as string[])[0], 'ignore.html');
    t.is((args[1].ignored as string[])[1], '.git/');
});

test(`When the watcher is ready, it should emit the scan::end event`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-no-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(1000);

    stream.emit('ready');

    stream.emit('close');

    await promise;

    t.is(engineEmitAsyncSpy.callCount, 3);

    const events: string[] = engineEmitAsyncSpy.args.map((arg: any[]) => {
        return arg[0];
    }).sort();

    t.is(events[0], 'fetch::end::json');
    t.is(events[1], 'scan::end');
    t.is(events[2], 'scan::start');
});

test(`When the watcher detects a new file, it should emit the fetch::end::{type} and the scan::end events`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-no-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(500);

    stream.emit('add', path.join(directory, '..', 'add', 'new-file.html'));

    await delay(1000);

    stream.emit('close');

    await promise;

    t.is(engineEmitAsyncSpy.callCount, 4);

    const events: string[] = engineEmitAsyncSpy.args.map((arg: any[]) => {
        return arg[0];
    }).sort();

    t.is(events[0], 'fetch::end::html');
    t.is(events[1], 'fetch::end::json');
    t.is(events[2], 'scan::end');
    t.is(events[3], 'scan::start');
});

test(`When the watcher detects a change in a file, it should emit the fetch::end::{type} and the scan::end events`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-no-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(500);

    stream.emit('change', path.join(directory, 'tsconfig.json'));

    await delay(1000);

    stream.emit('close');

    await promise;

    t.is(engineEmitAsyncSpy.callCount, 4);

    const events: string[] = engineEmitAsyncSpy.args.map((arg: any[]) => {
        return arg[0];
    }).sort();

    t.is(events[0], 'fetch::end::json');
    t.is(events[1], 'fetch::end::json');
    t.is(events[2], 'scan::end');
    t.is(events[3], 'scan::start');
});

test(`When the watcher detects that a file was removed, it should emit the scan::end event`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-no-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    const engineEmitAsyncSpy = sandbox.spy(engine, 'emitAsync');

    sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(500);

    stream.emit('unlink', path.join(directory, 'tsconfig.json'));

    await delay(1000);

    stream.emit('close');

    await promise;

    t.is(engineEmitAsyncSpy.callCount, 3);

    const events: string[] = engineEmitAsyncSpy.args.map((arg: any[]) => {
        return arg[0];
    }).sort();

    t.is(events[0], 'fetch::end::json');
    t.is(events[1], 'scan::end');
    t.is(events[2], 'scan::start');
});

test(`When the watcher get an error, it should throw an error`, async (t) => {
    const sandbox = t.context.sandbox;
    const directoryUri = getAsUri(path.join(__dirname, 'fixtures', 'watch-no-ignore'));
    const directory = directoryUri ? asPathString(directoryUri) : '';
    const stream = new Stream();
    const { chokidar, cwdStub, engine, isFileStub, LocalConnector } = mockContext(t.context);

    (stream as any).close = () => { };

    isFileStub.returns(false);
    cwdStub.returns(directory);
    sandbox.spy(engine, 'emitAsync');
    sandbox.stub(chokidar, 'watch').returns(stream);

    const connector = new LocalConnector(engine as any, { watch: true });

    let promise: Promise<void> | undefined;

    if (directoryUri) {
        promise = connector.collect(directoryUri);
    }

    await delay(500);

    stream.emit('error', 'Error!');

    t.plan(1);
    try {
        await promise;
    } catch (err) {
        t.is(err, 'Error!');
    }
});

test('If target is a not a file, it should throw and exception', async (t) => {
    const { engine, LocalConnector } = mockContext(t.context);

    const connector = new LocalConnector(engine as any, {});

    t.plan(1);

    try {
        await connector.collect(new URL('https://example.com'));
    } catch (err) {
        t.is((err as Error).message, 'Connector local only works with local files or directories');
    }
});
