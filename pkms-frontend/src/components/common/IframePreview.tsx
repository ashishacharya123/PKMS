/**
 * Universal Iframe Preview Component
 * Handles preview for all file types (images, PDFs, documents) with appropriate controls
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Group,
  Button,
  Box,
  Alert,
  Text
} from '@mantine/core';
import {
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
  IconZoomScan,
  IconExternalLink,
  IconDownload
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface IframePreviewProps {
  url: string;
  fileName: string;
  mimeType?: string;
  onOpenInNewTab?: () => void;
  onDownload?: () => void;
  height?: string;
  onError?: (error: string) => void;
}

export const IframePreview: React.FC<IframePreviewProps> = ({
  url,
  fileName,
  mimeType,
  onOpenInNewTab,
  onDownload,
  height = '70vh',
  onError
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isImage, setIsImage] = useState(mimeType?.startsWith('image/') || false);
  const [imageControls, setImageControls] = useState({
    rotate: 0,
    scale: 1,
    translateX: 0,
    translateY: 0
  });
  const [iframeError, setIframeError] = useState<string | null>(null);

  useEffect(() => {
    setIsImage(mimeType?.startsWith('image/') || false);
  }, [mimeType]);

  const executeImageCommand = (command: string, value?: any) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !isImage) return;

    try {
      const img = iframe.contentWindow.document.querySelector('img') as HTMLImageElement;
      if (!img) return;

      // Wait for image to load if not already loaded
      if (!img.complete) {
        img.onload = () => executeImageCommand(command, value);
        return;
      }

      switch (command) {
        case 'rotate':
          const newRotate = (imageControls.rotate + 90) % 360;
          setImageControls(prev => ({ ...prev, rotate: newRotate }));
          updateImageTransform(img, { ...imageControls, rotate: newRotate });
          break;

        case 'zoomIn':
          const newScaleIn = Math.min(imageControls.scale * 1.2, 3);
          setImageControls(prev => ({ ...prev, scale: newScaleIn }));
          updateImageTransform(img, { ...imageControls, scale: newScaleIn });
          break;

        case 'zoomOut':
          const newScaleOut = Math.max(imageControls.scale / 1.2, 0.1);
          setImageControls(prev => ({ ...prev, scale: newScaleOut }));
          updateImageTransform(img, { ...imageControls, scale: newScaleOut });
          break;

        case 'reset':
          setImageControls({ rotate: 0, scale: 1, translateX: 0, translateY: 0 });
          updateImageTransform(img, { rotate: 0, scale: 1, translateX: 0, translateY: 0 });
          break;

        case 'fitToWidth':
          const containerWidth = iframe.parentElement?.clientWidth || iframe.clientWidth;
          const scale = containerWidth / img.naturalWidth;
          setImageControls(prev => ({ ...prev, scale: Math.min(scale, 1) }));
          updateImageTransform(img, { ...imageControls, scale: Math.min(scale, 1) });
          break;
      }
    } catch (error) {
      console.error('Failed to execute image command:', command, error);
      notifications.show({
        title: 'Control Error',
        message: `Failed to ${command.replace(/([A-Z])/g, ' $1').toLowerCase()} the image`,
        color: 'red'
      });
    }
  };

  const updateImageTransform = (img: HTMLImageElement, controls: typeof imageControls) => {
    img.style.transform = `
      translate(${controls.translateX}px, ${controls.translateY}px)
      rotate(${controls.rotate}deg)
      scale(${controls.scale})
    `.trim();

    img.style.transformOrigin = 'center center';
    img.style.transition = 'transform 0.3s ease';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width = 'auto';
    img.style.height = 'auto';
  };

  const handleIframeLoad = () => {
    setIframeError(null);

    if (isImage && iframeRef.current?.contentWindow) {
      // Apply initial image styling
      setTimeout(() => {
        const img = iframeRef.current?.contentWindow?.document.querySelector('img');
        if (img) {
          // Basic image styling
          img.style.display = 'block';
          img.style.margin = '20px auto';
          img.style.maxWidth = 'calc(100% - 40px)';
          img.style.maxHeight = 'calc(100vh - 150px)';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '8px';
          img.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        }
      }, 100);
    }
  };

  const handleIframeError = () => {
    const errorMsg = `Failed to load ${fileName}`;
    setIframeError(errorMsg);
    onError?.(errorMsg);
  };

  return (
    <Box style={{ width: '100%' }}>
      {/* Image Controls */}
      {isImage && (
        <Group gap="xs" mb="sm" p="sm" bg="gray.0" style={{ borderRadius: '8px 8px 0 0' }}>
          <Button
            variant="light"
            size="sm"
            onClick={() => executeImageCommand('rotate')}
            leftSection={<IconRotateClockwise size={14} />}
          >
            Rotate
          </Button>
          <Button
            variant="light"
            size="sm"
            onClick={() => executeImageCommand('zoomIn')}
            leftSection={<IconZoomIn size={14} />}
          >
            Zoom In
          </Button>
          <Button
            variant="light"
            size="sm"
            onClick={() => executeImageCommand('zoomOut')}
            leftSection={<IconZoomOut size={14} />}
          >
            Zoom Out
          </Button>
          <Button
            variant="light"
            size="sm"
            onClick={() => executeImageCommand('fitToWidth')}
            leftSection={<IconZoomScan size={14} />}
          >
            Fit Width
          </Button>
          <Button
            variant="light"
            size="sm"
            onClick={() => executeImageCommand('reset')}
            leftSection={<IconZoomScan size={14} />}
          >
            Reset View
          </Button>
        </Group>
      )}

      {/* Iframe Container */}
      <Box
        style={{
          width: '100%',
          height: isImage ? '65vh' : height,
          border: '1px solid #e9ecef',
          borderRadius: isImage ? '0 0 8px 8px' : '8px',
          overflow: 'hidden',
          background: isImage ? '#f8f9fa' : 'white',
          position: 'relative'
        }}
      >
        {iframeError ? (
          <Alert color="red" style={{ margin: '20px' }}>
            <Text>{iframeError}</Text>
          </Alert>
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'white'
            }}
            title={fileName}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        )}
      </Box>

      {/* Status Bar for Images */}
      {isImage && !iframeError && (
        <Group gap="sm" p="xs" bg="gray.50" style={{ borderRadius: '0 0 8px 8px', fontSize: '12px' }}>
          <Text color="dimmed">
            Rotation: {imageControls.rotate}°
          </Text>
          <Text color="dimmed">
            Zoom: {Math.round(imageControls.scale * 100)}%
          </Text>
        </Group>
      )}
    </Box>
  );
};