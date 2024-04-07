import * as path from 'path';

import anyTest, { TestFn } from 'ava';
import * as Excel from 'exceljs';
import * as fs from 'fs-extra';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';

import * as problems from './fixtures/list-of-problems';
import ExcelFormatter from '../src/formatter';

type ExcelContext = {
    ExcelFormatter: typeof ExcelFormatter;
    spy: sinon.SinonSpy<any, any>;
};

const test = anyTest as TestFn<ExcelContext>;

test.beforeEach(async (t) => {
    const { groupBy } = await import('lodash');
    const spy = sinon.spy(groupBy);
    const ExcelFormat: typeof ExcelFormatter = proxyquire('../src/formatter', { lodash: spy }).default;

    t.context.ExcelFormatter = ExcelFormat;
    t.context.spy = spy;
});

test(`Excel formatter doesn't print anything if no values`, async (t) => {
    const formatter = new t.context.ExcelFormatter();
    const spy = t.context.spy;

    await formatter.format(problems.noproblems);

    t.is(spy.callCount, 0);
});

test(`Excel formatter generates the right number of sheets with the good content`, async (t) => {
    const formatter = new t.context.ExcelFormatter();

    await formatter.format(problems.multipleproblems, { target: 'http://myresource.com:8080/' });

    const workbook = new Excel.Workbook();
    const filePath = path.join(process.cwd(), 'http-myresource-com-8080.xlsx');

    await workbook.xlsx.readFile(filePath);

    const summary = workbook.getWorksheet(1);
    const report = workbook.getWorksheet(2);

    t.is(summary.name, 'summary', 'Title is not summary');
    t.is(summary.actualColumnCount, 2, `summary.actualColumnCount isn't 2`);
    t.is(summary.actualRowCount, 3, `summary.actualRowCount isn't 3`);

    t.true(report.name.startsWith('resource-'), `Title doesn't start with resource-`);
    t.is(report.actualColumnCount, 2, `report.actualColumnCount isn't 2`);
    t.is(report.actualRowCount, 6, `report.actualRowCount isn't 3`);

    await fs.remove(filePath);
});

test(`Excel formatter generates the right number of sheets with the good content in the right file`, async (t) => {
    const formatter = new t.context.ExcelFormatter();
    const filePath = path.join(process.cwd(), 'test.xlsx');

    await formatter.format(problems.multipleproblems, { output: filePath });

    const workbook = new Excel.Workbook();

    await workbook.xlsx.readFile(filePath);

    const summary = workbook.getWorksheet(1);
    const report = workbook.getWorksheet(2);

    t.is(summary.name, 'summary', 'Title is not summary');
    t.is(summary.actualColumnCount, 2, `summary.actualColumnCount isn't 2`);
    t.is(summary.actualRowCount, 3, `summary.actualRowCount isn't 3`);

    t.true(report.name.startsWith('resource-'), `Title doesn't start with resource-`);
    t.is(report.actualColumnCount, 2, `report.actualColumnCount isn't 2`);
    t.is(report.actualRowCount, 6, `report.actualRowCount isn't 3`);

    await fs.remove(filePath);
});
