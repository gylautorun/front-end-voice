import ReactDOM from 'react-dom/client';
import React from 'react';

import App from './app.tsx';
import './index.scss';

// React.StrictMode 执行多次
// ReactDOM.createRoot(document.getElementById('root')!).render(
//     <React.StrictMode>
//         <App />
//     </React.StrictMode>,
// );

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);