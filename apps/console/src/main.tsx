import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { BRAND } from './lib/env';
import './styles.css';

document.title = `${BRAND} 콘솔`;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
