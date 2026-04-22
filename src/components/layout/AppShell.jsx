import { useContext } from 'react';
import AppContext from '../../context/AppContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';

export default function AppShell({ children }) {
  const { notification } = useContext(AppContext);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </main>
      {notification && (
        <Toast message={notification.msg} type={notification.type} />
      )}
    </div>
  );
}
