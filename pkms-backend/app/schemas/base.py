"""
Base Pydantic models for all API schemas.
Provides automatic snake_case (Python) to camelCase (JSON) conversion.
"""
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class CamelCaseModel(BaseModel):
    """
    Base model that automatically converts Python snake_case to JSON camelCase.
    - alias_generator=to_camel: Converts field names in JSON responses
    - populate_by_name=True: Accepts both camelCase and snake_case in requests
    - from_attributes=True: Enables ORM mode for SQLAlchemy models
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )
