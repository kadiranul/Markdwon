import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '3rem', color: '#2563eb' }}>404</h1>
      <h2>Not Found</h2>
      <p>The note you are looking for does not exist.</p>
      <button
        style={{
          marginTop: '1.5rem',
          padding: '0.7em 2em',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1.1em',
          cursor: 'pointer'
        }}
        onClick={() => navigate('/')}
      >
        Go Home
      </button>
    </div>
  );
};

export default NotFound; 