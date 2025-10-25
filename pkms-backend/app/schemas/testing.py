"""
Testing API Response Schemas for PKMS Backend

Provides Pydantic models for testing endpoints to ensure consistent camelCase JSON responses.
"""

from pydantic import Field
from typing import Dict, List, Any, Optional
from datetime import datetime
from .base import CamelCaseModel


class DatabaseStatsResponse(CamelCaseModel):
    """Database statistics response with camelCase field names"""
    status: str
    statistics: Dict[str, Any]
    userUuid: str
    timestamp: str


class TableSchemaResponse(CamelCaseModel):
    """Table schema information response"""
    table: str
    columnCount: int
    columns: List[Dict[str, Any]]
    rowCount: int
    sizeInfo: Dict[str, Any]
    timestamp: str


class SampleRowsResponse(CamelCaseModel):
    """Sample table rows response"""
    table: str
    rowCount: int
    sampleRows: List[Dict[str, Any]]
    timestamp: str


class FtsTablesDataResponse(CamelCaseModel):
    """FTS tables data response"""
    ftsGroups: Dict[str, Dict[str, Any]]
    allFtsTables: List[Any]
    totalFtsTables: int
    sampleData: Optional[Any] = None
    ftsExplanation: Dict[str, str]


class DetailedHealthResponse(CamelCaseModel):
    """Detailed health check response"""
    status: str
    database: Dict[str, Any]
    userSession: Dict[str, Any]
    systemInfo: Dict[str, Any]
    timestamp: str


class ConsoleCommandsResponse(CamelCaseModel):
    """Console commands response"""
    status: str
    commands: Dict[str, Any]
