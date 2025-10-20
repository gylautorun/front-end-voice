import React from 'react';
import {Layout} from 'antd';
import './style.scss';
import { BasicLayoutContext } from './context';

const {Header, Content, Footer, Sider} = Layout;
interface LayoutPageProps {
    className?: string;
    renderHeader?(): React.ReactNode;
    renderFooter?(): React.ReactNode;
    renderSidebar?(): React.ReactNode;
    renderBreadcrumb?(): React.ReactNode;
    renderContent?(): React.ReactNode;
}
export const LayoutPage = (props: LayoutPageProps) => {
    const {
        className,
        renderHeader,
        renderFooter,
        renderSidebar,
        renderBreadcrumb,
        renderContent,
    } = props;
    const scrollRef = React.useRef<HTMLDivElement>(null);

    return (
        <Layout className={`layout-page ${className}`} >
            <Header className={'header'}>
                {renderHeader?.()}
            </Header>
            <Content className={'main'}>
                <div className={'breadcrumb'}>
                    {renderBreadcrumb?.()}
                </div>
                <Layout>
                    <Sider className={'sidebar'} theme={'light'}>
                        {renderSidebar?.()}
                    </Sider>
                    <BasicLayoutContext.Provider value={{scrollRef}}>
                        <Content className={'main-content'} ref={scrollRef}>
                            {renderContent?.()}
                        </Content>
                    </BasicLayoutContext.Provider>
                    
                </Layout>
            </Content>
            <Footer className={'footer'}>
                {renderFooter?.()}
            </Footer>
        </Layout>
    );
};

