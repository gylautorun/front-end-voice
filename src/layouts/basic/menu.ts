import {matchPath, RouteComponentProps} from 'react-router-dom';
import {MouseEventHandler, ReactNode} from 'react';
import {SITE_MAP, SiteNode} from '../common';

/** 菜单 key 直接使用完整路由地址，确保选中项和展开项不会重名。 */
const getMenuItemKey = (path: string) => path;

/** useMenu 向 Sidebar 返回的菜单结构和当前路由状态。 */
interface MenuResult {
    /** 由站点地图转换得到的 Ant Design 菜单数据。 */
    menu: MenuItemObject[];
    /** 当前页面对应的叶子菜单 key。 */
    selectedIds: string[];
    /** 从顶级目录到当前叶子菜单之间的所有父目录 key。 */
    openIds: string[];
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
     * 站内路由地址，叶子菜单通过 React Router Link 跳转
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

/**
 * 查找当前地址在站点地图中的完整层级路径。
 *
 * @param siteNode 当前递归检查的站点节点。
 * @param pathname 浏览器当前路由地址。
 * @returns 命中时返回“父目录 -> 叶子节点”的 key 列表，否则返回 null。
 */
const findActiveTrail = (siteNode: SiteNode, pathname: string): string[] | null => {
    // 优先递归子节点，避免父级 `/music` 抢先匹配 `/music/spectrum`。
    for (const child of siteNode.children || []) {
        const childTrail = findActiveTrail(child, pathname);
        if (childTrail) {
            // SITE_MAP 根节点使用 `#`，它不渲染在菜单中，因此不加入展开路径。
            return siteNode.path && siteNode.path !== '#'
                ? [getMenuItemKey(siteNode.path), ...childTrail]
                : childTrail;
        }
    }

    // 叶子节点使用精确匹配，确保只选中当前实际页面。
    const matched = siteNode.path && siteNode.path !== '#'
        ? matchPath(pathname, {path: siteNode.path, exact: true})
        : null;
    return matched ? [getMenuItemKey(siteNode.path!)] : null;
};

/**
 * 根据站点地图生成侧栏菜单，并计算当前路由的选中项与父目录。
 *
 * @param routeProps withRouter 注入的当前路由信息。
 * @returns 菜单树、选中 key 和需要展开的父目录 key。
 */
export const useMenu = (routeProps: RouteComponentProps): MenuResult => {
    /** 把单个 SiteNode 递归转换为 Sidebar 使用的 MenuItemObject。 */
    const makeMenuItem = (siteNode: SiteNode): MenuItemObject => {
        const {label, children, path = ''} = siteNode;
        const id = getMenuItemKey(path);
        const _children = children && children.map(makeMenuItem);
        const sideNavProps: MenuItemObject = {
            id,
            children: _children && _children.length ? _children : undefined,
            label: (typeof label === 'function' ? label(routeProps) : label) as ReactNode,
            href: path ? path : undefined,
        };

        return sideNavProps;
    };

    // trail 示例：['/music', '/music/spectrum']。
    const trail = findActiveTrail(SITE_MAP, routeProps.location.pathname) || [];
    // Ant Menu 的 selectedKeys 只需要最后一个叶子节点。
    const selectedIds = trail.length ? [trail[trail.length - 1]] : [];
    // openKeys 使用叶子节点之前的所有父目录。
    const openIds = trail.slice(0, -1);
    
    return {
        menu: SITE_MAP.children!.map(makeMenuItem),
        selectedIds,
        openIds,
    };
};
