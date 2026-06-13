"""Chrome cookie extraction for macOS.

Extracts cookies from Chrome's encrypted SQLite database using only stdlib
modules and the system openssl CLI (ships with macOS). Zero pip dependencies.

Chrome on macOS uses v10 encryption (AES-128-CBC with Keychain-stored key).
This is NOT affected by Windows App-Bound Encryption (v20).
"""

import hashlib
import logging
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Chrome cookie DB location on macOS
CHROME_COOKIES_DB = Path.home() / "Library" / "Application Support" / "Google" / "Chrome" / "Default" / "Cookies"

# Chrome v10 encryption constants
CHROME_SALT = b"saltysalt"
CHROME_PBKDF2_ITERATIONS = 1003
CHROME_KEY_LENGTH = 16
# IV is 16 space characters (0x20)
CHROME_IV_HEX = "20" * 16


def _get_chrome_encryption_key() -> Optional[bytes]:
    """Retrieve Chrome's encryption passphrase from macOS Keychain.

    Calls `security find-generic-password` which may trigger a system dialog
    on first access.

    Returns the raw passphrase bytes, or None on failure.
    """
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-w", "-s", "Chrome Safe Storage"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            logger.info("Chrome Keychain access denied or Chrome not installed: %s", result.stderr.strip())
            return None
        passphrase = result.stdout.strip()
        if not passphrase:
            logger.info("Chrome Keychain returned empty passphrase")
            return None
        return passphrase.encode("utf-8")
    except FileNotFoundError:
        logger.info("'security' command not found — not on macOS?")
        return None
    except subprocess.TimeoutExpired:
        logger.info("Chrome Keychain access timed out")
        return None
    except Exception as e:
        logger.info("Failed to get Chrome encryption key: %s", e)
        return None


def _derive_aes_key(passphrase: bytes) -> bytes:
    """Derive 16-byte AES key from Chrome's Keychain passphrase via PBKDF2."""
    return hashlib.pbkdf2_hmac(
        "sha1",
        passphrase,
        CHROME_SALT,
        CHROME_PBKDF2_ITERATIONS,
        dklen=CHROME_KEY_LENGTH,
    )


def _decrypt_v10_value(encrypted_value: bytes, aes_key: bytes, db_version: int) -> Optional[str]:
    """Decrypt a Chrome v10-encrypted cookie value.

    Uses system openssl CLI for AES-128-CBC decryption (zero pip deps).
    For Chrome 130+ (db_version >= 24), strips 32-byte SHA-256 prefix after decryption.

    Returns decrypted string or None on failure.
    """
    # Strip the 'v10' prefix
    ciphertext = encrypted_value[3:]
    if not ciphertext:
        return None

    hex_key = aes_key.hex()

    try:
        result = subprocess.run(
            [
                "openssl", "enc", "-aes-128-cbc", "-d",
                "-K", hex_key,
                "-iv", CHROME_IV_HEX,
                "-nopad",
            ],
            input=ciphertext,
            capture_output=True,
            timeout=5,
        )
        if result.returncode != 0:
            logger.debug("openssl decryption failed: %s", result.stderr.decode(errors="replace").strip())
            return None

        decrypted = result.stdout
        if not decrypted:
            return None

        # Remove PKCS7 padding
        decrypted = _remove_pkcs7_padding(decrypted)
        if decrypted is None:
            return None

        # Chrome 130+ (db version >= 24): strip 32-byte SHA-256 prefix
        if db_version >= 24 and len(decrypted) > 32:
            decrypted = decrypted[32:]

        return decrypted.decode("utf-8", errors="replace")

    except FileNotFoundError:
        logger.info("openssl not found — cannot decrypt Chrome cookies")
        return None
    except subprocess.TimeoutExpired:
        logger.info("openssl decryption timed out")
        return None
    except Exception as e:
        logger.debug("Chrome cookie decryption error: %s", e)
        return None


def _remove_pkcs7_padding(data: bytes) -> Optional[bytes]:
    """Remove PKCS7 padding from decrypted data.

    The last byte indicates the number of padding bytes added.
    All padding bytes must have the same value.

    Returns unpadded data or None if padding is invalid.
    """
    if not data:
        return None
    pad_len = data[-1]
    if pad_len < 1 or pad_len > 16:
        return None
    # Verify all padding bytes match
    if data[-pad_len:] != bytes([pad_len]) * pad_len:
        return None
    return data[:-pad_len]


def _get_db_version(cursor: sqlite3.Cursor) -> int:
    """Get Chrome cookie database version from the meta table.

    Returns 0 if meta table doesn't exist or version can't be read.
    """
    try:
        cursor.execute("SELECT value FROM meta WHERE key = 'version'")
        row = cursor.fetchone()
        if row:
            return int(row[0])
    except Exception:
        pass
    return 0


def extract_chrome_cookies_macos(domain: str, cookie_names: list[str]) -> Optional[dict[str, str]]:
    """Extract cookies from Chrome on macOS.

    Copies the locked Cookies database to a temp file, reads specified cookies,
    and decrypts v10-encrypted values using the Keychain-stored key.

    Args:
        domain: Cookie domain to match (e.g., ".twitter.com", ".x.com")
        cookie_names: List of cookie names to extract

    Returns:
        Dict mapping cookie name to decrypted value, or None on failure.
        Only includes cookies that were successfully found and decrypted.
    """
    if not CHROME_COOKIES_DB.exists():
        logger.info("Chrome cookies database not found at %s", CHROME_COOKIES_DB)
        return None

    # Get encryption key from Keychain
    passphrase = _get_chrome_encryption_key()
    aes_key = _derive_aes_key(passphrase) if passphrase else None

    # Copy DB to temp file (Chrome locks the original)
    tmp_fd = None
    tmp_path = None
    try:
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".sqlite")
        shutil.copy2(str(CHROME_COOKIES_DB), tmp_path)
    except Exception as e:
        logger.info("Failed to copy Chrome cookies database: %s", e)
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass
        return None
    finally:
        if tmp_fd is not None:
            import os
            os.close(tmp_fd)

    try:
        conn = sqlite3.connect(tmp_path)
        cursor = conn.cursor()

        db_version = _get_db_version(cursor)
        logger.debug("Chrome cookie DB version: %d", db_version)

        # Build query with placeholders for cookie names
        placeholders = ",".join("?" for _ in cookie_names)
        query = (
            f"SELECT name, value, encrypted_value FROM cookies "
            f"WHERE host_key LIKE ? AND name IN ({placeholders})"
        )
        # Use LIKE for domain matching (e.g., %.twitter.com matches .twitter.com)
        params = [f"%{domain}"] + list(cookie_names)
        cursor.execute(query, params)

        results: dict[str, str] = {}
        for name, value, encrypted_value in cursor.fetchall():
            # Prefer unencrypted value if present
            if value:
                results[name] = value
                continue

            # Handle encrypted value
            if encrypted_value and encrypted_value[:3] == b"v10":
                if aes_key is None:
                    logger.debug("Skipping encrypted cookie %s — no Keychain access", name)
                    continue
                decrypted = _decrypt_v10_value(encrypted_value, aes_key, db_version)
                if decrypted:
                    results[name] = decrypted
                else:
                    logger.debug("Failed to decrypt cookie %s", name)
            elif encrypted_value:
                # Unknown encryption version
                logger.debug("Unknown encryption for cookie %s (prefix: %r)", name, encrypted_value[:3])

        conn.close()

        if not results:
            logger.info("No matching cookies found in Chrome for domain %s", domain)
            return None

        return results

    except sqlite3.Error as e:
        logger.info("Failed to read Chrome cookies database: %s", e)
        return None
    except Exception as e:
        logger.info("Unexpected error reading Chrome cookies: %s", e)
        return None
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass
