import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, Collapse, Loader } from '@mantine/core';
import { IconFolder, IconFolderOpen, IconChevronRight } from '@tabler/icons-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { FolderTree as FolderTreeType } from '../../types/archive';

interface FolderNodeProps {
  node: FolderTreeType;
  onSelect: (folder: FolderTreeType) => void;
  selectedId: string | null;
  level: number;
}

const FolderNode: React.FC<FolderNodeProps> = ({ node, onSelect, selectedId, level }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<FolderTreeType[]>(node.children || []);
  const loadFolders = useArchiveStore(state => state.loadFolders);

  const loadChildren = useCallback(async () => {
    if (!isExpanded && children.length === 0) {
      setIsLoading(true);
      try {
        await loadFolders(node.folder.uuid);
        // The folders will be loaded into the store, we need to get them from there
        // For now, we'll just set a flag to indicate children exist
        setChildren([{ folder: node.folder, children: [], items: [] }]);
      } catch (error) {
        console.error('Failed to load folder children:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [node, isExpanded, children.length, loadFolders]);

  const handleExpand = useCallback(async () => {
    await loadChildren();
    setIsExpanded(!isExpanded);
  }, [loadChildren, isExpanded]);

  const handleSelect = useCallback(() => {
    onSelect(node);
  }, [node, onSelect]);

  const isSelected = selectedId === node.folder.uuid;

  return (
    <Box>
      <Box
        onClick={handleSelect}
        onDoubleClick={handleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          paddingLeft: `${level * 20 + 12}px`,
          cursor: 'pointer',
          backgroundColor: isSelected ? 'var(--mantine-color-blue-1)' : 'transparent',
          borderRadius: '4px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isSelected ? 'var(--mantine-color-blue-2)' : 'var(--mantine-color-gray-1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isSelected ? 'var(--mantine-color-blue-1)' : 'transparent';
        }}
      >
        <Box
          onClick={(e) => {
            e.stopPropagation();
            handleExpand();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            marginRight: '8px',
            cursor: 'pointer',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        >
          {isLoading ? (
            <Loader size="xs" />
          ) : (
            <IconChevronRight size={16} />
          )}
        </Box>
        
        {isExpanded ? <IconFolderOpen size={20} color="var(--mantine-color-blue-6)" /> : <IconFolder size={20} />}
        
        <Text
          size="sm"
          ml="xs"
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {node.folder.name}
        </Text>
      </Box>
      
      <Collapse in={isExpanded}>
        {children.map(child => (
          <FolderNode
            key={child.folder.uuid}
            node={child}
            onSelect={onSelect}
            selectedId={selectedId}
            level={level + 1}
          />
        ))}
      </Collapse>
    </Box>
  );
};

interface FolderTreeProps {
  onSelect: (folder: FolderTreeType) => void;
  selectedId: string | null;
}

export const FolderTree: React.FC<FolderTreeProps> = ({ onSelect, selectedId }) => {
  const folderTree = useArchiveStore(state => state.folderTree);
  const loadFolderTree = useArchiveStore(state => state.loadFolderTree);

  useEffect(() => {
    loadFolderTree();
  }, [loadFolderTree]);

  return (
    <Box>
      {folderTree.map(node => (
        <FolderNode
          key={node.folder.uuid}
          node={node}
          onSelect={onSelect}
          selectedId={selectedId}
          level={0}
        />
      ))}
    </Box>
  );
}; 