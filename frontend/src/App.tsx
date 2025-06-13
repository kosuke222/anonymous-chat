// frontend/src/App.tsx
import React from 'react';
import './App.css'; // CSSファイルをインポートしているか確認
import ChatRoom from './ChatRoom'; // ★この行が重要

const App: React.FC = () => {
  return (
    <div className="App">
      <ChatRoom /> {/* ★このコンポーネントがレンダリングされているか確認 */}
    </div>
  );
};

export default App;