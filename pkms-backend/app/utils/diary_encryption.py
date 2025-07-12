"""diary_encryption.py – helper utilities for PKMS diary text/media encryption files.

Header format (see models.diary docstring):
Offset | Size | Purpose
0      | 4    | b"PKMS" magic
4      | 1    | version byte (0x01)
5      | 1    | original extension length N (0-255) – 0 means diary text
6      | N    | original extension bytes (utf-8)
6+N    | 12   | IV (AES-GCM nonce)
18+N   | 16   | TAG (AES-GCM authentication tag)
34+N   | …    | ciphertext payload

Functions:
    write_encrypted_file(...): pack header + ciphertext and write to disk
    read_encrypted_header(...): parse header (does NOT decrypt)
    compute_sha256(path): helper for integrity hash

NOTE: Actual AES-GCM encryption/decryption is performed on the frontend (browser) or
by the standalone decrypt script. The backend simply repackages the components
into the standardized file format for storage.
"""
from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from typing import Tuple, Dict, Any

MAGIC = b"PKMS"
VERSION = 0x01
IV_LEN = 12
TAG_LEN = 16
HEADER_BASE_LEN = 4 + 1 + 1  # magic + version + ext_len

class InvalidPKMSFile(ValueError):
    """Raised when header validation fails."""


def _validate_iv(iv: bytes):
    if len(iv) != IV_LEN:
        raise ValueError(f"IV must be {IV_LEN} bytes, got {len(iv)}")


def _validate_tag(tag: bytes):
    if len(tag) != TAG_LEN:
        raise ValueError(f"Auth tag must be {TAG_LEN} bytes, got {len(tag)}")


def write_encrypted_file(
    dest_path: Path,
    iv_b64: str,
    encrypted_blob_b64: str,
    original_extension: str = "",
) -> Dict[str, Any]:
    """Create a .dat file following the PKMS header spec.

    Args:
        dest_path: Absolute path where the file will be written.
        iv_b64: Base64-encoded IV (12 bytes, generated on the FE).
        encrypted_blob_b64: Base64 of ciphertext+tag (AES-GCM output from FE).
        original_extension: File extension without leading dot. Empty string for diary text.

    Returns:
        dict with keys {"file_hash", "tag_b64"}
    """
    iv = base64.b64decode(iv_b64)
    _validate_iv(iv)

    encrypted_blob = base64.b64decode(encrypted_blob_b64)
    if len(encrypted_blob) < TAG_LEN:
        raise ValueError("Encrypted blob shorter than auth tag length")

    # Split tag from ciphertext (last 16 bytes per WebCrypto/AES-GCM)
    tag = encrypted_blob[-TAG_LEN:]
    ciphertext = encrypted_blob[:-TAG_LEN]
    _validate_tag(tag)

    ext_bytes = original_extension.encode("utf-8")
    if len(ext_bytes) > 255:
        raise ValueError("Original extension exceeds 255 bytes")

    header = bytearray()
    header.extend(MAGIC)
    header.append(VERSION)
    header.append(len(ext_bytes))
    header.extend(ext_bytes)
    header.extend(iv)
    header.extend(tag)

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(header)
        f.write(ciphertext)

    file_hash = compute_sha256(dest_path)
    return {
        "file_hash": file_hash,
        "tag_b64": base64.b64encode(tag).decode(),
        "iv_b64": iv_b64,
    }


def read_encrypted_header(path: Path) -> Tuple[str, bytes, bytes, int]:
    """Parse header and return (extension, iv, tag, header_size).

    Does not read ciphertext.
    """
    with open(path, "rb") as f:
        magic = f.read(4)
        if magic != MAGIC:
            raise InvalidPKMSFile("Magic bytes mismatch")
        version = f.read(1)
        if not version or version[0] != VERSION:
            raise InvalidPKMSFile("Unsupported version")
        ext_len_b = f.read(1)
        if not ext_len_b:
            raise InvalidPKMSFile("Truncated header at ext_len")
        ext_len = ext_len_b[0]
        ext_bytes = f.read(ext_len)
        if len(ext_bytes) != ext_len:
            raise InvalidPKMSFile("Truncated header at ext bytes")
        extension = ext_bytes.decode("utf-8")

        iv = f.read(IV_LEN)
        if len(iv) != IV_LEN:
            raise InvalidPKMSFile("Truncated IV in header")
        tag = f.read(TAG_LEN)
        if len(tag) != TAG_LEN:
            raise InvalidPKMSFile("Truncated TAG in header")

        header_size = HEADER_BASE_LEN + ext_len + IV_LEN + TAG_LEN
        return extension, iv, tag, header_size


def compute_sha256(path: Path) -> str:
    """Return hex SHA-256 of entire file."""
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest() 