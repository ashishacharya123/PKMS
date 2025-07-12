#!/usr/bin/env python3
"""
Debug script to test authentication issues
"""

import asyncio
import sys
import os

# Add the backend path to Python path
sys.path.append('pkms-backend')

from app.database import get_db_session
from app.models.user import User
from app.auth.security import verify_password
from sqlalchemy import select

async def debug_auth():
    print("🔍 Debugging authentication...")
    
    try:
        async with get_db_session() as db:
            print("✅ Database connection successful")
            
            # Check if users exist
            result = await db.execute(select(User))
            users = result.scalars().all()
            print(f"📊 Found {len(users)} users in database")
            
            if users:
                user = users[0]
                print(f"👤 First user: {user.username}")
                print(f"🔐 Password hash: {user.password_hash[:20]}...")
                print(f"🚪 Is first login: {user.is_first_login}")
                print(f"✅ Is active: {user.is_active}")
                
                # Test password verification with common passwords
                test_passwords = ["ashish123", "Ashish123", "Ashish123!", "password123", "admin123"]
                
                for pwd in test_passwords:
                    try:
                        is_valid = verify_password(pwd, user.password_hash)
                        print(f"🔑 Password '{pwd}': {'✅ VALID' if is_valid else '❌ Invalid'}")
                        if is_valid:
                            print(f"🎉 FOUND WORKING PASSWORD: '{pwd}'")
                            break
                    except Exception as e:
                        print(f"❌ Error testing password '{pwd}': {e}")
            else:
                print("❌ No users found in database")
                print("💡 You may need to create a user first")
                
    except Exception as e:
        print(f"❌ Database error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_auth()) 