import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, Collapse, Loader, TextInput, Button, Group } from '@mantine/core';
import { IconFolder, IconFolderOpen, IconChevronRight } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useArchiveStore } from '../../stores/archiveStore';
import { FolderTree as FolderTreeType } from '../../types/archive';

interface FolderNodeProps {
  node: FolderTreeType;
  onSelect: (folder: FolderTreeType) => void;
  selectedId: string | null;
  level: number;
}

const FolderNode: React.FC<FolderNodeProps> = ({ node, onSelect, selectedId, level }) => {
  const [isExpanded, setIsExpanded] = useState(true); // Default expanded to prevent disappearing
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
        notifications.show({
          title: 'Error',
          message: 'Failed to load folder children',
          color: 'red',
          autoClose: 5000
        });
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
          backgroundColor: isSelected ? 'var(--mantine-color-dark-5)' : 'transparent',
          borderRadius: '4px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isSelected ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-dark-6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = isSelected ? 'var(--mantine-color-dark-5)' : 'transparent';
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
  const loadFolders = useArchiveStore(state => state.loadFolders);
  const folderSearchResults = useArchiveStore(state => state.folderSearchResults);
  const loadFolderSearchFTS = useArchiveStore(state => state.loadFolderSearchFTS);
  const clearFolderSearchResults = useArchiveStore(state => state.clearFolderSearchResults);
  const isLoading = useArchiveStore(state => state.isLoading);

  const [search, setSearch] = useState('');
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleSearch = async () => {
    if (search.trim()) {
      await loadFolderSearchFTS(search.trim());
    } else {
      clearFolderSearchResults();
    }
  };

  const handleClear = () => {
    setSearch('');
    clearFolderSearchResults();
  };

  return (
    <Box>
      <Group mb="xs" gap="xs">
        <TextInput
          placeholder="Search folders..."
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ flex: 1 }}
        />
        <Button size="xs" onClick={handleSearch} disabled={isLoading || !search.trim()}>
          Search
        </Button>
        {search && (
          <Button size="xs" variant="subtle" color="gray" onClick={handleClear}>
            Clear
          </Button>
        )}
      </Group>
      {folderSearchResults.length > 0 ? (
        <Box>
          {folderSearchResults.map((node: FolderTreeType) => (
            <Box
              key={node.folder.uuid}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '4px',
                marginBottom: 2,
                backgroundColor: selectedId === node.folder.uuid ? 'var(--mantine-color-blue-1)' : 'transparent',
              }}
              onClick={() => onSelect(node)}
            >
              <IconFolder size={18} style={{ marginRight: 8 }} />
              <Text size="sm" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.folder.name}
              </Text>
              <Text size="xs" c="dimmed" ml="xs">
                {node.folder.path}
              </Text>
            </Box>
          ))}
          {isLoading && <Loader size="xs" mt="sm" />}
        </Box>
      ) : (
        (folderTree || []).map((node: FolderTreeType) => (
          <FolderNode
            key={node.folder.uuid}
            node={node}
            onSelect={onSelect}
            selectedId={selectedId}
            level={0}
          />
        ))
      )}
    </Box>
  );
}; 