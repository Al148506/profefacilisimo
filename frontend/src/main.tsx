import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import 'sweetalert2/dist/sweetalert2.min.css';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
const router = createBrowserRouter([{ path: '*', element: <App /> }]);
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>);
