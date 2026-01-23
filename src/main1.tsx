import {start} from './common';
import {BasicLayout} from './layouts/basic';
import {routes} from './routes';
import './index.scss'

function render() {
    void start(() => {
        return (
            <BasicLayout
                routes={routes}
            />
        );
    });
}

void render();