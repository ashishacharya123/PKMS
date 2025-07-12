#!/usr/bin/env python3
"""decrypt_pkms_file.py – Stand-alone tool to decrypt PKMS .dat files.

Usage:
    python decrypt_pkms_file.py /full/path/to/file.dat [--out OUTFILE]

• Prompts for password (input hidden)
• Parses PKMS header (see models.diary docstring)
• Derives key = SHA-256(password)
• Decrypts AES-256-GCM ciphertext
• If original extension present it writes OUTFILE (default: same name with ext)
  Otherwise prints plaintext to stdout (or writes .txt if --out supplied)

Requirements:
    pip install cryptography
"""
from __future__ import annotations

import argparse
import base64
import getpass
import sys
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Local import (assumes script run from repo root or installed as module)
try:
    from pkms_backend.app.utils.diary_encryption import (
        read_encrypted_header,
        InvalidPKMSFile,
        IV_LEN,
        TAG_LEN,
    )
except ModuleNotFoundError:
    # Fallback relative import when run from repository root
    import importlib.util, os

    util_path = Path(__file__).resolve().parents[1] / "pkms-backend" / "app" / "utils" / "diary_encryption.py"
    spec = importlib.util.spec_from_file_location("diary_encryption", util_path)
    diary_encryption = importlib.util.module_from_spec(spec)  # type: ignore
    assert spec and spec.loader
    spec.loader.exec_module(diary_encryption)  # type: ignore
    read_encrypted_header = diary_encryption.read_encrypted_header  # type: ignore
    InvalidPKMSFile = diary_encryption.InvalidPKMSFile  # type: ignore
    IV_LEN = diary_encryption.IV_LEN  # type: ignore
    TAG_LEN = diary_encryption.TAG_LEN  # type: ignore

import hashlib


def derive_key(password: str) -> bytes:
    """SHA-256(password) → 32-byte key."""
    return hashlib.sha256(password.encode("utf-8")).digest()


def decrypt_file(src: Path, out: Optional[Path] = None):
    try:
        ext, iv, tag, header_size = read_encrypted_header(src)
    except InvalidPKMSFile as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

    # Read ciphertext (excluding tag) after header
    with open(src, "rb") as f:
        f.seek(header_size)
        ciphertext = f.read()

    password = getpass.getpass("Enter password: ")
    key = derive_key(password)

    aesgcm = AESGCM(key)
    try:
        plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
    except Exception as e:
        print("[ERROR] Decryption failed – likely wrong password or corrupt file.")
        sys.exit(2)

    if ext:
        # Media file – write to disk
        if out is None:
            out = src.with_suffix("." + ext)
        with open(out, "wb") as f:
            f.write(plaintext)
        print(f"Decrypted media written to {out}")
    else:
        # Diary text – utf-8 assumed
        if out:
            out.write_text(plaintext.decode("utf-8", errors="replace"))
            print(f"Decrypted text written to {out}")
        else:
            print("\n---- Diary Text ----")
            try:
                print(plaintext.decode("utf-8"))
            except UnicodeDecodeError:
                print("[WARN] Could not decode text as UTF-8. Writing binary output.")
                sys.stdout.buffer.write(plaintext)


def main():
    parser = argparse.ArgumentParser(description="Decrypt PKMS .dat file")
    parser.add_argument("file", type=Path, help="Encrypted .dat file path")
    parser.add_argument("--out", type=Path, help="Optional output file path")
    args = parser.parse_args()

    if not args.file.exists():
        parser.error("Input file does not exist")
    decrypt_file(args.file, args.out)


if __name__ == "__main__":
    main() 