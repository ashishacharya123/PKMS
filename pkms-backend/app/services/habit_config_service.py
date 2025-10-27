import logging
import json
from typing import List, Dict, Any, Literal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException

from app.models.config import AppConfig
from app.config import NEPAL_TZ

logger = logging.getLogger(__name__)

ConfigType = Literal["default_habits", "defined_habits"]

class HabitConfigService:
    """Unified service for both default and defined habits"""
    
    # DRY: Same method for both types
    @staticmethod
    async def get_config(
        db: AsyncSession, 
        user_uuid: str, 
        config_type: ConfigType
    ) -> List[Dict[str, Any]]:
        """Get configuration - works for both types"""
        result = await db.execute(
            select(AppConfig).where(
                and_(
                    AppConfig.created_by == user_uuid,
                    AppConfig.config_name == config_type
                )
            )
        )
        config = result.scalar_one_or_none()
        
        if not config:
            if config_type == "default_habits":
                return HabitConfigService._get_default_habits()
            return []
        
        try:
            return json.loads(config.config_json)
        except json.JSONDecodeError:
            logger.error(f"Invalid {config_type} config for user {user_uuid}")
            return []
    
    @staticmethod
    def _get_default_habits() -> List[Dict[str, Any]]:
        """Built-in default habits (clean IDs, UPPERCASE names)"""
        return [
            {"habitId": "sleep", "name": "SLEEP", "unit": "hours"},
            {"habitId": "stress", "name": "STRESS", "unit": "1-5"},
            {"habitId": "exercise", "name": "EXERCISE", "unit": "minutes"},
            {"habitId": "meditation", "name": "MEDITATION", "unit": "minutes"},
            {"habitId": "screen_time", "name": "SCREEN TIME", "unit": "hours"},

            # Enhanced wellness metrics
            {"habitId": "steps", "name": "STEPS", "unit": "count"},
            {"habitId": "learning", "name": "LEARNING", "unit": "minutes"},
            {"habitId": "outdoor", "name": "OUTDOOR", "unit": "hours"},
            {"habitId": "social", "name": "SOCIAL", "unit": "hours"},
        ]
    
    @staticmethod
    def _slugify_name(name: str) -> str:
        """Convert habit name to clean habitId (lowercase slug)"""
        import re
        # Convert to lowercase, replace spaces/special chars with underscore
        slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
        return slug
    
    @staticmethod
    def _normalize_name(name: str) -> str:
        """Normalize name to UPPERCASE for storage and comparison"""
        return name.strip().upper()
    
    # DRY: Same save method for both
    @staticmethod
    async def save_config(
        db: AsyncSession,
        user_uuid: str,
        config_type: ConfigType,
        config_data: List[Dict[str, Any]]
    ) -> None:
        """Save configuration - works for both types"""
        result = await db.execute(
            select(AppConfig).where(
                and_(
                    AppConfig.created_by == user_uuid,
                    AppConfig.config_name == config_type
                )
            )
        )
        config = result.scalar_one_or_none()
        
        if config:
            config.config_json = json.dumps(config_data)
            config.updated_at = datetime.now(NEPAL_TZ)
        else:
            config = AppConfig(
                config_name=config_type,
                created_by=user_uuid,
                config_json=json.dumps(config_data)
            )
            db.add(config)
        
        await db.commit()
    
    # DRY: Same add method (can add to both types)
    @staticmethod
    async def add_item(
        db: AsyncSession,
        user_uuid: str,
        config_type: ConfigType,
        name: str,
        unit: str,
        goal_type: str = None,
        target_quantity: float = None
    ) -> Dict[str, Any]:
        """Add item to either config type (with duplicate prevention)"""
        
        items = await HabitConfigService.get_config(db, user_uuid, config_type)
        
        # Normalize name to UPPERCASE for storage and comparison
        normalized_name = HabitConfigService._normalize_name(name)
        
        # Check for duplicate (case-insensitive)
        existing = next(
            (item for item in items if item["name"] == normalized_name), 
            None
        )
        
        if existing:
            if existing.get("isActive", True):
                raise HTTPException(
                    status_code=400,
                    detail=f"Habit '{normalized_name}' already exists. Edit it instead of creating a duplicate."
                )
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Habit '{normalized_name}' exists but is inactive. Reactivate it by editing."
                )
        
        # Generate habitId from slugified name (no prefix!)
        habit_id = HabitConfigService._slugify_name(normalized_name)
        
        new_item = {
            "habitId": habit_id,
            "name": normalized_name,  # Store UPPERCASE
            "unit": unit,
        }
        
        # Add goal fields only for defined_habits
        if config_type == "defined_habits" and goal_type and target_quantity is not None:
            new_item.update({
                "goalType": goal_type,
                "targetQuantity": target_quantity,
                "isActive": True,
                "createdAt": datetime.now(NEPAL_TZ).isoformat(),
                "order": len(items)
            })
        
        items.append(new_item)
        await HabitConfigService.save_config(db, user_uuid, config_type, items)
        return new_item

    @staticmethod
    async def update_item(
        db: AsyncSession,
        user_uuid: str,
        config_type: ConfigType,
        habit_id: str,
        updates: Dict[str, Any]
    ) -> None:
        """Update an existing habit/stat item"""
        items = await HabitConfigService.get_config(db, user_uuid, config_type)
        
        found = False
        for item in items:
            if item["habitId"] == habit_id:
                # Normalize name if it's being updated
                if "name" in updates:
                    updates["name"] = HabitConfigService._normalize_name(updates["name"])
                    # Re-generate habitId if name changes to keep it consistent
                    item["habitId"] = HabitConfigService._slugify_name(updates["name"])
                
                item.update(updates)
                item["updatedAt"] = datetime.now(NEPAL_TZ).isoformat()
                found = True
                break
        
        if not found:
            raise HTTPException(
                status_code=404,
                detail=f"Habit/Stat with ID {habit_id} not found in {config_type} config"
            )
        
        await HabitConfigService.save_config(db, user_uuid, config_type, items)

    @staticmethod
    async def delete_item(
        db: AsyncSession,
        user_uuid: str,
        config_type: ConfigType,
        habit_id: str,
        soft_delete: bool = True
    ) -> None:
        """Delete or deactivate a habit/stat item"""
        items = await HabitConfigService.get_config(db, user_uuid, config_type)
        
        if config_type == "default_habits":
            raise HTTPException(
                status_code=400,
                detail="Default habits cannot be deleted, only modified."
            )
        
        found = False
        if soft_delete:
            for item in items:
                if item["habitId"] == habit_id:
                    item["isActive"] = False
                    item["updatedAt"] = datetime.now(NEPAL_TZ).isoformat()
                    found = True
                    break
            await HabitConfigService.save_config(db, user_uuid, config_type, items)
        else: # Hard delete (only if explicitly requested and allowed)
            items = [h for h in items if h["habitId"] != habit_id]
            await HabitConfigService.save_config(db, user_uuid, config_type, items)
        
        if not found and soft_delete: # If not found for soft delete
             raise HTTPException(
                status_code=404,
                detail=f"Habit with ID {habit_id} not found for deactivation."
            )

habit_config_service = HabitConfigService()
