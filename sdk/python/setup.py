from setuptools import setup, find_packages

setup(
    name="voidmind",
    version="1.0.0",
    description="Official Python SDK for VoidMind — Zero-Knowledge AI Gateway",
    author="Mohammed Badran AbuSiam (Nuyvo LLC)",
    license="MIT",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
    ],
    extras_require={
        "dev": ["pytest>=7.0", "black>=22.0"],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    url="https://github.com/MBAS89/voidmind/tree/main/sdk/python",
)
