"""
Testing API Response Schemas for PKMS Backend

Provides Pydantic models for testing endpoints to ensure consistent camelCase JSON responses.
"""

from pydantic import Field
from typing import Any, Optional
from datetime import datetime
from .base import CamelCaseModel


class DatabaseStatsResponse(CamelCaseModel):
    """Database statistics response with camelCase field names"""
    status: str
    statistics: dict[str, Any]
    userUuid: str
    timestamp: str


class TableSchemaResponse(CamelCaseModel):
    """Table schema information response"""
    table: str
    columnCount: int
    columns: list[dict[str, Any]]
    rowCount: int
    sizeInfo: dict[str, Any]
    timestamp: str


class SampleRowsResponse(CamelCaseModel):
    """Sample table rows response"""
    table: str
    rowCount: int
    sampleRows: list[dict[str, Any]]
    timestamp: str


class FtsTablesDataResponse(CamelCaseModel):
    """FTS tables data response"""
    ftsGroups: dict[str, dict[str, Any]]
    allFtsTables: list[Any]
    totalFtsTables: int
    sampleData: Optional[Any] = None
    ftsExplanation: dict[str, str]


class DetailedHealthResponse(CamelCaseModel):
    """Detailed health check response"""
    status: str
    database: dict[str, Any]
    userSession: dict[str, Any]
    systemInfo: dict[str, Any]
    timestamp: str


class ConsoleCommandsResponse(CamelCaseModel):
    """Console commands response"""
    status: str
    commands: dict[str, Any]
