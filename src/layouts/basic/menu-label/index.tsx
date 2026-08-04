import cx from 'classnames';
import { Tooltip } from 'antd';
import {Link} from 'react-router-dom';
import {MenuItemObject} from '../menu';
import './style.scss';

interface MenuLabelProps {
    ids: string[];
    item: MenuItemObject;
}

export const MenuLabel = ((props: MenuLabelProps) => {
    const {ids, item} = props;
    // 目录标题只控制 Menu 展开状态；只有叶子节点才执行路由跳转。
    const content = item.href && !item.children?.length
        ? <Link className="link" to={item.href}>{item.label}</Link>
        : <span className="link">{item.label}</span>;

    return (
        <Tooltip placement="top" title={item.label}>
            <div className={cx('menu-label', {active: ids[0] === item.id})}>
                {content}
            </div>
        </Tooltip>
    );
});
