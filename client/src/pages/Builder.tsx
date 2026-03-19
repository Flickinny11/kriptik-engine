/**
 * Builder Page — DIAGNOSTIC VERSION
 * Temporarily simplified to identify the black screen crash.
 * Each import and render step is wrapped to identify exactly what fails.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

// Log that the module loaded
console.log('[Builder] Module loaded');

export default function Builder() {
  console.log('[Builder] Component rendering');

  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[Builder] useEffect running, projectId:', projectId);
    if (!projectId) {
      setError('No project ID');
      setStatus('error');
      return;
    }

    apiClient.getProject(projectId)
      .then(({ project }) => {
        console.log('[Builder] Project loaded:', project.name, project.status);
        setProjectName(project.name);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('[Builder] Failed to load project:', err);
        setError(err.message);
        setStatus('error');
      });
  }, [projectId]);

  console.log('[Builder] Rendering JSX, status:', status);

  return (
    <div style={{
      height: '100vh',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        height: 52,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
      }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}
        >
          ← Back
        </button>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {projectName || 'Loading...'}
        </span>
        <span style={{ fontSize: 11, color: '#666', marginLeft: 'auto' }}>
          Builder Diagnostic v1 | Status: {status}
        </span>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex' }}>
        {/* Chat panel */}
        <div style={{
          width: '25%',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {status === 'loading' && <span style={{ color: '#666' }}>Loading project...</span>}
            {status === 'error' && <span style={{ color: '#f44' }}>Error: {error}</span>}
            {status === 'ready' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                  What do you want to build?
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  Streaming chat will appear here.
                  Project: {projectName}
                </div>
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
            <input
              placeholder="Describe your app..."
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Preview panel */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#444',
          fontSize: 14,
        }}>
          Live preview area — waiting for build to start
        </div>
      </div>

      {/* Debug info */}
      <div style={{
        height: 24,
        background: '#111',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        fontSize: 10,
        color: '#555',
        gap: 12,
      }}>
        <span>ProjectID: {projectId}</span>
        <span>Status: {status}</span>
        <span>Name: {projectName}</span>
        {error && <span style={{ color: '#f44' }}>Error: {error}</span>}
      </div>
    </div>
  );
}
