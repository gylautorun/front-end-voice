import React from 'react';
import {HashRouter, Redirect, Route, Switch as RouteSwitch} from 'react-router-dom';
import {ConfigProvider} from 'antd';

import {LayoutPage} from './layout';
import {RouteItem, Sidebar} from './sidebar';
import {Header} from './header';
import './style.scss';

const {Suspense} = React;
const Loading = () => <div>loading...</div>;

interface BasicLayoutProps {
    routes?: RouteItem[];
}

const locale = 'zh_CN';

export const BasicLayout = (props: BasicLayoutProps) => {
    const {routes} = props;

    const renderHeader = () => {
        return (
            <Header />
        );
    };
    
    const renderSidebar = () => {
        return (
            <Sidebar routes={routes || []} />
        );
    };

    const renderBreadcrumb = () => {
        return null;
    };

    const renderContent = () => {
        if (!routes) {
            return null;
        }
        const firstRoutes = routes[0];
        return (
            <div className="app-content">
                <Suspense fallback={<Loading />}>
                    <RouteSwitch>
                        <Redirect exact from="/" to={firstRoutes.path} />
                        {routes.map((route) => (
                            <Route {...route} key={route.key} />
                        ))}
                    </RouteSwitch>
                </Suspense>
            </div>
        );
    };

    const renderFooter = () => {
        return null;
    };

    return (
        <HashRouter>
            <ConfigProvider locale={{locale}}>
                <LayoutPage
                    className={'app-page'}
                    renderHeader={renderHeader}
                    renderSidebar={renderSidebar}
                    renderBreadcrumb={renderBreadcrumb}
                    renderContent={renderContent}
                    renderFooter={renderFooter}
                />
            </ConfigProvider>
        </HashRouter>
    );
};

