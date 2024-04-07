import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import anyTest, { TestFn, ExecutionContext } from 'ava';
import { EventEmitter2 } from 'eventemitter2';

import { ElementFound, Engine, FetchEnd } from 'hint';
import { HTMLElement } from '@hint/utils-dom';

import { ScriptEvents, ScriptParse, NodeVisitor } from '../src/parser';

type AcornParser = {
    parse: (code: string, options: any) => {};
    tokenizer: (code: string, options: any) => any[];
};

type Acorn = {
    Parser: { extend(from: any): AcornParser };
};

type AcornWalk = {
    ancestor: (node: any, visitors: NodeVisitor) => void;
    full: (node: any, callback: Function) => void;
    fullAncestor: (node: any, callback: Function) => void;
    simple: (node: any, visitors: NodeVisitor) => void;
};

type ParseJavascriptContext = {
    acorn: Acorn;
    acornWalk: AcornWalk;
    element: HTMLElement;
    engine: Engine<ScriptEvents>;
    jsxParser: AcornParser;
    parser: AcornParser;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestFn<ParseJavascriptContext>;

const initContext = (t: ExecutionContext<ParseJavascriptContext>) => {
    t.context.parser = {
        parse(code: string) {
            return {};
        },
        tokenizer(code: string) {
            return [];
        }
    };
    t.context.jsxParser = {
        parse(code: string) {
            return {};
        },
        tokenizer(code: string) {
            return [];
        }
    };
    t.context.acorn = {
        Parser: {
            extend(from) {
                return from ? t.context.jsxParser : t.context.parser;
            }
        }
    };
    t.context.element = {
        getAttribute(): string | null {
            return null;
        },
        innerHTML: ''
    } as any;
    t.context.engine = new EventEmitter2({
        delimiter: '::',
        maxListeners: 0,
        wildcard: true
    }) as Engine<ScriptEvents>;
    t.context.acornWalk = {
        ancestor() { },
        full() { },
        fullAncestor() { },
        simple() { }
    };

    t.context.sandbox = sinon.createSandbox();
};

const loadScript = (context: ParseJavascriptContext) => {
    const script = proxyquire('../src/parser', {
        './walk': proxyquire('../src/walk', { 'acorn-walk': context.acornWalk }),
        acorn: context.acorn
    });

    return script.default;
};

test.beforeEach(initContext);

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test('If an script tag is an external javascript, then nothing happen', async (t) => {
    const sandbox = t.context.sandbox;
    const JavascriptParser = loadScript(t.context);

    new JavascriptParser(t.context.engine); // eslint-disable-line

    const acornParseSpy = sandbox.spy(t.context.parser, 'parse');
    const acornTokenizeSpy = sandbox.spy(t.context.parser, 'tokenizer');
    const elementGetAttributeStub = sandbox.stub(t.context.element, 'getAttribute').returns('http://script.url');

    await t.context.engine.emitAsync('element::script', { element: t.context.element } as ElementFound);

    t.true(elementGetAttributeStub.calledOnce);
    t.is(elementGetAttributeStub.args[0][0], 'src');
    t.false(acornParseSpy.called);
    t.false(acornTokenizeSpy.called);
});

test('If an script tag is not a javascript, then nothing should happen', async (t) => {
    const sandbox = t.context.sandbox;
    const JavascriptParser = loadScript(t.context);

    new JavascriptParser(t.context.engine); // eslint-disable-line

    const acornParseSpy = sandbox.spy(t.context.parser, 'parse');
    const acornTokenizeSpy = sandbox.spy(t.context.parser, 'tokenizer');
    const elementGetAttributeStub = sandbox.stub(t.context.element, 'getAttribute')
        .onFirstCall()
        .returns(null)
        .onSecondCall()
        .returns('text/x-handlebars-template');

    await t.context.engine.emitAsync('element::script', { element: t.context.element } as ElementFound);

    t.true(elementGetAttributeStub.calledTwice);
    t.is(elementGetAttributeStub.args[0][0], 'src');
    t.is(elementGetAttributeStub.args[1][0], 'type');
    t.false(acornParseSpy.called);
    t.false(acornTokenizeSpy.called);
});

test('If an script tag is an internal javascript, then we should parse the code and emit a parse::end::javascript event', async (t) => {
    const sandbox = t.context.sandbox;
    const parseObject = {};
    const tokenList: any[] = ['test'];
    const code = 'var x = 8;';
    const JavascriptParser = loadScript(t.context);
    const resource = 'index.html';

    new JavascriptParser(t.context.engine); // eslint-disable-line

    const engineEmitAsyncSpy = sandbox.spy(t.context.engine, 'emitAsync');
    const acornParseStub = sandbox.stub(t.context.parser, 'parse').returns(parseObject);
    const acornTokenizeStub = sandbox.stub(t.context.parser, 'tokenizer').returns(tokenList);

    sandbox.stub(t.context.element, 'innerHTML').value(code);
    const elementGetAttributeStub = sandbox.stub(t.context.element, 'getAttribute')
        .onFirstCall()
        .returns(null)
        .onSecondCall()
        .returns('text/javascript');

    await t.context.engine.emitAsync('element::script', { element: t.context.element, resource } as ElementFound);

    t.true(elementGetAttributeStub.calledTwice);
    t.is(elementGetAttributeStub.args[0][0], 'src');
    t.is(elementGetAttributeStub.args[1][0], 'type');
    t.true(acornParseStub.calledOnce);
    t.is(acornParseStub.args[0][0], code);
    t.true(acornTokenizeStub.calledOnce);
    t.is(acornTokenizeStub.args[0][0], code);
    t.true(engineEmitAsyncSpy.calledThrice);

    t.is(engineEmitAsyncSpy.args[1][0], 'parse::start::javascript');

    const args = engineEmitAsyncSpy.args[2];
    const data = args[1] as ScriptParse;

    t.is(args[0], 'parse::end::javascript');
    t.is(data.element, t.context.element);
    t.is(data.resource, resource);
    // @ts-ignore
    t.is(data.ast, parseObject);
    t.is(data.tokens[0], tokenList[0]);
});

test('If fetch::end::script is received, then we should parse the code and emit a parse::end::javascript event', async (t) => {
    const sandbox = t.context.sandbox;
    const parseObject = {};
    const tokenList: any[] = ['test'];
    const code = 'var x = 8;';
    const JavascriptParser = loadScript(t.context);

    new JavascriptParser(t.context.engine); // eslint-disable-line

    const engineEmitAsyncSpy = sandbox.spy(t.context.engine, 'emitAsync');
    const acornParseStub = sandbox.stub(t.context.parser, 'parse').returns(parseObject);
    const acornTokenizeStub = sandbox.stub(t.context.parser, 'tokenizer').returns(tokenList);

    await t.context.engine.emitAsync('fetch::end::script', {
        resource: 'script.js',
        response: {
            body: { content: code },
            mediaType: 'text/javascript'
        }
    } as FetchEnd);

    t.true(acornParseStub.calledOnce);
    t.is(acornParseStub.args[0][0], code);
    t.true(acornTokenizeStub.calledOnce);
    t.is(acornTokenizeStub.args[0][0], code);
    t.true(engineEmitAsyncSpy.calledThrice);

    t.is(engineEmitAsyncSpy.args[1][0], 'parse::start::javascript');

    const args = engineEmitAsyncSpy.args[2];
    const data = args[1] as ScriptParse;

    t.is(args[0], 'parse::end::javascript');
    t.is(data.element, null);
    // @ts-ignore
    t.is(data.ast, parseObject);
    t.is(data.resource, 'script.js');
    t.is(data.tokens[0], tokenList[0]);
});

test('If fetch::end::script is received for text/jsx, we should use the jsx parser', async (t) => {
    const sandbox = t.context.sandbox;
    const parseObject = {};
    const tokenList: any[] = ['test'];
    const code = 'var x = 8;';

    const JavascriptParser = loadScript(t.context);

    new JavascriptParser(t.context.engine); // eslint-disable-line

    const engineEmitAsyncSpy = sandbox.spy(t.context.engine, 'emitAsync');
    const acornParseStub = sandbox.stub(t.context.jsxParser, 'parse').returns(parseObject);
    const acornTokenizeStub = sandbox.stub(t.context.jsxParser, 'tokenizer').returns(tokenList);

    await t.context.engine.emitAsync('fetch::end::unknown', {
        resource: 'script.js',
        response: {
            body: { content: code },
            mediaType: 'text/jsx'
        }
    } as FetchEnd);

    t.true(acornParseStub.calledOnce);
    t.is(acornParseStub.args[0][0], code);
    t.true(acornTokenizeStub.calledOnce);
    t.is(acornTokenizeStub.args[0][0], code);
    t.true(engineEmitAsyncSpy.calledThrice);

    t.is(engineEmitAsyncSpy.args[1][0], 'parse::start::javascript');

    const args = engineEmitAsyncSpy.args[2];
    const data = args[1] as ScriptParse;

    t.is(args[0], 'parse::end::javascript');
    t.is(data.element, null);
    // @ts-ignore
    t.is(data.ast, parseObject);
    t.is(data.resource, 'script.js');
    t.is(data.tokens[0], tokenList[0]);
});

test('If the tree walked is always the same, acorn-walk will be called just once for each method', async (t) => {
    const sandbox = t.context.sandbox;
    const parseObject = {};
    const tokenList: any[] = ['test'];
    const code = 'var x = 8;';
    const JavascriptParser = loadScript(t.context);

    new JavascriptParser(t.context.engine); // eslint-disable-line

    sandbox.stub(t.context.parser, 'parse').returns(parseObject);
    sandbox.stub(t.context.parser, 'tokenizer').returns(tokenList);
    const walkSimpleSpy = sandbox.spy(t.context.acornWalk, 'simple');
    const walkAncestorSpy = sandbox.spy(t.context.acornWalk, 'ancestor');
    const walkFullSpy = sandbox.spy(t.context.acornWalk, 'full');
    const walkFullAncestorSpy = sandbox.spy(t.context.acornWalk, 'fullAncestor');

    t.context.engine.on('parse::end::javascript', (data: ScriptParse) => {
        data.walk.simple(data.ast, {
            CallExpression(node) {
            }
        });

        data.walk.simple(data.ast, {
            CallExpression(node) {
            }
        });

        data.walk.simple(data.ast, {
            Literal(node) {
            }
        });

        data.walk.ancestor(data.ast, {
            CallExpression(node) {
            }
        });

        data.walk.ancestor(data.ast, {
            CallExpression(node) {
            }
        });

        data.walk.full(data.ast, (node) => { });
        data.walk.full(data.ast, (node) => { });
        data.walk.fullAncestor(data.ast, (node) => { });
        data.walk.fullAncestor(data.ast, (node) => { });
    });

    await t.context.engine.emitAsync('fetch::end::script', {
        resource: 'script.js',
        response: {
            body: { content: code },
            mediaType: 'text/javascript'
        }
    } as FetchEnd);

    t.true(walkSimpleSpy.calledOnce);
    t.true(walkAncestorSpy.calledOnce);
    t.true(walkFullAncestorSpy.calledOnce);
    t.true(walkFullSpy.calledOnce);

    t.is(typeof walkFullSpy.args[0][1], 'function');
    t.is(typeof walkFullAncestorSpy.args[0][1], 'function');
    t.truthy(walkSimpleSpy.args[0][1].CallExpression);
    t.truthy(walkSimpleSpy.args[0][1].Literal);
    t.truthy(walkAncestorSpy.args[0][1].CallExpression);
});

test('acorn-walk will be called once per javascript file and method', async (t) => {
    const sandbox = t.context.sandbox;
    const parseObject = {};
    const tokenList: any[] = ['test'];
    const code = 'var x = 8;';
    const JavascriptParser = loadScript(t.context);

    new JavascriptParser(t.context.engine); // eslint-disable-line

    sandbox.stub(t.context.parser, 'parse').returns(parseObject);
    sandbox.stub(t.context.parser, 'tokenizer').returns(tokenList);
    const walkSimpleSpy = sandbox.spy(t.context.acornWalk, 'simple');
    const walkAncestorSpy = sandbox.spy(t.context.acornWalk, 'ancestor');
    const walkFullSpy = sandbox.spy(t.context.acornWalk, 'full');
    const walkFullAncestorSpy = sandbox.spy(t.context.acornWalk, 'fullAncestor');

    t.context.engine.on('parse::end::javascript', (data: ScriptParse) => {
        data.walk.simple(data.ast, {
            CallExpression(node) {
            }
        });
        data.walk.ancestor(data.ast, {
            CallExpression(node) {
            }
        });

        data.walk.full(data.ast, (node) => { });
        data.walk.fullAncestor(data.ast, (node) => { });
    });

    await t.context.engine.emitAsync('fetch::end::script', {
        resource: 'script.js',
        response: {
            body: { content: code },
            mediaType: 'text/javascript'
        }
    } as FetchEnd);

    await t.context.engine.emitAsync('fetch::end::script', {
        resource: 'script2.js',
        response: {
            body: { content: code },
            mediaType: 'text/javascript'
        }
    } as FetchEnd);

    t.true(walkSimpleSpy.calledTwice);
    t.true(walkAncestorSpy.calledTwice);
    t.true(walkFullAncestorSpy.calledTwice);
    t.true(walkFullSpy.calledTwice);
});
