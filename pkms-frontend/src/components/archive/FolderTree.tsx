import React, { useState, useCallback, useEffect } from 'react';
import { Tree, TreeNode } from '@mantine/core';
import { IconFolder, IconFolderOpen } from '@tabler/icons-react';
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
    if (!isExpanded && node.has_children && children.length === 0) {
      setIsLoading(true);
      try {
        const folders = await loadFolders(node.uuid);
        setChildren(folders.map(folder => ({
          uuid: folder.uuid,
          name: folder.name,
          parent_uuid: folder.parent_uuid,
          has_children: folder.has_children,
          children: []
        })));
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

  return (
    <TreeNode
      label={node.name}
      onClick={handleSelect}
      onExpand={handleExpand}
      expanded={isExpanded}
      loading={isLoading}
      selected={selectedId === node.uuid}
      icon={isExpanded ? <IconFolderOpen size={20} /> : <IconFolder size={20} />}
      style={{
        paddingLeft: `${level * 20}px`,
        cursor: 'pointer',
        backgroundColor: selectedId === node.uuid ? 'var(--mantine-color-blue-1)' : 'transparent'
      }}
    >
      {isExpanded && children.map(child => (
        <FolderNode
          key={child.uuid}
          node={child}
          onSelect={onSelect}
          selectedId={selectedId}
          level={level + 1}
        />
      ))}
    </TreeNode>
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
    <Tree>
      {folderTree.map(node => (
        <FolderNode
          key={node.uuid}
          node={node}
          onSelect={onSelect}
          selectedId={selectedId}
          level={0}
        />
      ))}
    </Tree>
  );
}; 