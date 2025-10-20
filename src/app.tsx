import {BasicLayout} from './layouts/basic';
import {routes} from './routes';

function App() {
    return (
        <BasicLayout
            routes={routes}
        />
    );
}

export default App;
