"""
VoidMind Python SDK — Installation Verification
Run: python verify.py
"""

import sys
import os

print("=== VoidMind Python SDK Verification ===\n")

# 1. Check package directory exists
pkg_dir = os.path.join(os.path.dirname(__file__), "voidmind")
if os.path.isdir(pkg_dir):
    print(f"[OK] Package directory found: {pkg_dir}")
else:
    print(f"[FAIL] Package directory not found: {pkg_dir}")
    sys.exit(1)

# 2. Check imports
try:
    from voidmind import VoidMindClient, VoidMindAdminClient
    from voidmind.errors import (
        VoidMindError,
        AuthenticationError,
        RateLimitError,
        ValidationError,
        ServerError,
        CircuitBreakerError,
    )
    print("[OK] All imports successful")
    print("   Client classes: VoidMindClient, VoidMindAdminClient")
    print("   Error classes: VoidMindError, AuthenticationError, RateLimitError, ValidationError, ServerError, CircuitBreakerError")
except ImportError as e:
    print(f"[FAIL] Import failed: {e}")
    sys.exit(1)

# 3. Check __init__ exports
try:
    import voidmind
    exports = dir(voidmind)
    expected = ["VoidMindClient", "VoidMindAdminClient", "VoidMindError"]
    missing = [e for e in expected if e not in exports]
    if not missing:
        print("[OK] __init__.py exports correct")
    else:
        print(f"[WARN]  Missing exports: {missing}")
except Exception as e:
    print(f"[FAIL] Export check failed: {e}")
    sys.exit(1)

# 4. Instantiate client without network
try:
    client = VoidMindClient(base_url="http://localhost:3000", api_key="vm_test")
    print("[OK] Client instantiates")
    print(f"   Base URL: {client.base_url}")
    print(f"   Timeout: {client.timeout}")
    print(f"   Max retries: {client.max_retries}")
except Exception as e:
    print(f"[FAIL] Client instantiation failed: {e}")
    sys.exit(1)

# 5. Context manager
try:
    with VoidMindClient(base_url="http://localhost:3000", api_key="vm_test") as c:
        print("[OK] Context manager works")
except Exception as e:
    print(f"[FAIL] Context manager failed: {e}")
    sys.exit(1)

# 6. Admin client
try:
    admin = VoidMindAdminClient(base_url="http://localhost:3000", access_token="test")
    print("[OK] Admin client instantiates")
except Exception as e:
    print(f"[FAIL] Admin client failed: {e}")
    sys.exit(1)

# 7. Check example files exist
examples = ["examples/basic.py", "examples/streaming.py", "examples/admin.py"]
for ex in examples:
    if os.path.exists(os.path.join(os.path.dirname(__file__), ex)):
        print(f"[OK] Example found: {ex}")
    else:
        print(f"[WARN]  Example missing: {ex}")

print("\n=== All checks passed! SDK is ready. ===")
