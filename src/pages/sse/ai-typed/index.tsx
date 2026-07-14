import {useAiTypedStream} from './hooks/use-ai-typed-stream';
import {AiTypedSseView} from './view';

/** 页面入口只组合业务 Hook 与纯视图，便于分别阅读和测试。 */
export default function AiTypedSse() {
    const model = useAiTypedStream();
    return <AiTypedSseView model={model} />;
}
