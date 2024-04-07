import { HTMLDocument } from './htmldocument';
import { HTMLElement } from './htmlelement';
import { NodeData } from './types';

/**
 * https://developer.mozilla.org/docs/Web/API/Node
 */
export class Node {
    private _node: NodeData;

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/nodeType
     */
    public static ELEMENT_NODE = 1;
    public static ATTRIBUTE_NODE = 2;
    public static TEXT_NODE = 3;
    public static CDATA_SECTION_NODE = 4;
    public static PROCESSING_INSTRUCTION_NODE = 7;
    public static COMMENT_NODE = 8;
    public static DOCUMENT_NODE = 9;
    public static DOCUMENT_TYPE_NODE = 10;
    public static DOCUMENT_FRAGMENT_NODE = 11;

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/ownerDocument
     */
    public ownerDocument: HTMLDocument;

    /**
     * Non-standard. Used internally by utils-dom to create Node instances.
     */
    public constructor(data: NodeData, ownerDocument: HTMLDocument) {
        this._node = data;
        this.ownerDocument = ownerDocument;
    }

    private get _owner() {
        return this.ownerDocument || this;
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/childNodes
     */
    public get childNodes(): Node[] {

        const result: Node[] = [];

        if ('children' in this._node) {
            for (const child of this._node.children) {
                if (child.type === 'root') {
                    continue; // Ignore DocumentFragment under <template>.
                }

                result.push(this._owner.getNodeFromData(child));
            }
        }

        return result;
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/nodeName
     */
    public get nodeName(): string {
        switch (this._node.type) {
            case 'comment':
                return '#comment';
            case 'directive':
                return this._node.nodeName || this._node['x-name'] || '';
            case 'root':
                return '#document';
            case 'script':
            case 'style':
            case 'tag': {
                const isHTML = this._node.namespace === 'http://www.w3.org/1999/xhtml';

                return isHTML ? this._node.name.toUpperCase() : this._node.name;
            }
            case 'text':
                return '#text';
            /* istanbul ignore next */
            default:
                throw new Error(`Unrecognized node type ${(this._node as any).type}`);
        }
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/nodeType
     */
    public get nodeType(): number {
        switch (this._node.type) {
            case 'comment':
                return Node.COMMENT_NODE;
            case 'directive':
                return Node.DOCUMENT_TYPE_NODE;
            case 'root':
                return Node.DOCUMENT_NODE;
            case 'script':
            case 'style':
            case 'tag':
                return Node.ELEMENT_NODE;
            case 'text':
                return Node.TEXT_NODE;
            /* istanbul ignore next */
            default:
                throw new Error(`Unrecognized node type ${(this._node as any).type}`);
        }
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/nodeValue
     */
    public get nodeValue(): string | null {
        switch (this._node.type) {
            case 'comment':
            case 'text':
                return this._node.data;
            default:
                return null;
        }
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/parentElement
     */
    public get parentElement(): HTMLElement | null {
        const parentNode = this.parentNode;
        const parent = parentNode?._node;

        if (!parent || (parent.type !== 'tag' && parent.type !== 'script' && parent.type !== 'style')) {
            return null;
        }

        return parentNode as HTMLElement;
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/parentNode
     */
    public get parentNode(): Node | null {
        if ('parent' in this._node && this._node.parent) {
            return this._owner.getNodeFromData(this._node.parent);
        }

        return null;
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/textContent
     */
    public get textContent(): string {
        switch (this._node.type) {
            case 'comment':
            case 'directive':
            case 'root':
                return '';
            case 'script':
            case 'style':
            case 'tag':
                return this.childNodes.map((child) => {
                    return child.textContent;
                }).join('');
            case 'text':
                return this._node.data;
            /* istanbul ignore next */
            default:
                throw new Error(`Unrecognized node type ${(this._node as any).type}`);
        }
    }

    /**
     * https://developer.mozilla.org/docs/Web/API/Node/contains
     */
    public contains(node: Node): boolean {
        let target = node as Node | null;

        while (target) {
            if (target === this) {
                return true;
            }
            target = target.parentNode;
        }

        return false;
    }
}
