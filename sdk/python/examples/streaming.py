"""
VoidMind Python SDK — Streaming Usage Example
"""

from voidmind import VoidMindClient


def main():
    client = VoidMindClient(
        base_url="http://localhost:3000",
        api_key="vm_YOUR_API_KEY_HERE",
    )

    stream = client.stream_chat(
        messages=[
            {"role": "system", "content": "You are a creative writer."},
            {"role": "user", "content": "Write a haiku about silence."},
        ],
        max_tokens=256,
    )

    print("AI: ", end="", flush=True)
    for chunk in stream:
        content = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
        if content:
            print(content, end="", flush=True)
    print()

    client.close()


if __name__ == "__main__":
    main()
