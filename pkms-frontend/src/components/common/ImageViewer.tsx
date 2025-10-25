/**
 * ImageViewer - Embedded image viewer component
 * Provides inline image viewing with zoom, pan, and download capabilities
 */

import React, { useState, useRef, useEffect } from 'react';
import { Modal, Group, Button, Text, Image, Stack, Slider, ActionIcon, Tooltip } from '@mantine/core';
import { IconZoomIn, IconZoomOut, IconDownload, IconMaximize, IconX, IconRotateClockwise } from '@tabler/icons-react';

interface ImageViewerProps {
  opened: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName: string;
  onDownload?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function ImageViewer({
  opened,
  onClose,
  imageUrl,
  imageName,
  onDownload,
  size = 'lg'
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const imageRef = useRef<HTMLImageElement>(null);

  const getModalSize = () => {
    if (size === 'full') return '100%';
    if (size === 'xl') return '90vw';
    if (size === 'lg') return '80vw';
    if (size === 'md') return '60vw';
    return '40vw';
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 500));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 25));
  };

  const handleReset = () => {
    setZoom(100);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Default download behavior
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = imageName;
      link.click();
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  useEffect(() => {
    if (opened) {
      setZoom(100);
      setRotation(0);
      setIsFullscreen(false);
      setImageLoaded(false);
      setImageError(false);
    }
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={imageName}
      size={getModalSize()}
      centered
      fullScreen={isFullscreen}
      styles={{
        content: {
          height: isFullscreen ? '100vh' : 'auto',
          maxHeight: isFullscreen ? '100vh' : '90vh'
        }
      }}
    >
      <Stack gap="md">
        {/* Controls */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Tooltip label="Zoom In">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 500}
              >
                <IconZoomIn size={16} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Zoom Out">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 25}
              >
                <IconZoomOut size={16} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Reset">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={handleReset}
              >
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Rotate">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={handleRotate}
              >
                <IconRotateClockwise size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          
          <Group gap="xs">
            <Tooltip label="Fullscreen">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                <IconMaximize size={16} />
              </ActionIcon>
            </Tooltip>
            
            <Tooltip label="Download">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={handleDownload}
              >
                <IconDownload size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Zoom Slider */}
        <Group gap="sm" align="center">
          <Text size="sm" c="dimmed" style={{ minWidth: 60 }}>
            {zoom}%
          </Text>
          <Slider
            value={zoom}
            onChange={setZoom}
            min={25}
            max={500}
            step={25}
            style={{ flex: 1 }}
            marks={[
              { value: 25, label: '25%' },
              { value: 100, label: '100%' },
              { value: 200, label: '200%' },
              { value: 500, label: '500%' }
            ]}
          />
        </Group>

        {/* Image Container */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: isFullscreen ? 'calc(100vh - 200px)' : '60vh',
            overflow: 'auto',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 'var(--mantine-radius-md)',
            backgroundColor: 'var(--mantine-color-gray-0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {imageError ? (
            <Stack align="center" gap="sm">
              <Text c="red" size="sm">Failed to load image</Text>
              <Button size="sm" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </Stack>
          ) : (
            <Image
              ref={imageRef}
              src={imageUrl}
              alt={imageName}
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease',
                cursor: zoom > 100 ? 'grab' : 'default'
              }}
              draggable={false}
            />
          )}
        </div>

        {/* Image Info */}
        {imageLoaded && (
          <Group justify="center" gap="lg">
            <Text size="sm" c="dimmed">
              Zoom: {zoom}%
            </Text>
            {rotation !== 0 && (
              <Text size="sm" c="dimmed">
                Rotation: {rotation}°
              </Text>
            )}
          </Group>
        )}
      </Stack>
    </Modal>
  );
}
