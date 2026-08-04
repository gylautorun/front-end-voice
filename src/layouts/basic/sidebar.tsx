import React, {useEffect, useMemo, useState} from 'react';
import {RouteComponentProps, withRouter, RouteProps} from 'react-router-dom';
import {Menu, MenuProps} from 'antd';
import {MenuItemObject, useMenu} from './menu';
import {MenuLabel} from './menu-label';

export interface RouteItem extends RouteProps {
    key: string;
    path: string;
    url?: string;
    component?: React.ComponentType | React.LazyExoticComponent<React.ComponentType<unknown>>;
}
interface SideMenuProps extends RouteComponentProps {
    className?: string;
    routes: RouteItem[];
}type MenuItem = Required<MenuProps>['items'][number];
export const Sidebar = withRouter((props: SideMenuProps) => {
    // 根据当前路由同时取得叶子选中项和必须展开的祖先目录。
    const {menu, openIds, selectedIds} = useMenu(props);
    const collapsed = false;
    // 首次直接访问子路由时，立即用 openIds 展开其父目录。
    const [expandedKeys, setExpandedKeys] = useState<string[]>(openIds);
    // 数组每次渲染都会重新创建，转为稳定字符串后只在祖先路径真正变化时触发 effect。
    const routeOpenKeySignature = openIds.join('\u0000');

    // 切换到其他目录的子路由时，补充新祖先，同时保留用户手动展开的其他目录。
    useEffect(() => {
        const requiredKeys = routeOpenKeySignature ? routeOpenKeySignature.split('\u0000') : [];
        setExpandedKeys(currentKeys => {
            const missingKeys = requiredKeys.filter(key => !currentKeys.includes(key));
            return missingKeys.length ? [...currentKeys, ...missingKeys] : currentKeys;
        });
    }, [routeOpenKeySignature]);

    // 把站点菜单对象递归转换为 Ant Design Menu 的 items 结构。
    const menuList = useMemo(() => {
        const handleMenu = (list: MenuItemObject[]): MenuItem[] => {
            return list.map(item => {
                const children = item.children || [];
                return {
                    key: item.id,
                    // label: item.label,
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
    }, [menu, selectedIds]);

    /** 保存用户通过目录标题产生的展开/收起操作。 */
    const handleOpenChange: MenuProps['onOpenChange'] = keys => {
        setExpandedKeys(keys.map(String));
    };

    return (
        <Menu
            items={menuList}
            mode="inline"
            theme={'light'}
            style={{ height: '100%', overflowY: 'auto', borderInlineEnd: 0, width: 225 }}
            inlineCollapsed={collapsed}
            selectedKeys={selectedIds}
            openKeys={expandedKeys}
            onOpenChange={handleOpenChange}
        />
    )
});

Sidebar.displayName = 'Sidebar';
