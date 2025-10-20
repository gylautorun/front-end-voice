import {ReactNode} from 'react';
import {RouteComponentProps} from 'react-router-dom';
import {SITE_MAP_MAIN} from '../site-map';

export interface SiteNode {
    /**
     * 显示名称
     */
    label?: ReactNode | ((routeProps: RouteComponentProps) => ReactNode);

    /**
     * 站内资源 path
     */
    path?: string;

    /**
     * 站外资源地址
     */
    url?: string;

    /**
     * 子项
     */
    children?: SiteNode[];
}

export const SITE_MAP: SiteNode = SITE_MAP_MAIN;
