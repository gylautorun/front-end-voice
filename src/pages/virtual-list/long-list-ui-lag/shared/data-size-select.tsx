import React from 'react';
import {DATA_SIZE_OPTIONS} from './demo-data';
import style from '../style.module.scss';

interface DataSizeSelectProps {
    /** label 与 select 关联所需的唯一 DOM id。 */
    inputId: string;
    /** 当前数据规模。 */
    value: number;
    /** 选择变化后通知页面重建数据和虚拟模型。 */
    onChange(value: number): void;
}

export const DataSizeSelect = React.memo((props: DataSizeSelectProps) => (
    <label className={style.dataSizeControl} htmlFor={props.inputId}>
        <span>数据规模</span>
        <select
            id={props.inputId}
            value={props.value}
            onChange={(event) => props.onChange(Number(event.currentTarget.value))}
        >
            {DATA_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                    {size.toLocaleString()}
                </option>
            ))}
        </select>
    </label>
));

DataSizeSelect.displayName = 'DataSizeSelect';
