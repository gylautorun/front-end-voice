import cx from 'classnames';
import {MenuItemObject} from '../menu';
import './style.scss';

interface MenuLabelProps {
    ids: string[];
    item: MenuItemObject;
}

export const MenuLabel = ((props: MenuLabelProps) => {
    const {ids, item} = props;
    return (
        <div className={cx('menu-label', {active: ids[0] === item.id})}>
            <a className="link" href={item.href}>{item.label}</a>
        </div>
    )
});
