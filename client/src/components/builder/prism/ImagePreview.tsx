/**
 * ImagePreview — Displays the generated UI image from FLUX.2.
 *
 * Shows the full-page image for the current hub, with optional
 * segmentation mask overlay. Part of the Prism builder panels.
 */

import { usePrismStore } from '@/store/usePrismStore';

interface ImagePreviewProps {
  showSegmentation?: boolean;
}

export function ImagePreview({ showSegmentation = false }: ImagePreviewProps) {
  const { generatedImageUrl, segmentationMasks } = usePrismStore();

  if (!generatedImageUrl) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(161,161,170,0.4)', fontSize: 12,
      }}>
        Generated UI image will appear here
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto' }}>
      <img
        src={generatedImageUrl}
        alt="Generated UI"
        style={{
          width: '100%', display: 'block',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      />

      {/* Segmentation Overlay */}
      {showSegmentation && segmentationMasks && segmentationMasks.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {segmentationMasks.map((mask) => (
            <div
              key={mask.nodeId}
              style={{
                position: 'absolute',
                left: `${mask.bbox.x}%`,
                top: `${mask.bbox.y}%`,
                width: `${mask.bbox.width}%`,
                height: `${mask.bbox.height}%`,
                border: '1.5px solid rgba(251,191,36,0.5)',
                borderRadius: 4,
                background: 'rgba(251,191,36,0.05)',
              }}
              title={mask.nodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ImagePreview;
