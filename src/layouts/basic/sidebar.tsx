import React, {useMemo} from 'react';
import {RouteComponentProps, withRouter, RouteProps} from 'react-router-dom';
import {Menu, MenuProps} from 'antd';
import {MenuItemObject, useMenu} from './menu';
import {MenuLabel} from './menu-label';

export interface RouteItem extends RouteProps {
    key: string;
    path: string;
    url?: string;
    component?: React.ComponentType | React.LazyExoticComponent<React.ComponentType<any>>;
}
interface SideMenuProps extends RouteComponentProps {
    className?: string;
    routes: RouteItem[];
}type MenuItem = Required<MenuProps>['items'][number];
export const Sidebar = withRouter((props: SideMenuProps) => {
    const {menu, selectedIds} = useMenu(props);
    const collapsed = true;
    const menuList = useMemo(() => {
        const handleMenu = (list: MenuItemObject[]): MenuItem[] => {
            return list.map(item => {
                const children = item.children || [];
                return {
                    key: item.id,
                    label: (
                        <MenuLabel
                            ids={selectedIds}
                            item={item}
                        />
                    ),
                    children: children.length ? handleMenu(children) : undefined,
                };
            }) as MenuItem[];
        };
        return handleMenu(menu);
    }, [menu]);
    // console.log(menuList, selectedIds);
    return (
        <Menu
            items={menuList}
            mode="inline"
            theme={'light'}
            style={{width: 225}}
            inlineCollapsed={collapsed}
            selectedKeys={selectedIds}
        />
    )
});

Sidebar.displayName = 'Sidebar';
