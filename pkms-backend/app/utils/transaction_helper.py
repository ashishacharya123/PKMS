"""
Transaction Helper Utility
Provides consistent transaction management patterns across all services
"""

import logging
from contextlib import asynccontextmanager
from typing import Any, Callable, Optional
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class TransactionHelper:
    """Helper class for consistent database transaction management"""

    @staticmethod
    @asynccontextmanager
    async def transaction(
        db: AsyncSession,
        commit_on_success: bool = True,
        rollback_on_error: bool = True,
        error_message: Optional[str] = None
    ):
        """
        Context manager for consistent transaction handling

        Args:
            db: AsyncSession database session
            commit_on_success: Whether to commit on successful completion
            rollback_on_error: Whether to rollback on error
            error_message: Custom error message for logging

        Yields:
            None - Control passes back to the caller within the transaction

        Raises:
            Exception: Re-raises the original exception after rollback handling
        """
        try:
            yield
            if commit_on_success:
                await db.commit()
                logger.debug("Transaction committed successfully")
        except Exception as e:
            if rollback_on_error:
                await db.rollback()
                error_msg = error_message or f"Transaction rolled back due to error: {str(e)}"
                logger.error(error_msg)
            else:
                error_msg = error_message or f"Transaction error (no rollback): {str(e)}"
                logger.error(error_msg)
            raise

    @staticmethod
    async def execute_with_transaction(
        db: AsyncSession,
        operation: Callable[[], Any],
        commit_on_success: bool = True,
        rollback_on_error: bool = True,
        error_message: Optional[str] = None
    ) -> Any:
        """
        Execute an operation within a transaction

        Args:
            db: AsyncSession database session
            operation: Async function to execute within transaction
            commit_on_success: Whether to commit on successful completion
            rollback_on_error: Whether to rollback on error
            error_message: Custom error message for logging

        Returns:
            Result of the operation

        Raises:
            Exception: Re-raises the original exception after rollback handling
        """
        async with TransactionHelper.transaction(
            db, commit_on_success, rollback_on_error, error_message
        ):
            return await operation()


# Convenience functions for common patterns
async def safe_commit(db: AsyncSession, operation_name: str = "operation") -> bool:
    """
    Safely commit a transaction with error handling

    Args:
        db: AsyncSession database session
        operation_name: Name of the operation for logging

    Returns:
        bool: True if commit was successful, False otherwise
    """
    try:
        await db.commit()
        logger.debug(f"{operation_name}: Transaction committed successfully")
        return True
    except Exception as e:
        logger.error(f"{operation_name}: Failed to commit transaction: {str(e)}")
        return False


async def safe_rollback(db: AsyncSession, operation_name: str = "operation") -> bool:
    """
    Safely rollback a transaction with error handling

    Args:
        db: AsyncSession database session
        operation_name: Name of the operation for logging

    Returns:
        bool: True if rollback was successful, False otherwise
    """
    try:
        await db.rollback()
        logger.debug(f"{operation_name}: Transaction rolled back successfully")
        return True
    except Exception as e:
        logger.error(f"{operation_name}: Failed to rollback transaction: {str(e)}")
        return False


class BatchTransaction:
    """Helper for batch operations that need to be processed together"""

    def __init__(self, db: AsyncSession, batch_size: int = 100):
        self.db = db
        self.batch_size = batch_size
        self.operations = []

    def add_operation(self, operation: Callable[[], Any]):
        """Add an operation to the batch"""
        self.operations.append(operation)

    async def execute(self) -> list[Any]:
        """Execute all operations in the batch with transaction safety"""
        results = []

        async with TransactionHelper.transaction(self.db):
            for operation in self.operations:
                result = await operation()
                results.append(result)

        return results

    def clear(self):
        """Clear the batch operations"""
        self.operations.clear()