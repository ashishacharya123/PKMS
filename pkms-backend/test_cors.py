#!/usr/bin/env python3
"""
Simple CORS test script for PKMS Backend
Tests if CORS headers are properly configured
"""

import requests
import json

def test_cors_headers():
    """Test if CORS headers are properly configured"""
    
    # Test the CORS endpoint
    url = "http://localhost:8000/test-cors"
    
    try:
        # Make a request to the backend
        response = requests.get(url)
        
        print(f"✅ Response Status: {response.status_code}")
        print(f"✅ Response Headers:")
        
        # Check for CORS headers
        cors_headers = [
            'Access-Control-Allow-Origin',
            'Access-Control-Allow-Methods',
            'Access-Control-Allow-Headers',
            'Access-Control-Allow-Credentials'
        ]
        
        for header in cors_headers:
            if header in response.headers:
                print(f"   {header}: {response.headers[header]}")
            else:
                print(f"   ❌ {header}: MISSING")
        
        print(f"\n✅ Response Body:")
        print(json.dumps(response.json(), indent=2))
        
        # Test with Origin header (simulating browser request)
        headers = {'Origin': 'http://localhost:3000'}
        response_with_origin = requests.get(url, headers=headers)
        
        print(f"\n🔍 Testing with Origin header 'http://localhost:3000':")
        print(f"   Access-Control-Allow-Origin: {response_with_origin.headers.get('Access-Control-Allow-Origin', 'MISSING')}")
        
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend. Make sure it's running on localhost:8000")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🧪 Testing CORS Configuration...")
    print("=" * 50)
    test_cors_headers()
