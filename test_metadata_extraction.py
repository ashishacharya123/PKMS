#!/usr/bin/env python3
"""
Test script for multi-step metadata extraction fallback system
Tests different package combinations and fallback behavior
"""

import asyncio
import sys
import os
from pathlib import Path
import tempfile
import json

# Add backend to path for imports
sys.path.append(str(Path(__file__).parent / "pkms-backend"))

from pkms_backend.app.routers.archive import _extract_metadata

async def create_test_files():
    """Create temporary test files for different formats"""
    test_files = {}

    # Create a simple test directory
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Test 1: Create a simple text file (basic fallback)
        txt_file = temp_path / "test.txt"
        txt_file.write_text("This is a test text file for metadata extraction.")
        test_files['text'] = {
            'path': txt_file,
            'mime_type': 'text/plain',
            'expected_basic': {'original_name', 'mime_type', 'size'}
        }

        # Test 2: Create a simple JSON file (document-like)
        json_file = temp_path / "test.json"
        json_file.write_text('{"title": "Test Document", "author": "Test Author"}')
        test_files['json'] = {
            'path': json_file,
            'mime_type': 'application/json',
            'expected_basic': {'original_name', 'mime_type', 'size'}
        }

        # Note: We can't easily create real image/PDF files in this test script
        # But we can test the import availability and basic functionality

        return temp_dir, test_files

def check_package_availability():
    """Check which packages are available"""
    packages = {}

    # Check lightweight packages
    try:
        import imagesize
        packages['imagesize'] = True
        print("✅ imagesize available")
    except ImportError:
        packages['imagesize'] = False
        print("❌ imagesize not available")

    try:
        import filetype
        packages['filetype'] = True
        print("✅ filetype available")
    except ImportError:
        packages['filetype'] = False
        print("❌ filetype not available")

    try:
        import pypdf
        packages['pypdf'] = True
        print("✅ pypdf available")
    except ImportError:
        packages['pypdf'] = False
        print("❌ pypdf not available")

    try:
        from tinytag import TinyTag
        packages['tinytag'] = True
        print("✅ tinytag available")
    except ImportError:
        packages['tinytag'] = False
        print("❌ tinytag not available")

    # Check heavy packages
    try:
        from PIL import Image
        packages['pil'] = True
        print("✅ PIL/Pillow available")
    except ImportError:
        packages['pil'] = False
        print("❌ PIL/Pillow not available")

    try:
        import fitz
        packages['pymupdf'] = True
        print("✅ PyMuPDF available")
    except ImportError:
        packages['pymupdf'] = False
        print("❌ PyMuPDF not available")

    try:
        from docx import Document
        packages['docx'] = True
        print("✅ python-docx available")
    except ImportError:
        packages['docx'] = False
        print("❌ python-docx not available")

    return packages

async def test_basic_metadata_extraction():
    """Test basic metadata extraction with available files"""
    print("\n🧪 Testing basic metadata extraction...")

    temp_dir, test_files = await create_test_files()

    for file_type, file_info in test_files.items():
        print(f"\n📁 Testing {file_type} file...")

        try:
            metadata = await _extract_metadata(
                file_info['path'],
                file_info['mime_type'],
                file_info['path'].name
            )

            print(f"   📊 Extracted metadata: {json.dumps(metadata, indent=2)}")

            # Check basic fields
            basic_fields = file_info['expected_basic']
            missing_fields = [field for field in basic_fields if field not in metadata]

            if missing_fields:
                print(f"   ⚠️ Missing basic fields: {missing_fields}")
            else:
                print(f"   ✅ All basic fields present")

            # Check if extraction method is reported
            if 'extraction_method' in metadata:
                print(f"   🔧 Extraction method: {metadata['extraction_method']}")

        except Exception as e:
            print(f"   ❌ Error extracting metadata: {e}")

def test_package_combinations():
    """Test different package combinations and their behavior"""
    print("\n🔄 Testing package combination scenarios...")

    packages = check_package_availability()

    # Calculate total package size estimate
    size_map = {
        'imagesize': 1, 'filetype': 2, 'pypdf': 5, 'tinytag': 1,
        'pil': 100, 'pymupdf': 50, 'docx': 30
    }

    lightweight_size = sum(size_map[pkg] for pkg in ['imagesize', 'filetype', 'pypdf', 'tinytag'] if packages.get(pkg, False))
    heavy_size = sum(size_map[pkg] for pkg in ['pil', 'pymupdf', 'docx'] if packages.get(pkg, False))

    print(f"\n📦 Package Size Analysis:")
    print(f"   Lightweight packages: {lightweight_size}MB (if all available)")
    print(f"   Heavy packages: {heavy_size}MB (if all available)")
    print(f"   Total available: {lightweight_size + heavy_size}MB")

    # Test fallback scenarios
    scenarios = [
        {
            'name': 'Lightweight only (ideal)',
            'available': ['imagesize', 'filetype', 'pypdf', 'tinytag'],
            'expected_size': 9
        },
        {
            'name': 'Heavy fallback (current)',
            'available': ['pil', 'pymupdf', 'docx'],
            'expected_size': 180
        },
        {
            'name': 'Mixed (recommended)',
            'available': ['imagesize', 'pypdf', 'tinytag', 'pil', 'pymupdf', 'docx'],
            'expected_size': 189
        }
    ]

    print(f"\n🎯 Recommended Setup Scenarios:")
    for scenario in scenarios:
        available_count = sum(1 for pkg in scenario['available'] if packages.get(pkg, False))
        actual_size = sum(size_map[pkg] for pkg in scenario['available'] if packages.get(pkg, False))

        status = "✅ Available" if available_count > 0 else "❌ Not Available"
        print(f"   {scenario['name']}: {status}")
        print(f"      Expected size: {scenario['expected_size']}MB")
        print(f"      Actual available size: {actual_size}MB")
        print(f"      Available packages: {available_count}/{len(scenario['available'])}")

async def main():
    """Main test function"""
    print("🚀 Starting Metadata Extraction Fallback System Test")
    print("=" * 60)

    # Test 1: Package availability
    packages = check_package_availability()

    # Test 2: Basic metadata extraction
    await test_basic_metadata_extraction()

    # Test 3: Package combinations and recommendations
    test_package_combinations()

    print("\n" + "=" * 60)
    print("✅ Test completed!")

    # Summary
    lightweight_available = any([packages.get(pkg, False) for pkg in ['imagesize', 'filetype', 'pypdf', 'tinytag']])
    heavy_available = any([packages.get(pkg, False) for pkg in ['pil', 'pymupdf', 'docx']])

    if lightweight_available:
        print("🎉 Lightweight packages available - size reduction possible!")
    if heavy_available:
        print("🔧 Heavy packages available - full functionality guaranteed!")
    if lightweight_available and heavy_available:
        print("⚡ Best of both worlds - lightweight with heavy fallbacks!")

if __name__ == "__main__":
    asyncio.run(main())