// frontend/src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
//import './index.css'; // index.css がない場合はコメントアウトするか、空のファイルを作成
// import reportWebVitals from './reportWebVitals'; // ★この行を削除

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// reportWebVitals(); // ★この行を削除