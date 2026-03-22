/**
 * Open Source Studio Page — Full-page wrapper for the OSS component.
 * Accessible from the developer toolbar or via direct route.
 */

import { useNavigate } from 'react-router-dom';
import { ShaderBackground } from '@/components/shaders';
import { ArrowLeftIcon } from '@/components/ui/icons';
import { ShaderButton } from '@/components/shaders';
import { OpenSourceStudio } from '@/components/open-source-studio/OpenSourceStudio';

export default function OpenSourceStudioPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <ShaderBackground />

      {/* Header */}
      <div style={{
        height: 52,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'relative',
        zIndex: 10,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <ShaderButton variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeftIcon size={16} />
        </ShaderButton>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
          Open Source Studio
        </span>
      </div>

      {/* Main content */}
      <div style={{ padding: '0 16px 16px', position: 'relative', zIndex: 1 }}>
        <OpenSourceStudio />
      </div>
    </div>
  );
}
