"""
VoidMind Python SDK — Admin Operations Example
"""

from voidmind import VoidMindAdminClient


def main():
    # Step 1: Login as admin
    admin = VoidMindAdminClient(
        base_url="http://localhost:3000",
        access_token="",  # Will get from login
    )

    login = admin.login("admin@voidmind.local", "your_password")
    print("Logged in. Token expires in", login["expires_in"], "seconds")

    # Step 2: Use the token
    admin = VoidMindAdminClient(
        base_url="http://localhost:3000",
        access_token=login["access_token"],
    )

    # Create a new API key
    new_key = admin.create_key(
        name="Production App",
        monthly_limit=100000,
        daily_limit=5000,
        requests_per_minute=120,
    )
    print("New key created:", new_key["key"])  # Save this!

    # List all keys
    keys = admin.list_keys()
    print("Active keys:", len(keys["keys"]))

    # View usage
    usage = admin.get_usage()
    print("Tokens today:", usage["total_tokens_today"])

    # View performance
    perf = admin.get_performance()
    print("Response cache:", perf["caches"]["response"])
    print("Queue:", perf["queue"])

    # Force-wipe all sessions
    wiped = admin.wipe_all_sessions()
    print("Sessions wiped:", wiped.get("count", 0))

    admin.close()


if __name__ == "__main__":
    main()
