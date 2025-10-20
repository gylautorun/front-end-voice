import React from 'react';
import ReactDOM from 'react-dom/client';

export async function start(App: React.ComponentType) {
    // React.StrictMode 执行多次 hook: useEffect 执行两次
    ReactDOM.createRoot(document.getElementById('root')!)
        .render(
            // <React.StrictMode>
                <App />
            // </React.StrictMode>,
        );
};

