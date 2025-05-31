import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'tailwindcss/tailwind.css';
import { WebSocketProvider } from './contexts/WebSocketProvider';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Đảm bảo có element root trong HTML
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found in HTML');
}

// Các class toàn cục cho body có thể được xử lý tốt hơn trong index.css
// Ví dụ, trong index.css bạn có thể thêm:
// @layer base {
//   body {
//     @apply w-screen h-screen bg-gray-100 flex justify-center items-center;
//   }
// }
// Hoặc nếu bạn không muốn dùng @layer, chỉ cần các class CSS thông thường.
// Xóa các dòng sau nếu bạn chuyển vào CSS:
// document.body.classList.add(
//   "w-screen",
//   "h-screen",
//   "bg-gray-100",
//   "flex",
//   "justify-center",
//   "items-center"
// );

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WebSocketProvider>
      <DndProvider backend={HTML5Backend}>
        <App />
      </DndProvider>
    </WebSocketProvider>
  </React.StrictMode>
);
