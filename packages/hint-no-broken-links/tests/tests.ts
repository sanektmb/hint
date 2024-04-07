import { Severity } from '@hint/utils-types';
import { generateHTMLPage } from '@hint/utils-create-server';
import { getHintPath, HintTest, testHint } from '@hint/utils-tests-helpers';

const hintPath = getHintPath(__filename);

const bodyWithValidLinks = `<div>
<a href='https://example.com/'>Example</a>
<a href='/about'>About</a>
</div>`;

const bodyWithImageSource = `<div>
<img src='https://webhint.io/static/images/next-arrow-c558ba3f13.svg'/>
</div>`;

const bodyWithValidRelativeLink = `<div>
<a href='about'>About</a>
</div>`;

const bodyWithBrokenLinks = `<div>
<a href='https://example.com/404'>Example</a>
</div>`;

const bodyWithBrokenImageSource = `<div>
<img src='https://example.com/404.png'/>
</div>`;

const bodyWithValidLinksAndBrokenLinks = `<div>
<a href='https://example.com/'>Example</a>
<a href='https://example.com/404'>Example2</a>
</div>`;

const bodyWithRelative500Links = `<div>
<a href='/500'>Example</a>
</div>`;

const bodyWithRelative410Links = `<div>
<a href='/410'>Example</a>
</div>`;

const bodyWithRelative404Links = `<div>
<a href='/410'>Example</a>
</div>`;

const bodyWithRelative503Links = `<div>
<a href='/503'>Example</a>
</div>`;

const bodyWithBrokenScriptTag = `<div>
<script href='/404'>Example</script>
</div>`;

const bodyWithBrokenLinkTag = `<div>
<link rel="stylesheet" href='/404'>
</div>`;

const bodyWithBrokenImageSrcSets = `<div>
<img alt="test" src="/1.jpg" srcset="2.jpg 640w,3.jpg 750w , 4.jpg 1080w">
</div>`;

const bodyWithDataUriSrcSets = `<div>
<img alt="test" src="/1.jpg" srcset="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=,2.jpg 640w,data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII= 1024w">
</div>`;

const bodyWithBrokenVideo = `<div>
<video controls src="/1.mp4" poster="/2.png">
</div>`;

const bodyWithMailTo = `<div>
<a href='/about'>About</a>
<a href='mailto:someone@example.com'>Mail</a>
</div>`;

const bodyWithInvalidUrl = `<div>
<a href='https://'>About</a>
</div>`;

const bodyWithBrokenDnsPrefetchLinkTag = `<div>
<link rel="dns-prefetch" href="https://localhost/404">
</div>`;

const bodyWithBrokenPreconnectLinkTag = `<div>
<link rel="preconnect" href="https://localhost/404">
</div>`;

const bodyWithInvalidDomainDnsPrefetchLinkTag = `<div>
<link rel="dns-prefetch" href="https://invalid.domain/">
</div>`;

const bodyWithInvalidDomainPreconnectLinkTag = `<div>
<link rel="preconnect" href="https://invalid.domain/">
</div>`;

const tests: HintTest[] = [
    {
        name: `This test should pass as it has links with valid href value`,
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithValidLinks) },
            '/about': { content: 'My about page content' }
        }
    },
    {
        name: `This test should pass as it has an img with valid src value(absolute)`,
        serverConfig: generateHTMLPage('', bodyWithImageSource)
    },
    {
        name: `This test should pass as it has links with valid href values and a base tag which gets not used`,
        serverConfig: {
            '/': { content: generateHTMLPage('<base href="nested/">', bodyWithValidLinks) },
            '/about': { content: 'My about page content' }
        }
    },
    {
        name: `This test should pass as it has a valid link (when resolved with the base tag)`,
        serverConfig: {
            '/': { content: generateHTMLPage('<base href="nested/">', bodyWithValidRelativeLink) },
            '/nested/about': { content: 'My about page content' }
        }
    },
    {
        name: `This test should fail as it has a link with 404 href value(absolute)`,
        reports: [{
            message: `Broken link found (404 response).`,
            severity: Severity.error
        }],
        serverConfig: generateHTMLPage('', bodyWithBrokenLinks)
    },
    {
        name: `This test should fail as it has an img with 404 src value(absolute)`,
        reports: [{
            message: `Broken link found (404 response).`,
            severity: Severity.error
        }],
        serverConfig: generateHTMLPage('', bodyWithBrokenImageSource),
        skip: true // temporary disabling to investigate
    },
    {
        name: `This test should fail as it has a valid link but it has also a link with 404 href value(absolute)`,
        reports: [{
            message: `Broken link found (404 response).`,
            severity: Severity.error
        }],
        serverConfig: generateHTMLPage('', bodyWithValidLinksAndBrokenLinks)
    },
    {
        name: `This test should fail as it has a link with 500 href value(relative)`,
        reports: [{
            message: `Broken link found (500 response).`,
            severity: Severity.error
        }],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithRelative500Links) },
            '/500': { status: 500 }
        }
    },
    {
        name: `This test should fail as it has a link with 410 href value(relative)`,
        reports: [{
            message: `Broken link found (410 response).`,
            severity: Severity.error
        }],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithRelative410Links) },
            '/410': { status: 410 }
        }
    },
    {
        name: `This test should fail as it has a link with 404 href value(relative)`,
        reports: [{
            message: `Broken link found (404 response).`,
            severity: Severity.error
        }],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithRelative404Links) },
            '/404': { status: 404 }
        }
    },
    {
        name: `This test should fail as it has a link with 503 href value(relative)`,
        reports: [{
            message: `Broken link found (503 response).`,
            severity: Severity.error
        }],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithRelative503Links) },
            '/503': { status: 503 }
        }
    },
    {
        name: `This test should fail as it has a link with 404 href value`,
        reports: [{
            message: `Broken link found (404 response).`,
            severity: Severity.error
        }],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenScriptTag) },
            '/404': { status: 404 }
        }
    },
    {
        name: `This test should fail as it has a script with 404 src value`,
        reports: [{
            message: `Broken link found (404 response).`,
            severity: Severity.error
        }],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenLinkTag) },
            '/404': { status: 404 }
        }
    },
    {
        name: `This test should fail as it has an img with 404 src and srcset values`,
        reports: [
            { message: `Broken link found (404 response).`, severity: Severity.error },
            { message: `Broken link found (404 response).`, severity: Severity.error },
            { message: `Broken link found (404 response).`, severity: Severity.error }
        ],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenImageSrcSets) },
            '/1.jpg': { status: 404 },
            '/2.jpg': '',
            '/3.jpg': { status: 404 },
            '/4.jpg': { status: 404 }
        }
    },
    {
        name: `This test should pass as data uris in srcset should be ignored`,
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithDataUriSrcSets) },
            '/1.jpg': '',
            '/2.jpg': ''
        }
    },
    {
        name: `This test should fail as it has a video tag broken poster and src`,
        reports: [
            { message: `Broken link found (404 response).`, severity: Severity.error },
            { message: `Broken link found (404 response).`, severity: Severity.error }
        ],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenVideo) },
            '/1.mp4': { status: 404 },
            '/2.png': { status: 404 }
        }
    },
    {
        name: `This test should pass as it has a link with valid href value and a mailto`,
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithMailTo) },
            '/about': { content: 'My about page content' }
        }
    },
    {
        name: `Invalid URL triggers an error`,
        reports: [{
            message: `Broken link found (invalid URL).`,
            severity: Severity.error
        }],
        serverConfig: { '/': { content: generateHTMLPage('', bodyWithInvalidUrl) } }
    },
    {
        name: `This test should pass as the 404 error should be ignored for dns-prefetch link tags`,
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenDnsPrefetchLinkTag) },
            '/404': { status: 404 }
        }
    },
    {
        name: `This test should pass as the 404 error should be ignored for preconnect link tags`,
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenPreconnectLinkTag) },
            '/404': { status: 404 }
        }
    },
    {
        name: `This test should fail as the domain is not found for the dns-prefetch link tag`,
        reports: [{
            message: `Broken link found (domain not found).`,
            severity: Severity.error
        }],
        serverConfig: generateHTMLPage('', bodyWithInvalidDomainDnsPrefetchLinkTag)
    },
    {
        name: `This test should fail as the domain is not found for the preconnect link tag`,
        reports: [{
            message: `Broken link found (domain not found).`,
            severity: Severity.error
        }],
        serverConfig: generateHTMLPage('', bodyWithInvalidDomainPreconnectLinkTag)
    },
    {
        name: `This test should fail as it has a loop`,
        reports: [
            {
                message: `'https://localhost/1.mp4' could not be fetched using GET method (redirect loop detected).`,
                severity: Severity.error
            },
            {
                message: `Broken link found (404 response).`,
                severity: Severity.error
            }
        ],
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithBrokenVideo) },
            '/1.mp4': {
                content: '1.mp4',
                status: 302
            },
            '/2.png': { status: 404 }
        }
    },
    {
        name: `This test should fail as it has a link with 404 href value(absolute with base tag)`,
        reports: [
            {
                message: `Broken link found (404 response).`,
                severity: Severity.error
            }
        ],
        serverConfig: {
            '/': { content: generateHTMLPage('<base href="nested/">', bodyWithValidRelativeLink) },
            '/nested/about': { status: 404 }
        }
    }
];

const httpTests: HintTest[] = [
    {
        name: `This test should pass as it has valid links (hosted on http to https links) `,
        serverConfig: {
            '/': { content: generateHTMLPage('', bodyWithValidLinks) },
            '/about': { content: 'My about page content' }
        }
    }
];

testHint(hintPath, httpTests, {https: false});
testHint(hintPath, tests, {https: true});
