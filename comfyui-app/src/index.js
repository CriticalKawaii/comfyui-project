import React/*, { useEffect }*/ from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import reportWebVitals from './reportWebVitals';
import ComfyUIImageGenerator from './ComfyUIImageGenerator';



const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ComfyUIImageGenerator />
  </React.StrictMode>
);

reportWebVitals();
