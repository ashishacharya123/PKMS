/**
 * DeleteConfirmationModal - Unified delete confirmation with link warnings
 * 
 * Shows delete preflight information and allows user to confirm deletion
 */

import React from 'react';

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: string;
  linkCount: number;
  linkedItems?: {
    [key: string]: {
      items: string[];
      count: number;
    };
  };
  warningMessage?: string;
  isLoading?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType,
  linkCount,
  linkedItems = {},
  warningMessage,
  isLoading = false
}) => {
  if (!isOpen) return null;

  const hasLinks = linkCount > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              {hasLinks ? (
                <div className="w-6 h-6 text-yellow-600 mr-2">⚠️</div>
              ) : (
                <div className="w-6 h-6 text-red-600 mr-2">🗑️</div>
              )}
              <h3 className="text-lg font-semibold text-gray-900">
                Delete {itemType}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isLoading}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete <strong>"{itemName}"</strong>?
            </p>

            {hasLinks && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <div className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0">⚠️</div>
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800 mb-2">
                      This {itemType} is linked to other items:
                    </h4>
                    {warningMessage && (
                      <p className="text-sm text-yellow-700 mb-2">
                        {warningMessage}
                      </p>
                    )}
                    <div className="text-sm text-yellow-700">
                      <p className="font-medium">Deleting will remove it from:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {Object.entries(linkedItems).map(([type, data]) => (
                          data.count > 0 && (
                            <li key={type}>
                              {data.count} {type}(s): {data.items.slice(0, 2).join(', ')}
                              {data.items.length > 2 && ` and ${data.items.length - 2} more`}
                            </li>
                          )
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!hasLinks && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700">
                  This {itemType} is not linked to any other items and can be safely deleted.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deleting...
                </>
              ) : (
                <>
                  <span className="mr-2">🗑️</span>
                  Delete Everywhere
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
