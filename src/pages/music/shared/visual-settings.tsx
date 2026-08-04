import {SettingOutlined} from '@ant-design/icons';
import {Button, Popover, Slider} from 'antd';
import style from './style.module.scss';

/**
 * 单个可视化参数的受控配置。
 * 页面负责保存 `value`，本组件只负责展示数值并通过 `onChange` 回传修改。
 */
export interface VisualParameter {
    /** React 列表使用的稳定标识，同一面板内不能重复。 */
    key: string;
    /** 展示在滑块上方的参数名称，例如“动画速度”。 */
    label: string;
    /** 用户可选择的最小倍率。 */
    min: number;
    /** 用户可选择的最大倍率。 */
    max: number;
    /** 滑块每次移动增加或减少的倍率。 */
    step: number;
    /** 页面状态中的当前倍率，`1` 表示使用默认效果。 */
    value: number;
    /** Slider 产生新倍率时调用，由页面更新对应状态。 */
    onChange: (value: number) => void;
}

/** 视觉参数弹出面板的属性。 */
interface VisualSettingsProps {
    /** 当前页面支持的全部参数，组件按照数组顺序渲染滑块。 */
    parameters: VisualParameter[];
    /** 点击“恢复默认”时调用，由页面一次性重置全部参数。 */
    onReset: () => void;
}

/**
 * 用紧凑弹出层承载速度与响应滑块，避免继续挤占音轨工具栏。
 *
 * @param props.parameters 当前页面允许用户调节的参数。
 * @param props.onReset 恢复页面默认参数的方法。
 * @returns 包含触发按钮和受控 Slider 的参数弹出层。
 */
export const VisualSettings = ({onReset, parameters}: VisualSettingsProps) => {
    // 先构建 Popover 内容；弹层未打开时由 Ant Design 负责控制挂载和定位。
    const content = (
        <div className={style.settingsPanel}>
            {/* 标题区同时提供统一重置入口，避免用户逐个拖回 1x。 */}
            <header>
                <strong>视觉参数</strong>
                <Button type="link" size="small" onClick={onReset}>恢复默认</Button>
            </header>
            {/* 配置数组中的每一项都会生成“名称 + 当前倍率 + 滑块”。 */}
            {parameters.map(parameter => (
                <div key={parameter.key} className={style.settingRow}>
                    <div>
                        <span>{parameter.label}</span>
                        {/* 固定保留两位小数，便于比较细粒度的 0.05x 调整。 */}
                        <b>{parameter.value.toFixed(2)}x</b>
                    </div>
                    <Slider
                        // 范围和步长由各可视化页面决定，共享组件不写死业务值。
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step}
                        // Slider 使用受控值，页面状态始终是唯一数据源。
                        value={parameter.value}
                        // 浮层提示与右侧倍率使用相同格式，避免展示精度不一致。
                        tooltip={{formatter: value => `${Number(value || 0).toFixed(2)}x`}}
                        // 将新值原样交给页面，页面更新后再通过 value 回流。
                        onChange={parameter.onChange}
                    />
                </div>
            ))}
        </div>
    );

    return (
        // 点击齿轮按钮打开弹层，右对齐可减少桌面工具栏边缘溢出。
        <Popover content={content} trigger="click" placement="bottomRight">
            <Button className={style.settingsTrigger} icon={<SettingOutlined />}>
                视觉参数
            </Button>
        </Popover>
    );
};
