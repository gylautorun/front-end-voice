import type {ComponentPropsWithoutRef} from 'react';
import ReactMarkdown from 'react-markdown';
import type {Components, ExtraProps} from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github-dark.css';
import style from './style.module.scss';

/** rehype 处理过程中使用的最小语法树结构。 */
interface HastNode {
    type: string;
    children?: HastNode[];
    tagName?: string;
    properties?: Record<string, unknown>;
    value?: string;
}

interface GraphemeSegment {
    segment: string;
    index: number;
}

interface SegmenterLike {
    segment: (input: string) => Iterable<GraphemeSegment>;
}

type SegmenterConstructor = new (
    locales?: string | string[],
    options?: {granularity: 'grapheme'},
) => SegmenterLike;

/** 将字符串拆成带 UTF-16 起始位置的完整字素，旧浏览器回退到 Unicode code point。 */
function segmentGraphemes(value: string): GraphemeSegment[] {
    const Segmenter = (Intl as unknown as {Segmenter?: SegmenterConstructor}).Segmenter;
    if (Segmenter) return Array.from(new Segmenter(undefined, {granularity: 'grapheme'}).segment(value));

    let index = 0;
    return Array.from(value).map((segment) => {
        const current = {segment, index};
        index += segment.length;
        return current;
    });
}

/** 找到最后一个非空白字素，并保留它前后的原始文本。 */
function splitLastVisibleGrapheme(value: string) {
    const segments = segmentGraphemes(value);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const current = segments[index];
        if (current.segment.trim()) {
            const end = current.index + current.segment.length;
            return {
                before: value.slice(0, current.index),
                grapheme: current.segment,
                trailing: value.slice(end),
            };
        }
    }
    return null;
}

/** 从语法树末尾查找最后一个字素，并将字素与光标放进同一个内联节点。 */
function insertCursorAfterLastText(node: HastNode): boolean {
    if (!node.children) return false;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index];
        const textParts = child.type === 'text' && child.value
            ? splitLastVisibleGrapheme(child.value)
            : null;

        if (textParts) {
            const replacement: HastNode[] = [];
            if (textParts.before) replacement.push({type: 'text', value: textParts.before});
            replacement.push({
                type: 'element',
                tagName: 'span',
                properties: {className: [style.cursorAnchor]},
                children: [
                    // 保留完整字素，避免在组合字符或 ZWJ emoji 内部插入 DOM 节点。
                    {type: 'text', value: textParts.grapheme},
                    {
                        type: 'element',
                        tagName: 'span',
                        properties: {className: [style.cursor]},
                        children: [],
                    },
                ],
            });
            if (textParts.trailing) replacement.push({type: 'text', value: textParts.trailing});
            node.children.splice(index, 1, ...replacement);
            return true;
        }
        if (insertCursorAfterLastText(child)) return true;
    }
    return false;
}

/** 在 Markdown 已完成安全清洗后追加内联打字机光标。 */
function rehypeTypingCursor() {
    return (tree: HastNode): void => {
        // transformer 只原地修改语法树；不能返回 boolean，否则 unified 会把它当成新语法树。
        insertCursorAfterLastText(tree);
    };
}

type MarkdownLinkProps = ComponentPropsWithoutRef<'a'> & ExtraProps;

/** 外部 HTTP(S) 链接在新标签页打开，站内相对路径和锚点保持当前页导航。 */
function MarkdownLink({node: _node, href = '', children, ...props}: MarkdownLinkProps) {
    const isExternal = /^(?:https?:)?\/\//i.test(href);
    return (
        <a
            {...props}
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
        >
            {children}
        </a>
    );
}

// 对象定义在组件外，避免打字机每次渲染都创建新的组件映射。
const markdownComponents: Components = {a: MarkdownLink};

interface StreamMarkdownProps {
    // 已经由打字机消费、允许交给 Markdown 解析的正文。
    displayed: string;
    // 流式阶段显示光标，空闲、完成和失败时隐藏。
    showTypingCursor: boolean;
    // 仅 done 后运行完整代码高亮，避免流式阶段反复分析代码块。
    enableCodeHighlight: boolean;
}

/** 负责 Markdown、GFM、安全清洗、完成后高亮和末尾光标。 */
export function StreamMarkdown({displayed, showTypingCursor, enableCodeHighlight}: StreamMarkdownProps) {
    if (!displayed) {
        return (
            <article className={style.markdown} aria-live="polite">
                <p className={style.placeholder}>
                    点击“开始生成”查看 Markdown 流式拼接效果
                    {/* 句号与光标共用锚点，避免连接首包到达前光标单独换行。 */}
                    <span className={showTypingCursor ? style.cursorAnchor : undefined}>
                        。{showTypingCursor && <span className={style.cursor} aria-hidden="true" />}
                    </span>
                </p>
            </article>
        );
    }

    return (
        <article className={style.markdown} aria-live="polite">
            <ReactMarkdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                    // 第一步清洗服务端 Markdown 生成的 HTML，过滤危险属性和标签。
                    rehypeSanitize,
                    // 第二步仅在生成完成后高亮带语言标记的围栏代码块。
                    ...(enableCodeHighlight ? [rehypeHighlight] : []),
                    // 第三步在清洗后的最后一个文本节点中插入光标，避免被 sanitize 删除。
                    ...(showTypingCursor ? [rehypeTypingCursor] : []),
                ]}
            >
                {displayed}
            </ReactMarkdown>
        </article>
    );
}
