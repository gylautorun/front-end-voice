import {matchPath, RouteComponentProps} from 'react-router-dom';
import {MouseEventHandler, ReactNode} from 'react';
import {pick} from 'lodash-es';
import {SITE_MAP, SiteNode} from '../common';

const getMenuItemKey = (path: string) => path;

interface MenuResult {
    menu: MenuItemObject[];
    selectedIds: string[];
}
export interface MenuItemObject {
    /**
     * 唯一标识
     */
    id?: string;
    /**
     * 显示内容
     */
    label: ReactNode;
    /**
     * 是否禁用
     */
    disabled?: boolean;
    /**
     * 链接地址，item label 将 wrap 在 <a /> 元素内
     */
    href?: string;
    /**
     * <a /> 的 target
     */
    target?: string;
    /**
     * title tip
     */
    title?: string;
    /**
     * 点击回调
     */
    onClick?: MouseEventHandler;
    /**
     * 是否选中
     */
    selected?: boolean;
    /**
     * （submenu）是否展开
     */
    expanded?: boolean;
    /**
     * 子项
     */
    children?: MenuItemObject[];
}

export const useMenu = (routeProps: RouteComponentProps): MenuResult => {
    // const {entry: currentEntry} = parsePageUrl() || {};
    const makeMenuItem = (siteNode: SiteNode): MenuItemObject => {
        const {label, children, path = ''} = siteNode;
        const id = getMenuItemKey(path);
        const _children = children && children.map(makeMenuItem);
        const sideNavProps: MenuItemObject = {
            id,
            children: _children && _children.length ? _children : undefined,
            label: (typeof label === 'function' ? label(routeProps) : label) as ReactNode,
            href: path ? `/#${path}` : undefined,
        };

        return sideNavProps;
    };

    const selectedIds: string[] = [];
    const findSelected = ((siteNode: SiteNode): boolean => {
        const found = !!(
            siteNode.children && siteNode.children.some(findSelected)
            || matchPath(routeProps.location.pathname, pick(siteNode, ['path']))
        );
        if (found && !selectedIds.length) {
            selectedIds.push(getMenuItemKey(siteNode.path!));
        }

        return found;
    });

    findSelected(SITE_MAP);
    
    return {
        menu: SITE_MAP.children!.map(makeMenuItem),
        selectedIds,
    };
};
